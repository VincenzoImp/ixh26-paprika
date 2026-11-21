// Paprika web app: what a record means, in words. Shared by Verify, the record page, Activity and the explorer.
// States come from the contract (Attested, Accused, Refunded, Fake) and the device status (Active, Flagged).

import { h } from "./dom.js";
import { S } from "./state.js";
import { same } from "../util.js";
import { tok, dur, exactTime, hashLink } from "./format.js";

export const stateOf = (rec) => String(rec?.state ?? "").toLowerCase();
export const challengeOver = (rec) => S.chain.timestamp > Number(rec.accusableUntil);
export const refundable = (rec) => stateOf(rec) === "attested" && S.chain.timestamp + 1 >= Number(rec.refundableAt);
// A commitment sent now (next block, at least one second later) is valid only up to accusableUntil.
export const accusableNow = (rec) => stateOf(rec) === "attested" && S.chain.timestamp + 1 <= Number(rec.accusableUntil);

// Device part of a record: { status: "active" | "flagged" | "none", reason, flaggedAtBlock }.
export function deviceOf(rec) {
  const d = rec?.device || {};
  const st = String(d.status ?? "").toLowerCase();
  const rs = String(d.reason ?? "").toLowerCase();
  return { status: st.includes("flag") ? "flagged" : st.includes("activ") ? "active" : "none",
    reason: rs.includes("fake") ? "fake proven" : rs.includes("revok") ? "key revoked" : "",
    flaggedAtBlock: d.flaggedAtBlock != null ? Number(d.flaggedAtBlock) : null };
}

// Accusations of one record on the chain.
export function accusationsOf(rec) {
  const list = S.accusations.filter((a) => same(a.photoHash, rec.photoHash) && same(a.keyId, rec.keyId));
  return { list, total: list.length, rejected: list.filter((a) => !a.open && !a.fakeProven).length,
    open: list.find((a) => a.open) || null, proven: list.filter((a) => !a.open && a.fakeProven).length };
}

// Why a record cannot be accused now ("" if it can).
export function notAccusable(rec) {
  const st = stateOf(rec);
  if (st === "refunded") return "The deposit was returned: nothing is at stake any more.";
  if (st === "fake") return "Already proven fake.";
  if (st === "accused") return "A challenge is open; one at a time.";
  if (!accusableNow(rec)) return "The challenge period is over.";
  return "";
}

// The verdict of one record: { cls, seal, title, detail, state } (state = stable machine name for tests).
export function verdictOf(rec) {
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  const acc = accusationsOf(rec);
  const B = tok(S.ctx.params.bond);
  const left = dur(Number(rec.accusableUntil) - S.chain.timestamp);
  if (st === "fake") return { cls: "bad", seal: "✕", state: "fake", title: "Proven fake",
    detail: `UMA's voters found the evidence proves this photo is not a genuine capture by this key. The depositor lost ${B}. The record stays, marked. Device key ${String(rec.keyId).slice(0, 6)}…${String(rec.keyId).slice(-4)} is now flagged: it can no longer attest.` };
  if (st === "accused") return { cls: "flag", seal: "!", state: "accused", title: "Challenged · UMA vote pending",
    detail: "UMA's voters decide. UMA holds both stakes until the vote." };
  if (dev.status === "flagged" && st !== "refunded") {
    const still = challengeOver(rec) ? "Its challenge period is over." : `It can still be challenged for ${left}.`;
    const why = dev.reason === "key revoked" ? `The key holder revoked this key at block ${dev.flaggedAtBlock}.` : `Another photo of this device was proven fake at block ${dev.flaggedAtBlock}.`;
    return { cls: "flag", seal: "!", state: dev.reason === "key revoked" ? "flagged-key-revoked" : "flagged-fake-proven", title: "Device flagged", detail: `${why} ${still}` };
  }
  const title = acc.rejected ? "Confirmed · challenge rejected" : "Confirmed";
  const base = "No one proved it fake within the challenge period.";
  if (st === "refunded") return { cls: "ok", seal: "✓", state: "unchallenged", title, detail: `${base} Deposit returned to the photographer.` };
  if (challengeOver(rec)) return { cls: "ok", seal: "✓", state: "unchallenged", title, detail: `${base} Deposit refundable.` };
  return { cls: "open", seal: "◷", state: "attested", title: "Attested · open to challenge", detail: `${B} at stake · anyone can challenge it for ${left}.` };
}

// The large verdict card (projector-legible). With no record: the grey "no record" verdict.
export function verdictCard(rec, { testid = "verify-status", extra = null, action = null } = {}) {
  const v = rec ? verdictOf(rec) : { cls: "none", seal: "∅", state: "no-record", title: "Not attested",
    detail: "No record for this exact file. A resized or recompressed copy also has no record: \"no record\" does not mean \"fake\"." };
  const card = h("div", { class: `verdict ${v.cls}`, testid, "data-state": v.state, "data-record-state": rec ? stateOf(rec) : "none" },
    h("div", { class: "seal", testid: `${testid}-seal` }, v.seal),
    h("div", {}, h("div", { class: "bigt", testid: `${testid}-title` }, v.title), h("div", { class: "vd", testid: `${testid}-detail` }, v.detail), extra),
    action ? h("div", { class: "v-action" }, action) : null);
  return card;
}

// "What this record shows": the meaning of a record, in one line.
export function scopeLines(rec) {
  return h("div", { class: "scope", testid: "record-scope" },
    h("p", { testid: "verify-honest-sentence" }, h("b", {}, "What this record shows: "),
      `a registered device signed this exact file between block ${rec.anchorBlock} and block ${rec.recordedBlock}, and a deposit was at stake.`));
}

// The lifecycle of a record: Attested → Challenge period → Confirmed → Deposit returned, or Attested → Challenged → Proven fake / Confirmed.
export function lifecycle(rec) {
  const st = stateOf(rec);
  const acc = accusationsOf(rec);
  const end = exactTime(rec.accusableUntil).slice(11, 16);
  const ext = acc.rejected ? ` · extended by ${acc.rejected} rejected challenge${acc.rejected > 1 ? "s" : ""}` : "";
  let list, cur;
  if (st === "fake") { list = [["Attested", `#${rec.recordedBlock}`], ["Challenged", "UMA vote"], ["Proven fake", "device key flagged"]]; cur = "Proven fake"; }
  else if (st === "accused") { list = [["Attested", `#${rec.recordedBlock}`], ["Challenged", "UMA vote pending"], ["Proven fake or Confirmed", ""]]; cur = "Challenged"; }
  else {
    list = [["Attested", `#${rec.recordedBlock}`], ["Challenge period", challengeOver(rec) ? `ended ${end}${ext}` : `ends ${end}${ext}`],
      ["Confirmed", acc.rejected ? "challenge rejected" : ""], ["Deposit returned", st === "refunded" ? "" : `refundable from ${exactTime(rec.refundableAt).slice(11, 16)}`]];
    cur = st === "refunded" ? "Deposit returned" : challengeOver(rec) ? "Confirmed" : "Challenge period";
  }
  const curIdx = list.findIndex(([n]) => n === cur);
  // Steps up to the current one are done; a confirmed or returned step is mint, a proven fake rose.
  const cls = (i) => {
    const n = list[i][0];
    if (i > curIdx) return "";
    if (n === "Proven fake") return "bad";
    if (i < curIdx || n === "Confirmed" || n === "Deposit returned") return "done";
    return "cur";
  };
  return h("ol", { class: "lifecycle", testid: "record-lifecycle", "data-current": cur },
    list.map(([n, sub], i) => h("li", { class: cls(i), "data-step": n },
      h("span", {}, n), sub ? h("small", {}, sub) : null)));
}

// A short record row label: photo hash link + state chip.
export function stateChip(rec) {
  const st = stateOf(rec);
  const dev = deviceOf(rec);
  const deposit = st === "refunded" ? "deposit returned" : refundable(rec) ? "deposit refundable" : st === "fake" ? "deposit lost" : "deposit locked";
  const [label, cls] = st === "fake" ? ["proven fake", "r"] : st === "accused" ? ["challenged", "p"]
    : dev.status === "flagged" && st !== "refunded" && !challengeOver(rec) ? ["device flagged", "p"]
    : st === "refunded" || challengeOver(rec) ? ["confirmed", "m"]
    : [`open · ${dur(Number(rec.accusableUntil) - S.chain.timestamp)} left`, "s"];
  return h("span", { class: `chip ${cls}`, testid: "record-state-chip", title: `${deposit} · challenge until ${exactTime(rec.accusableUntil)} · refundable from ${exactTime(rec.refundableAt)}` }, label);
}

export { hashLink };
