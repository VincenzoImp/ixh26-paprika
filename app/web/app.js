// Paprika demo web UI: page logic.
// Three actor tabs (Photographer, Verifier, Accuser) wired to the local chain through the shared library
// (/lib/device.js and /lib/paprika.js). After every action the "What just happened" panel names the protocol step,
// says what happened and why the rule exists (wording from docs/design-rationale.md), and lists the transactions;
// the protocol map lights the step. Every amount and duration shown comes from the chain (ctx.params).
// Flow of each action: run() disables the buttons, collects the transactions the library reports (onActivity),
// shows the revert reason on failure, then re-reads the chain and re-renders every view.
// Local state that must survive a reload (device key, open accusation) is kept in localStorage per deployment;
// a restarted or redeployed chain is detected (fingerprint) and that state is then cleared.

import {
  q, setText, toHex, short, shortHash, same, fmtTime, fmtDuration, errText, big,
  blobBytes, sampleImage, videoFrame, changeOnePixel, showImage, download,
} from "./util.js";

// Everything the page knows. The device key and the open accusation are also kept in localStorage.
const S = {
  lib: null, dev: null, ctx: null,
  fingerprint: "",
  chain: { blockNumber: 0, timestamp: 0 },
  balances: null,
  credits: { photographer: 0n, accuser: 0n },
  busy: false,
  device: null,        // createDevice()/importDevice() result
  registered: null,    // { txHash, block } once the key is registered
  deviceStatus: "",    // plain-words device status
  deviceFlag: null,    // { reason, flaggedAtBlock } when the device is flagged
  revoked: null,       // { txHash, block }
  photo: null,         // photo loaded for capture: { bytes, type, name, hash, fromCamera, already }
  attested: null,      // last attested photo: { bytes, type, name, photoHash, keyId, anchorBlock, anchorHash, rec, txs }
  files: new Map(),    // photoHash -> { bytes, type, name }, for Download in "My photos"
  verify: null,        // file loaded on Verifier: { bytes, type, name, hash, records, prevHash }
  records: [],         // listRecords()
  accusations: [],     // [{ assertionId, photoHash, keyId, open, fakeProven }] from the chain
  acc: null,           // current accusation of this browser (persisted)
  accChoice: "", lastPhoto: "",
  stream: null,        // camera stream
  actionTxs: [],       // transactions reported by the library during the current action
  actionId: 0,         // counter of actions, to group the timeline
  timeline: [],        // readable timeline entries
  seenSteps: new Set(),
};
window.paprikaState = S;   // read-only handle for debugging and the end-to-end tests

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
  if (role === "operator") return { key: "uma", name: "Demo operator", cls: "act-uma" };
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

// The local time zone, for the label "times are chain time (GMT+1)".
function zoneName() {
  try { return new Intl.DateTimeFormat("en", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || ""; }
  catch { return ""; }
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

// Block number and timestamp of a mined transaction (nulls if unknown).
async function blockOf(txHash) {
  try {
    const r = await S.ctx.provider.getTransactionReceipt(txHash);
    if (!r) return { number: null, timestamp: null };
    const b = await S.ctx.provider.getBlock(r.blockNumber);
    return { number: r.blockNumber, timestamp: b ? Number(b.timestamp) : null };
  } catch { return { number: null, timestamp: null }; }
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
// A commitment sent now (next block, at least one second later) is valid only up to accusableUntil.
const accusableNow = (rec) => stateOf(rec) === "attested" && S.chain.timestamp + 1 <= Number(rec.accusableUntil);

// Accusations of one record on the chain: { total, rejected, open, proven }.
function accusationsOf(rec) {
  const list = S.accusations.filter((a) => same(a.photoHash, rec.photoHash) && same(a.keyId, rec.keyId));
  return { total: list.length, rejected: list.filter((a) => !a.open && !a.fakeProven).length,
    open: list.filter((a) => a.open).length, proven: list.filter((a) => !a.open && a.fakeProven).length };
}

// Locked deposit of a record as bigint (the library returns a bigint amount).
function lockedOf(rec) {
  if (!rec) return 0n;
  const v = rec.depositLocked;
  if (typeof v === "boolean") return v ? big(S.ctx.params.bond) : 0n;
  return big(v ?? 0);
}

// State label and chip class of a record, as the Photographer sees it. "Not proven fake" only if it was accused.
function stateChip(rec) {
  const st = stateOf(rec);
  const acc = accusationsOf(rec);
  if (st === "fake") return ["proven fake", "r"];
  if (st === "accused") return ["under accusation", "p"];
  if (st === "refunded") return [acc.rejected ? "not proven fake · refunded" : "challenge period over · refunded", "m"];
  if (challengeOver(rec)) return [acc.rejected ? "not proven fake · refundable" : "challenge period over · refundable", "m"];
  return [`open to challenge until ${fmtTime(rec.accusableUntil)}`, "s"];
}

// Deposit text of a record.
function depositText(rec) {
  const st = stateOf(rec);
  if (st === "fake") return "lost to the accuser";
  if (st === "accused") return "B held by UMA until the vote";
  if (st === "refunded") return "B refunded (credit)";
  if (refundable(rec)) return "B locked · refundable now";
  return `B locked · refundable after ${fmtTime(rec.refundableAt)}`;
}

// ------------------------------------------------------------------ local storage (per deployment)

const storeKey = (what) => `paprika-${what}:${S.fingerprint}`;
// JSON with bigints as strings.
const toJson = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? { $big: x.toString() } : x));
const fromJson = (s) => JSON.parse(s, (k, x) => (x && typeof x === "object" && "$big" in x ? BigInt(x.$big) : x));
// Removes every Paprika key of this browser (used when the chain was restarted or redeployed).
function clearLocalState() {
  for (const k of Object.keys(localStorage)) if (k.startsWith("paprika-")) localStorage.removeItem(k);
}
// Saves the current accusation (salt, evidence, photo, key, commit time, snapshots), or removes it.
function saveAcc() {
  try {
    if (S.acc) localStorage.setItem(storeKey("acc"), toJson({ ...S.acc, commitTxs: S.acc.commitTxs || [], revealTxs: S.acc.revealTxs || [] }));
    else localStorage.removeItem(storeKey("acc"));
  } catch (e) { console.warn("Could not save the accusation", e); }
}

// ------------------------------------------------------------------ readable descriptions of transactions

// Turns one library activity item into a readable line: { actor, text, kind, full }.
// The label comes from the library's `call` name (e.g. "Paprika.attest", "WETH9.deposit"), never from position.
function describe(item) {
  const c = String(item.call || "");
  const actor = actorOf(item);
  const rules = [
    [/register/i, "registered the device key (free)", "register"],
    [/weth.*deposit|\.deposit\b|wrap/i, "wrapped ETH into WETH", "plumbing"],
    [/approve/i, "allowed Paprika to take B", "plumbing"],
    [/\.attest/i, "attested a photo · deposit B locked", "attest"],
    [/commitClaim/i, "committed an accusation · bond B locked", "commit"],
    [/revealClaim/i, "revealed · Paprika asserted to UMA and disputed at once", "reveal"],
    [/commit/i, "committed a hidden vote", "vote"],
    [/reveal/i, "revealed a vote", "vote"],
    [/pushPrice/i, "entered the vote result", "vote"],
    [/settle/i, "settled at UMA (anyone can call it; here the demo operator) · Paprika credited the winner", "vote"],
    [/refund/i, "refunded the deposit B (as credit)", "refund"],
    [/withdrawCredit/i, "withdrew credit to the wallet", "withdraw"],
    [/revokeKey/i, "revoked the device key · no money moves", "revoke"],
  ];
  for (const [re, text, kind] of rules) if (re.test(c)) return { actor, text, kind, full: `${actor.name} ${text}` };
  return { actor, text: c, kind: "other", full: `${actor.name}: ${c}` };
}

// Groups the transactions of one action into readable lines: wrap + approve + attest (or commit) become one line,
// and the seven vote transactions become one line. Each group keeps its items for the expandable detail.
function groupTxs(items) {
  const out = [];
  const plumbing = [];
  for (const it of items) {
    const d = describe(it);
    if (d.kind === "plumbing") { plumbing.push(it); continue; }
    if (d.kind === "vote") {
      const last = out[out.length - 1];
      if (last && last.kind === "vote") { last.items.push(it); continue; }
      out.push({ kind: "vote", cls: "act-uma", items: [it] });
      continue;
    }
    out.push({ kind: d.kind, cls: d.actor.cls, items: [...plumbing, it], main: it });
    plumbing.length = 0;
  }
  if (plumbing.length) out.push({ kind: "plumbing", cls: describe(plumbing[0]).actor.cls, items: [...plumbing] });
  for (const g of out) g.text = groupText(g);
  return out;
}

// Readable text of a group.
function groupText(g) {
  const n = g.items.length;
  if (g.kind === "vote") {
    const commits = g.items.filter((i) => /commit/i.test(i.call)).length;
    const reveals = g.items.filter((i) => /reveal/i.test(i.call)).length;
    const settles = g.items.filter((i) => /settle/i.test(i.call)).length;
    return `UMA vote: ${commits} hidden votes, ${reveals} reveals${settles ? ", settle" : ""} (${n} tx)`;
  }
  if (g.kind === "attest") return `Photographer locked B: attested a photo${n > 1 ? ` (${n} tx: ${g.items.map((i) => shortCall(i)).join(", ")})` : ""}`;
  if (g.kind === "commit") return `Accuser committed an accusation · bond B locked${n > 1 ? ` (${n} tx: ${g.items.map((i) => shortCall(i)).join(", ")})` : ""}`;
  if (g.kind === "plumbing") return `${describe(g.items[0]).actor.name}: token preparation (${n} tx)`;
  return describe(g.main || g.items[0]).full;
}
const shortCall = (i) => (/deposit|wrap/i.test(i.call) ? "wrap" : /approve/i.test(i.call) ? "approve" : /attest/i.test(i.call) ? "attest" : /commitClaim/i.test(i.call) ? "commit" : i.call);

// Draws grouped transactions into an element: one line per group, expandable when a group has several transactions.
function renderGroups(el, items, { rawCalls = false } = {}) {
  el.replaceChildren();
  el.classList.add("txlist");
  for (const g of groupTxs(items)) {
    const hash = document.createElement("span");
    hash.className = "tx";
    hash.textContent = "tx " + short(g.items[g.items.length - 1].txHash) + (g.items.length > 1 ? ` +${g.items.length - 1}` : "");
    hash.title = g.items.map((i) => `${i.txHash} · block ${i.blockNumber} · ${i.call}`).join("\n");
    if (g.items.length > 1) {
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      const label = document.createElement("span");
      label.textContent = g.text;
      sum.append(label, hash);
      det.appendChild(sum);
      for (const i of g.items) {
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = `${describe(i).full} · tx ${short(i.txHash)}${rawCalls ? ` · block ${i.blockNumber} · ${i.call}` : ""}`;
        det.appendChild(sub);
      }
      el.appendChild(det);
    } else {
      const div = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = g.text;
      div.append(label, hash);
      el.appendChild(div);
    }
  }
}

// Draws the timeline: one entry per action (newest last), each with its grouped transactions.
function renderTimeline() {
  const ol = q("activity-log-table");
  const raw = q("timeline-raw-toggle").checked;
  ol.replaceChildren();
  for (const e of S.timeline) {
    const groups = e.items.length ? groupTxs(e.items) : [{ text: e.text, items: [], cls: "" }];
    for (const g of groups) {
      const li = document.createElement("li");
      li.dataset.testid = "activity-row";
      const dot = document.createElement("i");
      if (g.cls) dot.className = g.cls;
      const body = document.createElement("div");
      if (g.items.length > 1) {
        const det = document.createElement("details");
        const sum = document.createElement("summary");
        sum.textContent = g.text;
        det.appendChild(sum);
        for (const i of g.items) { const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = `${describe(i).full} · ${short(i.txHash)}`; det.appendChild(sub); }
        if (raw) det.open = true;
        body.appendChild(det);
      } else body.textContent = g.text;
      const rawDiv = document.createElement("div");
      rawDiv.className = "raw";
      rawDiv.textContent = e.raw || g.items.map((i) => `block ${i.blockNumber} · ${i.call}`).join("\n");
      body.appendChild(rawDiv);
      const h = document.createElement("span");
      h.className = "tx";
      if (g.items.length) {
        h.textContent = short(g.items[g.items.length - 1].txHash) + (g.items.length > 1 ? ` +${g.items.length - 1}` : "");
        h.title = g.items.map((i) => i.txHash).join("\n");
        li.dataset.hash = g.items[g.items.length - 1].txHash;
      }
      li.append(dot, body, h);
      ol.appendChild(li);
    }
  }
  q("timeline-empty").classList.toggle("hidden", S.timeline.length > 0);
  ol.scrollTop = ol.scrollHeight;
}

// Adds a transaction to the timeline entry of the current action.
function addTimeline(item) {
  const last = S.timeline[S.timeline.length - 1];
  if (last && last.actionId === S.actionId && last.items) last.items.push(item);
  else S.timeline.push({ actionId: S.actionId, items: [item] });
  renderTimeline();
}

// Adds a timeline entry that is not a transaction (e.g. the demo clock).
function addTimelineNote(text, raw) {
  S.timeline.push({ actionId: -1, text, items: [], raw });
  renderTimeline();
}

// ------------------------------------------------------------------ explainer and protocol map

// Revert reasons of Paprika.sol in plain words.
const REVERT_WHY = {
  "not active": "The device key is not Active (flagged, or not registered on this chain): it cannot attest, and cannot be revoked again.",
  "too early": "Too early. A refund needs the challenge period plus the reveal period to have passed; a reveal needs at least one block after the commit.",
  "too late": "The reveal period is over. The bond of this commitment can only be burned now.",
  refunded: "The deposit of this photo was already refunded: nothing is at stake, so it can no longer be accused.",
  "accusation open": "This photo already has an open accusation. Only one at a time: the deposit is the stake of that dispute.",
  "outside window": "The commitment was not made inside the photo's challenge period.",
  "no record": "There is no record for this photo and device.",
  "no commit": "No live commitment matches this reveal.",
  "no credit": "This account has no credit to withdraw.",
  "key used": "This key was registered before. A key registers only once, ever.",
  exists: "This key already attested this exact file.",
  anchor: "The signed block is older than the last 256 blocks.",
  "bad sig": "The signature does not match the device key.",
};

// Lights a step of the protocol map ("register", "attest", "commit", "reveal", "vote", "outcome", "refund", "verify", "revoke").
function setStep(step) {
  if (!step) return;
  S.seenSteps.add(step);
  for (const el of document.querySelectorAll(".pmap [data-step]")) {
    el.classList.toggle("cur", el.dataset.step === step);
    el.classList.toggle("seen", S.seenSteps.has(el.dataset.step) && el.dataset.step !== step);
  }
  q("protocol-map").dataset.step = step;
}

// Shows a step in the explainer: title (with actor chip), what happened, why the rule exists, and the transactions.
function explain(step, text, why = "", txs = S.actionTxs, actor = "", mapStep = "") {
  setText("explainer-kicker", "What just happened");
  const st = q("explainer-step");
  st.replaceChildren();
  if (actor) {
    const chip = document.createElement("span");
    chip.className = "chip " + ({ Photographer: "act-ph", Verifier: "act-ve", Accuser: "act-ac", UMA: "act-uma" }[actor] || "");
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
    renderGroups(ch, txs);
    const h = document.createElement("b");
    h.textContent = "On chain";
    ch.prepend(h);
  } else ch.replaceChildren();
  q("explainer").dataset.step = step;
  setStep(mapStep);
}

// The explainer before any action: the protocol in three lines.
function explainIntro() {
  explain("Paprika in three lines", [
    "A registered key signs each photo hash together with a recent block hash; whoever sends it locks a deposit B.",
    "During the challenge period T_photo, anyone can accuse the photo with an equal bond B; UMA's voters decide, and whoever is wrong loses B.",
    "If nobody proves it fake in time, the deposit goes back. No record is ever deleted.",
  ], "", []);
  setText("explainer-kicker", "How it works");
}

// ------------------------------------------------------------------ errors, notices, busy state, buttons

// Shows a failed action in the banner and in the explainer, with the contract's revert reason in plain words.
function showError(what, e) {
  console.warn(what, e);
  const reason = errText(e);
  const banner = q("error-banner");
  banner.classList.remove("info");
  setText("error-message", `${what} failed: ${reason}`);
  banner.classList.remove("hidden");
  const sent = S.actionTxs.length;
  explain(`Refused: ${what}`,
    sent ? `Refused with the reason "${reason}". These transactions went through before the refusal:` : `Refused with the reason "${reason}". Nothing was sent: no deposit or bond was taken.`,
    REVERT_WHY[reason] || "");
}

// Shows a notice (not an error) in the banner, e.g. after a chain restart.
function notice(msg) {
  const banner = q("error-banner");
  banner.classList.add("info");
  setText("error-message", msg);
  banner.classList.remove("hidden");
}

// True while an accusation of this browser is committed or revealed and not yet decided, or any record is Accused.
function accusationPending() {
  if (S.records.some((r) => stateOf(r) === "accused")) return true;
  const a = S.acc;
  return !!(a && a.commitment && !a.voted && !a.dead && !a.noAssertion);
}

// Why the Photographer cannot attest the loaded photo now ("" when it can).
function attestBlocker() {
  if (!S.device || !S.registered) return "Register the device key first (step ①).";
  if (S.deviceFlag) return `This key is flagged (${S.deviceFlag.reason} at block ${S.deviceFlag.flaggedAtBlock}). It can never attest again. Register another key to continue.`;
  if (!S.photo) return "";
  if (!S.photo.bytes.length) return "This file is empty: nothing to attest.";
  if (S.photo.already) return "This key already attested this exact file: nothing to do. Take another photo.";
  return "";
}

// When each button may be clicked (besides "not while an action is running").
const RULES = {
  "btn-register": () => !S.registered,
  "btn-take-photo": () => !!S.stream,
  "btn-attest": () => !!S.photo && !attestBlocker(),
  "btn-verify-last": () => !!S.attested,
  "btn-change-pixel": () => !!S.verify?.bytes && S.verify.bytes.length > 0 && /^image\//.test(S.verify.type || ""),
  "btn-commit": () => !!q("select-accuse-photo").value && !S.acc?.commitment,
  "btn-reveal": () => !!S.acc?.commitment && !S.acc?.assertionId && !S.acc?.noAssertion && !S.acc?.dead && !!S.acc?.salt,
  "btn-vote-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-vote-not-fake": () => !!S.acc?.assertionId && !S.acc?.voted,
  "btn-accuse-new": () => !!S.acc && (!S.acc.assertionId || !!S.acc.voted),
  "btn-accuse-verify": () => !!S.acc?.voted,
  "btn-withdraw-accuser": () => S.credits.accuser > 0n,
  "btn-withdraw-photographer": () => S.credits.photographer > 0n,
  "btn-deposits-withdraw": () => S.credits.photographer > 0n,
  "btn-revoke": () => !!S.device && !!S.registered && !S.revoked && !S.deviceFlag,
  "btn-advance-time": () => !accusationPending(),
};

// Enables or disables every button from RULES, per-row flags (data-enabled) and the busy state; shows the reasons.
function syncButtons() {
  for (const b of document.querySelectorAll("button")) {
    if (b.dataset.always) continue;
    const id = b.dataset.testid;
    let ok = true;
    if (RULES[id]) ok = RULES[id]();
    else if (b.dataset.enabled !== undefined) ok = b.dataset.enabled === "1";
    b.disabled = S.busy || !ok;
  }
  setText("attest-why", S.photo || S.deviceFlag ? attestBlocker() : "");
  setText("advance-why", accusationPending() ? "Not while an accusation is open: decide it first (Accuser tab). Skipping time now would expire UMA's vote." : "");
}

// Runs one user action: one at a time, buttons disabled meanwhile, transactions collected, errors shown, then
// everything re-read from the chain. `after` explains the result once the chain was re-read.
async function run(what, fn, { tx = true, after = null } = {}) {
  if (S.busy) return;
  S.busy = true;
  S.actionTxs = [];
  S.actionId += 1;
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

// ETH wrapped into WETH by each role in these transactions (WETH9.deposit carries the amount as the tx value).
// Counted as WETH spent, so that "money moved" includes what the library wrapped just before paying.
async function wrappedBy(txs) {
  const out = { photographer: 0n, accuser: 0n };
  for (const t of txs) {
    if (!/deposit|wrap/i.test(String(t.call)) || /attest|refund/i.test(String(t.call))) continue;
    const k = actorOf(t).key === "ph" ? "photographer" : actorOf(t).key === "ac" ? "accuser" : null;
    if (!k) continue;
    try { const tx = await S.ctx.provider.getTransaction(t.txHash); out[k] += big(tx?.value ?? 0); } catch { /* count 0 */ }
  }
  return out;
}

// ------------------------------------------------------------------ chain reads and refresh

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
  for (const k of ["photographer", "accuser", "store"]) {
    setText(`balance-${k}`, tok(b[k]));
    if (prev && deltas === "action") {
      const d = big(b[k]) - big(prev[k]) - big(S.wrapped?.[k] ?? 0);
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

// Accusations from the contract's events (AccusationOpened / AccusationResolved); the library's list if it has one.
async function readAccusations() {
  try {
    const p = S.ctx.contracts.paprika;
    const opened = await p.queryFilter(p.filters.AccusationOpened(), 0, "latest");
    const resolved = await p.queryFilter(p.filters.AccusationResolved(), 0, "latest");
    const res = new Map(resolved.map((e) => [toHex(e.args.assertionId), !!e.args.fakeProven]));
    S.accusations = opened.map((e) => {
      const id = toHex(e.args.assertionId);
      return { assertionId: id, photoHash: toHex(e.args.photoHash), keyId: toHex(e.args.keyId), claimant: e.args.claimant,
        evidenceHash: toHex(e.args.evidenceHash), open: !res.has(id), fakeProven: res.get(id) || false };
    });
  } catch (e) {
    if (S.lib.listAccusations) {
      const list = await S.lib.listAccusations(S.ctx);
      S.accusations = list.map((a) => ({ ...a, assertionId: toHex(a.assertionId), photoHash: toHex(a.photoHash), keyId: toHex(a.keyId),
        open: a.open !== undefined ? !!a.open : a.resolved !== undefined ? !a.resolved : /open|pending/i.test(String(a.status || a.state || "")),
        fakeProven: !!(a.fakeProven ?? /fake/i.test(String(a.outcome || ""))) }));
    } else console.warn("Could not read accusations", e);
  }
}

// Re-reads the chain and re-renders every view.
async function refreshAll({ deltas = false } = {}) {
  await refreshChain();
  await refreshBalances(deltas);
  S.records = await S.lib.listRecords(S.ctx);
  await readAccusations();
  await refreshDeviceStatus();
  await reconcileAccusation();
  renderDevice();
  renderCapture();
  renderDeposits();
  renderRevoke();
  renderAccuseSelect();
  renderAccuse();
  if (S.verify) await runVerify(false);
}

// Fills the parameters line and the contracts panel (all values from the deployment and the contract).
function renderParams() {
  const p = S.ctx.params, a = S.ctx.addresses;
  setText("param-bond", tok(p.bond));
  setText("param-photo-window", fmtDuration(p.photoWindow));
  setText("param-reveal-window", fmtDuration(p.revealWindow));
  setText("param-fee", String(p.feeShare));
  setText("token-symbol", p.tokenSymbol);
  setText("time-zone", zoneName());
  for (const el of document.querySelectorAll(".v-bond")) el.textContent = tok(p.bond);
  for (const el of document.querySelectorAll(".v-tphoto")) el.textContent = fmtDuration(p.photoWindow);
  for (const el of document.querySelectorAll(".v-treveal")) el.textContent = fmtDuration(p.revealWindow);
  for (const el of document.querySelectorAll(".v-fee")) el.textContent = String(p.feeShare);
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
  if (info.status === "none") S.registered = null;
  if (info.status === "flagged") S.deviceFlag = info;
  S.deviceStatus = deviceText(d);
}

// Saves / restores the device key in this browser (per deployment). Test keys only.
async function saveDevice() {
  try { if (S.device && S.dev.exportDevice) localStorage.setItem(storeKey("device"), JSON.stringify(await S.dev.exportDevice(S.device))); }
  catch (e) { console.warn("Could not save the device key", e); }
}
async function loadDevice() {
  try { const s = localStorage.getItem(storeKey("device")); if (s && S.dev.importDevice) S.device = await S.dev.importDevice(s); }
  catch (e) { console.warn("Could not restore the device key", e); }
}

// Shows the device card.
function renderDevice() {
  const d = S.device;
  setShort("device-key-id", d?.keyId || "", 8);
  setText("device-pubkey", d ? `x ${short(d.x, 6)} · y ${short(d.y, 6)}` : "—");
  const st = q("device-status");
  st.textContent = d ? `Key ${short(d.keyId)} · ${S.deviceStatus}` : "no key yet";
  st.dataset.status = S.deviceFlag ? "flagged" : S.registered ? "active" : "none";
  st.className = "status " + (S.deviceFlag ? "am" : S.registered ? "ok" : "");
  q("flag-note").classList.toggle("hidden", !S.deviceFlag);
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
  if (S.photo) S.photo.already = false;
  await saveDevice();
}

// Registers the device (creating a key first if there is none): proof of possession, free.
async function doRegister() {
  if (!S.device) await doGenerateKey();
  const r = await S.lib.registerDevice(S.ctx, "photographer", S.device);
  S.registered = { txHash: r.txHash, block: (await blockOf(r.txHash)).number };
}

// ------------------------------------------------------------------ Photographer: camera, capture and attest

// Shows the capture buttons for the current state: camera live -> "Take a selfie"; still loaded -> "Sign & attest"
// (+ "Retake" for a camera still); nothing -> "Start camera". One primary button at a time.
function renderCaptureControls() {
  const live = !!S.stream, still = !!S.photo;
  // "Start camera" stays available next to a file or sample image (as a secondary button); hidden for a camera still.
  q("btn-start-camera").classList.toggle("hidden", live || !!S.photo?.fromCamera);
  q("btn-start-camera").classList.toggle("pri", !still);
  q("btn-take-photo").classList.toggle("hidden", !live);
  q("btn-attest").classList.toggle("hidden", live || !still);
  q("btn-retake").classList.toggle("hidden", live || !S.photo?.fromCamera);
}

// Loads photo bytes for capture (camera still, file or sample image). Refuses an empty file; warns on a non-image.
async function loadCapturePhoto(bytes, type, name, fromCamera = false) {
  if (!bytes.length) throw new Error("This file is empty (0 bytes): nothing to attest.");
  S.photo = { bytes, type, name, fromCamera, already: false };
  const box = q("capture-preview");
  showImage(box, bytes, type);
  q("capture-placeholder").classList.add("hidden");
  setTag(fromCamera ? "Still: exactly the bytes that will be attested" : "");
  setText("capture-file-name", `${name} · ${bytes.length} bytes`);
  const warn = q("capture-warning");
  warn.textContent = /^image\//.test(type || "") ? "" : `This file does not look like an image (${type || "unknown type"}). It can still be attested, but a verifier will not see a picture.`;
  warn.classList.toggle("hidden", !warn.textContent);
  setText("capture-result", "");               // a new photo clears the line of the previous attestation
  q("capture-details").open = false;
  // Pre-check: has this key already attested this exact file? Then the button stays disabled (nothing is sent).
  S.photo.hash = toHex(await S.dev.sha256(bytes));
  if (S.device) {
    const rows = await S.lib.verifyPhoto(S.ctx, S.photo.hash);
    S.photo.already = rows.some((r) => same(r.keyId, S.device.keyId));
  }
  renderCaptureControls();
}

// Puts a small label on the preview ("Live camera", "Still: ...").
function setTag(text) {
  const box = q("capture-preview");
  box.querySelector(".tag")?.remove();
  if (!text) return;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.dataset.testid = "capture-tag";
  tag.textContent = text;
  box.appendChild(tag);
}

// Starts the live camera preview (only on https or localhost).
async function doStartCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("The camera needs localhost or https. Choose a file or use the sample image.");
  S.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  S.photo = null;
  const box = q("capture-preview");
  for (const el of box.querySelectorAll("img,video")) el.remove();
  const v = document.createElement("video");
  v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = S.stream;
  v.dataset.testid = "camera-video";
  box.appendChild(v);
  await new Promise((resolve) => { if (v.readyState >= 2) resolve(); else v.onloadeddata = resolve; setTimeout(resolve, 3000); });
  q("capture-placeholder").classList.add("hidden");
  setTag("Live camera");
  setText("capture-file-name", "Camera on: frame the shot, then press Take a selfie.");
  setText("capture-result", "");
  renderCaptureControls();
}

// Freezes the current camera frame as a JPEG still (the exact file that will be attested); stops the camera.
async function doTakePhoto() {
  const bytes = await videoFrame(q("capture-preview").querySelector("video"));
  stopCamera();
  await loadCapturePhoto(bytes, "image/jpeg", `selfie-${Date.now()}.jpg`, true);
}

// Stops the camera stream.
function stopCamera() {
  if (S.stream) for (const t of S.stream.getTracks()) t.stop();
  S.stream = null;
}

// Signs the loaded photo with the device key and attests it (the library wraps ETH and approves if needed).
// Pre-checks first, so that a refused attest sends nothing.
async function doAttest() {
  const blocker = attestBlocker();
  if (blocker) throw new Error(blocker);
  const { bytes, type, name } = S.photo;
  const pre = await S.lib.verifyPhoto(S.ctx, bytes);
  if (pre.some((r) => same(r.keyId, S.device.keyId))) { S.photo.already = true; throw new Error("This key already attested this exact file (nothing was sent)."); }
  const r = await S.lib.attestPhoto(S.ctx, "photographer", S.device, bytes);
  const anchor = Number(r.anchorBlock);
  const block = await S.ctx.provider.getBlock(anchor).catch(() => null);
  const rows = await S.lib.verifyPhoto(S.ctx, r.photoHash);
  const rec = rows.find((x) => same(x.keyId, r.keyId)) || rows[rows.length - 1];
  S.attested = { bytes, type, name, photoHash: toHex(r.photoHash), keyId: toHex(r.keyId), anchorBlock: anchor,
    anchorHash: block?.hash || "", rec, txs: [...S.actionTxs] };
  S.photo.already = true;
  S.files.set(S.attested.photoHash, { bytes, type, name });
  S.lastPhoto = `${S.attested.photoHash}|${S.attested.keyId}`;
  S.accChoice = "";
}

// Explains an attestation.
function explainAttest() {
  const a = S.attested;
  const r = a.rec ? Number(a.rec.recordedBlock) : "?";
  explain("Attest a photo",
    `The key signed the photo hash together with the hash of block ${a.anchorBlock}. Paprika checked the P-256 signature and stored the record in block ${r}. The Photographer locked B: anyone can accuse the photo until ${a.rec ? fmtTime(a.rec.accusableUntil) : "—"}.`,
    "nobody can predict a block hash, so the signature was made after block a; the record is in block r, so the file existed by then. If the same image was public before block a, the record is refuted. The deposit makes every record cost locked money, not only gas.",
    a.txs, "Photographer", "attest");
}

// Shows the result line and the details of the last attestation (only while its photo is the one shown).
function renderCapture() {
  renderCaptureControls();
  const a = S.attested;
  if (!a) return;
  // Use the current record (its challenge period grows after a rejected accusation).
  a.rec = S.records.find((x) => same(x.photoHash, a.photoHash) && same(x.keyId, a.keyId)) || a.rec;
  const r = a.rec ? Number(a.rec.recordedBlock) : "?";
  if (S.photo && S.photo.hash === a.photoHash) {
    setText("capture-result", `Attested ${shortHash(a.photoHash)} · signed between blocks ${a.anchorBlock} and ${r} · open to challenge until ${a.rec ? fmtTime(a.rec.accusableUntil) : "—"} · refundable after ${a.rec ? fmtTime(a.rec.refundableAt) : "—"} (chain time)`);
  }
  setShort("capture-hash", a.photoHash, 8);
  setText("capture-anchor-block", `block ${a.anchorBlock}`);
  setShort("capture-anchor-hash", a.anchorHash, 6);
  setText("capture-signature", `"PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ${short(a.keyId)} ‖ ${shortHash(a.photoHash)} ‖ blockhash(${a.anchorBlock})`);
  setText("record-window", `block ${r} (window [a, r] = [${a.anchorBlock}, ${r}])`);
  setText("record-deposit", `B = ${tok(S.ctx.params.bond)}`);
  setText("record-locked-until", a.rec ? fmtTime(a.rec.refundableAt) : "—");
  renderGroups(q("capture-txs"), a.txs);
}

// ------------------------------------------------------------------ Photographer: my photos, clock, revoke

// Lists the Photographer's records with key, window, state, deposit, Refund and Download.
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
    const ck = tr.insertCell(); ck.className = "mono"; ck.textContent = short(r.keyId); ck.title = toHex(r.keyId); ck.dataset.testid = "deposit-key";
    tr.insertCell().textContent = `${r.anchorBlock} – ${r.recordedBlock}`;
    const [label, cls] = stateChip(r);
    const c2 = tr.insertCell();
    const chip = document.createElement("span"); chip.className = "chip " + cls; chip.textContent = label; chip.dataset.testid = "deposit-state";
    c2.appendChild(chip);
    const acc = accusationsOf(r);
    if (acc.rejected) { const n = document.createElement("div"); n.className = "d"; n.textContent = `${acc.rejected} accusation${acc.rejected > 1 ? "s" : ""} rejected`; c2.appendChild(n); }
    const c3 = tr.insertCell(); c3.textContent = depositText(r); c3.className = "d"; c3.dataset.testid = "deposit-when";
    const c4 = tr.insertCell();
    const b = document.createElement("button");
    b.className = "sm"; b.dataset.testid = "btn-refund"; b.dataset.photoHash = hash;
    b.textContent = stateOf(r) === "refunded" ? "Refunded" : "Refund";
    b.dataset.enabled = refundable(r) ? "1" : "0";
    b.title = refundable(r) ? "Credit the deposit back to the depositor" : `Possible after ${fmtTime(r.refundableAt)} (chain time)`;
    b.addEventListener("click", () => run("Refund", () => S.lib.refund(S.ctx, "photographer", { photoHash: hash, keyId: toHex(r.keyId) }),
      { after: () => explain("Refund", "Nobody proved this photo fake in time, so its deposit B was credited back to the Photographer. The record stays.",
        "a refund is possible only after T_photo + T_reveal, so an accusation committed at the last second can still be revealed. Anyone may trigger the refund; the money always goes to the depositor.", S.actionTxs, "Photographer", "refund") }));
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
  setText("revoke-why", !S.device ? "Register a device key first."
    : !S.registered ? "Register the device key first."
    : S.deviceFlag && !S.revoked ? `Already flagged (${S.deviceFlag.reason}): a flagged key cannot be revoked.` : "");
  setText("revoke-status", S.revoked ? `Device flagged · reason: key revoked · block ${S.revoked.block}. No money moved; earlier records are untouched.` : "");
  const t = q("revoke-tx");
  t.textContent = S.revoked ? "tx " + short(S.revoked.txHash) : "";
  t.title = S.revoked?.txHash || "";
  t.dataset.hash = S.revoked?.txHash || "";
}

// Revokes the device key: signed by the key, naming the caller; no money moves.
async function doRevoke() {
  const r = await S.lib.revokeKey(S.ctx, "photographer", S.device);
  S.revoked = { txHash: r.txHash, block: (await blockOf(r.txHash)).number };
}

// ------------------------------------------------------------------ Verifier

// Loads a file into the Verifier tab and checks it. Refuses an empty file; warns on a non-image.
async function loadVerifyFile(bytes, type, name, prevHash = "") {
  if (bytes && !bytes.length) throw new Error("This file is empty (0 bytes): there is nothing to verify.");
  S.verify = { bytes, type, name, hash: "", records: [], prevHash };
  if (bytes) {
    showImage(q("verify-dropzone"), bytes, type);
    q("verify-placeholder").classList.add("hidden");
  }
  setText("verify-file-name", name);
  const w = q("verify-warning");
  w.textContent = bytes && !/^image\//.test(type || "") ? `This file does not look like an image (${type || "unknown type"}); it is checked anyway.` : "";
  w.classList.toggle("hidden", !w.textContent);
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

// The record to show when a file has several (one per key): this page's key first, else the newest.
function mainRecord(records) {
  return records.find((r) => S.device && same(r.keyId, S.device.keyId)) || records[records.length - 1];
}

// One verdict for one record: [cls, seal, title, detail, state]. Neutral colours: blue for "open", never a green check.
function verdictOf(rec) {
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  const acc = accusationsOf(rec);
  const hist = acc.rejected ? `Accusations: ${acc.rejected}, rejected by UMA's vote.` : "Never accused.";
  if (st === "fake") return ["bad", "✕", "Proven fake", "UMA's voters found the evidence proves this photo is not a genuine capture by this key. The depositor lost B. The record stays, marked.", "fake"];
  if (st === "accused") return ["flag", "!", "Under accusation", "An accusation was sent to UMA; the vote is pending. The deposit is UMA's dispute stake.", "accused"];
  if (dev.status === "flagged" && st !== "refunded") {
    if (dev.reason === "key revoked") return ["flag", "!", `Not judged · its key was revoked at block ${dev.flaggedAtBlock}`,
      `The key holder declared the key compromised. This record is older than the revocation, so a thief may have made it. It can still be accused until ${fmtTime(rec.accusableUntil)}.`, "flagged-key-revoked"];
    const bad = S.accusations.find((a) => same(a.keyId, rec.keyId) && a.fakeProven);
    return ["flag", "!", "Not judged · its key is flagged",
      `Another photo of this key${bad ? ` (${shortHash(bad.photoHash)})` : ""} was proven fake at block ${dev.flaggedAtBlock}. ${challengeOver(rec) ? "This photo's challenge period is over." : `This photo can still be accused until ${fmtTime(rec.accusableUntil)}.`}`, "flagged-fake-proven"];
  }
  if (st === "refunded") return ["neutral", "○", acc.rejected ? "Not proven fake · deposit returned" : "Challenge period over · never accused · deposit returned",
    `Nobody proved it fake within the challenge period. ${hist}`, "unchallenged"];
  if (challengeOver(rec)) return ["neutral", "○", acc.rejected ? "Not proven fake · challenge period over" : "Challenge period over · never accused",
    `Nobody proved it fake within the challenge period; the deposit can be refunded. ${hist}`, "unchallenged"];
  return ["open", "◷", "Signed and staked · open to challenge",
    `Anyone can accuse it until ${fmtTime(rec.accusableUntil)}. Deposit B is refunded after ${fmtTime(rec.refundableAt)} if nobody proves it fake (chain time). ${acc.rejected ? hist : ""}`.trim(), "attested"];
}

// Shows the verdict, the honest sentence and the details.
function renderVerify() {
  const v = S.verify;
  const box = q("verify-status");
  const set = ([cls, seal, title, detail, state]) => {
    box.className = "verdict " + cls;
    box.dataset.state = state;
    setText("verify-seal", seal); setText("verify-title", title); setText("verify-detail", detail);
  };
  setShort("verify-hash", v.hash, 10);
  const cmp = q("verify-hash-compare");
  cmp.textContent = v.prevHash ? `SHA-256 before ${short(v.prevHash, 6)} → after ${short(v.hash, 6)}` : "";
  cmp.classList.toggle("hidden", !v.prevHash);
  const attesters = q("verify-attesters");
  if (!v.records.length) {
    set(["bad", "✕", "No record for this file",
      "No registered key signed this exact file. A resized or recompressed copy also has no record: \"no record\" does not mean \"fake\".", "no-record"]);
    box.dataset.recordState = "none";
    for (const id of ["verify-record", "verify-honest-sentence", "verify-not-shown", "verify-other-records", "verify-attesters"]) q(id).classList.add("hidden");
    return;
  }
  const rec = mainRecord(v.records);
  box.dataset.recordState = stateOf(rec);
  set(verdictOf(rec));
  const dev = deviceOf(rec);
  const A = Number(rec.anchorBlock), B = Number(rec.recordedBlock);
  q("verify-honest-sentence").classList.remove("hidden");
  q("verify-not-shown").classList.remove("hidden");
  setText("verify-block-a", A); setText("verify-block-b", B);
  q("verify-record").classList.remove("hidden");
  setShort("verify-record-device", rec.keyId, 6);
  setText("verify-device-status", deviceText(rec));
  setShort("verify-depositor", rec.depositor, 4);
  setText("verify-window", `signed after block ${A}, on chain by block ${B} (${fmtTime(rec.recordedAt)})`);
  setText("verify-photo-state", stateOf(rec));
  setText("verify-deposit", depositText(rec));
  const acc = accusationsOf(rec);
  setText("verify-accusations", acc.total ? `${acc.total} (${acc.rejected} rejected, ${acc.proven} proven, ${acc.open} open)` : "none");
  setText("verify-records-count", v.records.length === 1 ? "1 (one key)" : `${v.records.length} (one per key that signed it)`);
  // Several keys attested this file: one verdict line per key.
  attesters.replaceChildren();
  attesters.classList.toggle("hidden", v.records.length < 2);
  if (v.records.length > 1) {
    const p = document.createElement("p");
    p.className = "note attesters";
    p.textContent = "Several keys attested this file. Each is a separate claim; judge each key by its history.";
    attesters.appendChild(p);
    for (const r of v.records) {
      const d = document.createElement("div");
      d.className = "d";
      d.dataset.testid = "verify-attester-row";
      d.textContent = `Key ${short(r.keyId)}: ${verdictOf(r)[2]}`;
      attesters.appendChild(d);
    }
  }
  // Flagged device: its other records stay listed with their deposits.
  const others = dev.status === "flagged" ? S.records.filter((r) => same(r.keyId, rec.keyId) && !same(r.photoHash, v.hash)) : [];
  q("verify-other-records").classList.toggle("hidden", !others.length);
  const tb = q("verify-other-table").tBodies[0];
  tb.replaceChildren();
  for (const o of others) {
    const tr = tb.insertRow();
    tr.dataset.testid = "verify-other-row";
    [shortHash(o.photoHash), `${o.anchorBlock} – ${o.recordedBlock}`, stateChip(o)[0], depositText(o)].forEach((c, i) => {
      const td = tr.insertCell(); td.textContent = c; if (i === 0) td.className = "mono";
    });
  }
}

// Explains the verdict now shown.
function explainVerify(pixel = false) {
  const state = q("verify-status").dataset.state;
  if (pixel) {
    return explain("One pixel changed", "One pixel of the image changed, so its SHA-256 changed completely, and the contract has no record for this file.",
      "a record binds one exact file, not a picture that looks the same. A recompressed copy also has no record: \"no record\" does not mean \"fake\".", [], "Verifier", "verify");
  }
  const what = {
    "no-record": "The page hashed the file and read the contract: no registered key signed this exact file.",
    attested: `A registered key signed this exact file between block ${q("verify-block-a").textContent} and block ${q("verify-block-b").textContent}, and a deposit B is at stake. Nothing more is claimed.`,
    accused: "The record exists and is under accusation: UMA's vote is pending.",
    unchallenged: "The record exists and nobody proved it fake within its challenge period.",
    fake: "The record exists and is marked Fake: UMA's voters found the evidence proves it. The key is flagged.",
    "flagged-fake-proven": "This photo was not judged. Its key was flagged because another of its photos was proven fake.",
    "flagged-key-revoked": "This photo was not judged. Its key was revoked after the record was made; a thief may have made it.",
  }[state] || "";
  explain("Verify a file", what, state === "no-record" ? "" : "anyone can verify with one read call to any node: no account, no vendor server.", [], "Verifier", "verify");
}

// Changes one pixel of the loaded file and verifies again (expected: no record).
async function doChangePixel() {
  const v = S.verify;
  const out = await changeOnePixel(v.bytes, v.type);
  await loadVerifyFile(out.bytes, out.type, v.name.replace(/ · one pixel changed.*$/, "") + ` · one pixel changed (${out.how})`, v.hash);
}

// ------------------------------------------------------------------ Accuser

// Why a record cannot be accused now ("" if it can).
function notAccusableReason(r) {
  const st = stateOf(r);
  if (st === "refunded") return "refunded";
  if (st === "fake") return "already proven fake";
  if (st === "accused") return "under accusation";
  if (!accusableNow(r)) return "challenge period over";
  return "";
}

// Fills the photo selector with the photos that can be accused now (newest first) and says why the others cannot.
function renderAccuseSelect() {
  const sel = q("select-accuse-photo");
  const a = S.acc;
  const keep = (a && a.commitment && !a.voted ? `${a.photoHash}|${a.keyId}` : "") || S.accChoice || S.lastPhoto || "";
  sel.replaceChildren();
  const ok = S.records.filter((r) => !notAccusableReason(r)).reverse();
  const options = [...ok];
  // The photo of the open accusation stays shown even if it is no longer accusable.
  const live = a && a.commitment && !a.voted && !a.dead && !a.noAssertion;   // an accusation still in progress
  if (live && !ok.some((r) => same(r.photoHash, a.photoHash) && same(r.keyId, a.keyId))) {
    const r = S.records.find((x) => same(x.photoHash, a.photoHash) && same(x.keyId, a.keyId));
    if (r) options.unshift(r);
  }
  for (const r of options) {
    const o = document.createElement("option");
    o.value = `${toHex(r.photoHash)}|${toHex(r.keyId)}`;
    o.textContent = `${shortHash(r.photoHash)} · key ${short(r.keyId)} · blocks ${r.anchorBlock}–${r.recordedBlock} · open until ${fmtTime(r.accusableUntil)}`;
    sel.appendChild(o);
  }
  if (!options.length) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "no photo is open to challenge now";
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  // Why the other photos are not offered.
  const counts = {};
  for (const r of S.records) { const why = notAccusableReason(r); if (why) counts[why] = (counts[why] || 0) + 1; }
  const parts = Object.entries(counts).map(([why, n]) => `${n} ${why}`);
  setText("accuse-not-accusable", parts.length ? `Not offered (cannot be accused now): ${parts.join(", ")}.` : "");
  const [, keyId] = sel.value.split("|");
  setText("uma-question-key", keyId ? short(keyId) : "K");
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

// Step 1: commit (only a hash goes on chain) and lock the bond B. Re-checks the record on chain first.
async function doCommit() {
  const [photoHash, keyId] = q("select-accuse-photo").value.split("|");
  const evidence = q("input-evidence").value.trim();
  if (!evidence) throw new Error("Write the evidence (a link or a hash of public evidence) first");
  await refreshChain();
  const rec = (await S.lib.verifyPhoto(S.ctx, photoHash)).find((r) => same(r.keyId, keyId));
  const why = rec ? notAccusableReason(rec) : "no record";
  if (why) throw new Error(`This photo cannot be accused now (${why}); nothing was sent.`);
  const before = await settleSnapshot(photoHash, keyId);
  const r = await S.lib.commitAccusation(S.ctx, "accuser", { photoHash, keyId, evidence });
  const commitTxs = [...S.actionTxs];
  const blk = await blockOf(commitTxs[commitTxs.length - 1]?.txHash);
  S.acc = { photoHash, keyId, evidence, before, commitment: toHex(r.commitment), salt: toHex(r.salt),
    evidenceHash: toHex(r.evidenceHash), commitTxs, committedAt: blk.timestamp ?? S.chain.timestamp, commitBlock: blk.number,
    wrapped: await wrappedBy(commitTxs) };
  saveAcc();
}

// Step 2: reveal; Paprika asserts the accusation at UMA and disputes it at once. A failed reveal keeps the
// commitment (it may be retried) and the "Start a new accusation" button stays available.
async function doReveal() {
  const a = S.acc;
  const r = await S.lib.revealAccusation(S.ctx, "accuser", { photoHash: a.photoHash, keyId: a.keyId, evidenceHash: a.evidenceHash, salt: a.salt });
  a.revealTxs = [...S.actionTxs];
  a.assertionId = toHex(r.assertionId);
  if (!r.assertionId || /^0x0*$/.test(a.assertionId)) { a.assertionId = ""; a.noAssertion = true; }   // bond returned
  saveAcc();
}

// Brings the local accusation in line with the chain: rebuilds a revealed accusation that this browser does not know
// (fresh browser, cleared storage), marks one decided elsewhere, and marks a commitment whose reveal period is over.
async function reconcileAccusation() {
  const open = S.accusations.find((x) => x.open);
  let a = S.acc;
  if (a?.assertionId && !a.voted) {
    const onChain = S.accusations.find((x) => same(x.assertionId, a.assertionId));
    if (onChain && !onChain.open) {
      a.voted = true; a.fakeProven = onChain.fakeProven; a.decidedElsewhere = true;
      a.after = await settleSnapshot(a.photoHash, a.keyId);
      saveAcc();
    }
  }
  const inProgress = a && a.commitment && !a.assertionId && !a.dead && !a.noAssertion && !a.voted;   // committed, not revealed
  if (open && !inProgress && !(a && same(a.assertionId, open.assertionId))) {
    S.acc = a = { photoHash: open.photoHash, keyId: open.keyId, assertionId: open.assertionId, commitment: "(revealed earlier; rebuilt from the chain)",
      evidenceHash: open.evidenceHash, before: null, fromChain: true };
    saveAcc();
  }
  if (a && a.commitment && !a.assertionId && !a.noAssertion && a.committedAt) {
    a.dead = S.chain.timestamp > a.committedAt + Number(S.ctx.params.revealWindow);
  }
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
  let seen = 0;
  phaseState("commit", "run"); phaseState("reveal", ""); phaseState("settled", "");
  const order = ["commit", "reveal", "settled"];
  const onPhase = (p) => {
    const name = phaseName(p.phase);
    const i = order.indexOf(name);
    const txs = S.actionTxs.slice(seen);
    seen = S.actionTxs.length;
    if (i >= 0) phaseState(name, "done", p.timestamp ? `chain time ${fmtTime(p.timestamp)}` : "");
    if (i >= 0 && i + 1 < order.length) phaseState(order[i + 1], "run");
    const text = {
      commit: "Three UMA voters committed hidden votes in UMA's voting contract. Then chain time was advanced to the reveal phase.",
      reveal: "The voters revealed their votes; UMA counted them. Then chain time was advanced to the end of the round.",
      settled: "Settled at UMA (anyone can call it; here the demo operator): UMA paid Paprika and Paprika credited the winner.",
    }[name] || `UMA vote: ${p.phase}`;
    explain(`UMA vote · ${name}`, text, "", txs, "UMA", "vote");
  };
  const r = await S.lib.umaVote(S.ctx, a.assertionId, fakeProven, { onPhase });
  for (const n of order) if (q(`vote-phase-${n}`).className !== "done") phaseState(n, "done");
  a.voteTxs = r?.txHashes || [];
  a.voted = true;
  a.fakeProven = fakeProven;
  a.after = await settleSnapshot(a.photoHash, a.keyId);
  saveAcc();
}

// Explains the outcome of the vote and scrolls the Outcome card into view.
function explainOutcome() {
  const a = S.acc;
  if (a.fakeProven) {
    explain("Outcome · fake proven",
      "UMA's voters found the evidence proves the fake. The photo is marked Fake for good and its key is flagged. The Accuser gets B back plus B − f×B as credit; UMA keeps f×B.",
      "the reward is this record's own deposit, so there is no shared fund to drain; voters say yes only if the claim is publicly verifiable.",
      S.actionTxs, "UMA", "outcome");
  } else {
    explain("Outcome · not proven fake",
      "UMA's voters found the evidence does not prove it. The Accuser loses B; the Photographer keeps the deposit and gets B − f×B as credit; UMA keeps f×B. The challenge period is extended by the time spent under accusation.",
      "the bond makes a false accusation cost B; the extension stops a forger from running out the clock by accusing its own fake.",
      S.actionTxs, "UMA", "outcome");
  }
  q("accuse-panel-settle").scrollIntoView({ block: "start" });
}

// Starts over with a new accusation (an unrevealed commitment is dropped from this browser; its bond stays locked).
function doNewAccusation() {
  S.acc = null;
  saveAcc();
  q("input-evidence").value = defaultEvidence();
  for (const n of ["commit", "reveal", "settled"]) phaseState(n, "");
  renderAccuse();
  renderAccuseSelect();
  explain("New accusation", "Choose a photo that is open to challenge, write the public evidence, and commit.", "", [], "Accuser", "commit");
}

// Default evidence text, so the demo can be clicked through quickly.
function defaultEvidence() {
  return `https://example.org/evidence · same image published before block a · ${new Date().toISOString().slice(0, 10)}`;
}

// Countdown to the reveal deadline of an unrevealed commitment (chain time).
function renderDeadline() {
  const a = S.acc;
  if (!a?.commitment || a.assertionId || a.noAssertion || !a.committedAt) return setText("reveal-deadline", "");
  const deadline = a.committedAt + Number(S.ctx.params.revealWindow);
  const left = deadline - S.chain.timestamp;
  setText("reveal-deadline", left > 0
    ? `Reveal before ${fmtTime(deadline)} (chain time) · ${fmtDuration(Math.max(0, left))} left. The secret is saved in this browser.`
    : `The reveal period ended at ${fmtTime(deadline)}: this bond can only be forfeited now. Start a new accusation.`);
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
  if (a?.evidence && k > 0) q("input-evidence").value = a.evidence;
  setText("commit-status", !a?.commitment ? "" : a.fromChain ? "Accusation rebuilt from the chain (revealed earlier, vote pending)."
    : a.dead ? "Committed, not revealed in time: the bond is lost." : "Committed: only a hash is on chain · bond B locked");
  setText("reveal-status", a?.noAssertion ? "nothing to vote on: the photo was already decided or under accusation; the bond was credited back"
    : a?.assertionId ? "sent to UMA and disputed" : "");
  if (a?.salt) setShort("accuse-secret", a.salt, 8); else setText("accuse-secret", "random, created at commit, kept by the accuser (saved in this browser)");
  if (a?.commitment && /^0x/.test(a.commitment)) setShort("commit-commitment", a.commitment, 8);
  else setText("commit-commitment", a?.commitment || "keccak256(accuser, photo, device, evidence hash, secret)");
  renderGroups(q("commit-tx"), a?.commitTxs || []);
  renderGroups(q("reveal-tx"), a?.revealTxs || []);
  setText("reveal-photo", a ? shortHash(a.photoHash) : "");
  if (a?.assertionId) setShort("reveal-assertion-id", a.assertionId, 8); else setText("reveal-assertion-id", "");
  renderDeadline();
  if (a?.voted) renderSettle();
}

// The Outcome table: measured money next to the rule with B and f.
function renderSettle() {
  const a = S.acc;
  const B = big(S.ctx.params.bond), fB = feeOfBond();
  const up = a.fakeProven;
  const o = q("settle-outcome");
  o.innerHTML = up ? '<span class="chip r">fake proven</span>' : '<span class="chip m">not proven fake</span>';
  o.dataset.outcome = up ? "fake-proven" : "not-proven";
  const expA = up ? B - fB : -B, expD = up ? -B : B - fB;
  setText("settle-formula-accuser", up ? "−B + B back + (B − f×B)" : "−B");
  setText("settle-formula-depositor", up ? "−B (deposit lost)" : "B kept + (B − f×B)");
  setText("settle-formula-store", "+f×B");
  setText("settle-expected-accuser", signed(expA));
  setText("settle-expected-depositor", signed(expD));
  setText("settle-expected-store", signed(fB));
  if (!a.before || !a.after) {
    for (const id of ["settle-accuser", "settle-depositor", "settle-store"]) setText(id, "not measured (no snapshot from before the commit in this browser)");
    setText("settle-check", "");
  } else {
    const w = a.wrapped || { accuser: 0n, photographer: 0n };
    const depIsPh = same(a.before.depositor || a.after.depositor, addr("photographer"));
    const mA = a.after.accuser - a.before.accuser - big(w.accuser);
    const mD = a.after.photographer - a.before.photographer - big(w.photographer) + (a.after.locked - a.before.locked);
    const mS = a.after.store - a.before.store;
    setText("settle-accuser", signed(mA));
    setText("settle-depositor", depIsPh ? signed(mD) : "not measured (depositor is not the Photographer)");
    setText("settle-store", signed(mS));
    const good = mA === expA && (!depIsPh || mD === expD) && mS === fB;
    setText("settle-check", a.decidedElsewhere ? "Decided outside this page: measured amounts may include other actions."
      : good ? "Measured on chain = expected by the rule ✓" : "Measured on chain differs from the rule: other actions happened meanwhile.");
  }
  setText("vote-tx", (a.voteTxs || []).join(" "));
}

// Withdraws a role's credit to its wallet.
async function doWithdraw(role) {
  await S.lib.withdrawCredit(S.ctx, role);
}
const explainWithdraw = (who) => () => explain("Withdraw credit", `The ${who} moved its credit from Paprika to its wallet.`,
  "Paprika pays by credits: an account that cannot receive tokens then blocks only its own withdrawal, never UMA's settlement.", S.actionTxs, who, "");

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
    after: () => explain("New device key", "A new P-256 key pair was created in this browser. Only its public key goes on chain, at registration. A new key starts with no history.", "", [], "Photographer", "register") }));
  on("btn-register", () => run("Register", doRegister, { after: () => explain("Register a device key",
    "The key signed a message naming the Photographer's account, and Paprika stored the public key on chain. It cost only gas: no manufacturer or authority approved it. Here the key is a software key in this browser.",
    "a public key is public. Without this proof of possession anyone could register someone else's key, and the real holder could never register it.", S.actionTxs, "Photographer", "register") }));
  on("btn-start-camera", () => run("Start camera", doStartCamera, { tx: false }));
  on("btn-take-photo", () => run("Take a selfie", doTakePhoto, { tx: false }));
  on("btn-retake", () => run("Retake", async () => { S.photo = null; await doStartCamera(); }, { tx: false }));
  q("toggle-mirror").addEventListener("change", (e) => q("capture-preview").classList.toggle("mirror", e.target.checked));
  on("btn-choose-file", () => q("input-capture-file").click());
  onFileInput("input-capture-file", (f) => run("Load file", async () => { stopCamera(); await loadCapturePhoto(await blobBytes(f), f.type, f.name); }, { tx: false }));
  on("btn-sample-image", () => run("Sample image", async () => { stopCamera(); await loadCapturePhoto(await sampleImage(), "image/jpeg", `sample-${Date.now()}.jpg`); }, { tx: false }));
  on("btn-attest", () => run("Sign & attest", doAttest, { after: explainAttest }));
  on("btn-deposits-withdraw", () => run("Withdraw credit", () => doWithdraw("photographer"), { after: explainWithdraw("Photographer") }));
  on("btn-advance-time", () => run("Advance time", async () => {
    if (accusationPending()) throw new Error("An accusation is open: decide it first. Skipping time now would expire UMA's vote.");
    const p = S.ctx.params;
    const secs = Number(p.photoWindow) + Number(p.revealWindow) + 1;
    await S.lib.advanceTime(S.ctx, secs);
    addTimelineNote(`Demo clock: skipped ${fmtDuration(secs)}`, "evm_increaseTime + evm_mine");
  }, { after: () => explain("Demo clock", `Demo: skipped the ${fmtDuration(S.ctx.params.photoWindow)} challenge period + ${fmtDuration(S.ctx.params.revealWindow)} reveal period. On a real network this is just waiting.`,
    "a deposit is refundable only after the challenge period plus the reveal period, so an accusation committed at the last second can still be revealed.", [], "", "refund") }));
  on("btn-revoke", () => run("Revoke key", doRevoke, { after: () => explain("Revoke a key",
    "The key signed its own revocation, naming the caller. The key is flagged and cannot attest again. Its earlier records and deposits are untouched. No vote, no money.",
    "for a stolen or copied key: otherwise a thief could keep making records in the holder's name. A flag never erases records.", S.actionTxs, "Photographer", "revoke") }));
  // Verifier
  on("btn-verify-choose-file", () => q("input-verify-file").click());
  onFileInput("input-verify-file", verifyFile);
  on("btn-verify-last", () => run("Verify", () => loadVerifyFile(S.attested.bytes, S.attested.type, S.attested.name), { tx: false, after: () => explainVerify() }));
  on("btn-change-pixel", () => run("Change one pixel", doChangePixel, { tx: false, after: () => explainVerify(true) }));
  const dz = q("verify-dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); const f = e.dataTransfer.files[0]; if (f) verifyFile(f); });
  addEventListener("dragover", (e) => e.preventDefault());   // a file dropped elsewhere must not navigate away
  addEventListener("drop", (e) => e.preventDefault());
  // Accuser
  q("select-accuse-photo").addEventListener("change", (e) => { S.accChoice = e.target.value; renderAccuseSelect(); syncButtons(); });
  on("btn-refresh-records", () => run("Reload records", async () => {}, { tx: false }));
  on("btn-commit", () => run("Commit", doCommit, { after: () => explain("Accuse · Commit",
    "Only a hash went on chain, with a bond B. Nobody can tell which photo is accused, so nobody can copy this accusation or react to it. The secret is saved in this browser for the reveal.",
    "a pending transaction is public. A one-step accusation could be copied under another name, even by the forger itself. The hash includes the accuser's address, so a copied commitment is useless.",
    S.actionTxs, "Accuser", "commit") }));
  on("btn-reveal", () => run("Reveal", doReveal, { after: () => explain("Accuse · Reveal",
    S.acc?.noAssertion ? "There was nothing to vote on (the photo was already decided or under accusation), so the bond was credited back."
      : "Paprika recomputed the commitment, then opened the case at UMA with the accuser's bond and, in the same transaction, contested it with the photographer's deposit. Both stakes (2B) are now at UMA.",
    "in UMA an undisputed claim is accepted as true. Without the immediate dispute a false accusation would win by silence against a photographer who was not watching.",
    S.actionTxs, "Accuser", "reveal") }));
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
  q("timeline-raw-toggle").addEventListener("change", (e) => { q("activity-log").classList.toggle("showraw", e.target.checked); renderTimeline(); });
  addEventListener("hashchange", showView);
}

// Shows the full-page message (system not running, or another blocker with its own title and instructions).
function fatal(reason, title, howtoText, howto, retry = true) {
  setText("fatal-reason", reason);
  if (title) setText("fatal-title", title);
  if (howtoText) setText("fatal-howto-text", howtoText);
  if (howto) setText("fatal-howto", howto);
  q("fatal-retry").classList.toggle("hidden", !retry);
  q("fatal-message").classList.remove("hidden");
  // Retry by itself: reload when the server answers with a deployment whose contract exists on the chain.
  if (retry) setInterval(async () => {
    try {
      const dep = await (await fetch("/deployment.json", { cache: "no-store" })).json();
      const res = await fetch("/rpc", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [dep.addresses.paprika, "latest"] }) });
      const code = (await res.json()).result;
      if (code && code !== "0x") location.reload();
    } catch { /* still down */ }
  }, 3000);
}

// Camera hint: browsers allow the camera only on https or localhost.
function cameraHint() {
  if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) return;
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.dataset.testid = "camera-hint";
  hint.textContent = "The camera needs localhost or https. Open the app through an SSH tunnel, or choose a file / use the sample image.";
  q("capture-file-name").before(hint);
}

// Identifies the chain and deployment: changes when the chain is restarted or Paprika is redeployed.
async function fingerprint() {
  if (S.lib.deploymentFingerprint) return String(await S.lib.deploymentFingerprint(S.ctx));
  const g = await S.ctx.provider.getBlock(0);
  return `${g?.hash}|${S.ctx.addresses.paprika}`.toLowerCase();
}

// Starts the page: secure context, deployment, library, connection (through this server's /rpc), restore, render.
async function main() {
  // WebCrypto (P-256 keys, SHA-256) and the camera exist only in a secure context: https, or http on localhost.
  if (!globalThis.crypto?.subtle) {
    const port = location.port || (location.protocol === "https:" ? "443" : "80");
    return fatal(`This page was opened at ${location.origin}. Browsers enable WebCrypto (the device key and SHA-256) and the camera only on https or on localhost, so Paprika cannot run here.`,
      "Open Paprika on localhost (SSH tunnel) or https",
      `On the demo computer, forward this port over SSH, keep the command running, then open http://localhost:${port}/ :`,
      `ssh -N -L ${port}:127.0.0.1:${port} <user>@${location.hostname}`, false);
  }
  let deployment;
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`/deployment.json: HTTP ${res.status}`);
    deployment = await res.json();
  } catch (e) {
    return fatal(`No deployment found (${errText(e)}). The deploy script writes the deployment JSON that this server serves.`);
  }
  try {
    S.dev = await import("/lib/device.js");
    S.lib = await import("/lib/paprika.js");
  } catch (e) {
    return fatal(`The Paprika library could not be loaded (${errText(e)}).`);
  }
  const rpcUrl = location.origin + "/rpc";   // the server forwards /rpc to the local chain
  try {
    S.ctx = await S.lib.connect({ rpcUrl, deployment });
    await refreshChain();
    const code = await S.ctx.provider.getCode(S.ctx.addresses.paprika);
    if (!code || code === "0x") throw new Error("no Paprika contract at the deployed address: deploy first");
    S.fingerprint = await fingerprint();
  } catch (e) {
    return fatal(`The local chain does not answer through ${rpcUrl}, or the deployment does not match it (${errText(e)}).`);
  }
  // A restarted or redeployed chain makes the saved key and accusation meaningless: clear them and say so.
  const lastFp = localStorage.getItem("paprika-fingerprint");
  const msg = sessionStorage.getItem("paprika-reset-msg");
  sessionStorage.removeItem("paprika-reset-msg");
  if (lastFp && lastFp !== S.fingerprint) {
    clearLocalState();
    notice("The chain was restarted or Paprika was redeployed since this browser last used it: the saved device key and accusation were cleared.");
  } else if (msg) notice(msg);
  localStorage.setItem("paprika-fingerprint", S.fingerprint);

  renderParams();
  wire();
  cameraHint();
  showView();
  explainIntro();
  q("input-evidence").value = defaultEvidence();
  await loadDevice();
  try { const s = localStorage.getItem(storeKey("acc")); if (s) S.acc = fromJson(s); } catch { S.acc = null; }
  S.lib.onActivity(S.ctx, onTx);
  await run("Reading the chain", async () => {}, { tx: false });
  if (S.acc?.commitment && !S.acc.voted) explain("Accusation restored", S.acc.fromChain
    ? "An accusation is open on the chain: it was rebuilt from the contract's events, so the vote can go on."
    : "The open accusation of this browser was restored (secret, evidence, photo), so it can still be revealed or voted on.", "", [], "Accuser", S.acc.assertionId ? "vote" : "commit");
  // Poll: block, time, balances, chain identity, refund buttons, countdown.
  setInterval(async () => {
    if (S.busy) return;
    try {
      await refreshChain();
      if ((await fingerprint()) !== S.fingerprint) {
        clearLocalState();
        sessionStorage.setItem("paprika-reset-msg", "The chain was restarted or Paprika was redeployed: the page reloaded and the saved device key and accusation were cleared.");
        location.reload();
        return;
      }
      await refreshBalances(false);
      q("chain-dot").classList.remove("off");
      updateRefundButtons();
      renderDeadline();
      syncButtons();
    } catch {
      q("chain-dot").classList.add("off");
      setText("chain-label", "local chain not answering");
    }
  }, 3000);
}

main();
