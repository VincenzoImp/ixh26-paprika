// Paprika web app: the "Protocol view" drawer (off by default; ?protocol=1 opens it).
// For the jury: the lifecycle map with the current step, the last action with WHY the rule exists, its calls,
// the rule-vs-measured check of an outcome, and the parameters with their symbols. Users never need it.

import { h, tid, mount } from "./dom.js";
import { S, emit } from "./state.js";
import { hashLink, addrLink, tok, signedTok, dur } from "./format.js";

// One entry per protocol step: title, what happened, why the rule exists (docs/design-rationale.md), map step.
const STEPS = {
  register: { title: "Register a device key", map: "register",
    text: "The key signed a message naming the account, and Paprika stored the public key. It cost only gas: no manufacturer or authority approved it.",
    why: "A public key is public. Without this proof of possession anyone could register someone else's key, and the real holder could never register it." },
  prepare: { title: "Prepare the account", map: "attest",
    text: "ETH was wrapped into WETH and Paprika was allowed to take WETH from this account, once. Later deposits and bonds need one signature each.",
    why: "UMA's bonds are an ERC-20 token; WETH is ETH in that form." },
  attest: { title: "Attest a photo", map: "attest",
    text: "The key signed the photo hash together with the hash of a recent block. Paprika checked the P-256 signature, stored the record and locked the deposit B.",
    why: "Nobody can predict a block hash, so the signature was made after block a; the record is in block r, so the file existed by then. The deposit makes every record cost locked money, not only gas." },
  verify: { title: "Verify a file", map: "verify",
    text: "The page hashed the file in the browser and read the contract. No account, no transaction.",
    why: "Anyone can verify with one read call to any node: no vendor server." },
  pixel: { title: "One pixel changed", map: "verify",
    text: "One pixel changed, so the SHA-256 changed completely, and the contract has no record for this file.",
    why: "A record binds one exact file, not a picture that looks the same. \"No record\" does not mean \"fake\"." },
  evidence: { title: "Publish evidence", map: "challenge",
    text: "The evidence was published where UMA's voters can read it; only its SHA-256 goes on chain.",
    why: "Voters say FAKE only on public, checkable evidence (UMIP-170): the challenger must prove it." },
  commit: { title: "Challenge · Commit", map: "challenge",
    text: "Only a hash went on chain, with a bond B. Nobody can tell which photo is challenged, so nobody can copy this challenge or react to it.",
    why: "A pending transaction is public. A one-step challenge could be copied under another name, even by the forger itself. The hash includes the challenger's address, so a copied commitment is useless." },
  reveal: { title: "Challenge · Reveal", map: "challenge",
    text: "Paprika checked the commitment and sent the case to UMA's vote. UMA holds both stakes (the challenger's bond and the photo's deposit) until the vote, then pays the winner.",
    why: "In UMA an undisputed claim is accepted as true. Paprika disputes at once with the deposit, so a false challenge can never win by silence." },
  vote: { title: "UMA vote (3 local voter accounts)", map: "challenge",
    text: "Three local voter accounts committed and revealed their votes in UMA's voting contract; then the assertion was settled (anyone can settle) and Paprika credited the winner.",
    why: "On mainnet UMA token holders vote; this takes 48-72 h. The reward is the record's own deposit: there is no shared fund to drain." },
  refund: { title: "Refund", map: "refund",
    text: "Nobody proved the photo fake in time, so its deposit was credited back to the depositor. The record stays.",
    why: "A refund is possible only after T_photo + T_reveal, so a challenge committed at the last second can still be revealed." },
  claim: { title: "Claim credit", map: "refund",
    text: "The account moved its credit from Paprika to its wallet.",
    why: "Paprika pays by credits: an account that cannot receive tokens blocks only its own withdrawal, never UMA's settlement." },
  revoke: { title: "Revoke a key", map: "revoke",
    text: "The key signed its own revocation. The key is flagged and cannot attest again; earlier records keep their deposits. No vote, no money.",
    why: "For a stolen or copied key: otherwise a thief could keep making records in the holder's name. A flag never erases records." },
  clock: { title: "Skip wait (local network)", map: "refund",
    text: "The local chain's clock moved forward. On a real network this is just waiting.",
    why: "A deposit is refundable only after the challenge period plus the reveal period." },
  forfeit: { title: "Forfeit an expired commitment", map: "challenge",
    text: "The commitment was not revealed in time; its bond was sent to the burn address.",
    why: "The target of a commitment is hidden, so no depositor is known to receive the bond." },
};

const MAP = [["register", "Register"], ["attest", "Attest (locks B)"], ["challenge", "Challenge period"], ["refund", "Refund"], ["verify", "Verify (any time)"], ["revoke", "Revoke (any time)"]];

// Records the last protocol step (called by act() and by read-only steps like Verify).
export function record(step) {
  S.protocol.last = step;
  render();
}

// Opens or closes the drawer (persisted).
export function setOpen(open) {
  S.protocol.open = !!open;
  try { localStorage.setItem("paprika:protocol-view", open ? "1" : "0"); } catch { /* ignore */ }
  document.body.classList.toggle("protocol-open", S.protocol.open);
  const sw = tid("protocol-toggle");
  if (sw) sw.checked = S.protocol.open;
  render();
}

// Draws the drawer content.
export function render() {
  const el = tid("protocol-drawer");
  if (!el || !S.ctx) return;
  if (!S.protocol.open) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const last = S.protocol.last;
  const st = last ? STEPS[last.key] : null;
  const p = S.ctx.params;
  mount(el,
    h("div", { class: "dr-head" }, h("b", {}, "Protocol view"), h("button", { class: "t-close", testid: "protocol-close", title: "Close the protocol view", onclick: () => setOpen(false) }, "Close")),
    h("ol", { class: "pmap", testid: "protocol-map", "data-step": st?.map || "" },
      MAP.map(([k, n]) => h("li", { class: st?.map === k ? "cur" : "", "data-step": k, testid: `map-${k}` }, n))),
    st ? h("div", { class: "dr-step", testid: "explainer" },
      h("div", { class: "ex-step", testid: "explainer-step" }, last.refused ? `Refused: ${st.title}` : st.title),
      h("div", { class: "ex-text", testid: "explainer-text" }, last.refused ? last.refused : last.text || st.text),
      h("div", { class: "ex-why", testid: "explainer-why" }, `Why: ${st.why}`),
      last.txs?.length ? h("div", { class: "ex-chain", testid: "explainer-chain" }, h("b", {}, "Calls"),
        last.txs.map((t) => h("div", {}, h("span", {}, t.call), hashLink(t.txHash, "tx", { copy: false })))) : null,
      last.check ? ruleTable(last.check) : null)
      : h("div", { class: "dr-step", testid: "explainer" }, h("div", { class: "ex-step", testid: "explainer-step" }, "Paprika in three lines"),
        h("ul", { class: "ex-text", testid: "explainer-text" },
          h("li", {}, "A registered key signs each photo hash together with a recent block hash; whoever sends it locks a deposit B."),
          h("li", {}, "During the challenge period anyone can challenge the photo with an equal bond B; UMA's voters decide, and whoever is wrong loses B."),
          h("li", {}, "If nobody proves it fake in time, the deposit goes back. No record is ever deleted."))),
    h("div", { class: "dr-params", testid: "params-panel" },
      h("div", {}, h("b", {}, "B"), ` = `, h("span", { testid: "param-bond" }, tok(p.bond)), " deposit = bond"),
      h("div", {}, h("b", {}, "T_photo"), ` = `, h("span", { testid: "param-photo-window" }, dur(p.photoWindow)), " challenge period"),
      h("div", {}, h("b", {}, "T_reveal"), ` = `, h("span", { testid: "param-reveal-window" }, dur(p.revealWindow)), " reveal period"),
      h("div", {}, h("b", {}, "f"), ` = `, h("span", { testid: "param-fee" }, String(p.feeShare)), " UMA's share of the loser's stake (set by UMA)"),
      h("div", {}, "Paprika ", addrLink(S.ctx.addresses.paprika)),
      h("div", {}, "UMA OOv3 ", addrLink(S.ctx.addresses.oo)),
      h("div", { class: "d" }, "Fixed at deployment; the contract has no owner.")));
  emit("drawer");
}

// The outcome check for the jury: money moved (measured on chain) next to the rule with B and f.
function ruleTable(c) {
  const row = (who, measured, rule, expected) => h("tr", {}, h("td", {}, who), h("td", { testid: `settle-${who.split(" ")[0].toLowerCase().replace("uma","store")}` }, measured == null ? "—" : signedTok(measured)),
    h("td", { class: "d" }, rule), h("td", { testid: `settle-expected-${who.split(" ")[0].toLowerCase().replace("uma","store")}` }, signedTok(expected)));
  const ok = c.measured && c.measured.accuser === c.expected.accuser && c.measured.depositor === c.expected.depositor && c.measured.store === c.expected.store;
  return h("div", { class: "rule" },
    h("table", { testid: "settle-table" }, h("tr", {}, h("th", {}, ""), h("th", {}, "Measured"), h("th", {}, "Rule"), h("th", {}, "Expected")),
      row("Challenger", c.measured?.accuser, c.fake ? "−B + B + (B − f×B)" : "−B", c.expected.accuser),
      row("Depositor", c.measured?.depositor, c.fake ? "−B" : "B kept + (B − f×B)", c.expected.depositor),
      row("UMA Store (fee)", c.measured?.store, "+f×B", c.expected.store)),
    h("p", { class: "status", testid: "settle-check" }, ok ? "Measured on chain = expected by the rule ✓" : "Not measured in this browser (no snapshot from before the commit)."));
}
