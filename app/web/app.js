// Paprika demo web UI: page logic.
// Three actor tabs (Photographer, Verifier, Accuser) wired to the local chain through the shared library
// (/lib/device.js and /lib/paprika.js). After every action the "What just happened" panel names the protocol step,
// says in one or two sentences what happened and why the rule exists (wording from docs/design-rationale.md), and
// lists the transactions of that action. Every amount and duration shown comes from the chain (ctx.params).
// Flow of each action: run() disables the buttons, collects the transactions the library reports (onActivity),
// shows the revert reason on failure, then re-reads the chain and re-renders every view.

import {
  q, setText, toHex, short, shortHash, same, fmtTime, fmtDuration, errText, big,
  blobBytes, sampleImage, videoFrame, changeOnePixel, showImage, download,
} from "./util.js";

// Everything the page knows. The device key is also kept in localStorage; the rest lives for the session.
const S = {
  lib: null, dev: null, ctx: null,
  chain: { blockNumber: 0, timestamp: 0 },
  balances: null,
  credits: { photographer: 0n, accuser: 0n },
  busy: false,
  device: null,        // createDevice()/importDevice() result
  registered: null,    // { txHash, block } once the key is registered
  deviceStatus: "",    // plain-words device status
  deviceFlag: null,    // { reason, flaggedAtBlock } when the device is flagged
  revoked: null,       // { txHash, block }
  photo: null,         // photo loaded for capture: { bytes, type, name }
  attested: null,      // last attested photo: { bytes, type, name, photoHash, keyId, anchorBlock, anchorHash, rec, txs }
  files: new Map(),    // photoHash -> { bytes, type, name }, for Download in "My photos"
  verify: null,        // file loaded on Verifier: { bytes, type, name, hash, records }
  records: [],         // listRecords()
  acc: null,           // current accusation
  accChoice: "", lastPhoto: "",
  stream: null,        // camera stream
  actionTxs: [],       // transactions reported by the library during the current action
  timeline: [],        // readable timeline entries
};
window.paprikaState = S;   // read-only handle for debugging and the end-to-end test

// ------------------------------------------------------------------ small helpers

// Address of a role ("photographer" | "accuser" | "operator" | ...), from the library context.
function addr(role) {
  const a = S.ctx?.accounts?.[role];
  return typeof a === "string" ? a : a?.address || "";
}

// Actor of a transaction: { key, name, cls } from the library's role, or else from the sender address.
function actorOf(item) {
  let role = String(item.role || "");
  if (!role) for (const r of Object.keys(S.ctx.accounts || {})) if (same(addr(r), item.from)) role = r;
  if (role === "photographer") return { key: "ph", name: "Photographer", cls: "act-ph" };
  if (role === "accuser") return { key: "ac", name: "Accuser", cls: "act-ac" };
  const v = role.match(/voter\s*(\d+)/i);
  if (v) return { key: "uma", name: `UMA voter ${v[1]}`, cls: "act-uma" };
  if (role === "operator") return { key: "uma", name: "Anyone (operator)", cls: "act-uma" };
  return { key: "uma", name: role || short(item.from), cls: "act-uma" };
}

// Token amount with its symbol (the library's formatToken already adds it).
function tok(amount) {
  const sym = S.ctx.params.tokenSymbol || "";
  const s = S.lib.formatToken(S.ctx, big(amount));
  return s.includes(sym) ? s : `${s} ${sym}`.trim();
}

// Signed token amount: "+5 WETH", "−10 WETH", "0 WETH".
function signed(amount) {
  const a = big(amount);
  if (a === 0n) return tok(0n);
  return (a > 0n ? "+" : "−") + tok(a < 0n ? -a : a);
}

// UMA's fee f×B, from the fee share (a fraction) and the bond.
function feeOfBond() {
  return (big(S.ctx.params.bond) * BigInt(Math.round(Number(S.ctx.params.feeShare) * 1e9))) / 1000000000n;
}

// Shows a long value shortened, with the full value on hover and on click (see the click handler in wire()).
function setShort(testid, value, keep = 6) {
  const el = q(testid);
  if (!el) return;
  const full = toHex(value);
  el.classList.add("short");
  el.dataset.full = full;
  el.dataset.short = full ? short(full, keep) : "";
  el.textContent = el.dataset.short;
  el.title = full ? full + " (click to expand)" : "";
}

// Renders a list of transactions as "label tx 0x12…ab" lines into an element.
function renderTxList(el, txs) {
  el.replaceChildren();
  el.classList.add("txlist");
  for (const t of txs) {
    const div = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = describe(t).text;
    const h = document.createElement("span");
    h.className = "tx";
    h.textContent = "tx " + short(t.txHash);
    h.title = `${t.txHash} · block ${t.blockNumber} · ${t.call}`;
    div.append(label, h);
    el.appendChild(div);
  }
}

// ETH wrapped into WETH by each role in these transactions (WETH9.deposit carries the amount as the tx value).
// Counted as WETH spent, so that "money moved" includes what the library wrapped just before paying.
async function wrappedBy(txs) {
  const out = { photographer: 0n, accuser: 0n };
  for (const t of txs) {
    if (!/deposit|wrap/i.test(String(t.call)) || /attest|refund/i.test(String(t.call))) continue;
    const key = actorOf(t).key === "ph" ? "photographer" : actorOf(t).key === "ac" ? "accuser" : null;
    if (!key) continue;
    try { const tx = await S.ctx.provider.getTransaction(t.txHash); out[key] += big(tx?.value ?? 0); } catch { /* unknown: count 0 */ }
  }
  return out;
}

// Block number of a mined transaction (null if unknown).
async function blockOf(txHash) {
  try { const r = await S.ctx.provider.getTransactionReceipt(txHash); return r ? r.blockNumber : null; } catch { return null; }
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

// Plain-words device status ("Active", "Flagged at block 151 · reason: fake proven").
function deviceText(rec) {
  const d = deviceOf(rec);
  if (d.status === "flagged") return `Flagged at block ${d.flaggedAtBlock} · reason: ${d.reason || "unknown"}`;
  return d.status === "active" ? "Active" : "not registered";
}

const stateOf = (rec) => String(rec?.state ?? "").toLowerCase();               // attested | accused | refunded | fake
const challengeOver = (rec) => S.chain.timestamp > Number(rec.accusableUntil);   // by the chain's clock
const refundable = (rec) => stateOf(rec) === "attested" && S.chain.timestamp + 1 >= Number(rec.refundableAt);

// Locked deposit of a record as bigint (the library returns a bigint amount).
function lockedOf(rec) {
  if (!rec) return 0n;
  const v = rec.depositLocked;
  if (typeof v === "boolean") return v ? big(S.ctx.params.bond) : 0n;
  return big(v ?? 0);
}

// Short state label and chip class of a record, as the Photographer sees it.
function stateChip(rec) {
  const st = stateOf(rec);
  if (st === "fake") return ["proven fake", "r"];
  if (st === "accused") return ["under accusation", "p"];
  if (st === "refunded") return ["unchallenged · refunded", "m"];
  if (challengeOver(rec)) return ["unchallenged", "m"];
  return ["attested · can be accused", "s"];
}

// Deposit text of a record.
function depositText(rec) {
  const st = stateOf(rec);
  if (st === "fake") return "lost to the accuser";
  if (st === "accused") return "B held by UMA until the vote";
  if (st === "refunded") return "B refunded (credit)";
  if (refundable(rec)) return `B locked · refundable now`;
  if (challengeOver(rec)) return `B locked · refundable from ${fmtTime(rec.refundableAt)}`;
  return `B locked until ${fmtTime(rec.refundableAt)}`;
}

// ------------------------------------------------------------------ readable descriptions of transactions

// Turns one library activity item into a readable line: { actor, text, group }.
// The label comes from the library's `call` name (e.g. "Paprika.attest", "WETH.deposit"), never from position.
function describe(item) {
  const c = String(item.call || "");
  const actor = actorOf(item);
  const B = "B";
  const rules = [
    [/register/i, "registered the device key (free)"],
    [/weth.*deposit|\.deposit\b|wrap/i, "wrapped ETH into WETH"],
    [/approve/i, `allowed Paprika to take ${B}`],
    [/\.attest/i, `attested a photo · deposit ${B} locked`],
    [/commitClaim/i, `committed an accusation · bond ${B} locked`],
    [/revealClaim/i, "revealed · Paprika asserted to UMA and disputed at once"],
    [/commit/i, "committed a hidden vote", "vote-commit"],
    [/reveal/i, "revealed a vote", "vote-reveal"],
    [/pushPrice/i, "entered the vote result"],
    [/settle/i, "settled the assertion · Paprika credited the winner"],
    [/refund/i, `refunded the deposit ${B} (as credit)`],
    [/withdrawCredit/i, "withdrew credit to the wallet"],
    [/revokeKey/i, "revoked the device key · no money moves"],
  ];
  for (const [re, text, group] of rules) if (re.test(c)) return { actor, text, group, full: `${actor.name} ${text}` };
  return { actor, text: c, full: `${actor.name}: ${c}` };
}

// Adds one transaction to the timeline; consecutive voter commits or reveals are grouped ("UMA voters: 3 commits").
function addTimeline(item) {
  const d = describe(item);
  const last = S.timeline[S.timeline.length - 1];
  if (d.group && last && last.group === d.group) {
    last.items.push(item);
    last.text = `UMA voters: ${last.items.length} ${d.group === "vote-commit" ? "vote commits" : "vote reveals"}`;
  } else {
    S.timeline.push({ cls: d.actor.cls, text: d.group ? `UMA voters: 1 ${d.group === "vote-commit" ? "vote commit" : "vote reveal"}` : d.full,
      group: d.group, items: [item] });
  }
  renderTimeline();
}

// Adds a timeline entry that is not a transaction (e.g. the demo clock).
function addTimelineNote(text, raw) {
  S.timeline.push({ cls: "", text, items: [], raw });
  renderTimeline();
}

// Draws the timeline, newest last.
function renderTimeline() {
  const ol = q("activity-log-table");
  ol.replaceChildren();
  for (const e of S.timeline) {
    const li = document.createElement("li");
    li.dataset.testid = "activity-row";
    const dot = document.createElement("i");
    if (e.cls) dot.className = e.cls;
    const body = document.createElement("div");
    body.textContent = e.text;
    const raw = document.createElement("div");
    raw.className = "raw";
    raw.textContent = e.raw || e.items.map((i) => `block ${i.blockNumber} · ${i.call}`).join("\n");
    body.appendChild(raw);
    const h = document.createElement("span");
    h.className = "tx";
    if (e.items.length) {
      h.textContent = short(e.items[0].txHash) + (e.items.length > 1 ? ` +${e.items.length - 1}` : "");
      h.title = e.items.map((i) => i.txHash).join("\n");
      li.dataset.hash = e.items[0].txHash;
    }
    li.append(dot, body, h);
    ol.appendChild(li);
  }
  q("timeline-empty").classList.toggle("hidden", S.timeline.length > 0);
  ol.scrollTop = ol.scrollHeight;
}

// ------------------------------------------------------------------ the explainer ("What just happened")

// Revert reasons of Paprika.sol in plain words.
const REVERT_WHY = {
  "not active": "The device is not Active (flagged, or not registered): a flagged device cannot attest, and cannot be revoked again.",
  "too early": "Too early. A refund needs the challenge period plus the reveal period to have passed; a reveal needs at least one block after the commit.",
  "too late": "The reveal period is over. The bond of this commitment can only be burned now.",
  refunded: "The deposit of this photo was already refunded: nothing is at stake, so it can no longer be accused.",
  "accusation open": "This photo already has an open accusation. Only one at a time: the deposit is the stake of that dispute.",
  "outside window": "The commitment was not made inside the photo's challenge period.",
  "no record": "There is no record for this photo and device.",
  "no commit": "No live commitment matches this reveal.",
  "no credit": "This account has no credit to withdraw.",
  "key used": "This key was registered before. A key registers only once, ever.",
  exists: "This device already attested this exact file.",
  anchor: "The signed block is older than the last 256 blocks.",
  "bad sig": "The signature does not match the device key.",
};

// Shows a step in the explainer: title (with actor chip), what happened, why the rule exists, and the transactions.
function explain(step, text, why = "", txs = S.actionTxs, actor = "") {
  const st = q("explainer-step");
  st.replaceChildren();
  if (actor) {
    const chip = document.createElement("span");
    chip.className = "chip " + ({ Photographer: "act-ph", Verifier: "act-ve", Accuser: "act-ac", UMA: "act-uma", Demo: "" }[actor] || "");
    chip.textContent = actor;
    st.appendChild(chip);
  }
  st.append(step);
  const t = q("explainer-text");
  if (Array.isArray(text)) {
    const ul = document.createElement("ul");
    for (const line of text) { const li = document.createElement("li"); li.textContent = line; ul.appendChild(li); }
    t.replaceChildren(ul);
  } else t.textContent = text;
  setText("explainer-why", why ? "Why: " + why : "");
  const ch = q("explainer-chain");
  if (txs && txs.length) {
    renderTxList(ch, txs);
    const h = document.createElement("b");
    h.textContent = "On chain";
    ch.prepend(h);
  } else ch.replaceChildren();
  q("explainer").dataset.step = step;
}

// The explainer before any action: the protocol in three lines.
function explainIntro() {
  explain("Paprika in three lines", [
    "A registered device signs each photo hash together with a recent block hash; whoever sends it locks a deposit B.",
    "Anyone can accuse a photo by staking an equal bond B; UMA's voters decide, and whoever is wrong loses B.",
    "If nobody accuses the photo within the challenge period, the deposit goes back. No record is ever deleted.",
  ], "", []);
}

// ------------------------------------------------------------------ errors, busy state, buttons

// Shows a failed action in the banner and in the explainer, with the contract's revert reason in plain words.
function showError(what, e) {
  console.error(what, e);
  const reason = errText(e);
  setText("error-message", `${what} failed: ${reason}`);
  q("error-banner").classList.remove("hidden");
  explain(`Rejected: ${what}`, `The transaction was refused with the reason "${reason}". Nothing changed on chain.`, REVERT_WHY[reason] || "");
}

// When each button may be clicked (besides "not while an action is running").
const RULES = {
  "btn-register": () => !S.registered,
  "btn-take-photo": () => !!S.stream,
  "btn-attest": () => !!S.device && !!S.registered && !!S.photo && !S.deviceFlag,
  "btn-verify-last": () => !!S.attested,
  "btn-change-pixel": () => !!S.verify?.bytes,
  "btn-commit": () => !!q("select-accuse-photo").value && !S.acc?.commitment,
  "btn-reveal": () => !!S.acc?.commitment && !S.acc?.assertionId && !S.acc?.noAssertion,
  "btn-vote-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-vote-not-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-accuse-new": () => !!S.acc?.commitment,
  "btn-accuse-verify": () => !!S.acc?.voted,
  "btn-withdraw-accuser": () => S.credits.accuser > 0n,
  "btn-withdraw-photographer": () => S.credits.photographer > 0n,
  "btn-deposits-withdraw": () => S.credits.photographer > 0n,
  "btn-revoke": () => !!S.device && !!S.registered && !S.revoked && !S.deviceFlag,
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

// Runs one user action: one at a time, buttons disabled meanwhile, transactions collected, errors shown, then
// everything re-read from the chain. `after` (optional) explains the result once the chain was re-read.
async function run(what, fn, { tx = true, after = null } = {}) {
  if (S.busy) return;
  S.busy = true;
  S.actionTxs = [];
  setText("busy-indicator", `${what}…`);
  q("busy-indicator").classList.remove("hidden");
  syncButtons();
  let ok = false;
  try {
    await fn();
    ok = true;
  } catch (e) {
    showError(what, e);
  }
  try {
    S.wrapped = await wrappedBy(S.actionTxs);
    await refreshAll({ deltas: tx ? "action" : false });   // still busy: nothing shows stale data meanwhile
    if (ok && after) after();
  } catch (e) {
    showError("Reading the chain", e);
  }
  S.busy = false;
  q("busy-indicator").classList.add("hidden");
  syncButtons();
}

// ------------------------------------------------------------------ header and refresh

// Reads block number and time from the chain.
async function refreshChain() {
  const info = await S.lib.chainInfo(S.ctx);
  S.chain = { blockNumber: Number(info.blockNumber), timestamp: Number(info.timestamp) };
  setText("chain-block", S.chain.blockNumber);
  setText("local-time", fmtTime(S.chain.timestamp));
  setText("clock-time", fmtTime(S.chain.timestamp));
  setText("chain-label", `local chain · block ${S.chain.blockNumber}`);
  q("chain-status").dataset.block = S.chain.blockNumber;
}

// Reads balances and credits; with deltas = "action" shows the change caused by the last action.
async function refreshBalances(deltas) {
  const b = await S.lib.balances(S.ctx);
  const prev = S.balances;
  const keys = ["photographer", "accuser", "store"];
  const moved = prev && keys.some((k) => big(b[k]) !== big(prev[k]));
  for (const k of keys) {
    setText(`balance-${k}`, tok(b[k]));
    if (prev && (deltas === "action" || (deltas && moved))) {
      const d = big(b[k]) - big(prev[k]) - big(S.wrapped?.[k] ?? 0);   // ETH wrapped in this action counts as spent WETH
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
  setText("header-credit-photographer", S.credits.photographer ? `+ ${tok(S.credits.photographer)} credit` : "");
  setText("header-credit-accuser", S.credits.accuser ? `+ ${tok(S.credits.accuser)} credit` : "");
}

// Re-reads the chain and re-renders every view.
async function refreshAll({ deltas = false } = {}) {
  await refreshChain();
  await refreshBalances(deltas);
  S.records = await S.lib.listRecords(S.ctx);
  await refreshDeviceStatus();
  renderDevice();
  renderCapture();
  renderDeposits();
  renderRevoke();
  renderAccuseSelect();
  renderAccuse();
  if (S.verify) await runVerify(false);
}

// Fills the "Protocol parameters and contracts" panel (all values from the deployment and the contract).
function renderParams() {
  const p = S.ctx.params, a = S.ctx.addresses;
  setText("param-bond", tok(p.bond));
  setText("param-photo-window", fmtDuration(p.photoWindow));
  setText("param-reveal-window", fmtDuration(p.revealWindow));
  setText("param-fee", String(p.feeShare));
  setText("token-symbol", p.tokenSymbol);
  setShort("addr-token", a.currency, 4);
  setShort("addr-paprika", a.paprika, 4);
  setShort("addr-oo", a.oo, 4);
  setShort("addr-store", a.store, 4);
  setShort("device-owner", addr("photographer"), 4);
  setShort("accuser-address", addr("accuser"), 4);
  q("btn-advance-time").title = `Local-chain demo control: moves the chain clock forward by T_photo + T_reveal + 1 s (${fmtDuration(Number(p.photoWindow) + Number(p.revealWindow) + 1)}).`;
}

// ------------------------------------------------------------------ Photographer: device

// Reads the status of the page's device from the contract (Paprika.devices(keyId)).
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
  if (info.status !== "none" && !S.registered) S.registered = { txHash: "", block: null };   // registered earlier
  if (info.status === "none") S.registered = null;                                            // e.g. chain restarted
  if (info.status === "flagged") S.deviceFlag = info;
  S.deviceStatus = deviceText(d);
}

// Saves / restores the device key in this browser (per Paprika contract). Test keys only.
const deviceStoreKey = () => "paprika-device:" + S.ctx.addresses.paprika.toLowerCase();
async function saveDevice() {
  try { if (S.device && S.dev.exportDevice) localStorage.setItem(deviceStoreKey(), JSON.stringify(await S.dev.exportDevice(S.device))); }
  catch (e) { console.warn("Could not save the device key", e); }
}
async function loadDevice() {
  try { const s = localStorage.getItem(deviceStoreKey()); if (s && S.dev.importDevice) S.device = await S.dev.importDevice(s); }
  catch (e) { console.warn("Could not restore the device key", e); }
}

// Shows the device card.
function renderDevice() {
  const d = S.device;
  setShort("device-key-id", d?.keyId || "", 8);
  setText("device-pubkey", d ? `x ${short(d.x, 6)} · y ${short(d.y, 6)}` : "—");
  const st = q("device-status");
  st.textContent = d ? `Device ${short(d.keyId)} · ${S.deviceStatus}` : "no key yet";
  st.dataset.status = S.deviceFlag ? "flagged" : S.registered ? "active" : "none";
  st.className = "status " + (S.deviceFlag ? "am" : "");
  const rt = q("register-tx");
  rt.textContent = S.registered?.txHash ? "tx " + short(S.registered.txHash) : "";
  rt.title = S.registered?.txHash || "";
  rt.dataset.hash = S.registered?.txHash || "";
  setText("register-block", S.registered?.block != null ? `block ${S.registered.block}` : "");
}

// Creates a new device key (software P-256 key in this browser).
async function doGenerateKey() {
  S.device = await S.dev.createDevice();
  S.registered = null; S.revoked = null;
  await saveDevice();
}

// Registers the device (creating a key first if there is none): proof of possession, free.
async function doRegister() {
  if (!S.device) await doGenerateKey();
  const r = await S.lib.registerDevice(S.ctx, "photographer", S.device);
  S.registered = { txHash: r.txHash, block: await blockOf(r.txHash) };
}

// ------------------------------------------------------------------ Photographer: capture and attest

// Loads photo bytes for capture (camera, file or sample image).
function loadCapturePhoto(bytes, type, name) {
  S.photo = { bytes, type, name };
  showImage(q("capture-preview"), bytes, type);
  q("capture-placeholder").classList.add("hidden");
  setText("capture-file-name", `${name} · ${bytes.length} bytes · ready to sign`);
  setText("capture-result", "");
}

// Starts the camera preview (only on https or localhost).
async function doStartCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("The camera needs localhost or https. Choose a file or use the sample image.");
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
  const bytes = await videoFrame(q("capture-preview").querySelector("video"));
  for (const t of S.stream.getTracks()) t.stop();
  S.stream = null;
  loadCapturePhoto(bytes, "image/jpeg", `photo-${Date.now()}.jpg`);
}

// Signs the loaded photo with the device and attests it (the library wraps ETH and approves if needed).
async function doAttest() {
  const { bytes, type, name } = S.photo;
  const r = await S.lib.attestPhoto(S.ctx, "photographer", S.device, bytes);
  const anchor = Number(r.anchorBlock);
  const block = await S.ctx.provider.getBlock(anchor).catch(() => null);
  const rows = await S.lib.verifyPhoto(S.ctx, r.photoHash);
  const rec = rows.find((x) => same(x.keyId, r.keyId)) || rows[rows.length - 1];
  S.attested = { bytes, type, name, photoHash: toHex(r.photoHash), keyId: toHex(r.keyId), anchorBlock: anchor,
    anchorHash: block?.hash || "", rec, txs: [...S.actionTxs] };
  S.files.set(S.attested.photoHash, { bytes, type, name });
  S.lastPhoto = `${S.attested.photoHash}|${S.attested.keyId}`;
  S.accChoice = "";
}

// Explains an attestation.
function explainAttest() {
  const a = S.attested;
  const r = a.rec ? Number(a.rec.recordedBlock) : "?";
  explain("Attest a photo",
    `The device signed the photo hash together with the hash of block ${a.anchorBlock}. Paprika checked the P-256 signature and stored the record in block ${r}. The Photographer locked B until ${a.rec ? fmtTime(a.rec.refundableAt) : "—"}.`,
    "nobody can predict a block hash, so the signature was made after block a; the record is in block r, so it was made before. The deposit makes every record cost locked money, not only gas.",
    a.txs, "Photographer");
}

// Shows the result and details of the last attestation.
function renderCapture() {
  const a = S.attested;
  if (!a) return;
  const r = a.rec ? Number(a.rec.recordedBlock) : "?";
  setText("capture-result", `Attested: ${shortHash(a.photoHash)} · window [${a.anchorBlock}, ${r}] · B locked until ${a.rec ? fmtTime(a.rec.refundableAt) : "—"}`);
  setShort("capture-hash", a.photoHash, 8);
  setText("capture-anchor-block", `block ${a.anchorBlock}`);
  setShort("capture-anchor-hash", a.anchorHash, 6);
  setText("capture-signature", `"PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ${short(a.keyId)} ‖ ${shortHash(a.photoHash)} ‖ blockhash(${a.anchorBlock})`);
  setText("record-window", `[a, r] = [${a.anchorBlock}, ${r}]`);
  setText("record-deposit", `B = ${tok(S.ctx.params.bond)}`);
  setText("record-locked-until", a.rec ? fmtTime(a.rec.refundableAt) : "—");
  renderTxList(q("capture-txs"), a.txs);
}

// ------------------------------------------------------------------ Photographer: my photos, clock, revoke

// Lists the Photographer's records with state, deposit, Refund and Download.
function renderDeposits() {
  const tb = q("deposits-table").tBodies[0];
  tb.replaceChildren();
  const mine = S.records.filter((r) => same(r.depositor, addr("photographer")));
  q("deposits-empty").classList.toggle("hidden", mine.length > 0);
  for (const r of mine) {
    const hash = toHex(r.photoHash);
    const tr = tb.insertRow();
    tr.dataset.testid = "deposit-row";
    tr.dataset.photoHash = hash;
    tr.dataset.state = stateOf(r);
    const c0 = tr.insertCell(); c0.className = "mono"; c0.textContent = shortHash(hash); c0.title = hash;
    tr.insertCell().textContent = `[${r.anchorBlock}, ${r.recordedBlock}]`;
    const [label, cls] = stateChip(r);
    const c2 = tr.insertCell(); const chip = document.createElement("span"); chip.className = "chip " + cls; chip.textContent = label;
    chip.dataset.testid = "deposit-state"; c2.appendChild(chip);
    const c3 = tr.insertCell(); c3.textContent = depositText(r); c3.className = "d"; c3.dataset.testid = "deposit-when";
    const c4 = tr.insertCell();
    const b = document.createElement("button");
    b.className = "sm"; b.dataset.testid = "btn-refund"; b.dataset.photoHash = hash;
    b.textContent = stateOf(r) === "refunded" ? "Refunded" : "Refund";
    b.dataset.enabled = refundable(r) ? "1" : "0";
    b.title = refundable(r) ? "Credit the deposit back to the Photographer" : `Possible from ${fmtTime(r.refundableAt)}`;
    b.addEventListener("click", () => run("Refund", () => S.lib.refund(S.ctx, "photographer", { photoHash: hash, keyId: toHex(r.keyId) }),
      { after: () => explain("Refund", "Nobody accused this photo in time, so its deposit B was credited back to the Photographer. The record stays, marked unchallenged.",
        "a refund is possible only after T_photo + T_reveal, so an accusation committed at the last second can still be revealed. Anyone may call it.", S.actionTxs, "Photographer") }));
    c4.appendChild(b);
    const f = S.files.get(hash);
    if (f) {
      const dl = document.createElement("button");
      dl.className = "sm"; dl.dataset.testid = "btn-download"; dl.dataset.photoHash = hash; dl.textContent = "Download";
      dl.title = "The exact bytes that were attested: drop them on the Verifier tab";
      dl.addEventListener("click", () => download(f.bytes, `paprika-${hash.slice(2, 10)}.${f.type === "image/png" ? "png" : "jpg"}`, f.type));
      c4.appendChild(dl);
    }
  }
}

// Re-checks, by the chain's clock, which Refund buttons may be clicked (without re-creating the rows).
function updateRefundButtons() {
  for (const b of document.querySelectorAll('[data-testid="btn-refund"]')) {
    const r = S.records.find((x) => same(x.photoHash, b.dataset.photoHash) && same(x.depositor, addr("photographer")));
    if (r) b.dataset.enabled = refundable(r) ? "1" : "0";
  }
}

// Shows the revoke card.
function renderRevoke() {
  setText("revoke-why", !S.device ? "Register a device first."
    : !S.registered ? "Register the device first."
    : S.deviceFlag && !S.revoked ? `Already flagged (${S.deviceFlag.reason}): a flagged key cannot be revoked.`
    : S.revoked ? "" : "");
  setText("revoke-status", S.revoked ? `Device flagged · reason: key revoked · block ${S.revoked.block}. No money moved; earlier records are untouched.` : "");
  const t = q("revoke-tx");
  t.textContent = S.revoked ? "tx " + short(S.revoked.txHash) : "";
  t.title = S.revoked?.txHash || "";
  t.dataset.hash = S.revoked?.txHash || "";
}

// Revokes the device key: signed by the key, naming the caller; no money moves.
async function doRevoke() {
  const r = await S.lib.revokeKey(S.ctx, "photographer", S.device);
  S.revoked = { txHash: r.txHash, block: await blockOf(r.txHash) };
}

// ------------------------------------------------------------------ Verifier

// Loads a file into the Verifier tab and checks it.
async function loadVerifyFile(bytes, type, name) {
  S.verify = { bytes, type, name, hash: "", records: [] };
  if (bytes) {
    showImage(q("verify-dropzone"), bytes, type);
    q("verify-placeholder").classList.add("hidden");
  }
  setText("verify-file-name", name);
  await runVerify(true);
}

// Hashes the file in the browser and reads its records from the contract.
async function runVerify(rehash) {
  const v = S.verify;
  if (rehash || !v.hash) v.hash = toHex(await S.dev.sha256(v.bytes));
  v.records = await S.lib.verifyPhoto(S.ctx, v.hash);
  if (rehash && v.records.length) { S.lastPhoto = `${toHex(v.hash)}|${toHex(mainRecord(v.records).keyId)}`; S.accChoice = ""; }
  renderVerify();
}

// The record to show when a file has several (one per device): this page's device first, else the newest.
function mainRecord(records) {
  return records.find((r) => S.device && same(r.keyId, S.device.keyId)) || records[records.length - 1];
}

// Shows the verdict, the honest sentence and the details.
function renderVerify() {
  const v = S.verify;
  const box = q("verify-status");
  const set = (cls, seal, title, detail, state) => {
    box.className = "verdict " + cls;
    box.dataset.state = state;
    setText("verify-seal", seal); setText("verify-title", title); setText("verify-detail", detail);
  };
  setShort("verify-hash", v.hash, 10);
  if (!v.records.length) {
    set("bad", "✕", "No record for this file", "No registered device signed this exact file.", "no-record");
    box.dataset.recordState = "none";
    q("verify-record").classList.add("hidden");
    q("verify-honest-sentence").classList.add("hidden");
    q("verify-other-records").classList.add("hidden");
    return;
  }
  const rec = mainRecord(v.records);
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  box.dataset.recordState = st;
  if (st === "fake") set("bad", "✕", "Proven fake", "UMA's voters found the evidence proves this photo is not a genuine capture. The depositor lost B. The record stays, marked.", "fake");
  else if (st === "accused") set("flag", "!", "Under accusation", "An accusation was sent to UMA; the vote is pending. The deposit is UMA's dispute stake.", "accused");
  else if (st === "refunded") set("", "✓", "Unchallenged", "Nobody proved this photo fake within the challenge period; the deposit went back. The record stays.", "unchallenged");
  else if (dev.status === "flagged") {
    const why = dev.reason === "key revoked"
      ? `The key was revoked at block ${dev.flaggedAtBlock}. This record is older and keeps its deposit.`
      : `Another photo of this device was proven fake; the device was flagged at block ${dev.flaggedAtBlock}. This record keeps its own deposit and challenge period.`;
    set("flag", "!", `Device flagged · ${dev.reason || "unknown"}`, why, dev.reason === "key revoked" ? "flagged-key-revoked" : "flagged-fake-proven");
  } else if (challengeOver(rec)) set("", "✓", "Unchallenged", "The challenge period passed with no accusation; the deposit can be refunded. The record stays.", "unchallenged");
  else set("", "✓", "Attested · deposit locked · can still be accused", `Anyone can accuse it until ${fmtTime(rec.accusableUntil)}.`, "attested");

  const A = Number(rec.anchorBlock), B = Number(rec.recordedBlock);
  q("verify-honest-sentence").classList.remove("hidden");
  setText("verify-block-a", A); setText("verify-block-b", B);
  q("verify-record").classList.remove("hidden");
  setShort("verify-record-device", rec.keyId, 6);
  setText("verify-device-status", deviceText(rec));
  setText("verify-window", `signed after block ${A}, recorded in block ${B} (${fmtTime(rec.recordedAt)})`);
  setText("verify-photo-state", st);
  setText("verify-deposit", depositText(rec));
  setText("verify-records-count", v.records.length === 1 ? "1 (one device)" : `${v.records.length} (one per device that signed it)`);

  // Flagged device: its other records stay listed with their deposits.
  const others = dev.status === "flagged" ? S.records.filter((r) => same(r.keyId, rec.keyId) && !same(r.photoHash, v.hash)) : [];
  q("verify-other-records").classList.toggle("hidden", !others.length);
  const tb = q("verify-other-table").tBodies[0];
  tb.replaceChildren();
  for (const o of others) {
    const tr = tb.insertRow();
    tr.dataset.testid = "verify-other-row";
    [shortHash(o.photoHash), `[${o.anchorBlock}, ${o.recordedBlock}]`, stateChip(o)[0], depositText(o)].forEach((c, i) => {
      const td = tr.insertCell(); td.textContent = c; if (i === 0) td.className = "mono";
    });
  }
}

// Explains the verdict now shown.
function explainVerify(pixel = false) {
  const v = S.verify;
  const state = q("verify-status").dataset.state;
  if (pixel) {
    return explain("One pixel changed", "One pixel of the image changed, so its SHA-256 changed completely, and the contract has no record for this file.",
      "a record binds one exact file, not a picture that looks the same.", [], "Verifier");
  }
  const what = {
    "no-record": "The page hashed the file and read the contract: no registered device signed this exact file.",
    attested: `The page hashed the file and read the contract. A registered device signed this exact file between block ${q("verify-block-a").textContent} and block ${q("verify-block-b").textContent}, and a deposit B is at stake.`,
    accused: "The record exists and is under accusation: UMA's vote is pending.",
    unchallenged: "The record exists and nobody proved it fake within its challenge period.",
    fake: "The record exists and is marked Fake: UMA's voters found the evidence proves it. The device is flagged.",
    "flagged-fake-proven": "The record exists, but its device was flagged because another of its photos was proven fake. This record keeps its own deposit and challenge period.",
    "flagged-key-revoked": "The record exists, but its device key was revoked after it was made. No money moved.",
  }[state] || "";
  explain("Verify a file", what, state === "no-record" ? "" : "anyone can verify with one read call to any node: no account, no vendor server.", [], "Verifier");
  void v;
}

// Changes one pixel of the loaded file and verifies again (expected: no record).
async function doChangePixel() {
  const v = S.verify;
  const out = await changeOnePixel(v.bytes, v.type);
  await loadVerifyFile(out.bytes, out.type, v.name.replace(/ · one pixel changed.*$/, "") + ` · one pixel changed (${out.how})`);
}

// ------------------------------------------------------------------ Accuser

// Fills the photo selector, keeping the open accusation's photo, the user's choice, or the last photo seen.
function renderAccuseSelect() {
  const sel = q("select-accuse-photo");
  const keep = (S.acc ? `${S.acc.photoHash}|${S.acc.keyId}` : "") || S.accChoice || S.lastPhoto || "";
  sel.replaceChildren();
  for (const r of S.records) {
    const o = document.createElement("option");
    o.value = `${toHex(r.photoHash)}|${toHex(r.keyId)}`;
    o.textContent = `${shortHash(r.photoHash)} · device ${short(r.keyId)} · [${r.anchorBlock}, ${r.recordedBlock}] · ${stateChip(r)[0]}`;
    sel.appendChild(o);
  }
  if (!S.records.length) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "no attested photo yet";
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

// Snapshot for the Outcome table: wallet + credit per role, the Store, and the photo's locked deposit.
async function settleSnapshot(photoHash, keyId) {
  const b = await S.lib.balances(S.ctx);
  const rec = (await S.lib.verifyPhoto(S.ctx, photoHash)).find((r) => same(r.keyId, keyId));
  return {
    accuser: big(b.accuser) + big(await S.lib.credits(S.ctx, addr("accuser"))),
    photographer: big(b.photographer) + big(await S.lib.credits(S.ctx, addr("photographer"))),
    store: big(b.store), locked: lockedOf(rec), depositor: rec?.depositor || "",
  };
}

// Step 1: commit (only a hash goes on chain) and lock the bond B.
async function doCommit() {
  const [photoHash, keyId] = q("select-accuse-photo").value.split("|");
  const evidence = q("input-evidence").value.trim();
  if (!evidence) throw new Error("Write the evidence (a link or a hash of public evidence) first");
  const before = await settleSnapshot(photoHash, keyId);
  const r = await S.lib.commitAccusation(S.ctx, "accuser", { photoHash, keyId, evidence });
  S.acc = { photoHash, keyId, evidence, before, commitment: toHex(r.commitment), salt: toHex(r.salt),
    evidenceHash: toHex(r.evidenceHash), commitTxs: [...S.actionTxs], wrapped: await wrappedBy(S.actionTxs) };
}

// Step 2: reveal; Paprika asserts the accusation at UMA and disputes it at once.
async function doReveal() {
  const a = S.acc;
  const r = await S.lib.revealAccusation(S.ctx, "accuser", { photoHash: a.photoHash, keyId: a.keyId, evidenceHash: a.evidenceHash, salt: a.salt });
  a.revealTxs = [...S.actionTxs];
  a.assertionId = toHex(r.assertionId);
  if (!r.assertionId || /^0x0*$/.test(a.assertionId)) { a.assertionId = ""; a.noAssertion = true; }   // photo already Fake
}

// Marks a vote phase in the progress list: "run" or "done".
function phaseState(name, state, note = "") {
  const li = q(`vote-phase-${name}`);
  if (!li) return;
  li.className = state;
  let small = li.querySelector("small");
  if (!small) { small = document.createElement("small"); li.appendChild(small); }
  small.textContent = note;
}

// Normalises a phase name from the library to "commit" | "reveal" | "settled".
function phaseName(p) {
  const s = String(p || "").toLowerCase();
  return s.includes("commit") ? "commit" : s.includes("reveal") ? "reveal" : s.includes("settl") || s.includes("resolv") ? "settled" : s;
}

// Step 3: UMA's vote. Three demo voters commit, then reveal, then the assertion is settled; progress via onPhase.
async function doVote(fakeProven) {
  const a = S.acc;
  a.phaseTxs = [];
  phaseState("commit", "run"); phaseState("reveal", ""); phaseState("settled", "");
  const order = ["commit", "reveal", "settled"];
  const onPhase = (p) => {
    const name = phaseName(p.phase);
    const i = order.indexOf(name);
    const txs = S.actionTxs.slice(a.phaseTxs.length);
    a.phaseTxs = [...S.actionTxs];
    order.forEach((n, j) => { if (j < i) phaseState(n, "done", q(`vote-phase-${n}`).querySelector("small")?.textContent || ""); });
    if (i >= 0) phaseState(name, "done", p.timestamp ? `chain time ${fmtTime(p.timestamp)}` : "");
    if (i >= 0 && i + 1 < order.length) phaseState(order[i + 1], "run");
    const text = {
      commit: "Three UMA voters committed hidden votes in UMA's voting contract. Then chain time was advanced to the reveal phase.",
      reveal: "The voters revealed their votes; UMA counted them. Then chain time was advanced to the end of the round.",
      settled: "Anyone called settleAssertion: UMA paid Paprika and Paprika credited the winner.",
    }[name] || `UMA vote: ${p.phase}`;
    explain(`UMA vote · ${name}`, text, "", txs, "UMA");
  };
  const r = await S.lib.umaVote(S.ctx, a.assertionId, fakeProven, { onPhase });
  for (const n of order) if (q(`vote-phase-${n}`).className !== "done") phaseState(n, "done");
  a.voteTxs = r?.txHashes || [];
  a.voted = true;
  a.fakeProven = fakeProven;
  a.after = await settleSnapshot(a.photoHash, a.keyId);
}

// Explains the outcome of the vote.
function explainOutcome() {
  const a = S.acc;
  if (a.fakeProven) {
    explain("Outcome · fake proven",
      "UMA's voters found the evidence proves the fake. The photo is marked Fake for good and its device is flagged. The Accuser gets B back plus B − f×B as credit; UMA's Store keeps f×B.",
      "the reward is this record's own deposit, so there is no shared fund to drain; voters say yes only if the claim is publicly verifiable.",
      S.actionTxs, "UMA");
  } else {
    explain("Outcome · not proven",
      "UMA's voters found the evidence does not prove it. The Accuser loses B; the depositor keeps the deposit and gets B − f×B as credit; UMA's Store keeps f×B. The challenge period is extended by the time spent under accusation.",
      "the bond makes a false accusation cost B; the extension stops a forger from running out the clock by accusing its own fake.",
      S.actionTxs, "UMA");
  }
}

// Starts over with a new accusation.
function doNewAccusation() {
  S.acc = null;
  q("input-evidence").value = defaultEvidence();
  for (const n of ["commit", "reveal", "settled"]) phaseState(n, "");
  renderAccuse();
  renderAccuseSelect();
  explain("New accusation", "Choose a photo, write the evidence, and commit.", "", []);
}

// Default evidence text, so the demo can be clicked through quickly.
function defaultEvidence() {
  return `https://example.org/evidence · same image published earlier · ${new Date().toISOString().slice(0, 10)}`;
}

// Shows the stepper and the four step cards of the current accusation.
function renderAccuse() {
  const a = S.acc;
  const k = !a?.commitment ? 0 : !a.assertionId && !a.noAssertion ? 1 : !a.voted && !a.noAssertion ? 2 : 3;
  [1, 2, 3, 4].forEach((n) => { q(`accuse-step-${n}`).className = n - 1 < k || (k === 3 && n === 4) ? "done" : n - 1 === k ? "cur" : ""; });
  q("accuse-panel-reveal").classList.toggle("off", k < 1);
  q("accuse-panel-vote").classList.toggle("off", k < 2 || !!a?.noAssertion);
  q("accuse-panel-settle").classList.toggle("hidden", !a?.voted);
  q("select-accuse-photo").disabled = k > 0;
  q("input-evidence").disabled = k > 0;
  setText("commit-status", a?.commitment ? "committed · bond B locked" : "");
  setText("reveal-status", a?.noAssertion ? "the photo was already proven fake: bond credited back" : a?.assertionId ? "sent to UMA and disputed" : "");
  if (a?.salt) setShort("accuse-secret", a.salt, 8); else { setText("accuse-secret", "random, created at commit, kept by the accuser"); }
  if (a?.commitment) setShort("commit-commitment", a.commitment, 8);
  else setText("commit-commitment", "keccak256(accuser, photo, device, evidence hash, secret)");
  renderTxList(q("commit-tx"), a?.commitTxs || []);
  renderTxList(q("reveal-tx"), a?.revealTxs || []);
  setText("reveal-photo", a ? shortHash(a.photoHash) : "");
  if (a?.assertionId) setShort("reveal-assertion-id", a.assertionId, 8); else setText("reveal-assertion-id", "");
  if (a?.voted) renderSettle();
}

// The Outcome table: measured money next to the rule with B and f.
function renderSettle() {
  const a = S.acc;
  const B = big(S.ctx.params.bond), fB = feeOfBond();
  const up = a.fakeProven;
  const o = q("settle-outcome");
  o.innerHTML = up ? '<span class="chip r">fake proven</span>' : '<span class="chip m">not proven</span>';
  o.dataset.outcome = up ? "fake-proven" : "not-proven";
  const depIsPh = same(a.before.depositor || a.after.depositor, addr("photographer"));
  // ETH that the library wrapped into WETH for the bond counts as money the accuser put in.
  setText("settle-accuser", signed(a.after.accuser - a.before.accuser - a.wrapped.accuser));
  setText("settle-depositor", depIsPh ? signed(a.after.photographer - a.before.photographer - a.wrapped.photographer + (a.after.locked - a.before.locked)) : "not measured (depositor is not the Photographer)");
  setText("settle-store", signed(a.after.store - a.before.store));
  setText("settle-formula-accuser", up ? "−B + B back + (B − f×B)" : "−B");
  setText("settle-formula-depositor", up ? "−B (deposit lost)" : "B kept + (B − f×B)");
  setText("settle-formula-store", "+f×B");
  setText("settle-expected-accuser", up ? signed(B - fB) : signed(-B));
  setText("settle-expected-depositor", up ? signed(-B) : signed(B - fB));
  setText("settle-expected-store", signed(fB));
  setText("vote-tx", (a.voteTxs || []).join(" "));
}

// Withdraws a role's credit to its wallet.
async function doWithdraw(role) {
  await S.lib.withdrawCredit(S.ctx, role);
}
const explainWithdraw = (who) => () => explain("Withdraw credit", `The ${who} moved its credit from Paprika to its wallet.`,
  "Paprika pays by credits: an account that cannot receive tokens then blocks only its own withdrawal, never UMA's settlement.", S.actionTxs, who);

// ------------------------------------------------------------------ navigation and wiring

// Shows the actor tab named in the URL hash.
function showView() {
  const v = (location.hash || "#photographer").slice(1);
  const view = ["photographer", "verifier", "accuser"].includes(v) ? v : "photographer";
  for (const e of document.querySelectorAll(".view")) e.classList.toggle("on", e.id === "view-" + view);
  for (const a of document.querySelectorAll("nav a")) a.classList.toggle("on", a.dataset.v === view);
}

// Receives every transaction the library sends: collects it for the current action and adds it to the timeline.
function onTx(item) {
  S.actionTxs.push(item);
  addTimeline(item);
}

// Calls onFile with each file chosen in a hidden file input (works for clicks and for scripted setInputFiles).
function onFileInput(inputId, onFile) {
  const input = q(inputId);
  input.addEventListener("change", () => { const f = input.files[0]; if (f) onFile(f); input.value = ""; });
}

// Verifies a File (from the input or a drop).
function verifyFile(f) {
  return run("Verify", async () => loadVerifyFile(await blobBytes(f), f.type, f.name), { tx: false, after: () => explainVerify() });
}

// Connects every control to its action.
function wire() {
  const on = (id, fn) => q(id).addEventListener("click", fn);
  on("btn-dismiss-error", () => q("error-banner").classList.add("hidden"));
  // Short values: click to show the full value, click again to shorten.
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".short");
    if (el && el.dataset.full) el.textContent = el.textContent === el.dataset.full ? el.dataset.short : el.dataset.full;
  });
  // Photographer
  on("btn-generate-key", () => run("New key", doGenerateKey, { tx: false,
    after: () => explain("New device key", "A new P-256 key pair was created in this browser. Only its public key will go on chain, at registration.", "", [], "Photographer") }));
  on("btn-register", () => run("Register", doRegister, { after: () => explain("Register a device",
    "The device key signed a message naming the Photographer's account, and Paprika stored the key. It cost only gas: no manufacturer or authority approved it.",
    "a public key is public. Without this proof of possession anyone could register someone else's key, and the real holder could never register it.", S.actionTxs, "Photographer") }));
  on("btn-start-camera", () => run("Start camera", doStartCamera, { tx: false }));
  on("btn-take-photo", () => run("Take photo", doTakePhoto, { tx: false }));
  on("btn-choose-file", () => q("input-capture-file").click());
  onFileInput("input-capture-file", (f) => run("Load file", async () => loadCapturePhoto(await blobBytes(f), f.type, f.name), { tx: false }));
  on("btn-sample-image", () => run("Sample image", async () => loadCapturePhoto(await sampleImage(), "image/jpeg", `sample-${Date.now()}.jpg`), { tx: false }));
  on("btn-attest", () => run("Sign & attest", doAttest, { after: explainAttest }));
  on("btn-deposits-withdraw", () => run("Withdraw credit", () => doWithdraw("photographer"), { after: explainWithdraw("Photographer") }));
  on("btn-advance-time", () => run("Advance time", async () => {
    const p = S.ctx.params;
    const secs = Number(p.photoWindow) + Number(p.revealWindow) + 1;
    await S.lib.advanceTime(S.ctx, secs);
    addTimelineNote(`Demo clock: chain time advanced by ${fmtDuration(secs)}`, "evm_increaseTime + evm_mine");
  }, { after: () => explain("Demo clock", `The local chain's clock moved forward by T_photo + T_reveal + 1 s (${fmtDuration(Number(S.ctx.params.photoWindow) + Number(S.ctx.params.revealWindow) + 1)}). On a real network this is simply waiting.`,
    "a deposit is refundable only after the challenge period plus the reveal period, so an accusation committed at the last second can still be revealed.", [], "Demo") }));
  on("btn-revoke", () => run("Revoke key", doRevoke, { after: () => explain("Revoke a key",
    "The key signed its own revocation, naming the caller. The device is flagged and cannot attest again. Its earlier records and deposits are untouched. No vote, no money.",
    "for a stolen or copied key: otherwise a thief could keep making records in the holder's name. A flag never erases records.", S.actionTxs, "Photographer") }));
  // Verifier
  on("btn-verify-choose-file", () => q("input-verify-file").click());
  onFileInput("input-verify-file", verifyFile);
  on("btn-verify-last", () => run("Verify", () => loadVerifyFile(S.attested.bytes, S.attested.type, S.attested.name), { tx: false, after: () => explainVerify() }));
  on("btn-change-pixel", () => run("Change one pixel", doChangePixel, { tx: false, after: () => explainVerify(true) }));
  const dz = q("verify-dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); const f = e.dataTransfer.files[0]; if (f) verifyFile(f); });
  // Dropping a file anywhere else must not navigate away from the page.
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => e.preventDefault());
  // Accuser
  q("select-accuse-photo").addEventListener("change", (e) => { S.accChoice = e.target.value; syncButtons(); });
  on("btn-refresh-records", () => run("Reload records", async () => {}, { tx: false }));
  on("btn-commit", () => run("Commit", doCommit, { after: () => explain("Accuse · 1 Commit",
    "Only a hash went on chain, with a bond B. Nobody can tell which photo is accused, so nobody can copy this accusation or react to it.",
    "a pending transaction is public. A one-step accusation could be copied under another name, even by the forger itself. The hash includes the accuser's address, so a copied commitment is useless.",
    S.actionTxs, "Accuser") }));
  on("btn-reveal", () => run("Reveal", doReveal, { after: () => explain("Accuse · 2 Reveal",
    S.acc?.noAssertion ? "The photo was already proven fake, so there is nothing to vote on: the bond was credited back."
      : "Paprika recomputed the commitment from the revealed photo, device, evidence and secret. In the same transaction it asserted the accusation at UMA's Optimistic Oracle V3 with the accuser's bond, and disputed it with the photo's deposit.",
    "in UMA an undisputed assertion is accepted as true. Without the immediate dispute a false accusation would win by silence against a depositor who was not watching.",
    S.actionTxs, "Accuser") }));
  on("btn-vote-fake", () => run("UMA vote", () => doVote(true), { after: explainOutcome }));
  on("btn-vote-not-fake", () => run("UMA vote", () => doVote(false), { after: explainOutcome }));
  on("btn-accuse-new", () => { doNewAccusation(); syncButtons(); });
  on("btn-withdraw-accuser", () => run("Withdraw credit (Accuser)", () => doWithdraw("accuser"), { after: explainWithdraw("Accuser") }));
  on("btn-withdraw-photographer", () => run("Withdraw credit (Photographer)", () => doWithdraw("photographer"), { after: explainWithdraw("Photographer") }));
  on("btn-accuse-verify", () => {
    location.hash = "#verifier";
    const a = S.acc;
    const f = S.files.get(toHex(a.photoHash));
    if (f) run("Verify", () => loadVerifyFile(f.bytes, f.type, f.name), { tx: false, after: () => explainVerify() });
    else run("Verify", async () => { S.verify = { bytes: null, type: "", name: `photo ${shortHash(a.photoHash)} (by hash)`, hash: a.photoHash, records: [] };
      setText("verify-file-name", S.verify.name); await runVerify(false); }, { tx: false, after: () => explainVerify() });
  });
  // Timeline: raw call names on/off.
  q("timeline-raw-toggle").addEventListener("change", (e) => q("activity-log").classList.toggle("showraw", e.target.checked));
  addEventListener("hashchange", showView);
}

// Shows the full-page message when the system is not running (or, with a title and instructions, another blocker).
function fatal(reason, title, howtoText, howto) {
  setText("fatal-reason", reason);
  if (title) setText("fatal-title", title);
  if (howtoText) setText("fatal-howto-text", howtoText);
  if (howto) setText("fatal-howto", howto);
  q("fatal-message").classList.remove("hidden");
}

// Camera hint: browsers allow the camera only on https or localhost.
function cameraHint() {
  if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) return;
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.dataset.testid = "camera-hint";
  hint.textContent = "The camera needs localhost or https. Open the app through an SSH tunnel, or choose a file / use the sample image.";
  q("btn-start-camera").parentElement.after(hint);
}

// Starts the page: deployment, library, connection (through this server's /rpc), first render, periodic refresh.
async function main() {
  // WebCrypto (P-256 keys, SHA-256) exists only in a secure context: https, or http on localhost.
  if (!globalThis.crypto?.subtle) {
    return fatal(`This page was opened at ${location.origin}, which the browser does not treat as secure, so WebCrypto (device key, SHA-256) is disabled.`,
      "Open Paprika on localhost or https",
      "From the demo machine, forward the port over SSH and open http://localhost:5173/ :",
      `ssh -N -L 5173:127.0.0.1:5173 <user>@${location.hostname}`);
  }
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
  // The page talks only to its own origin: the server forwards /rpc to the local chain.
  const rpcUrl = location.origin + "/rpc";
  try {
    S.ctx = await S.lib.connect({ rpcUrl, deployment });
    await refreshChain();
  } catch (e) {
    return fatal(`The local chain does not answer through ${rpcUrl}, or the deployment does not match it (${errText(e)}).`);
  }
  renderParams();
  wire();
  cameraHint();
  showView();
  explainIntro();
  q("input-evidence").value = defaultEvidence();
  await loadDevice();
  S.lib.onActivity(S.ctx, onTx);
  await run("Reading the chain", async () => {}, { tx: false });
  setInterval(async () => {
    if (S.busy) return;
    try {
      await refreshChain();
      q("chain-dot").classList.remove("off");
      updateRefundButtons();
      syncButtons();
    } catch {
      q("chain-dot").classList.add("off");
      setText("chain-label", "local chain not answering");
    }
  }, 3000);
}

main();
