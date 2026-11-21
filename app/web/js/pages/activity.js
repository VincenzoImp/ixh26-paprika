// Paprika web app: My activity — the connected account's records, accusations and transactions, read from the
// chain (not a browser log), with claimable credit on top.

import { h, mount } from "../dom.js";
import { S } from "../state.js";
import { same } from "../../util.js";
import { hashLink, tok, rel, blockLink } from "../format.js";
import { stateChip, refundable, stateOf } from "../verdict.js";
import { act } from "../actions.js";
import { paprikaEvents } from "../api.js";

let tab = "records";
let events = [];
let loadedAt = -1;

// Draws the page.
export function render(root) {
  if (!S.account) {
    mount(root, h("h1", {}, "My activity"), h("div", { class: "card empty", testid: "activity-empty" },
      h("b", {}, "Connect MetaMask to see your records and accusations."), h("p", { class: "d" }, "Verifying a photo needs no wallet.")));
    return;
  }
  if (loadedAt !== S.chain.blockNumber) { loadedAt = S.chain.blockNumber; paprikaEvents().then((e) => { events = e; render(root); }); }
  const me = S.account.address;
  const records = S.records.filter((r) => same(r.depositor, me)).reverse();
  const accs = S.accusations.filter((a) => same(a.claimant, me)).reverse();
  const tabs = h("div", { class: "tabs" }, [["records", `My records (${records.length})`], ["accusations", `My accusations (${accs.length})`], ["txs", "Transactions"]]
    .map(([k, n]) => h("button", { class: tab === k ? "on" : "", testid: `activity-tab-${k}`, onclick: () => { tab = k; render(root); } }, n)));
  let body;
  if (tab === "records") {
    body = records.length ? h("table", { testid: "deposits-table" },
      h("tr", {}, h("th", {}, "Photo"), h("th", {}, "Device key"), h("th", {}, "State"), h("th", {}, "Recorded"), h("th", {}, "")),
      records.map((r) => h("tr", { testid: "deposit-row", "data-photo-hash": r.photoHash, "data-state": stateOf(r) },
        h("td", {}, hashLink(r.photoHash, "record")), h("td", {}, hashLink(r.keyId, "device", { copy: false })), h("td", {}, stateChip(r)), h("td", {}, rel(r.recordedAt)),
        h("td", {}, refundable(r) ? h("button", { testid: "btn-refund", disabled: S.busy, onclick: () => act("Refund deposit", () => S.lib.refund(S.ctx, "photographer", { photoHash: r.photoHash, keyId: r.keyId }), { step: { key: "refund" } }) }, "Refund") : null))))
      : h("div", { class: "empty", testid: "deposits-empty" }, h("b", {}, "No records yet."), " ", h("a", { class: "link", href: "#/attest" }, "Attest your first photo →"));
  } else if (tab === "accusations") {
    body = accs.length ? h("table", { testid: "accusations-table" },
      h("tr", {}, h("th", {}, "Photo"), h("th", {}, "State"), h("th", {}, "Opened")),
      accs.map((a) => h("tr", { testid: "my-accusation-row" }, h("td", {}, hashLink(a.photoHash, "record")),
        h("td", {}, a.open ? h("span", { class: "chip p" }, "waiting for UMA vote") : h("span", { class: `chip ${a.fakeProven ? "m" : "r"}` }, a.fakeProven ? "fake proven · you won" : "rejected · bond lost")),
        h("td", {}, blockLink(a.blockNumber)))))
      : h("div", { class: "empty" }, h("b", {}, "No accusations."), " Open a record and press Accuse.");
  } else {
    const mineTx = events.filter((e) => [e.args?.depositor, e.args?.claimant, e.args?.account, e.args?.owner].some((x) => x && same(x, me)));
    body = mineTx.length ? h("table", { testid: "my-transactions" }, h("tr", {}, h("th", {}, "Event"), h("th", {}, "Block"), h("th", {}, "Transaction")),
      [...mineTx].reverse().map((e) => h("tr", { testid: "my-tx-row" }, h("td", {}, e.name), h("td", {}, blockLink(e.blockNumber)), h("td", {}, hashLink(e.txHash, "tx")))))
      : h("div", { class: "empty" }, "No transactions with Paprika yet.");
  }
  mount(root,
    h("div", { class: "rec-head" }, h("h1", {}, "My activity"),
      h("div", { class: "row" }, h("span", {}, "Claimable ", h("b", { testid: "deposits-credit" }, tok(S.account.credit))),
        h("button", { class: S.account.credit > 0n ? "pri" : "", testid: "btn-deposits-withdraw", disabled: !(S.account.credit > 0n) || S.busy,
          onclick: () => act("Claim credit", () => S.lib.withdrawCredit(S.ctx, "photographer"), { step: { key: "claim" } }) }, "Claim"))),
    tabs, h("div", { class: "card" }, body));
}
