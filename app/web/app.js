// Paprika demo web UI: page logic.
// Wires the screens of the mock (Device, Capture, Verify, Accuse, Deposits, Revoke key) to the local chain through the
// shared library (/lib/device.js and /lib/paprika.js). Every amount and duration shown comes from ctx.params.
// Flow of each action: run() disables the buttons, calls the library, shows the revert reason on failure, then
// refreshes the header (block, time, balances with the change of the last action) and every view.

import { ethers } from "ethers";
import {
  q, setText, toHex, short, shortHash, same, fmtTime, fmtDuration, errText, big,
  blobBytes, sampleImage, videoFrame, changeOnePixel, showImage, download,
} from "./util.js";

const DEFAULT_RPC = "http://127.0.0.1:8545";

// Everything the page knows. Kept in memory only (a reload starts a new session).
const S = {
  lib: null,          // /lib/paprika.js module
  dev: null,          // /lib/device.js module
  ctx: null,          // library context from connect()
  provider: null,     // read-only ethers provider, for block hashes and receipt block numbers
  chain: { blockNumber: 0, timestamp: 0 },
  balances: null,     // last balances() snapshot
  credits: { photographer: 0n, accuser: 0n },
  busy: false,
  device: null,       // createDevice() result
  registered: null,   // { txHash, block }
  deviceStatus: "",   // text shown in the Device view
  revoked: null,      // { txHash, block }
  photo: null,        // photo loaded on Capture: { bytes, type, name }
  attested: null,     // last attested photo: { bytes, type, name, photoHash, keyId, anchorBlock, recordedBlock, ... }
  verify: null,       // file loaded on Verify: { bytes, type, name, hash, records }
  records: [],        // listRecords() result
  acc: null,          // current accusation (see doCommit)
  stream: null,       // camera MediaStream
};

// ------------------------------------------------------------------ small helpers bound to the session

// Address of a role ("photographer" | "accuser" | "operator"); accepts plain addresses or signer-like objects.
function addr(role) {
  const a = S.ctx?.accounts?.[role];
  return typeof a === "string" ? a : a?.address || "";
}

// Name of the role that owns an address, for the activity log; otherwise the short address.
function roleOf(address) {
  for (const r of ["photographer", "accuser", "operator"]) if (same(addr(r), address)) return r[0].toUpperCase() + r.slice(1);
  return short(address);
}

// Token amount with its symbol, as formatted by the library.
function tok(amount) {
  const sym = S.ctx.params.tokenSymbol || "";
  const s = S.lib.formatToken(S.ctx, big(amount));
  return s.includes(sym) ? s : `${s} ${sym}`.trim();
}

// Signed token amount: "+5 TT", "−10 TT", "0 TT".
function signed(amount) {
  const a = big(amount);
  if (a === 0n) return tok(0n);
  return (a > 0n ? "+" : "−") + tok(a < 0n ? -a : a);
}

// The UMA fee f×B, computed from the contract's fee share (a fraction) and bond.
function feeOfBond() {
  const f = Number(S.ctx.params.feeShare);
  return (big(S.ctx.params.bond) * BigInt(Math.round(f * 1e9))) / 1000000000n;
}

// A transaction hash rendered like the mock ("tx 0x1234…abcd"), full hash in the tooltip and data attribute.
function setTx(testid, hash, label = "tx") {
  const el = q(testid);
  if (!el) return;
  el.textContent = hash ? `${label} ${short(hash)}` : "";
  el.title = hash || "";
  el.dataset.hash = hash || "";
}

// Block number of a mined transaction (null if unknown).
async function blockOf(txHash) {
  try {
    const r = await S.provider.getTransactionReceipt(txHash);
    return r ? r.blockNumber : null;
  } catch {
    return null;
  }
}

// Sets the class of each <li> of a step list: done / wait / run / bad, by data-step name.
function stepState(listId, states) {
  for (const li of q(listId).querySelectorAll("li[data-step]")) {
    const s = states[li.dataset.step];
    if (s) li.className = s;
  }
}

// Normalises the device part of a verify result to { status: "active"|"flagged"|"none", reason, flaggedAtBlock }.
function deviceOf(rec) {
  const d = rec?.device || {};
  const st = String(d.status ?? "").toLowerCase();
  const rs = String(d.reason ?? "").toLowerCase();
  const status = st.includes("flag") || st === "2" ? "flagged" : st.includes("activ") || st === "1" ? "active" : "none";
  const reason = rs.includes("fake") || rs === "1" ? "fake proven" : rs.includes("revok") || rs === "2" ? "key revoked" : "";
  return { status, reason, flaggedAtBlock: d.flaggedAtBlock != null ? Number(d.flaggedAtBlock) : null };
}

// Plain-words device status, as in the mock ("Active", "Flagged at block 151 · reason: fake proven").
function deviceText(rec) {
  const d = deviceOf(rec);
  if (d.status === "flagged") return `Flagged at block ${d.flaggedAtBlock} · reason: ${d.reason || "unknown"}`;
  if (d.status === "active") return "Active";
  return "not registered";
}

// Normalised record state: "attested" | "accused" | "refunded" | "fake".
function stateOf(rec) {
  return String(rec?.state ?? "").toLowerCase();
}

// True when the challenge period of an attested record is over (by the chain's clock).
function challengeOver(rec) {
  return S.chain.timestamp > Number(rec.accusableUntil);
}

// True when refund() would succeed in the next block.
function refundable(rec) {
  return stateOf(rec) === "attested" && S.chain.timestamp + 1 >= Number(rec.refundableAt);
}

// Deposit amount locked in a record, as bigint (accepts a bigint amount or a boolean flag from the library).
function lockedOf(rec) {
  if (!rec) return 0n;
  const v = rec.depositLocked;
  if (typeof v === "boolean") return v ? big(S.ctx.params.bond) : 0n;
  return big(v ?? 0);
}

// Photo-state text for tables and the Verify record.
function photoStateText(rec) {
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  if (st === "fake") return "proven fake";
  if (st === "accused") return "under accusation (UMA vote pending)";
  if (st === "refunded") return "unchallenged: challenge period passed · deposit refunded";
  if (challengeOver(rec)) return "unchallenged: challenge period passed";
  if (dev.status === "flagged") return "attested, recorded before the flag";
  return "attested, can still be accused";
}

// Deposit text for tables and the Verify record.
function depositText(rec) {
  const st = stateOf(rec);
  if (st === "fake") return "lost to the accuser, minus UMA fee";
  if (st === "accused") return "B held by UMA until the vote";
  if (st === "refunded") return "B refunded (credited to the depositor)";
  if (challengeOver(rec)) return `B locked · refundable from ${fmtTime(rec.refundableAt)}`;
  return `B locked until ${fmtTime(rec.refundableAt)}`;
}

// ------------------------------------------------------------------ errors, busy state, buttons

// Shows a failed action in the red banner, with the library's message (the contract's revert reason).
function showError(what, e) {
  console.error(what, e);
  setText("error-message", `${what} failed: ${errText(e)}`);
  q("error-banner").classList.remove("hidden");
}

// Hides the error banner.
function hideError() {
  q("error-banner").classList.add("hidden");
}

// When each button may be clicked (besides "not while a transaction is pending").
const RULES = {
  "btn-register": () => !!S.device && !S.registered,
  "btn-goto-capture": () => !!S.registered,
  "btn-take-photo": () => !!S.stream,
  "btn-attest": () => !!S.device && !!S.registered && !!S.photo,
  "btn-download-photo": () => !!S.attested,
  "btn-goto-verify": () => !!S.attested,
  "btn-verify-last": () => !!S.attested,
  "btn-change-pixel": () => !!S.verify?.bytes,
  "btn-commit": () => !!q("select-accuse-photo").value && !S.acc?.commitment,
  "btn-reveal": () => !!S.acc?.commitment && !S.acc?.assertionId,
  "btn-vote-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-vote-not-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-accuse-new": () => !!S.acc?.commitment,
  "btn-withdraw-accuser": () => S.credits.accuser > 0n,
  "btn-withdraw-photographer": () => S.credits.photographer > 0n,
  "btn-deposits-withdraw": () => S.credits.photographer > 0n,
  "btn-revoke": () => !!S.device && !!S.registered && !S.revoked && !S.deviceFlag,
  "btn-revoke-verify": () => !!S.attested && !!S.revoked,
  "btn-accuse-verify": () => !!S.acc?.voted,
};

// Enables or disables every button from RULES, per-row flags (data-enabled) and the busy state.
function syncButtons() {
  for (const b of document.querySelectorAll("button")) {
    if (b.dataset.always) continue;
    const id = b.dataset.testid;
    let ok = true;
    if (RULES[id]) ok = RULES[id]();
    else if (b.dataset.enabled !== undefined) ok = b.dataset.enabled === "1";
    b.disabled = S.busy || !ok;
  }
}

// Runs one user action: one at a time, buttons disabled meanwhile, errors shown, everything refreshed afterwards.
// With tx = true the balance change of the action is shown next to each balance.
async function run(what, fn, { tx = true } = {}) {
  if (S.busy) return;
  S.busy = true;
  setText("busy-indicator", `${what}…`);
  q("busy-indicator").classList.remove("hidden");
  syncButtons();
  try {
    await fn();
  } catch (e) {
    showError(what, e);
  } finally {
    // Still busy while the page re-reads the chain, so nothing shows stale data or accepts a click meanwhile.
    try {
      await refreshAll({ deltas: tx ? "action" : false });
    } catch (e) {
      showError("Reading the chain", e);
    }
    S.busy = false;
    q("busy-indicator").classList.add("hidden");
    syncButtons();
  }
}

// ------------------------------------------------------------------ header

// Reads block number and time from the chain and shows them.
async function refreshChain() {
  const info = await S.lib.chainInfo(S.ctx);
  S.chain = { blockNumber: Number(info.blockNumber), timestamp: Number(info.timestamp) };
  setText("chain-block", S.chain.blockNumber);
  setText("local-time", fmtTime(S.chain.timestamp));
  q("chain-status").dataset.block = S.chain.blockNumber;
}

// Reads balances and credits; with deltas = true shows the change since the previous snapshot.
async function refreshBalances(deltas) {
  const b = await S.lib.balances(S.ctx);
  const prev = S.balances;
  const keys = ["photographer", "accuser", "store"];
  // Keep the deltas of the last transaction that moved money (a read with no change does not clear them).
  const moved = prev && keys.some((k) => big(b[k]) !== big(prev[k]));
  for (const k of keys) {
    setText(`balance-${k}`, tok(b[k]));
    if (prev && (deltas === "action" || (deltas && moved))) {
      const d = big(b[k]) - big(prev[k]);
      const el = q(`delta-${k}`);
      el.textContent = d === 0n ? "" : signed(d);
      el.className = "delta " + (d < 0n ? "down" : "up");
    }
  }
  S.balances = b;
  S.credits.photographer = big(await S.lib.credits(S.ctx, addr("photographer")));
  S.credits.accuser = big(await S.lib.credits(S.ctx, addr("accuser")));
  setText("credit-photographer", tok(S.credits.photographer));
  setText("credit-accuser", tok(S.credits.accuser));
  setText("deposits-credit", tok(S.credits.photographer));
  setText("header-credit-photographer", tok(S.credits.photographer));
  setText("header-credit-accuser", tok(S.credits.accuser));
}

// Refreshes the header, the record list and every view that depends on chain data.
async function refreshAll({ deltas = false } = {}) {
  await refreshChain();
  await refreshBalances(deltas);
  S.records = await S.lib.listRecords(S.ctx);
  await refreshDeviceStatus();
  renderDevice();
  renderCaptureRecord();
  renderAccuseSelect();
  renderAccuse();
  renderDeposits();
  renderRevoke();
  if (S.verify) await runVerify(false);
}

// Shows the static header data: addresses and parameters (all from the deployment and the contract).
function renderHeader() {
  const p = S.ctx.params;
  setText("addr-paprika", short(S.ctx.addresses.paprika));
  q("addr-paprika").title = S.ctx.addresses.paprika;
  setText("addr-oo", short(S.ctx.addresses.oo));
  q("addr-oo").title = S.ctx.addresses.oo;
  setText("param-bond", tok(p.bond));
  setText("param-photo-window", fmtDuration(p.photoWindow));
  setText("param-reveal-window", fmtDuration(p.revealWindow));
  setText("param-fee", String(p.feeShare));
  setText("token-symbol", p.tokenSymbol);
  const adv = Number(p.photoWindow) + Number(p.revealWindow) + 1;
  q("btn-advance-time").title = `Local-chain demo control: moves the chain clock forward by challenge period + reveal period + 1 s (${adv} s).`;
  setText("device-owner", short(addr("photographer")));
  q("device-owner").title = addr("photographer");
  setText("device-pop-owner", short(addr("photographer")));
  setText("accuser-address", short(addr("accuser")));
  q("accuser-address").title = addr("accuser");
}

// ------------------------------------------------------------------ Device

// Reads the status of the page's device from the contract (Paprika.devices(keyId)): "none" | "active" | "flagged".
// Falls back to a record of the device when the contract object is not available.
async function refreshDeviceStatus() {
  S.deviceFlag = null;
  if (!S.device) return (S.deviceStatus = "no key yet");
  let d = null;
  try {
    const raw = await S.ctx.contracts.paprika.devices(S.device.keyId);
    d = { device: { status: ["none", "active", "flagged"][Number(raw.status ?? raw[1])],
      reason: ["none", "fake-proven", "key-revoked"][Number(raw.reason ?? raw[2])], flaggedAtBlock: Number(raw.flaggedAtBlock ?? raw[3]) } };
  } catch {
    const mine = S.records.find((r) => same(r.keyId, S.device.keyId));
    if (mine) d = (await S.lib.verifyPhoto(S.ctx, mine.photoHash)).find((r) => same(r.keyId, S.device.keyId)) || null;
  }
  if (!d) return (S.deviceStatus = S.registered ? "Active" : "not registered");
  const info = deviceOf(d);
  if (info.status !== "none" && !S.registered) S.registered = { txHash: "", block: null };   // registered in an earlier session
  if (info.status === "none") S.registered = null;                                            // e.g. the chain was restarted
  if (info.status === "flagged") S.deviceFlag = info;
  S.deviceStatus = deviceText(d);
}

// Saves the device key in this browser (localStorage, per Paprika contract) so a reload keeps it. Test keys only.
async function saveDevice() {
  try {
    const key = "paprika-device:" + S.ctx.addresses.paprika.toLowerCase();
    if (S.device && S.dev.exportDevice) localStorage.setItem(key, JSON.stringify(await S.dev.exportDevice(S.device)));
  } catch (e) {
    console.warn("Could not save the device key", e);
  }
}

// Restores the device key saved by saveDevice(), if any.
async function loadDevice() {
  try {
    const saved = localStorage.getItem("paprika-device:" + S.ctx.addresses.paprika.toLowerCase());
    if (saved && S.dev.importDevice) S.device = await S.dev.importDevice(saved);
  } catch (e) {
    console.warn("Could not restore the device key", e);
  }
}

// Shows the device key and the registration steps.
function renderDevice() {
  const d = S.device;
  setText("device-key-id", d ? toHex(d.keyId) : "no key yet");
  setText("device-pubkey", d ? `x ${short(d.x, 6)} · y ${short(d.y, 6)}` : "no key yet");
  setText("device-step-key", d ? short(d.keyId) : "");
  setText("device-status", S.deviceStatus || "no key yet");
  q("device-status").dataset.status = S.deviceStatus.startsWith("Flagged") ? "flagged" : S.deviceStatus === "Active" ? "active" : "none";
  stepState("device-steps", { key: d ? "done" : "wait", pop: S.registered ? "done" : "wait", reg: S.registered ? "done" : "wait" });
  setTx("register-tx", S.registered?.txHash);
  setText("register-block", S.registered?.block != null ? `block ${S.registered.block}` : "");
}

// Creates a new device key in the page (the key is software: "Simulated device").
async function doGenerateKey() {
  S.device = await S.dev.createDevice();
  S.registered = null;
  S.revoked = null;
  await saveDevice();
  renderDevice();
}

// Registers the device key for free (proof of possession signed by the key, sent by the Photographer).
async function doRegister() {
  const r = await S.lib.registerDevice(S.ctx, "photographer", S.device);
  S.registered = { txHash: r.txHash, block: await blockOf(r.txHash) };
}

// ------------------------------------------------------------------ Capture

// Loads photo bytes into the Capture view (from camera, file or sample image) and resets the steps.
function loadCapturePhoto(bytes, type, name) {
  S.photo = { bytes, type, name };
  showImage(q("capture-preview"), bytes, type);
  q("capture-placeholder").classList.add("hidden");
  setText("capture-file-name", `${name} · ${bytes.length} bytes · ready to sign`);
  stepState("capture-steps", { anchor: "wait", hash: "wait", sig: "wait", approve: "wait", attest: "wait" });
  for (const id of ["capture-anchor-block", "capture-anchor-hash", "capture-hash", "capture-attest-block"]) setText(id, "");
  setTx("capture-approve-tx", ""); setTx("capture-attest-tx", "");
  syncButtons();
}

// Starts the camera preview (getUserMedia).
async function doStartCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API in this browser; use a file or the sample image");
  S.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const box = q("capture-preview");
  for (const el of box.querySelectorAll("img,video")) el.remove();
  const v = document.createElement("video");
  v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = S.stream;
  box.appendChild(v);
  q("capture-placeholder").classList.add("hidden");
  setText("capture-file-name", "Camera on: press Take photo.");
}

// Takes a JPEG frame from the camera, then stops the camera.
async function doTakePhoto() {
  const v = q("capture-preview").querySelector("video");
  const bytes = await videoFrame(v);
  for (const t of S.stream.getTracks()) t.stop();
  S.stream = null;
  loadCapturePhoto(bytes, "image/jpeg", `photo-${Date.now()}.jpg`);
}

// Signs the loaded photo with the device and attests it (approval + attest), then shows the record.
async function doAttest() {
  const { bytes, type, name } = S.photo;
  stepState("capture-steps", { anchor: "run", hash: "run", sig: "wait", approve: "wait", attest: "wait" });
  const local = toHex(await S.dev.sha256(bytes));
  setText("capture-hash", shortHash(local));
  q("capture-hash").title = local;
  stepState("capture-steps", { hash: "done" });

  let r;
  try {
    r = await S.lib.attestPhoto(S.ctx, "photographer", S.device, bytes);
  } catch (e) {
    stepState("capture-steps", { anchor: "bad", sig: "bad", approve: "bad", attest: "bad" });
    throw e;
  }
  const anchor = Number(r.anchorBlock);
  const block = await S.provider.getBlock(anchor).catch(() => null);
  setText("capture-anchor-block", `block ${anchor}`);
  setText("capture-anchor-block-text", anchor);
  setText("capture-anchor-hash", block ? short(block.hash) : "");
  q("capture-anchor-hash").title = block?.hash || "";
  setText("capture-signature", `"PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ ${shortHash(r.photoHash)} ‖ blockhash(${anchor})`);
  const hashes = r.txHashes || [];
  const attestTx = hashes[hashes.length - 1];
  const approveTx = hashes.length > 1 ? hashes[0] : "";
  setTx("capture-approve-tx", approveTx);
  if (!approveTx) setText("capture-approve-tx", "allowance already set");
  setTx("capture-attest-tx", attestTx);
  setText("capture-attest-block", `block ${await blockOf(attestTx)}`);
  stepState("capture-steps", { anchor: "done", sig: "done", approve: "done", attest: "done" });

  const rows = await S.lib.verifyPhoto(S.ctx, r.photoHash);
  const rec = rows.find((x) => same(x.keyId, r.keyId)) || rows[rows.length - 1];
  S.attested = { bytes, type, name, photoHash: toHex(r.photoHash), keyId: toHex(r.keyId), anchorBlock: anchor, rec };
  S.lastPhoto = `${S.attested.photoHash}|${S.attested.keyId}`;
  S.accChoice = "";
  renderCaptureRecord();
}

// Shows "The record" card of the last attested photo.
function renderCaptureRecord() {
  const a = S.attested;
  q("capture-record").classList.toggle("dim", !a);
  if (!a) return;
  setText("record-hash", shortHash(a.photoHash));
  q("record-hash").title = a.photoHash;
  setText("record-device", short(a.keyId));
  q("record-device").title = a.keyId;
  const B = a.rec ? Number(a.rec.recordedBlock) : "?";
  setText("record-window", `[${a.anchorBlock}, ${B}]`);
  setText("record-block-a", a.anchorBlock);
  setText("record-block-b", B);
  setText("record-deposit", `B = ${tok(S.ctx.params.bond)}`);
  setText("record-locked-until", a.rec ? fmtTime(a.rec.refundableAt) : "—");
}

// ------------------------------------------------------------------ Verify

// Loads a file into the Verify view and checks it.
async function loadVerifyFile(bytes, type, name) {
  S.verify = { bytes, type, name, hash: "", records: [] };
  showImage(q("verify-dropzone"), bytes, type);
  q("verify-placeholder").classList.add("hidden");
  setText("verify-file-name", name);
  await runVerify(true);
}

// Hashes the loaded file in the browser and asks the contract for its records; then renders the verdict.
async function runVerify(rehash) {
  const v = S.verify;
  if (rehash || !v.hash) v.hash = toHex(await S.dev.sha256(v.bytes));
  setText("verify-hash", `SHA-256 ${v.hash}`);
  v.records = await S.lib.verifyPhoto(S.ctx, v.hash);
  if (rehash && v.records.length) { S.lastPhoto = `${toHex(v.hash)}|${toHex(mainRecord(v.records).keyId)}`; S.accChoice = ""; }
  renderVerify();
}

// Picks the record to show when a file has several (one per device that attested it): this page's device first.
function mainRecord(records) {
  return records.find((r) => S.device && same(r.keyId, S.device.keyId)) || records[records.length - 1];
}

// Shows the verdict and the record, in the states of the mock.
function renderVerify() {
  const v = S.verify;
  const box = q("verify-status");
  const set = (cls, seal, title, detail, state) => {
    box.className = "verdict " + cls;
    box.dataset.state = state;
    setText("verify-seal", seal);
    setText("verify-title", title);
    setText("verify-detail", detail);
  };
  if (!v.records.length) {
    set("bad", "✕", "No record for this file", "No registered device signed this exact file. One changed pixel is enough: the hash differs.", "no-record");
    box.dataset.recordState = "none";
    q("verify-record").classList.add("hidden");
    q("verify-other-records").classList.add("hidden");
    return;
  }
  const rec = mainRecord(v.records);
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  box.dataset.recordState = st;
  if (st === "fake") {
    set("bad", "✕", "Proven fake · record kept and marked", "UMA vote: the evidence proves the fake (simulated vote). The depositor lost B.", "fake");
  } else if (st === "accused") {
    set("flag", "!", "Under accusation", "An accusation was revealed and sent to UMA; vote pending. The deposit is held by UMA as the dispute bond.", "accused");
  } else if (st === "refunded") {
    set("", "✓", "Challenge period passed · unchallenged", "Nobody proved this photo fake in time; the deposit went back to its owner. The record stays.", "unchallenged");
  } else if (dev.status === "flagged") {
    const why = dev.reason === "key revoked"
      ? `The key was revoked at block ${dev.flaggedAtBlock} by a signature naming the caller. No money moved; existing records and deposits are untouched.`
      : `Device ${short(rec.keyId)} was flagged at block ${dev.flaggedAtBlock} because one of its photos was proven fake. Its earlier records are still listed, with their deposits.`;
    set("flag", "!", `Device flagged · reason: ${dev.reason || "unknown"}`, why, dev.reason === "key revoked" ? "flagged-key-revoked" : "flagged-fake-proven");
  } else if (challengeOver(rec)) {
    set("", "✓", "Challenge period passed · unchallenged", "Nobody accused this photo in time; its deposit can now be refunded to its owner. The record stays.", "unchallenged");
  } else {
    set("", "✓", "Attested · deposit locked · can still be accused", `Device Active. Challenge period open until ${fmtTime(rec.accusableUntil)}.`, "attested");
  }

  q("verify-record").classList.remove("hidden");
  setText("verify-record-hash", shortHash(v.hash));
  q("verify-record-hash").title = v.hash;
  setText("verify-record-device", short(rec.keyId));
  q("verify-record-device").title = toHex(rec.keyId);
  setText("verify-device-status", deviceText(rec));
  const A = Number(rec.anchorBlock), B = Number(rec.recordedBlock);
  setText("verify-window", `signed after block ${A}, recorded in block ${B} (${fmtTime(rec.recordedAt)})`);
  setText("verify-photo-state", photoStateText(rec));
  setText("verify-deposit", depositText(rec));
  setText("verify-records-count", v.records.length === 1 ? "1 (one device)" : `${v.records.length} (one per device that signed it; showing ${short(rec.keyId)})`);
  setText("verify-block-a", A);
  setText("verify-block-b", B);

  // Flagged device: list its other records, which stay readable with their deposits.
  const others = dev.status === "flagged" ? S.records.filter((r) => same(r.keyId, rec.keyId) && !same(r.photoHash, v.hash)) : [];
  q("verify-other-records").classList.toggle("hidden", !others.length);
  const tb = q("verify-other-table").tBodies[0];
  tb.replaceChildren();
  for (const o of others) {
    const tr = tb.insertRow();
    tr.dataset.testid = "verify-other-row";
    const st2 = stateOf(o);
    const cells = [shortHash(o.photoHash), `[${o.anchorBlock}, ${o.recordedBlock}]`,
      st2 === "fake" ? "proven fake: the reason for the flag" : photoStateText(o), depositText(o)];
    cells.forEach((c, i) => { const td = tr.insertCell(); td.textContent = c; if (i === 0) td.className = "mono"; if (st2 === "fake" && i === 2) td.className = "no"; });
  }
}

// Changes one pixel of the loaded file and verifies again (expected: no record).
async function doChangePixel() {
  const v = S.verify;
  const out = await changeOnePixel(v.bytes, v.type);
  const name = v.name.replace(/ · one pixel changed.*$/, "") + ` · one pixel changed (${out.how})`;
  await loadVerifyFile(out.bytes, out.type, name);
}

// ------------------------------------------------------------------ Accuse

// Fills the photo selector from listRecords(), keeping the current choice (or the last attested / verified photo).
function renderAccuseSelect() {
  const sel = q("select-accuse-photo");
  // Keep the photo of the open accusation, else the user's choice, else the photo last attested or verified.
  const keep = (S.acc ? `${S.acc.photoHash}|${S.acc.keyId}` : "") || S.accChoice || S.lastPhoto || "";
  sel.replaceChildren();
  for (const r of S.records) {
    const o = document.createElement("option");
    o.value = `${toHex(r.photoHash)}|${toHex(r.keyId)}`;
    o.textContent = `${shortHash(r.photoHash)} · device ${short(r.keyId)} · window [${r.anchorBlock}, ${r.recordedBlock}] · ${stateOf(r)}`;
    sel.appendChild(o);
  }
  if (!S.records.length) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "no attested photo on the chain yet";
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  sel.disabled = !!S.acc?.commitment;
}

// Snapshot used for the Settle view: wallet balances, credits and the photo's locked deposit.
async function settleSnapshot(photoHash, keyId) {
  const b = await S.lib.balances(S.ctx);
  const rows = await S.lib.verifyPhoto(S.ctx, photoHash);
  const rec = rows.find((r) => same(r.keyId, keyId));
  return {
    accuser: big(b.accuser) + big(await S.lib.credits(S.ctx, addr("accuser"))),
    photographer: big(b.photographer) + big(await S.lib.credits(S.ctx, addr("photographer"))),
    store: big(b.store),
    locked: lockedOf(rec),
    depositor: rec?.depositor || "",
  };
}

// Step 1: commits the hash of the accusation and locks the accuser's bond B.
async function doCommit() {
  const [photoHash, keyId] = q("select-accuse-photo").value.split("|");
  const evidence = q("input-evidence").value.trim();
  if (!evidence) throw new Error("Write the evidence (a link or a hash of public evidence) first");
  const before = await settleSnapshot(photoHash, keyId);
  const r = await S.lib.commitAccusation(S.ctx, "accuser", { photoHash, keyId, evidence });
  const hashes = r.txHashes || [];
  const commitTx = hashes[hashes.length - 1];
  S.acc = { photoHash, keyId, evidence, before, commitment: toHex(r.commitment), salt: toHex(r.salt),
    evidenceHash: toHex(r.evidenceHash), commitTx, commitBlock: await blockOf(commitTx) };
}

// Step 2: reveals the accusation; the contract asserts it to UMA and disputes it at once.
async function doReveal() {
  const a = S.acc;
  const r = await S.lib.revealAccusation(S.ctx, "accuser", { photoHash: a.photoHash, keyId: a.keyId, evidenceHash: a.evidenceHash, salt: a.salt });
  a.revealTx = r.txHash;
  a.assertionId = toHex(r.assertionId);
  if (!r.assertionId || /^0x0*$/.test(a.assertionId)) {
    // The contract returns no assertion when the photo is already proven fake: the bond is credited back.
    a.assertionId = "";
    a.noAssertion = true;
  }
}

// Step 3: enters the simulated UMA vote (mock oracle), which settles the assertion; then measures the money moved.
async function doVote(fakeProven) {
  const a = S.acc;
  const r = await S.lib.umaVote(S.ctx, a.assertionId, fakeProven);
  a.voteTxs = r.txHashes || [];
  a.voted = true;
  a.fakeProven = fakeProven;
  a.after = await settleSnapshot(a.photoHash, a.keyId);
}

// Starts over with a new accusation (keeps nothing of the previous one).
function doNewAccusation() {
  S.acc = null;
  q("input-evidence").value = defaultEvidence();
  renderAccuse();
  renderAccuseSelect();
}

// Default evidence text, so the demo can be clicked through quickly.
function defaultEvidence() {
  return `https://example.org/evidence · same image published earlier · ${new Date().toISOString().slice(0, 10)}`;
}

// Shows the stepper and the panels of the current accusation.
function renderAccuse() {
  const a = S.acc;
  const k = !a?.commitment ? 0 : !a.assertionId && !a.noAssertion ? 1 : !a.voted ? 2 : 4;
  [1, 2, 3, 4].forEach((n) => { q(`accuse-step-${n}`).className = n - 1 < k ? "done" : n - 1 === k ? "cur" : ""; });
  q("accuse-panel-commit").classList.toggle("hidden", k < 1);
  q("accuse-panel-reveal").classList.toggle("hidden", k < 2 || !!a?.noAssertion);
  q("accuse-panel-vote").classList.toggle("hidden", k !== 2 || !!a?.noAssertion);
  q("accuse-panel-settle").classList.toggle("hidden", k !== 4);
  q("select-accuse-photo").disabled = k > 0;
  q("input-evidence").disabled = k > 0;
  setText("accuse-secret", a?.salt ? `${a.salt} (random, kept by the accuser)` : "random, created at commit and kept by the accuser");
  if (!a) return;
  setText("commit-commitment", a.commitment);
  setTx("commit-tx", a.commitTx);
  setText("commit-block", a.commitBlock != null ? `block ${a.commitBlock}` : "");
  setText("commit-status", a.noAssertion ? "revealed: photo already proven fake, bond credited back"
    : a.assertionId ? "revealed" : "revealable from the next block");
  setTx("reveal-tx", a.revealTx);
  setText("reveal-photo", shortHash(a.photoHash));
  setText("reveal-assertion-id", a.assertionId ? short(a.assertionId, 6) : "");
  q("reveal-assertion-id").title = a.assertionId || "";
  if (k === 4) renderSettle();
}

// Shows the money that moved (measured) next to the formulas with B and f.
function renderSettle() {
  const a = S.acc;
  const B = big(S.ctx.params.bond), fB = feeOfBond();
  const up = a.fakeProven;
  q("settle-row-fake").classList.toggle("hl", up);
  q("settle-row-not-proven").classList.toggle("hl", !up);
  q("settle-outcome").innerHTML = up ? '<span class="chip r">fake proven</span>' : '<span class="chip m">not proven</span>';
  q("settle-outcome").dataset.outcome = up ? "fake-proven" : "not-proven";
  const dA = a.after.accuser - a.before.accuser;
  const depIsPhotographer = same(a.before.depositor || a.after.depositor, addr("photographer"));
  const dD = a.after.photographer - a.before.photographer + (a.after.locked - a.before.locked);
  const dS = a.after.store - a.before.store;
  setText("settle-accuser", signed(dA));
  setText("settle-depositor", depIsPhotographer ? signed(dD) : "depositor is not the Photographer account: not measured");
  setText("settle-store", signed(dS));
  setText("settle-formula-accuser", up ? "−B (bond) + B back + (B − f×B) = +(B − f×B)" : "−B (bond lost)");
  setText("settle-formula-depositor", up ? "−B (deposit lost)" : "B kept + (B − f×B) = +(B − f×B)");
  setText("settle-formula-store", "+f×B");
  setText("settle-expected-accuser", up ? signed(B - fB) : signed(-B));
  setText("settle-expected-depositor", up ? signed(-B) : signed(B - fB));
  setText("settle-expected-store", signed(fB));
  const txs = a.voteTxs || [];
  setText("vote-tx", txs.length ? `vote + settle: ${txs.map((h) => "tx " + short(h)).join(", ")}` : "");
  q("vote-tx").title = txs.join("\n");
}

// Withdraws the credit of a role to its wallet (the contract pays by credits).
async function doWithdraw(role) {
  await S.lib.withdrawCredit(S.ctx, role);
}

// ------------------------------------------------------------------ Deposits

// Shows the Photographer's records with their state, refund time and Refund button.
function renderDeposits() {
  const tb = q("deposits-table").tBodies[0];
  tb.replaceChildren();
  const mine = S.records.filter((r) => same(r.depositor, addr("photographer")));
  q("deposits-empty").classList.toggle("hidden", mine.length > 0);
  for (const r of mine) {
    const tr = tb.insertRow();
    tr.dataset.testid = "deposit-row";
    tr.dataset.photoHash = toHex(r.photoHash);
    tr.dataset.state = stateOf(r);
    const st = stateOf(r);
    const stText = st === "attested" ? (challengeOver(r) ? "unchallenged" : "attested") : st === "refunded" ? "unchallenged · refunded" : st === "accused" ? "under accusation" : "proven fake";
    const cells = [shortHash(r.photoHash), short(r.keyId), `[${r.anchorBlock}, ${r.recordedBlock}]`, stText,
      st === "attested" ? "B locked" : st === "accused" ? "B held by UMA" : st === "refunded" ? "B refunded" : "lost",
      st === "attested" || st === "accused" ? fmtTime(r.refundableAt) : "—"];
    cells.forEach((c, i) => {
      const td = tr.insertCell();
      td.textContent = c;
      if (i === 0 || i === 1) { td.className = "mono"; td.title = toHex(i === 0 ? r.photoHash : r.keyId); }
      if (i === 3) td.dataset.testid = "deposit-state";
    });
    const td = tr.insertCell();
    const b = document.createElement("button");
    b.dataset.testid = "btn-refund";
    b.dataset.photoHash = toHex(r.photoHash);
    b.textContent = st === "refunded" ? "Refunded" : "Refund";
    b.dataset.enabled = refundable(r) ? "1" : "0";
    b.title = refundable(r) ? "Credit the deposit back to the depositor" : `Possible from ${fmtTime(r.refundableAt)}`;
    b.addEventListener("click", () => run("Refund", () => S.lib.refund(S.ctx, "photographer", { photoHash: toHex(r.photoHash), keyId: toHex(r.keyId) })));
    td.appendChild(b);
  }
}

// Re-checks, by the chain's clock, which Refund buttons may be clicked (without re-creating the rows).
function updateRefundButtons() {
  for (const b of document.querySelectorAll('[data-testid="btn-refund"]')) {
    const r = S.records.find((x) => same(x.photoHash, b.dataset.photoHash) && same(x.depositor, addr("photographer")));
    if (r) b.dataset.enabled = refundable(r) ? "1" : "0";
  }
}

// ------------------------------------------------------------------ Revoke

// Shows the device to revoke and the result of a revocation.
function renderRevoke() {
  const d = S.device;
  setText("revoke-device", d ? `demo-cam · ${short(d.keyId)} · ${S.deviceStatus}` : "no device key in this page (create one on Device)");
  // Why Revoke is disabled, in plain words.
  setText("revoke-why", !d ? "Create and register a device key first (Device tab)."
    : !S.registered ? "Register the device first (Device tab)."
    : S.deviceFlag && !S.revoked ? `This device is already flagged (reason: ${S.deviceFlag.reason}); a flagged key cannot be revoked.`
    : S.revoked ? "This key is revoked." : "");
  setText("revoke-message", `"PAPRIKA/REVOKE" ‖ chainId ‖ contract ‖ keyId${d ? " " + short(d.keyId) : ""} ‖ caller ${short(addr("photographer"))}`);
  q("revoke-result").classList.toggle("dim", !S.revoked);
  setTx("revoke-tx", S.revoked?.txHash);
  setText("revoke-status", S.revoked ? `Device flagged · reason: key revoked · block ${S.revoked.block}` : "Device flagged · reason: key revoked");
}

// Revokes the page's device key: signed by the key, naming the caller; no money moves.
async function doRevoke() {
  const r = await S.lib.revokeKey(S.ctx, "photographer", S.device);
  S.revoked = { txHash: r.txHash, block: await blockOf(r.txHash) };
}

// ------------------------------------------------------------------ navigation, activity log, wiring

// Shows the view named in the URL hash (#device, #capture, ...), as in the mock.
function showView() {
  const v = (location.hash || "#device").slice(1);
  const known = ["device", "capture", "verify", "accuse", "deposits", "revoke"];
  const view = known.includes(v) ? v : "device";
  for (const e of document.querySelectorAll(".view")) e.classList.toggle("on", e.id === "view-" + view);
  for (const a of document.querySelectorAll("nav a")) a.classList.toggle("on", a.dataset.v === view);
}

// Adds one transaction to the activity log (newest last).
function logActivity({ blockNumber, txHash, call, from }) {
  const tb = q("activity-log-table").tBodies[0];
  const tr = tb.insertRow();
  tr.dataset.testid = "activity-row";
  tr.dataset.hash = txHash || "";
  [String(blockNumber ?? ""), txHash ? short(txHash) : "—", call || "", from ? roleOf(from) : ""].forEach((c, i) => {
    const td = tr.insertCell();
    td.textContent = c;
    if (i === 1) { td.className = "mono"; td.title = txHash || ""; }
  });
  // A transaction made outside this page (e.g. by the CLI): refresh soon so the header stays true.
  clearTimeout(S.extTimer);
  S.extTimer = setTimeout(() => {
    if (!S.busy) refreshAll({ deltas: "external" }).then(syncButtons).catch((e) => console.warn(e));
  }, 600);
}

// Opens the hidden file input and hands the chosen file to a callback.
function pickFile(inputId, onFile) {
  const input = q(inputId);
  input.onchange = async () => {
    const f = input.files[0];
    input.value = "";
    if (f) await onFile(f);
  };
  input.click();
}

// Connects every button to its action.
function wire() {
  const on = (id, fn) => q(id).addEventListener("click", fn);
  on("btn-dismiss-error", hideError);
  on("btn-advance-time", () => run("Advance time", async () => {
    const p = S.ctx.params;
    await S.lib.advanceTime(S.ctx, Number(p.photoWindow) + Number(p.revealWindow) + 1);
  }));
  // Device
  on("btn-generate-key", () => run("Generate key", doGenerateKey, { tx: false }));
  on("btn-register", () => run("Register", doRegister));
  on("btn-goto-capture", () => { location.hash = "#capture"; });
  // Capture
  on("btn-start-camera", () => run("Start camera", doStartCamera, { tx: false }));
  on("btn-take-photo", () => run("Take photo", doTakePhoto, { tx: false }));
  on("btn-choose-file", () => pickFile("input-capture-file", (f) =>
    run("Load file", async () => loadCapturePhoto(await blobBytes(f), f.type, f.name), { tx: false })));
  on("btn-sample-image", () => run("Sample image", async () =>
    loadCapturePhoto(await sampleImage(), "image/jpeg", `sample-${Date.now()}.jpg`), { tx: false }));
  on("btn-attest", () => run("Sign & submit", doAttest));
  on("btn-download-photo", () => download(S.attested.bytes, `paprika-${S.attested.photoHash.slice(2, 10)}.${S.attested.type === "image/png" ? "png" : "jpg"}`, S.attested.type));
  on("btn-goto-verify", () => { location.hash = "#verify"; run("Verify", () => loadVerifyFile(S.attested.bytes, S.attested.type, S.attested.name), { tx: false }); });
  // Verify
  on("btn-verify-choose-file", () => pickFile("input-verify-file", (f) =>
    run("Verify", async () => loadVerifyFile(await blobBytes(f), f.type, f.name), { tx: false })));
  on("btn-verify-last", () => run("Verify", () => loadVerifyFile(S.attested.bytes, S.attested.type, S.attested.name), { tx: false }));
  on("btn-change-pixel", () => run("Change one pixel", doChangePixel, { tx: false }));
  const dz = q("verify-dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (f) run("Verify", async () => loadVerifyFile(await blobBytes(f), f.type, f.name), { tx: false });
  });
  // Accuse
  q("select-accuse-photo").addEventListener("change", (e) => { S.accChoice = e.target.value; syncButtons(); });
  on("btn-refresh-records", () => run("Reload records", async () => {}, { tx: false }));
  on("btn-commit", () => run("Commit", doCommit));
  on("btn-reveal", () => run("Reveal", doReveal));
  on("btn-vote-fake", () => run("UMA vote (simulated)", () => doVote(true)));
  on("btn-vote-not-fake", () => run("UMA vote (simulated)", () => doVote(false)));
  on("btn-accuse-new", () => { doNewAccusation(); syncButtons(); });
  on("btn-withdraw-accuser", () => run("Withdraw credit (Accuser)", () => doWithdraw("accuser")));
  on("btn-withdraw-photographer", () => run("Withdraw credit (Photographer)", () => doWithdraw("photographer")));
  on("btn-accuse-verify", () => {
    location.hash = "#verify";
    const a = S.acc;
    const bytes = S.attested && same(S.attested.photoHash, a.photoHash) ? S.attested : null;
    if (bytes) run("Verify", () => loadVerifyFile(bytes.bytes, bytes.type, bytes.name), { tx: false });
    else run("Verify", async () => { S.verify = { bytes: null, type: "", name: `photo ${shortHash(a.photoHash)} (by hash)`, hash: a.photoHash, records: [] };
      setText("verify-file-name", S.verify.name); await runVerify(false); }, { tx: false });
  });
  // Deposits
  on("btn-deposits-withdraw", () => run("Withdraw credit", () => doWithdraw("photographer")));
  on("btn-deposits-refresh", () => run("Reload deposits", async () => {}, { tx: false }));
  // Revoke
  on("btn-revoke", () => run("Revoke key", doRevoke));
  on("btn-revoke-verify", () => { location.hash = "#verify"; run("Verify", () => loadVerifyFile(S.attested.bytes, S.attested.type, S.attested.name), { tx: false }); });
  addEventListener("hashchange", showView);
}

// Shows the full-page message when the system is not running.
function fatal(reason) {
  setText("fatal-reason", reason);
  q("fatal-message").classList.remove("hidden");
}

// Starts the page: loads the deployment and the library, connects, renders, then keeps the header fresh.
async function main() {
  let deployment;
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`/deployment.json: HTTP ${res.status}`);
    deployment = await res.json();
  } catch (e) {
    return fatal(`No deployment found (${errText(e)}). The deploy script writes app/web/deployment.json.`);
  }
  try {
    S.dev = await import("/lib/device.js");
    S.lib = await import("/lib/paprika.js");
  } catch (e) {
    return fatal(`The Paprika library could not be loaded (${errText(e)}).`);
  }
  const rpcUrl = deployment.rpcUrl || DEFAULT_RPC;
  try {
    S.ctx = await S.lib.connect({ rpcUrl, deployment });
    S.provider = S.ctx.provider || new ethers.JsonRpcProvider(rpcUrl);
    await refreshChain();
  } catch (e) {
    return fatal(`The local chain at ${rpcUrl} does not answer, or the deployment does not match it (${errText(e)}).`);
  }
  renderHeader();
  wire();
  showView();
  q("input-evidence").value = defaultEvidence();
  await loadDevice();
  S.lib.onActivity(S.ctx, logActivity);
  await run("Reading the chain", async () => {}, { tx: false });
  // Keep block number and time fresh; mark the chain as down if it stops answering.
  setInterval(async () => {
    if (S.busy) return;
    try {
      await refreshChain();
      q("chain-dot").classList.remove("off");
      updateRefundButtons();
      syncButtons();
    } catch {
      q("chain-dot").classList.add("off");
    }
  }, 3000);
}

window.paprikaState = S;   // read-only handle for debugging and the end-to-end test
main();
