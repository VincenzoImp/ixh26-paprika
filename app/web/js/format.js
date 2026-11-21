// Paprika web app: one format for every hash, address, amount, date and size, and explorer links.
// Every hash and address in the app goes through hashLink()/addrLink(): short form 0x1234…abcd, full value on
// hover, a copy button, and a link to the explorer of the network (the built-in one on the local chain).

import { h } from "./dom.js";
import { S } from "./state.js";
import { toHex, big } from "../util.js";

// 0x-prefixed short form of a hash or address.
export function shortHex(v, keep = 4) {
  const x = toHex(v);
  return x.length > 2 + keep * 2 + 1 ? `${x.slice(0, 2 + keep)}…${x.slice(-keep)}` : x;
}

// Explorer URL for a kind ("tx" | "address" | "block" | "record" | "device") and an id.
export function explorerUrl(kind, id) {
  const builtIn = { tx: `#/tx/${id}`, address: `#/address/${id}`, block: `#/block/${id}`, record: `#/record/${id}`, device: `#/device/${id}` };
  const ex = S.network?.explorer;
  if (ex && ex.kind && ex.kind !== "builtin" && ["tx", "address", "block"].includes(kind)) {
    const tpl = ex[`${kind}Url`];
    if (tpl) return tpl.replace("{hash}", id).replace("{address}", id).replace("{number}", id);
  }
  return builtIn[kind];
}

// The two demo accounts (Hardhat's well-known test accounts #1 and #2, imported into MetaMask by the team).
const DEMO_NAMES = {
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "Alice",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": "Bob",
};

// Known names for addresses (contracts, the local faucet, the simulated UMA voters).
export function labelOf(address) {
  const a = String(address || "").toLowerCase();
  if (!a || !S.ctx) return "";
  const ad = S.ctx.addresses || {};
  const names = { [ad.paprika]: "Paprika", [ad.oo]: "UMA Optimistic Oracle V3", [ad.store]: "UMA Store", [ad.currency]: "WETH",
    [ad.voting]: "UMA VotingV2", [ad.votingToken]: "UMA voting token" };
  for (const [k, v] of Object.entries(names)) if (k && k.toLowerCase() === a) return v;
  if (S.ctx.accounts?.operator && S.ctx.accounts.operator.toLowerCase() === a) return "Deployer account (settles votes; anyone can)";
  const vi = (S.ctx.accounts?.voters || []).findIndex((v) => v.toLowerCase() === a);
  if (vi >= 0) return `Local UMA voter ${vi + 1}`;
  const acc = S.deployment?.accounts || {};
  if (acc.alice && acc.alice.toLowerCase() === a) return "Alice";
  if (acc.bob && acc.bob.toLowerCase() === a) return "Bob";
  if (DEMO_NAMES[a]) return DEMO_NAMES[a];
  if (S.account && S.account.address.toLowerCase() === a) return "You";
  return "";
}

// Copies a value and shows a short "Copied" mark on the button.
function copyButton(value, testid) {
  return h("button", { class: "copy", title: "Copy", "aria-label": "Copy", testid, onclick: (e) => {
    e.preventDefault(); e.stopPropagation();
    navigator.clipboard?.writeText(value).catch(() => {});
    const b = e.currentTarget; b.textContent = "Copied"; b.classList.add("copied"); setTimeout(() => { b.textContent = "⧉"; b.classList.remove("copied"); }, 2000);
  } }, "⧉");
}

// A linked short hash with copy button. kind: "tx" | "block" | "record" | "device" | "hash" (no link).
export function hashLink(value, kind = "tx", { testid, copy = true, keep = 4 } = {}) {
  const full = toHex(value);
  if (!full) return h("span", { class: "mono" }, "—");
  const label = shortHex(full, keep);
  const main = kind === "hash" ? h("span", { class: "mono", title: full, testid }, label)
    : h("a", { class: "mono link", href: explorerUrl(kind, full), title: full, testid, "data-full": full }, label);
  return h("span", { class: "hashlink" }, main, copy ? copyButton(full) : null);
}

// A linked short address with its known name, if any.
export function addrLink(address, { testid, copy = true } = {}) {
  if (!address) return h("span", { class: "mono" }, "—");
  const name = labelOf(address);
  const a = h("a", { class: "mono link", href: explorerUrl("address", address), title: address, testid, "data-full": address },
    name && name !== "You" ? `${name} ` : "", shortHex(address));
  return h("span", { class: "hashlink" }, a, name === "You" ? h("span", { class: "you" }, "you") : null, copy ? copyButton(address) : null);
}

// A linked block number.
export function blockLink(n) {
  return h("a", { class: "link", href: explorerUrl("block", n) }, `#${n}`);
}

// Token amount, e.g. "1 WETH" (from the library's formatToken).
export function tok(amount) {
  if (amount == null) return "—";
  const sym = S.ctx?.params?.tokenSymbol || "WETH";
  const s = S.lib.formatToken(S.ctx, big(amount));
  return s.includes(sym) ? s : `${s} ${sym}`;
}
// Signed token amount: "+0.5 WETH", "−1 WETH".
export function signedTok(amount) {
  const a = big(amount);
  if (a === 0n) return tok(0n);
  return (a > 0n ? "+" : "−") + tok(a < 0n ? -a : a);
}
// ETH amount, e.g. "4.98 ETH".
export function eth(wei) {
  const n = Number(big(wei)) / 1e18;
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(n >= 1 ? 2 : 4).replace(/\.?0+$/, "") || "0"} ETH`;
}

// "18 KB", "1 byte".
export function size(bytes) {
  if (bytes < 1024) return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Exact chain time, local zone: "2026-11-21 03:33:18".
export function exactTime(sec) {
  if (!sec) return "—";
  const d = new Date(Number(sec) * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// Duration in words: "58 min", "1 h 15 min", "12 s".
export function dur(sec) {
  let s = Math.max(0, Math.round(Number(sec)));
  if (s < 60) return `${s} s`;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const m = Math.floor(s / 60);
  return [d ? `${d} d` : "", hh ? `${hh} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
// Relative time against the chain clock, exact time on hover: "in 58 min", "2 min ago".
export function rel(sec) {
  const now = S.chain.timestamp || Math.floor(Date.now() / 1000);
  const d = Number(sec) - now;
  const text = Math.abs(d) < 5 ? "now" : d > 0 ? `in ${dur(d)}` : `${dur(-d)} ago`;
  return h("span", { class: "rel", title: `${exactTime(sec)} (chain time)` }, text);
}
