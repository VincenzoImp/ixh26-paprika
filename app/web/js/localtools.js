// Paprika web app: local network tools (chain 31337 only; not in the page on any other network).
// They are facilities of the local test network, not features of Paprika: skip a wait (move the chain clock) and
// resolve a UMA vote with the three local UMA voter accounts run by the server. Dashed lemon = local network facility.
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
  if (S.accusations.some((a) => a.open) || S.records.some((r) => stateOf(r) === "accused")) return "Not while a challenge waits for its UMA vote: resolve the vote first.";
  // A commitment of this browser that is not revealed yet: skipping time would end its reveal period and burn the bond.
  const rw = Number(S.ctx.params.revealWindow);
  if (Object.values(S.mine || {}).some((m) => m.commitment && !m.assertionId && !m.noAssertion && !m.forfeited && (m.pending || S.chain.timestamp + 1 <= Number(m.committedAt) + rw)))
    return "Not while a challenge is committed but not revealed: reveal it first, or skipping would make it expire.";
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

// Resolves the UMA vote of an open accusation with the three local UMA voter accounts (server-side).
export async function resolveVote(assertionId, fakeProven) {
  S.votePhase = { assertionId, phases: [] };
  emit("change");
  const before = S.voteBefore?.[assertionId] || null;
  return act(`Resolve UMA vote (local): ${fakeProven ? "fake proven" : "not proven"}`, async () => {
    try {
      await S.lib.umaVote(S.ctx, assertionId, fakeProven, { onPhase: (ph) => { S.votePhase.phases.push(String(ph.phase)); emit("change"); } });
    } catch (e) {
      if (e?.code === "VOTE_IN_PROGRESS" || /in progress|already running/i.test(e?.message || "")) throw new Error("A vote on this challenge is already running (another window or the CLI). Wait a few seconds; the outcome appears here.");
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
  return h("button", { class: "localchip", testid, onclick, disabled: !!disabled, title: disabled || "Local network tool: not available on public networks" }, label);
}

let open = false;
// Draws the local tools: opened from the network badge in the header and, when open, a bar in the page flow under the banner (it never
// covers content). Only the chain clock lives here; the vote chips sit next to the vote they resolve.
export function renderTools() {
  const btn = tid("network-pill"), el = tid("local-tools");
  if (!btn || !el) return;
  const show = isLocal() && !!S.ctx;
  if (!show || !open) { el.classList.add("hidden"); btn.classList.toggle("on", false); return; }
  btn.classList.toggle("on", true);
  el.classList.remove("hidden");
  const blocker = skipBlocker();
  mount(el, h("div", { class: "localbar", testid: "local-tools-bar" },
    h("b", {}, "Local network tools"), h("span", { class: "d" }, `${S.network.name} only · not available on public networks`),
    h("span", {}, "Chain clock ", h("b", { testid: "clock-time" }, exactTime(S.chain.timestamp))),
    h("button", { testid: "btn-advance-time", disabled: !!blocker || S.busy, title: blocker, onclick: () => skipWait() },
      `Skip ${dur(Number(S.ctx.params.photoWindow) + Number(S.ctx.params.revealWindow) + 1)}`),
    blocker ? h("span", { class: "why", testid: "advance-why" }, blocker) : null,
    h("span", { class: "d" }, "UMA's vote uses UMA's voting contract with 3 local voter accounts; resolve it on the record page."),
    h("button", { class: "t-close", testid: "local-tools-close", title: "Close the local tools", onclick: () => { open = false; renderTools(); } }, "Close")));
}

// Opens or closes the local tools bar (header button).
export function toggleTools() { open = !open; renderTools(); }
