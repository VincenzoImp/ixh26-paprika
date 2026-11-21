// Paprika web app: local network tools (chain 31337 only; not in the page on any other network).
// They are facilities of the local test network, not features of Paprika: skip a wait (move the chain clock) and
// resolve a UMA vote with the simulated voters run by the server. Dashed lemon = local network facility.
// Shown as a collapsed pill bottom-left, plus inline "Skip wait (local)" / "Resolve vote (local)" chips where a wait is shown.

import { h, tid, mount } from "./dom.js";
import { S, emit } from "./state.js";
import { act } from "./actions.js";
import { dur, exactTime } from "./format.js";
import { stateOf } from "./verdict.js";
import { measuredOutcome } from "./outcome.js";

export const isLocal = () => !!S.network?.local;

// Why the clock cannot move now ("" if it can): never while an accusation waits for its vote.
export function skipBlocker() {
  if (S.accusations.some((a) => a.open) || S.records.some((r) => stateOf(r) === "accused")) return "Not while an accusation waits for its UMA vote: resolve the vote first.";
  return "";
}

// Moves the local chain clock forward. seconds: how far; default: past every open challenge + reveal period.
export async function skipWait(seconds) {
  const p = S.ctx.params;
  const secs = seconds ?? Number(p.photoWindow) + Number(p.revealWindow) + 1;
  return act("Skip wait (local)", () => S.lib.advanceTime(S.ctx, secs), { local: true,
    step: { key: "clock", text: `The local chain's clock moved forward by ${dur(secs)}. On a real network this is just waiting.` } });
}

// Seconds to wait until a record is refundable (0 if it already is).
export const untilRefundable = (rec) => Math.max(1, Number(rec.refundableAt) - S.chain.timestamp);

// Resolves the UMA vote of an open accusation with the simulated voters (server-side).
export async function resolveVote(assertionId, fakeProven) {
  S.votePhase = { assertionId, phases: [] };
  emit("change");
  const before = S.voteBefore?.[assertionId] || null;
  return act(`Resolve UMA vote (local): ${fakeProven ? "fake proven" : "not proven"}`, async () => {
    try {
      await S.lib.umaVote(S.ctx, assertionId, fakeProven, { onPhase: (ph) => { S.votePhase.phases.push(String(ph.phase)); emit("change"); } });
    } catch (e) {
      if (e?.code === "VOTE_IN_PROGRESS" || /in progress|already running/i.test(e?.message || "")) throw new Error("A vote on this accusation is already running (another window or the CLI). Wait a few seconds; the outcome appears here.");
      throw e;
    }
  }, { local: true, step: { key: "vote" }, after: async () => {
    const check = await measuredOutcome(assertionId, fakeProven);
    if (check) { S.protocol.last = { ...S.protocol.last, check }; emit("drawer-refresh"); }
  } });
}

// A dashed inline chip (local network facility).
export function localChip(label, onclick, { testid, disabled = "" } = {}) {
  if (!isLocal()) return null;
  return h("button", { class: "localchip", testid, onclick, disabled: !!disabled, title: disabled || "Local network tool: not available on public networks" }, `⏩ ${label}`);
}

let open = false;
// Draws the local tools pill/bar (bottom-left).
export function renderTools() {
  const el = tid("local-tools");
  if (!el) return;
  if (!isLocal() || !S.ctx) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if (!open) {
    mount(el, h("button", { class: "localpill", testid: "local-tools-toggle", onclick: () => { open = true; renderTools(); } }, "⚙ Local network"));
    return;
  }
  const openAcc = S.accusations.filter((a) => a.open);
  const blocker = skipBlocker();
  mount(el, h("div", { class: "localbar", testid: "local-tools-bar" },
    h("div", { class: "lb-head" }, h("b", {}, "Local network tools"), h("span", { class: "d" }, ` · ${S.network.name} · not available on public networks`),
      h("button", { class: "t-close", onclick: () => { open = false; renderTools(); } }, "–")),
    h("div", { class: "lb-row" }, h("span", {}, "Chain clock ", h("b", { testid: "clock-time" }, exactTime(S.chain.timestamp))),
      h("button", { testid: "btn-advance-time", disabled: !!blocker || S.busy, title: blocker, onclick: () => skipWait() },
        `⏩ Skip ${dur(Number(S.ctx.params.photoWindow) + Number(S.ctx.params.revealWindow) + 1)}`),
      blocker ? h("span", { class: "d", testid: "advance-why" }, blocker) : null),
    h("div", { class: "lb-row" }, h("span", {}, "UMA vote · simulated voters (3 local accounts)"),
      openAcc.length ? openAcc.map((a) => h("span", { class: "lb-acc" }, h("a", { class: "link mono", href: `#/record/${a.photoHash}` }, `${a.photoHash.slice(0, 8)}…`),
        h("button", { testid: "btn-vote-fake", disabled: S.busy, onclick: () => resolveVote(a.assertionId, true) }, "Fake proven"),
        h("button", { testid: "btn-vote-not-fake", disabled: S.busy, onclick: () => resolveVote(a.assertionId, false) }, "Not proven")))
        : h("span", { class: "d" }, "no accusation is waiting for a vote")),
    h("div", { class: "lb-row d" }, "Test ETH comes from Hardhat's prefunded accounts; it has no value.")));
}
