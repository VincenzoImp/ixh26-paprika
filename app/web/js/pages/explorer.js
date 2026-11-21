// Paprika web app: the built-in explorer of the local chain (#/explorer, #/tx/<hash>, #/block/<n>,
// #/address/<addr>, #/device/<keyId>). Calls and events are decoded with the ABIs of the deployment (Paprika,
// WETH, UMA). On a public network every link points to that network's explorer instead (network.json).

import { h, mount } from "../dom.js";
import { S, emit } from "../state.js";
import { same, toHex } from "../../util.js";
import { hashLink, addrLink, blockLink, rel, eth, tok, labelOf, shortHex } from "../format.js";
import { explorer, decodeCall, decodeLog } from "../api.js";
import { stateChip } from "../verdict.js";

const cache = new Map();   // route -> data (re-read when the block number changes)
let cacheBlock = -1;

// Reads data for a route once per block, then re-renders.
function useData(key, loader) {
  if (cacheBlock !== S.chain.blockNumber) { cache.clear(); cacheBlock = S.chain.blockNumber; }
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  loader().then((d) => { cache.set(key, d ?? false); emit("change"); }, (e) => { cache.set(key, { error: e.message }); emit("change"); });
  return null;
}

// A value of a decoded argument: hashes and addresses become links.
function argValue(v) {
  if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return addrLink(v, { copy: false });
  if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)) return hashLink(v, "hash", { copy: false });
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string" && v.length > 80) return h("span", { class: "mono", title: v }, `${v.slice(0, 40)}…`);
  return h("span", { class: "mono" }, String(v));
}
// "Contract.method" of a transaction.
function methodOf(tx) {
  const c = decodeCall(tx);
  return c ? `${c.contract}.${c.method}` : tx.to ? (tx.data && tx.data !== "0x" ? tx.data.slice(0, 10) : "transfer") : "contract creation";
}

// Search box: tx hash, block number, address, photo hash.
function search() {
  const inp = h("input", { testid: "explorer-search", placeholder: "Search by tx hash, block, address or photo hash" });
  const go = async () => {
    const r = await explorer.search(inp.value);
    if (!r) { inp.setCustomValidity("Nothing found"); inp.reportValidity(); return; }
    location.hash = `#/${r.kind}/${r.id}`;
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  return h("div", { class: "row search" }, inp, h("button", { testid: "btn-explorer-search", onclick: go }, "Search"));
}

// Draws an explorer route: { view: "home" | "tx" | "block" | "address" | "device", id }.
export function render(root, { view, id }) {
  const head = h("div", { class: "rec-head" }, h("h1", {}, S.network?.local ? "Localhost explorer" : "Explorer"), search());
  if (view === "tx") return mount(root, head, txPage(id));
  if (view === "block") return mount(root, head, blockPage(id));
  if (view === "address") return mount(root, head, addressPage(id));
  if (view === "device") return mount(root, head, devicePage(id));
  const blocks = useData("latest", () => explorer.latestBlocks(12));
  const txs = (blocks || []).flatMap((b) => (b.prefetchedTransactions || []).map((t) => ({ t, b })));
  mount(root, head, h("p", { class: "sub" }, `Chain ${S.network.chainId} · block #${S.chain.blockNumber}`),
    h("div", { class: "rec-grid" },
      h("div", { class: "card" }, h("h2", {}, "Latest blocks"), !blocks ? h("p", { class: "d" }, "Reading…") :
        h("table", { testid: "explorer-blocks" }, blocks.map((b) => h("tr", { testid: "explorer-block-row" }, h("td", {}, blockLink(b.number)),
          h("td", {}, `${(b.transactions || []).length} tx`), h("td", {}, rel(b.timestamp)))))),
      h("div", { class: "card" }, h("h2", {}, "Latest transactions"), !blocks ? h("p", { class: "d" }, "Reading…") :
        h("table", { testid: "explorer-txs" }, txs.slice(0, 15).map(({ t, b }) => h("tr", { testid: "explorer-tx-row" },
          h("td", {}, hashLink(t.hash, "tx", { copy: false })), h("td", {}, methodOf(t)), h("td", {}, addrLink(t.from, { copy: false })), h("td", {}, rel(b.timestamp))))))));
}

// A transaction: status, block, from, to, decoded call, decoded events, and a link to the record it touched.
function txPage(hash) {
  const d = useData(`tx:${hash}`, () => explorer.tx(hash));
  if (!d) return h("p", { class: "d" }, "Reading…");
  if (d.error || !d.tx) return h("p", { class: "err", testid: "tx-missing" }, "No such transaction on this network.");
  const { tx, receipt, block } = d;
  const call = decodeCall(tx);
  const logs = (receipt?.logs || []).map(decodeLog);
  const photo = logs.find((l) => l.args.some(([n]) => n === "photoHash"))?.args.find(([n]) => n === "photoHash")?.[1];
  return h("div", { class: "card", testid: "tx-page" },
    h("h2", {}, "Transaction ", hashLink(tx.hash, "hash", { testid: "tx-hash" })),
    h("dl", { class: "kv" },
      h("dt", {}, "Status"), h("dd", { testid: "tx-status" }, receipt ? (receipt.status === 1 ? "✓ Success" : "✕ Failed") : "Pending"),
      h("dt", {}, "Block"), h("dd", {}, receipt ? [blockLink(receipt.blockNumber), " · ", rel(block?.timestamp)] : "—"),
      h("dt", {}, "From"), h("dd", { testid: "tx-from" }, addrLink(tx.from)),
      h("dt", {}, "To"), h("dd", {}, tx.to ? addrLink(tx.to) : "contract creation"),
      h("dt", {}, "Value"), h("dd", {}, eth(tx.value)),
      h("dt", {}, "Gas used"), h("dd", {}, receipt ? receipt.gasUsed.toString() : "—"),
      h("dt", {}, "Call"), h("dd", { testid: "tx-call", "data-method": call ? `${call.contract}.${call.method}` : "" },
        call ? h("div", {}, h("b", {}, `${call.contract}.${call.method}`), h("ul", { class: "args" }, call.args.map(([n, v]) => h("li", {}, h("span", { class: "d" }, `${n} `), argValue(v))))) : h("span", { class: "mono" }, tx.data?.slice(0, 66) || "—")),
      h("dt", {}, "Events"), h("dd", { testid: "tx-events" }, logs.length ? h("ul", { class: "args" }, logs.map((l) => h("li", { testid: "tx-event", "data-event": l.name },
        h("b", {}, `${l.contract.startsWith("0x") ? labelOf(l.contract) || shortHex(l.contract) : l.contract}.${l.name}`), " ",
        l.args.map(([n, v]) => h("span", { class: "evarg" }, h("span", { class: "d" }, `${n} `), argValue(v), " "))))) : "none")),
    photo ? h("a", { class: "btn", href: `#/record/${toHex(photo)}`, testid: "tx-open-record" }, "Open record →") : null);
}

// A block and its transactions.
function blockPage(n) {
  const b = useData(`block:${n}`, () => explorer.block(Number(n)));
  if (!b) return h("p", { class: "d" }, b === false ? "No such block." : "Reading…");
  return h("div", { class: "card", testid: "block-page" }, h("h2", {}, `Block #${b.number}`),
    h("dl", { class: "kv" }, h("dt", {}, "Hash"), h("dd", {}, hashLink(b.hash, "hash")), h("dt", {}, "Time"), h("dd", {}, rel(b.timestamp)),
      h("dt", {}, "Parent"), h("dd", {}, b.number > 0 ? blockLink(b.number - 1) : "—")),
    h("table", {}, (b.prefetchedTransactions || []).map((t) => h("tr", {}, h("td", {}, hashLink(t.hash, "tx", { copy: false })), h("td", {}, methodOf(t)), h("td", {}, addrLink(t.from, { copy: false }))))));
}

// An address: label, balances, its latest transactions.
function addressPage(a) {
  const d = useData(`addr:${a}`, () => explorer.address(a));
  if (!d) return h("p", { class: "d" }, "Reading…");
  return h("div", { class: "card", testid: "address-page" }, h("h2", {}, labelOf(a) || (d.isContract ? "Contract" : "Address"), " ", hashLink(a, "hash")),
    h("dl", { class: "kv" }, h("dt", {}, "ETH"), h("dd", {}, eth(d.balance)), h("dt", {}, "WETH"), h("dd", {}, tok(d.weth)),
      h("dt", {}, "Type"), h("dd", {}, d.isContract ? "contract" : "account")),
    h("table", {}, (d.txs || []).map(({ tx, block }) => h("tr", {}, h("td", {}, hashLink(tx.hash, "tx", { copy: false })), h("td", {}, methodOf(tx)), h("td", {}, blockLink(block.number))))));
}

// A device key: its status and every record it made (records of a flagged key stay listed).
function devicePage(keyId) {
  const recs = S.records.filter((r) => same(r.keyId, keyId));
  return h("div", { class: "card", testid: "device-page" }, h("h2", {}, "Device key ", hashLink(keyId, "hash")),
    h("table", {}, recs.map((r) => h("tr", {}, h("td", {}, hashLink(r.photoHash, "record")), h("td", {}, stateChip(r)), h("td", {}, rel(r.recordedAt))))),
    recs.length ? null : h("p", { class: "d" }, "No records by this key."));
}
