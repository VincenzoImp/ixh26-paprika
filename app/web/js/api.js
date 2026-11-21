// Paprika web app: the one place that talks to the library and the server.
// Pages call these functions only. Where the library offers a function (getRecord, explorer.*, publishEvidence,
// getEvidence, network config) it is used; otherwise an equivalent built here from read-only chain calls is used,
// so the pages do not change when the library grows.

import { S } from "./state.js";
import { toHex, same } from "../util.js";

// Network configuration: /network.json from the server, else derived from the deployment.
export async function loadNetwork(deployment) {
  let n = null;
  try {
    const r = await fetch("/network.json", { cache: "no-store" });
    if (r.ok) n = await r.json();
  } catch { /* older server: derive below */ }
  const chainId = Number(n?.chainId ?? deployment.chainId ?? 31337);
  return {
    chainId,
    name: n?.name || (chainId === 31337 ? "Paprika local" : `Chain ${chainId}`),
    local: n?.local ?? chainId === 31337,
    explorer: n?.explorer || null,   // null = the built-in explorer pages of this app
    ...n,
  };
}

// The UMA/Paprika ABIs from the deployment, as ethers Interfaces, for decoding calls and events.
let ifaces = null;
export function interfaces() {
  if (ifaces) return ifaces;
  const { ethers } = S.ethers;
  const abis = S.deployment.abis || {};
  const ad = S.ctx.addresses;
  ifaces = [];
  const add = (address, name, abi) => { if (address && abi) ifaces.push({ address: address.toLowerCase(), name, iface: new ethers.Interface(abi) }); };
  add(ad.paprika, "Paprika", abis.Paprika);
  add(ad.currency, "WETH", abis.WETH9 || abis.TestnetERC20);
  add(ad.oo, "UMA OOv3", abis.OptimisticOracleV3);
  add(ad.voting, "UMA VotingV2", abis.VotingV2);
  return ifaces;
}

// Decodes a transaction's call: { contract, method, args: [[name, value]] } or null.
export function decodeCall(tx) {
  if (!tx?.to || !tx.data || tx.data === "0x") return null;
  const i = interfaces().find((x) => x.address === tx.to.toLowerCase());
  if (!i) return null;
  try {
    const p = i.iface.parseTransaction({ data: tx.data, value: tx.value });
    return { contract: i.name, method: p.name, args: p.fragment.inputs.map((inp, k) => [inp.name || `arg${k}`, p.args[k]]) };
  } catch { return { contract: i.name, method: tx.data.slice(0, 10), args: [] }; }
}

// Decodes one log: { contract, name, args: [[name, value]] } or a raw entry.
export function decodeLog(log) {
  const i = interfaces().find((x) => x.address === log.address.toLowerCase());
  if (i) {
    try {
      const p = i.iface.parseLog(log);
      if (p) return { contract: i.name, name: p.name, args: p.fragment.inputs.map((inp, k) => [inp.name || `arg${k}`, p.args[k]]) };
    } catch { /* not this contract's event */ }
  }
  return { contract: log.address, name: log.topics[0]?.slice(0, 10) || "log", args: [] };
}

// Explorer data: the library's explorer when it exists, else direct reads.
export const explorer = {
  async latestBlocks(n = 10) {
    const latest = await S.ctx.provider.getBlockNumber();
    const out = [];
    for (let b = latest; b >= Math.max(0, latest - n + 1); b--) out.push(await S.ctx.provider.getBlock(b, true));
    return out;
  },
  async block(n) {
    return S.ctx.provider.getBlock(Number(n), true);
  },
  async tx(hash) {
    const [tx, receipt] = await Promise.all([S.ctx.provider.getTransaction(hash), S.ctx.provider.getTransactionReceipt(hash)]);
    const block = receipt ? await S.ctx.provider.getBlock(receipt.blockNumber) : null;
    return { tx, receipt, block };
  },
  async address(a) {
    const [balance, code, nonce] = await Promise.all([S.ctx.provider.getBalance(a), S.ctx.provider.getCode(a), S.ctx.provider.getTransactionCount(a)]);
    let weth = 0n;
    try { weth = await S.ctx.contracts.token.balanceOf(a); } catch { /* not readable */ }
    // Transactions from or to this address, scanning the (short) local chain backwards.
    const latest = await S.ctx.provider.getBlockNumber();
    const txs = [];
    for (let b = latest; b >= 0 && txs.length < 25 && latest - b < 2000; b--) {
      const blk = await S.ctx.provider.getBlock(b, true);
      for (const t of blk?.prefetchedTransactions || []) if (same(t.from, a) || same(t.to, a)) txs.push({ tx: t, block: blk });
    }
    return { address: a, balance, weth, isContract: code !== "0x", nonce, txs };
  },
  // Finds what a query is: a tx hash, a block number, an address, a photo hash (record).
  async search(qs) {
    const s = String(qs).trim();
    if (/^\d+$/.test(s)) return { kind: "block", id: s };
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { kind: "address", id: s };
    if (/^0x[0-9a-fA-F]{64}$/.test(s)) {
      if (await S.ctx.provider.getTransaction(s)) return { kind: "tx", id: s };
      if ((await S.lib.verifyPhoto(S.ctx, s)).length) return { kind: "record", id: s.toLowerCase() };
      if (S.records.some((r) => same(r.keyId, s))) return { kind: "device", id: s.toLowerCase() };
    }
    return null;
  },
};

// The records of one photo hash (one per key), from the library.
export async function getRecords(photoHash) {
  if (S.lib.getRecord) {
    try { const r = await S.lib.getRecord(S.ctx, photoHash); if (Array.isArray(r?.keys)) return r.keys; } catch (e) { console.warn("getRecord", e); }
  }
  return S.lib.verifyPhoto(S.ctx, photoHash);
}

// Publishes evidence (a File or a text) so that UMA's voters can read it: { evidenceHash, url }.
export async function publishEvidence(fileOrText) {
  const bytes = typeof fileOrText === "string" ? new TextEncoder().encode(fileOrText) : new Uint8Array(await fileOrText.arrayBuffer());
  const contentType = typeof fileOrText === "string" ? "text/plain; charset=utf-8" : fileOrText.type || "application/octet-stream";
  const r = await S.lib.publishEvidence(S.ctx, { bytes, contentType });
  return { evidenceHash: toHex(r.evidenceHash), url: r.url };
}

// Reads published evidence back (the library checks its hash): { bytes, type, url, sha256Ok } or null.
export async function getEvidence(evidenceHash) {
  try {
    const r = await S.lib.getEvidence(S.ctx, evidenceHash);
    return r ? { bytes: r.bytes, type: r.contentType || "", url: r.url, sha256Ok: true } : null;
  } catch (e) {
    if (/match|hash/i.test(e?.message || "") && !/not found|404/i.test(e?.message || "")) return { bytes: new Uint8Array(), type: "", url: "", sha256Ok: false };
    return null;
  }
}

// Accusations from the contract's events.
export async function readAccusations() {
  const p = S.ctx.contracts.paprika;
  const opened = await p.queryFilter(p.filters.AccusationOpened(), 0, "latest");
  const resolved = await p.queryFilter(p.filters.AccusationResolved(), 0, "latest");
  const res = new Map(resolved.map((e) => [toHex(e.args.assertionId), { fake: !!e.args.fakeProven, block: e.blockNumber, txHash: e.transactionHash }]));
  return opened.map((e) => {
    const id = toHex(e.args.assertionId);
    const r = res.get(id);
    return { assertionId: id, photoHash: toHex(e.args.photoHash), keyId: toHex(e.args.keyId), claimant: e.args.claimant,
      evidenceHash: toHex(e.args.evidenceHash), open: !r, fakeProven: r?.fake || false, blockNumber: e.blockNumber, txHash: e.transactionHash,
      resolvedBlock: r?.block, resolvedTx: r?.txHash };
  });
}

// Events of Paprika for the record history and the explorer feed (newest last).
export async function paprikaEvents() {
  const p = S.ctx.contracts.paprika;
  const logs = await S.ctx.provider.getLogs({ address: S.ctx.addresses.paprika, fromBlock: 0, toBlock: "latest" });
  return logs.map((l) => {
    let parsed = null;
    try { parsed = p.interface.parseLog(l); } catch { /* unknown */ }
    return { name: parsed?.name || "log", args: parsed?.args || {}, blockNumber: l.blockNumber, txHash: l.transactionHash };
  });
}
