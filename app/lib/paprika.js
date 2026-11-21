// Paprika client library: every on-chain action of the demo, for the CLI (Node) and the web UI (browser).
//
// It talks to a LOCAL Hardhat node over JSON-RPC with ethers 6. As on a real network, every user action is signed
// CLIENT-SIDE by the user's own wallet: setSigner(ctx, role, signer) with MetaMask (injectedWallet) in the page,
// or a local key in the CLI and the tests. No node account is ever unlocked.
// Roles: photographer and accuser = the users (their own wallets). Third parties, run by the demo server
// (browser) or directly from Hardhat's well-known keys (Node, lib/demo-keys.js): the operator (settles UMA
// assertions) and the UMA voters (accounts 3, 4, 5, holders of staked UMA voting tokens).
// Deposits and bonds are in WETH (UMA's WETH9): the roles hold ETH and wrap exactly what they need.
// The contract addresses, parameters, RPC URL and ABIs come from the deployment JSON written by
// contract/scripts/deploy-local.js (copied to app/web/deployment.json for the browser).
//
// In the browser, "ethers" is resolved through an import map; device.js has no dependencies.
// Every function throws an Error whose message is the contract's revert reason when a transaction reverts.

import { ethers } from "ethers";
import { captureMessage, registerMessage, revokeMessage, sha256, toHex, utf8 } from "./device.js";

// Hardhat's well-known account 0 (the operator), used only if the deployment JSON does not name it.
const HARDHAT_OPERATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USER_ROLES = ["photographer", "accuser"];
const STATES = ["none", "attested", "accused", "refunded", "fake"];          // Paprika.State
const DEVICE_STATUS = ["none", "active", "flagged"];                          // Paprika.Status
const REASONS = ["none", "fake-proven", "key-revoked"];                       // Paprika.Reason
const NUMERICAL_TRUE = 10n ** 18n;   // OOv3 reads price 1e18 as "the assertion is true", anything else as false
const DVM_STATUS = ["NotRequested", "Active", "Resolved", "Future", "ToDelete"];   // VotingV2 RequestStatus

// ------------------------------------------------------------------ connection

/**
 * Connects to the node and the deployed contracts. Synchronous (no network call): awaiting it is harmless.
 * The ctx is READ-ONLY until setSigner() gives a role its wallet.
 *   deployment = the parsed JSON written by the deploy script;
 *   network    = the network configuration (app/config/network.json, served at /network.json): name, rpcUrl
 *                (relative URLs such as "/rpc" are resolved against the page), chainId, local, explorer link
 *                templates. Chain-specific values come only from it and from the deployment;
 *   demoKeys   = (Node only) { operator, voters } from lib/demo-keys.js: the demo controls (vote, clock)
 *                then run directly on the chain;
 *   demoUrl    = base URL of the demo server (default in a browser: location.origin): the demo controls then call
 *                its /demo/* endpoints. Without either, the demo controls throw a clear error.
 */
export function connect({ rpcUrl, deployment, network, demoKeys, demoUrl }) {
  if (!deployment?.addresses?.paprika) throw new Error("deployment JSON is missing or has no Paprika address");
  const here = typeof location !== "undefined" ? location.href : undefined;
  const netRpc = network?.rpcUrl ? (here ? new URL(network.rpcUrl, here).href : (/^https?:/.test(network.rpcUrl) ? network.rpcUrl : null)) : null;
  rpcUrl = rpcUrl || netRpc || deployment.rpcUrl;
  if (!rpcUrl) throw new Error("no RPC URL: give rpcUrl, a network configuration, or a deployment with rpcUrl");
  const chainId = Number(network?.chainId ?? deployment.chainId);
  if (network?.chainId && deployment.chainId && Number(network.chainId) !== Number(deployment.chainId)) {
    throw new Error(`the deployment is for chain ${deployment.chainId}, the network configuration for chain ${network.chainId}`);
  }
  // staticNetwork: skip chain detection calls; short polling interval: automine answers at once.
  // cacheTimeout -1: by default ethers shares identical requests for 250 ms, so a read right after a transaction
  // or after evm_mine could return the previous block. A demo must always show fresh state.
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, pollingInterval: 100, cacheTimeout: -1 });

  // ctx.accounts: the user roles (null until setSigner), the operator and the UMA voters (third parties).
  const known = deployment.accounts || {};
  const accounts = {
    operator: ethers.getAddress(known.operator || HARDHAT_OPERATOR),
    photographer: null,
    accuser: null,
    // Named demo accounts (Hardhat's prefunded #1 and #2, imported into MetaMask), for display only.
    alice: known.alice ? ethers.getAddress(known.alice) : null,
    bob: known.bob ? ethers.getAddress(known.bob) : null,
    voters: (known.voters || deployment.voters || []).map((v) => ethers.getAddress(v)),
  };
  // Demo controls: direct (Node, with the demo keys) or through the demo server (browser).
  let demo;
  if (demoKeys) {
    demo = {
      mode: "direct",
      operator: demoKeys.operator.connect(provider),
      voters: demoKeys.voters.map((w, i) => ({ label: `voter${i + 1}`, address: w.address, signer: w.connect(provider) })),
    };
  } else {
    const base = demoUrl || (typeof location !== "undefined" ? location.origin : null);
    demo = base ? { mode: "server", baseUrl: base.replace(/\/$/, "") } : { mode: "none" };
  }
  const signers = {};
  const voters = demo.mode === "direct" ? demo.voters : [];

  const a = deployment.addresses, abis = deployment.abis;
  const p = deployment.parameters;
  const ctx = {
    rpcUrl,
    chainId,
    deployment,
    provider,
    signers,     // role -> ethers Signer (set with setSigner)
    accounts,
    voters,      // direct mode only: [{ label, address, signer }]
    demo,
    network: {
      name: network?.name || "local", rpcUrl, chainId, local: network ? Boolean(network.local) : true,
      explorer: network?.explorer || { kind: "builtin", txUrl: "#/explorer/tx/{hash}", addressUrl: "#/explorer/address/{address}", blockUrl: "#/explorer/block/{number}" },
      eventChunk: Number(network?.eventChunk || 5000),
    },
    deploymentBlock: Number(deployment.deploymentBlock || 0),   // events are read from here, in chunks
    evidenceBaseURI: deployment.evidenceBaseURI || null,
    addresses: {
      paprika: a.paprika, oo: a.oo, store: a.store, currency: a.currency, weth: a.weth || deployment.weth || a.currency,
      voting: a.voting || deployment.voting, votingToken: a.votingToken || deployment.votingToken,
    },
    params: {
      bond: BigInt(p.BOND),
      photoWindow: Number(p.PHOTO_WINDOW),
      revealWindow: Number(p.REVEAL_WINDOW),
      feeShare: Number(BigInt(p.burnedBondPercentage ?? "500000000000000000")) / 1e18,   // UMA's burnedBondPercentage
      tokenSymbol: deployment.token?.symbol ?? "WETH",
      tokenDecimals: Number(deployment.token?.decimals ?? 18),
      phaseLength: Number(deployment.phaseLength ?? p.PHASE_LENGTH ?? 0),   // seconds of each UMA voting phase
    },
    contracts: {
      paprika: new ethers.Contract(a.paprika, abis.Paprika, provider),
      token: new ethers.Contract(a.currency, abis.WETH9, provider),        // WETH9: ERC-20 + deposit/withdraw
      oo: new ethers.Contract(a.oo, abis.OptimisticOracleV3, provider),
      voting: abis.VotingV2 && (a.voting || deployment.voting)
        ? new ethers.Contract(a.voting || deployment.voting, abis.VotingV2, provider) : null,
    },
    activity: [],          // every transaction sent through this ctx, oldest first
    listeners: new Set(),  // onActivity callbacks
    blockTimes: new Map(), // block number -> timestamp cache
  };
  return ctx;
}

/**
 * Registers a callback called with { blockNumber, txHash, call, from, role } after every transaction sent through
 * ctx (role is "photographer" | "accuser" | "operator" | "voter1".."voter3"). Returns an unsubscribe function.
 */
export function onActivity(ctx, callback) {
  ctx.listeners.add(callback);
  return () => ctx.listeners.delete(callback);
}

// ------------------------------------------------------------------ wallets (client-side signing)

/**
 * Gives a user role its wallet: any ethers v6 Signer (a Wallet, or a BrowserProvider signer from MetaMask).
 * Every write function of that role signs with it, client-side. role: "photographer" | "accuser".
 * Pass null to forget the role's wallet. Returns the signer's address (or null).
 */
export async function setSigner(ctx, role, signer) {
  if (!USER_ROLES.includes(role)) throw new Error(`unknown role "${role}" (use photographer or accuser)`);
  if (!signer) { delete ctx.signers[role]; ctx.accounts[role] = null; return null; }
  const address = ethers.getAddress(await signer.getAddress());
  ctx.signers[role] = signer;
  ctx.accounts[role] = address;
  return address;
}

/**
 * A wallet kept by the app itself (a "burner" key, like a mobile wallet's): loads the role's private key from
 * `storage`, or creates and stores a new one. The key is stored per deployment fingerprint, so a new chain or
 * deployment gets a new key and an old one is never overwritten. storage = any object with getItem(key) and
 * setItem(key, value) (window.localStorage in the browser; a file-backed object in the CLI).
 * Returns { signer, address, isNew }; the signer is connected to ctx's provider. Call setSigner() to use it.
 */
export async function browserWallet(ctx, role, { storage } = {}) {
  if (!USER_ROLES.includes(role)) throw new Error(`unknown role "${role}" (use photographer or accuser)`);
  if (!storage || typeof storage.getItem !== "function") throw new Error("browserWallet needs a storage with getItem/setItem");
  const key = `paprika-wallet:${await deploymentFingerprint(ctx)}:${role}`;
  let pk = await storage.getItem(key);
  let isNew = false;
  if (!pk) {
    pk = ethers.Wallet.createRandom().privateKey;
    await storage.setItem(key, pk);
    isNew = true;
  }
  const signer = new ethers.Wallet(pk, ctx.provider);
  return { signer, address: signer.address, isNew };
}

/**
 * An injected EIP-1193 wallet (MetaMask): asks for an account, makes sure the wallet is on this chain
 * (wallet_switchEthereumChain, or wallet_addEthereumChain "Paprika local" with RPC <page origin>/rpc), and returns
 * { signer, address }. The wallet signs every transaction itself. A refusal in the wallet (code 4001) throws
 * "request rejected in the wallet". Call setSigner() to use it.
 */
export async function injectedWallet(ctx, role, ethereum = globalThis.ethereum) {
  if (!USER_ROLES.includes(role)) throw new Error(`unknown role "${role}" (use photographer or accuser)`);
  if (!ethereum?.request) throw new Error("no browser wallet found (install MetaMask, or use the built-in wallet)");
  const ask = async (method, params) => {
    try { return await ethereum.request(params ? { method, params } : { method }); } catch (e) {
      if (e?.code === 4001) throw Object.assign(new Error("request rejected in the wallet"), { code: 4001 });
      throw e;
    }
  };
  const [address] = await ask("eth_requestAccounts");
  if (!address) throw new Error("the wallet gave no account");
  const want = ethers.toQuantity(ctx.chainId);
  if (String(await ask("eth_chainId")).toLowerCase() !== want) {
    try {
      await ask("wallet_switchEthereumChain", [{ chainId: want }]);
    } catch (e) {
      if (e?.code === 4001) throw e;
      // 4902 = unknown chain: add it, pointing the wallet at this page's /rpc relay.
      const origin = typeof location !== "undefined" ? location.origin : ctx.rpcUrl.replace(/\/rpc$/, "");
      await ask("wallet_addEthereumChain", [{
        chainId: want, chainName: "Paprika local",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [typeof location !== "undefined" ? `${origin}/rpc` : ctx.rpcUrl],
      }]);
    }
  }
  const browser = new ethers.BrowserProvider(ethereum, "any");
  const signer = await browser.getSigner(address);
  return { signer, address: ethers.getAddress(address) };
}

// The demo controls work only on a network the configuration marks as local.
function assertLocalChain(ctx) {
  if (!ctx.network.local) throw new Error(`demo controls refused: the network "${ctx.network.name}" is not marked local in its configuration`);
}

function demoOperator(ctx) {
  if (ctx.demo.mode !== "direct") throw new Error("demo controls are not available here (no demo server and no demo keys)");
  return ctx.demo.operator;
}

// The demo server's per-session token (GET /demo/session, same-origin only), sent as X-Paprika-Session.
async function demoToken(ctx, renew = false) {
  if (!ctx.demo.token || renew) {
    const res = await fetch(ctx.demo.baseUrl + "/demo/session", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `demo server: HTTP ${res.status}`);
    ctx.demo.token = j.token;
  }
  return ctx.demo.token;
}
// One request to the demo server with the session token (renewed once on 401); throws its error (with its code).
async function demoFetch(ctx, method, pathname, body) {
  if (ctx.demo.mode !== "server") throw new Error("demo controls are not available here (no demo server and no demo keys)");
  assertLocalChain(ctx);
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(ctx.demo.baseUrl + pathname, {
        method, cache: "no-store",
        headers: { "content-type": "application/json", "x-paprika-session": await demoToken(ctx, attempt > 0) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) { throw new Error(`cannot reach the demo server (${e.message})`); }
    if (res.status === 401 && attempt === 0) continue;
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error || `demo server: HTTP ${res.status}`), { code: j.code, status: res.status });
    return j;
  }
}
const demoPost = (ctx, pathname, body) => demoFetch(ctx, "POST", pathname, body);
const demoGet = (ctx, pathname) => demoFetch(ctx, "GET", pathname);

/**
 * Events of a contract matching `filter`, from the deployment block to the latest block, read in chunks of
 * ctx.network.eventChunk blocks (5,000 by default) so that it also works on nodes that limit eth_getLogs ranges.
 */
export async function queryEvents(ctx, contract, filter, fromBlock = ctx.deploymentBlock) {
  const latest = await read(ctx.provider.getBlockNumber());
  const out = [];
  for (let from = Math.max(0, fromBlock); from <= latest; from += ctx.network.eventChunk) {
    const to = Math.min(latest, from + ctx.network.eventChunk - 1);
    out.push(...(await read(contract.queryFilter(filter, from, to))));
  }
  return out;
}

// Reports activity items (from this ctx, or relayed by the demo server) to the onActivity listeners.
function emit(ctx, item) {
  ctx.activity.push(item);
  for (const cb of ctx.listeners) {
    try { cb(item); } catch { /* a broken listener must not break the flow */ }
  }
}
function emitAll(ctx, items) {
  for (const it of items || []) emit(ctx, it);
}

// ------------------------------------------------------------------ errors and sending

// Turns an ethers / Hardhat error into the bare revert reason (e.g. "bad sig"), or the shortest useful message.
function revertReason(e) {
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return "request rejected in the wallet";
  if (e?.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(String(e?.message))) {
    return "not enough ETH in this wallet to pay for the transaction";
  }
  if (e?.reason) return e.reason;
  if (e?.revert?.args?.length) return String(e.revert.args[0]);
  const texts = [e?.info?.error?.message, e?.error?.message, e?.data?.message, e?.shortMessage, e?.message].filter(Boolean);
  for (const t of texts) {
    const m = t.match(/reverted with reason string '([^']*)'/) || t.match(/execution reverted: "?([^"]*)"?/);
    if (m) return m[1];
  }
  if (e?.code === "ECONNREFUSED" || /ECONNREFUSED|Failed to fetch|fetch failed/.test(texts.join(" "))) {
    return "cannot reach the local chain (is `npm run chain` running?)";
  }
  return e?.shortMessage || e?.message || String(e);
}
function fail(e) {
  const err = new Error(revertReason(e));
  err.cause = e;
  return err;
}

// The wallet of a role. "operator" is the demo operator (direct mode only); users must have called setSigner.
function signerOf(ctx, role) {
  if (role === "operator") return demoOperator(ctx);
  if (!USER_ROLES.includes(role)) throw new Error(`unknown role "${role}" (use photographer or accuser)`);
  const s = ctx.signers[role];
  if (!s) throw new Error(`no wallet for the ${role}: connect one first (setSigner)`);
  return s;
}
// The address of a role's wallet (throws like signerOf when there is none).
function addressOf(ctx, role) {
  if (role === "operator") return demoOperator(ctx).address;
  signerOf(ctx, role);
  return ctx.accounts[role];
}

// Sends one transaction, waits for it to be mined, reports it to onActivity, returns the receipt.
// `who` is a role name or a voter { label, address, signer }. `label` is the call shown in the activity log,
// e.g. "Paprika.attest". `overrides` (optional) carries e.g. { value } for payable calls.
async function send(ctx, who, contract, method, args, label, overrides) {
  const voter = typeof who === "object" ? who : null;
  const signer = voter ? voter.signer : signerOf(ctx, who);
  const role = voter ? voter.label : who;
  const from = voter ? voter.address : addressOf(ctx, who);
  let receipt;
  try {
    const tx = await contract.connect(signer)[method](...args, ...(overrides ? [overrides] : []));
    receipt = await tx.wait();
  } catch (e) {
    throw fail(e);
  }
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  emit(ctx, { blockNumber: receipt.blockNumber, txHash: receipt.hash, call: label, from, role });
  return receipt;
}

// Read-only call with the same error translation.
async function read(promise) {
  try { return await promise; } catch (e) { throw fail(e); }
}

// Makes sure `role` can pay one BOND to Paprika: wraps exactly the missing amount of ETH into WETH
// (WETH9.deposit{value}) and, if the allowance is too low, approves Paprika for MaxUint256 ONCE per account (fewer
// wallet pop-ups). Pushes the tx hashes it sent into txHashes, and { label, txHash } into labelled.
async function ensureFunds(ctx, role, txHashes, labelled = []) {
  const { token } = ctx.contracts;
  const me = addressOf(ctx, role);
  const held = await read(token.balanceOf(me));
  if (held < ctx.params.bond) {
    const label = `${ctx.params.tokenSymbol}.deposit (wrap ETH)`;
    const r = await send(ctx, role, token, "deposit", [], label, { value: ctx.params.bond - held });
    txHashes.push(r.hash);
    labelled.push({ label, txHash: r.hash });
  }
  const have = await read(token.allowance(me, ctx.addresses.paprika));
  if (have >= ctx.params.bond) return;
  const label = `${ctx.params.tokenSymbol}.approve (once, unlimited)`;
  const r = await send(ctx, role, token, "approve", [ctx.addresses.paprika, ethers.MaxUint256], label);
  txHashes.push(r.hash);
  labelled.push({ label, txHash: r.hash });
}

// Accepts Uint8Array / ArrayBuffer / Node Buffer and returns a Uint8Array.
function asBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error("photo must be bytes (Uint8Array or ArrayBuffer)");
}

// Photo bytes -> sha256 hex; a 0x-prefixed 32-byte hex string is taken as the hash itself.
async function photoHashOf(photoBytesOrHash) {
  if (typeof photoBytesOrHash === "string") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(photoBytesOrHash)) throw new Error("photo hash must be 0x + 64 hex characters");
    return photoBytesOrHash.toLowerCase();
  }
  return sha256(asBytes(photoBytesOrHash));
}

async function blockTime(ctx, blockNumber) {
  if (!ctx.blockTimes.has(blockNumber)) {
    const b = await read(ctx.provider.getBlock(blockNumber));
    ctx.blockTimes.set(blockNumber, b ? Number(b.timestamp) : 0);
  }
  return ctx.blockTimes.get(blockNumber);
}

// ------------------------------------------------------------------ reads

/** Chain id, latest block number and its timestamp (seconds). Reads only. */
export async function chainInfo(ctx) {
  const b = await read(ctx.provider.getBlock("latest"));
  return { chainId: ctx.chainId, blockNumber: b.number, timestamp: Number(b.timestamp) };
}

/**
 * WETH balances (bigint) of photographer, accuser, UMA Store and Paprika; also operator and UMA's oracle (oo, which
 * holds both bonds during a vote). `eth` = native ETH balances of operator, photographer, accuser (they pay gas in
 * ETH). The user roles' addresses come from their wallets (setSigner); a role without a wallet reports null.
 */
export async function balances(ctx) {
  const { token } = ctx.contracts;
  const who = {
    photographer: ctx.accounts.photographer, accuser: ctx.accounts.accuser, store: ctx.addresses.store,
    paprika: ctx.addresses.paprika, oo: ctx.addresses.oo, operator: ctx.accounts.operator,
  };
  const keys = Object.keys(who);
  // A role without a wallet (no setSigner yet) reports null.
  const values = await read(Promise.all(keys.map((k) => (who[k] ? token.balanceOf(who[k]) : null))));
  const out = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  const roles = ["operator", ...USER_ROLES];
  const eth = await read(Promise.all(roles.map((r) => (ctx.accounts[r] ? ctx.provider.getBalance(ctx.accounts[r]) : null))));
  out.eth = Object.fromEntries(roles.map((r, i) => [r, eth[i]]));
  return out;
}

/** Credit (bigint) that `address` can collect from Paprika with withdrawCredit. Reads only. */
export async function credits(ctx, address) {
  return read(ctx.contracts.paprika.credits(address));
}

// Turns Paprika.verify(photoHash, keyId) into the plain object documented in the README.
async function recordView(ctx, photoHash, keyId) {
  const v = await read(ctx.contracts.paprika.verify(photoHash, keyId));
  const recordedBlock = Number(v.recordedBlock);
  return {
    photoHash,
    keyId,
    state: STATES[Number(v.state)],
    anchorBlock: Number(v.anchorBlock),
    recordedBlock,
    recordedAt: recordedBlock ? await blockTime(ctx, recordedBlock) : 0,
    depositor: v.depositor,
    depositLocked: v.lockedDeposit,                // bigint: BOND while attested or accused, else 0
    accusableUntil: Number(v.accusableUntil),      // seconds; a commit must be made at or before this time
    refundableAt: Number(v.refundableAt),          // seconds; refund() works from this time on (if still attested)
    recordedBeforeFlag: v.recordedBeforeFlag,      // true if the record predates any flag of the device
    device: {
      status: DEVICE_STATUS[Number(v.deviceStatus)],
      flaggedAtBlock: Number(v.flaggedAtBlock),
      reason: REASONS[Number(v.reason)],
    },
  };
}

/**
 * Looks up a photo (bytes, or its 0x sha256 hash): one entry per device key that attested it, oldest first;
 * [] if no record. Reads only (attestersOf + verify).
 */
export async function verifyPhoto(ctx, photoBytesOrHash) {
  const photoHash = await photoHashOf(photoBytesOrHash);
  const keyIds = await read(ctx.contracts.paprika.attestersOf(photoHash));
  return Promise.all([...keyIds].map((k) => recordView(ctx, photoHash, k)));
}

/** All records ever attested, from the Attested events (oldest first), with their current state. Reads only. */
export async function listRecords(ctx) {
  const { paprika } = ctx.contracts;
  const events = await queryEvents(ctx, paprika, paprika.filters.Attested());
  return Promise.all(events.map((ev) => recordView(ctx, ev.args.photoHash, ev.args.keyId)));
}

/** Amount -> "100 DBT" (decimals from the token, trailing ".0" removed). */
export function formatToken(ctx, amount) {
  let s = ethers.formatUnits(amount, ctx.params.tokenDecimals);
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return `${s} ${ctx.params.tokenSymbol}`;
}

// ------------------------------------------------------------------ device actions

/**
 * Registers a device key for free. The device signs registerMessage naming the role's account (proof of
 * possession); sends Paprika.register(x, y, sig) from that account, which becomes the device owner.
 */
export async function registerDevice(ctx, role, device) {
  const owner = addressOf(ctx, role);
  const msg = registerMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, owner });
  const sig = toHex(await device.sign(msg));
  const r = await send(ctx, role, ctx.contracts.paprika, "register", [device.x, device.y, sig], "Paprika.register");
  return { txHash: r.hash, keyId: device.keyId };
}

/**
 * Attests a photo with a deposit of BOND (WETH) paid by `role`.
 * Sends: WETH.deposit (wraps only the missing ETH), WETH.approve (only if needed), then
 * Paprika.attest(photoHash, anchorBlock, keyId, sig). txHashes lists them in order.
 */
export async function attestPhoto(ctx, role, device, photoBytes) {
  addressOf(ctx, role);
  // Checks BEFORE spending anything (no wrap, no approve when the attest would revert anyway).
  const bytes = asBytes(photoBytes);
  if (bytes.length === 0) throw new Error("the photo is empty (0 bytes): nothing to attest");
  const d = await read(ctx.contracts.paprika.devices(device.keyId));
  if (Number(d.status) === 0) throw new Error("this device key is not registered on this chain: register it first");
  if (Number(d.status) === 2) throw new Error(`this device key is flagged (${REASONS[Number(d.reason)]}) and can no longer attest`);
  const existing = await read(ctx.contracts.paprika.verify(await sha256(bytes), device.keyId));
  if (Number(existing.state) !== 0) throw new Error(`this key already attested this exact file (record ${STATES[Number(existing.state)]})`);
  // The block hash is read FIRST, before the photo is hashed and signed: a block hash cannot be known in
  // advance, so a signature over it proves the photo was signed after block `anchorBlock`. The block that
  // records the attestation gives the upper bound. The contract checks blockhash(anchorBlock), which only
  // exists for the 256 most recent blocks, so the anchor must be recent.
  const anchor = await read(ctx.provider.getBlock("latest"));
  const photoHash = await sha256(bytes);
  const msg = captureMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, photoHash, blockHash: anchor.hash });
  const sig = toHex(await device.sign(msg));
  const txHashes = [];
  const transactions = [];
  await ensureFunds(ctx, role, txHashes, transactions);
  const r = await send(ctx, role, ctx.contracts.paprika, "attest", [photoHash, anchor.number, device.keyId, sig], "Paprika.attest");
  txHashes.push(r.hash);
  transactions.push({ label: "Paprika.attest", txHash: r.hash });
  return { txHashes, transactions, photoHash, keyId: device.keyId, anchorBlock: anchor.number };
}

/**
 * Revokes a device key: the device signs revokeMessage naming the role's account; sends Paprika.revokeKey.
 * The device becomes Flagged (reason key-revoked). No money moves.
 */
export async function revokeKey(ctx, role, device) {
  const caller = addressOf(ctx, role);
  const d = await read(ctx.contracts.paprika.devices(device.keyId));
  if (Number(d.status) === 0) throw new Error("this device key is not registered on this chain");
  if (Number(d.status) === 2) throw new Error(`this key is already flagged (${REASONS[Number(d.reason)]}): nothing to revoke`);
  const msg = revokeMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, caller });
  const sig = toHex(await device.sign(msg));
  const r = await send(ctx, role, ctx.contracts.paprika, "revokeKey", [device.keyId, sig], "Paprika.revokeKey");
  return { txHash: r.hash };
}

// ------------------------------------------------------------------ evidence (content-addressed)

/** Public URL of a piece of evidence: <evidenceBaseURI>/<sha256 hex, no 0x>, as written in the claim UMA reads. */
export function evidenceUrl(ctx, evidenceHash) {
  const hex = String(evidenceHash).toLowerCase().replace(/^0x/, "");
  return ctx.evidenceBaseURI ? `${ctx.evidenceBaseURI}/${hex}` : null;
}

// Node only: the folder where the server keeps evidence (app/data/evidence), for direct publishing.
async function evidenceDir() {
  const { fileURLToPath } = await import("node:url");
  return fileURLToPath(new URL("../data/evidence/", import.meta.url));
}

/**
 * Publishes evidence (a file or a text) so UMA's voters can fetch it. Browser: POST <server>/evidence with the raw
 * bytes. Node: written directly where the server serves it (app/data/evidence/<sha256>). Content-addressed: the
 * SHA-256 of the bytes is the name and the integrity check. Returns { evidenceHash, url }.
 */
export async function publishEvidence(ctx, { bytes, contentType = "application/octet-stream" }) {
  const data = asBytes(bytes);
  if (!data.length) throw new Error("the evidence is empty");
  if (data.length > 10 * 1024 * 1024) throw new Error("the evidence is larger than 10 MB");
  const evidenceHash = await sha256(data);
  if (ctx.demo.mode === "server") {
    let res;
    try {
      res = await fetch(ctx.demo.baseUrl + "/evidence", { method: "POST", headers: { "content-type": contentType }, body: data });
    } catch (e) { throw new Error(`cannot reach the evidence server (${e.message})`); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `evidence server: HTTP ${res.status}`);
    if (j.evidenceHash !== evidenceHash) throw new Error("the server stored different bytes (hash mismatch)");
  } else {
    const fs = await import("node:fs");
    const dir = await evidenceDir();
    const hex = evidenceHash.slice(2);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dir + hex)) fs.writeFileSync(dir + hex, data);
    fs.writeFileSync(dir + hex + ".type", String(contentType));
  }
  return { evidenceHash, url: evidenceUrl(ctx, evidenceHash) };
}

/**
 * Fetches published evidence and checks it against its hash. Returns { url, contentType, bytes }.
 * Browser: GET <server>/evidence/<hash>; Node: read from app/data/evidence. Throws if missing or if the bytes do not
 * hash to evidenceHash.
 */
export async function getEvidence(ctx, evidenceHash) {
  const hex = String(evidenceHash).toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("evidence hash must be 64 hex characters");
  let bytes, contentType;
  if (ctx.demo.mode === "server") {
    const res = await fetch(`${ctx.demo.baseUrl}/evidence/${hex}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 404 ? "this evidence was never published on this server" : `evidence server: HTTP ${res.status}`);
    contentType = res.headers.get("content-type") || "application/octet-stream";
    bytes = new Uint8Array(await res.arrayBuffer());
  } else {
    const fs = await import("node:fs");
    const dir = await evidenceDir();
    if (!fs.existsSync(dir + hex)) throw new Error("this evidence was never published here");
    bytes = new Uint8Array(fs.readFileSync(dir + hex));
    contentType = fs.existsSync(dir + hex + ".type") ? fs.readFileSync(dir + hex + ".type", "utf8") : "application/octet-stream";
  }
  if ((await sha256(bytes)) !== `0x${hex}`) throw new Error("the evidence does not match its hash");
  return { url: evidenceUrl(ctx, `0x${hex}`), contentType, bytes };
}

// ------------------------------------------------------------------ account preparation

/**
 * Prepares a user account for `photos` deposits or bonds in one go, so each later attest or commit needs a single
 * signature: wraps only the missing ETH into WETH (WETH9.deposit) and approves Paprika for MaxUint256 if the
 * allowance is below one BOND. role defaults to the only role with a wallet (else "photographer").
 * Returns { transactions: [{ label, txHash }], wethBalance, allowance } (nothing sent if already prepared).
 */
export async function prepareAccount(ctx, { photos = 3, role } = {}) {
  role = role || (USER_ROLES.filter((r) => ctx.signers[r]).length === 1 ? USER_ROLES.find((r) => ctx.signers[r]) : "photographer");
  const me = addressOf(ctx, role);
  const { token } = ctx.contracts;
  const need = ctx.params.bond * BigInt(Math.max(1, Math.floor(Number(photos))));
  const transactions = [];
  const held = await read(token.balanceOf(me));
  if (held < need) {
    const label = `${ctx.params.tokenSymbol}.deposit (wrap ETH for ${photos})`;
    const r = await send(ctx, role, token, "deposit", [], label, { value: need - held });
    transactions.push({ label, txHash: r.hash });
  }
  if ((await read(token.allowance(me, ctx.addresses.paprika))) < ctx.params.bond) {
    const label = `${ctx.params.tokenSymbol}.approve (once, unlimited)`;
    const r = await send(ctx, role, token, "approve", [ctx.addresses.paprika, ethers.MaxUint256], label);
    transactions.push({ label, txHash: r.hash });
  }
  return { transactions, wethBalance: await read(token.balanceOf(me)), allowance: await read(token.allowance(me, ctx.addresses.paprika)) };
}

// ------------------------------------------------------------------ secrets kept by the app (never deleted)

/**
 * A key-value store for the app's secrets (commitment salts, device keys, wallet keys), on top of `storage`
 * (getItem/setItem, e.g. localStorage). Entries are namespaced by deployment fingerprint and NEVER deleted, so a
 * redeploy or a chain restart only archives them. Returns { fingerprint, put(kind, id, value), get(kind, id),
 * list(kind) } (values are JSON).
 */
export async function secretStore(ctx, storage) {
  const fingerprint = await deploymentFingerprint(ctx);
  const prefix = `paprika:${fingerprint}:`;
  return {
    fingerprint,
    put: async (kind, id, value) => storage.setItem(`${prefix}${kind}:${id}`, JSON.stringify(value)),
    get: async (kind, id) => { const v = await storage.getItem(`${prefix}${kind}:${id}`); return v ? JSON.parse(v) : null; },
    list: async (kind) => storageEntries(storage)
      .filter(([k]) => k.startsWith(`${prefix}${kind}:`))
      .map(([k, v]) => ({ id: k.slice(prefix.length + kind.length + 1), value: JSON.parse(v) })),
  };
}

// [key, value] pairs of a storage: localStorage (length/key), or an object with keys().
function storageEntries(storage) {
  const keys = typeof storage.keys === "function" ? [...storage.keys()]
    : Array.from({ length: storage.length || 0 }, (_, i) => storage.key(i));
  return keys.filter(Boolean).map((k) => [k, storage.getItem(k)]);
}

/**
 * Every secret the app ever stored in `storage`, of every deployment (archived ones included), grouped by
 * deployment fingerprint: [{ fingerprint, kind, id, value }]. Wallet keys made by browserWallet appear with
 * kind "wallet" (id = role, value = { address, privateKey }).
 */
export function archivedWallets(storage) {
  const out = [];
  for (const [k, v] of storageEntries(storage)) {
    let m = k.match(/^paprika-wallet:(.+):(photographer|accuser)$/);
    if (m) {
      const w = new ethers.Wallet(v);
      out.push({ fingerprint: m[1], kind: "wallet", id: m[2], value: { address: w.address, privateKey: v } });
      continue;
    }
    m = k.match(/^paprika:(.+?:0x[0-9a-f]{40}:[^:]+):([^:]+):(.+)$/i);
    if (m) {
      let value = v;
      try { value = JSON.parse(v); } catch { /* raw string */ }
      out.push({ fingerprint: m[1], kind: m[2], id: m[3], value });
    }
  }
  return out;
}

// ------------------------------------------------------------------ accusation

/**
 * Step 1 of an accusation. Only a hash goes on chain, so nobody can tell which photo is accused:
 * commitment = keccak256(abi.encode(claimant, photoHash, keyId, evidenceHash, salt)), with a random salt.
 * Sends: WETH.deposit (wraps only the missing ETH), WETH.approve (if needed), then Paprika.commitClaim(commitment),
 * which pulls BOND from `role`.
 * KEEP the returned salt and evidenceHash: the reveal needs them.
 * Checks first, before any money moves: evidence is not empty; the record exists, is not refunded, not proven fake,
 * and the challenge period is not over. If another accusation is open on the photo the commit still goes ahead
 * (the contract credits the bond back if it is still open at reveal time) and `warning` explains it.
 * Evidence: pass evidenceHash (from publishEvidence: the file is already published, UMA's voters will fetch it), or
 * evidence = a text, which is published first (publishEvidence) and then hashed.
 * Returns { txHashes, transactions, commitment, salt, evidenceHash, evidenceUrl, warning (string or null) }.
 */
export async function commitAccusation(ctx, role, { photoHash, keyId, evidence, evidenceHash }) {
  const claimant = addressOf(ctx, role);
  if (evidenceHash !== undefined && evidenceHash !== null) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(evidenceHash))) throw new Error("evidenceHash must be 0x + 64 hex characters (from publishEvidence)");
  } else if (!String(evidence ?? "").trim()) {
    throw new Error("evidence is required: publish a file or a text that shows the photo is not genuine");
  }
  const rec = await read(ctx.contracts.paprika.verify(photoHash, keyId));
  const state = STATES[Number(rec.state)];
  if (state === "none") throw new Error("this photo has no record for this device key: nothing to accuse");
  if (state === "refunded") throw new Error("this photo was refunded: its challenge period is over");
  if (state === "fake") throw new Error("this photo is already proven fake");
  const now = Number(await latestTimestamp(ctx));
  if (now >= Number(rec.accusableUntil)) {
    throw new Error(`the challenge period is over (it ended at ${new Date(Number(rec.accusableUntil) * 1000).toISOString()})`);
  }
  const warning = state === "accused"
    ? "another accusation is open on this photo: if it is still open when you reveal, no new accusation opens and your bond is credited back"
    : null;
  if (!evidenceHash) evidenceHash = (await publishEvidence(ctx, { bytes: utf8(String(evidence)), contentType: "text/plain; charset=utf-8" })).evidenceHash;
  evidenceHash = evidenceHash.toLowerCase();
  const salt = ethers.hexlify(ethers.randomBytes(32));
  // abi.encode (NOT encodePacked): each value padded to 32 bytes, the address first.
  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes32", "bytes32", "bytes32"], [claimant, photoHash, keyId, evidenceHash, salt]));
  const txHashes = [];
  const transactions = [];
  await ensureFunds(ctx, role, txHashes, transactions);
  const r = await send(ctx, role, ctx.contracts.paprika, "commitClaim", [commitment], "Paprika.commitClaim");
  txHashes.push(r.hash);
  transactions.push({ label: "Paprika.commitClaim", txHash: r.hash });
  return { txHashes, transactions, commitment, salt, evidenceHash, evidenceUrl: evidenceUrl(ctx, evidenceHash), warning };
}

/**
 * Step 2: reveals the commitment (at least one block after the commit; under automine every transaction is its
 * own block, so any later call works). Sends Paprika.revealClaim, which asserts the accusation at UMA's
 * Optimistic Oracle V3 with the accuser's bond and disputes it at once with the photo's deposit: UMA's vote
 * decides. Returns { txHash, assertionId, bondReturned, reason }. If the photo was already proven fake, or another
 * accusation is still open on it, no accusation opens: assertionId = ZeroHash, bondReturned = true, the bond is
 * credited back to the accuser, and reason is "already proven fake" or "another accusation is open".
 */
export async function revealAccusation(ctx, role, { photoHash, keyId, evidenceHash, salt }) {
  const { paprika } = ctx.contracts;
  const before = STATES[Number((await read(paprika.verify(photoHash, keyId))).state)];
  const r = await send(ctx, role, paprika, "revealClaim", [photoHash, keyId, evidenceHash, salt], "Paprika.revealClaim");
  let assertionId = ethers.ZeroHash;
  let bondReturned = false;
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ctx.addresses.paprika.toLowerCase()) continue;
    const parsed = paprika.interface.parseLog(log);
    if (parsed?.name === "AccusationOpened") assertionId = parsed.args.assertionId;
    if (parsed?.name === "BondReturned") bondReturned = true;
  }
  const reason = bondReturned ? (before === "fake" ? "already proven fake" : "another accusation is open") : null;
  return { txHash: r.hash, assertionId, bondReturned, reason };
}

/**
 * Every accusation ever opened, oldest first, from the AccusationOpened / AccusationResolved events (reads only):
 * [{ assertionId, photoHash, keyId, claimant, evidenceHash, openedAt, blockNumber, txHash, open,
 *    outcome: "pending" | "fake-proven" | "rejected" }]. Use it to find an open accusation again after a reload.
 */
export async function listAccusations(ctx) {
  const { paprika } = ctx.contracts;
  const [opened, resolved] = await read(Promise.all([
    queryEvents(ctx, paprika, paprika.filters.AccusationOpened()),
    queryEvents(ctx, paprika, paprika.filters.AccusationResolved()),
  ]));
  const outcome = new Map(resolved.map((ev) => [ev.args.assertionId, ev.args.fakeProven ? "fake-proven" : "rejected"]));
  return Promise.all(opened.map(async (ev) => ({
    assertionId: ev.args.assertionId,
    photoHash: ev.args.photoHash,
    keyId: ev.args.keyId,
    claimant: ev.args.claimant,
    evidenceHash: ev.args.evidenceHash,
    openedAt: await blockTime(ctx, ev.blockNumber),
    blockNumber: ev.blockNumber,
    txHash: ev.transactionHash,
    open: !outcome.has(ev.args.assertionId),
    outcome: outcome.get(ev.args.assertionId) || "pending",
  })));
}

/**
 * Identity of "this chain + this deployment" (reads only): "<chainId>:<paprika address>:<hash of block 1>", or
 * "<chainId>:<paprika>:no-contract" when nothing is deployed at the Paprika address. A restarted Hardhat chain gives
 * the same addresses but a new block-1 hash, so a page can compare fingerprints to detect a restart or redeploy.
 */
export async function deploymentFingerprint(ctx) {
  const code = await read(ctx.provider.getCode(ctx.addresses.paprika));
  if (!code || code === "0x") return `${ctx.chainId}:${ctx.addresses.paprika.toLowerCase()}:no-contract`;
  const b1 = await read(ctx.provider.send("eth_getBlockByNumber", ["0x1", false]));
  return `${ctx.chainId}:${ctx.addresses.paprika.toLowerCase()}:${b1 ? b1.hash : "none"}`;
}

// Latest block timestamp through a raw call (never cached).
async function latestTimestamp(ctx) {
  try { return BigInt((await ctx.provider.send("eth_getBlockByNumber", ["latest", false])).timestamp); } catch (e) { throw fail(e); }
}

// Moves the local chain clock to exactly `ts` (evm_setNextBlockTimestamp + evm_mine, i.e. evm_increaseTime to an
// exact boundary). Returns the seconds advanced (0 if already there).
async function advanceTo(ctx, ts) {
  const now = await latestTimestamp(ctx);
  if (ts <= now) return 0n;
  try {
    await ctx.provider.send("evm_setNextBlockTimestamp", [ethers.toQuantity(ts)]);
    await ctx.provider.send("evm_mine", []);
  } catch (e) { throw fail(e); }
  return ts - now;
}

/**
 * THE VOTE: a real UMA vote in VotingV2, the DVM, by the three voter accounts (3-5), then settlement.
 * When Paprika disputed its assertion, OOv3 called VotingV2.requestPrice(identifier, assertionTime,
 * stampAssertion(assertionId)). VotingV2 votes on it in the NEXT round; a round = commit phase + reveal phase,
 * each `phaseLength` seconds, roundId = floor(timestamp / (2 x phaseLength)). On the local chain we jump the clock:
 *   1. find the request status (getPriceRequestStatuses: a fresh request is "Future" and is NOT listed by
 *      getPendingRequests, so we query it directly);
 *   2. jump to the commit phase of its round; each voter commits
 *      keccak256(abi.encodePacked(int256 price, int256 salt, address voter, uint256 time, bytes ancillaryData,
 *      uint256 roundId, bytes32 identifier)) with price 1e18 = "the accusation is true" (fake proven), 0 = rejected;
 *   3. jump to the reveal phase; each voter reveals (price, salt);
 *   4. jump past the round end; the operator calls OOv3.settleAssertion, which reads the price from VotingV2
 *      (resolved: revealed stake above the GAT, winning answer above the SPAT), pays out, and calls Paprika back.
 * onPhase({ phase: "commit" | "reveal" | "settle", roundId, txHashes, timestamp }) is called after each phase.
 * Returns { status: "settled", txHashes, roundId, simulatedSeconds, fakeProven }.
 *
 * Safe to call twice for the same assertion (two tabs, or a tab and the CLI):
 *   - already settled: returns { status: "already-settled", fakeProven, txHashes: [], roundId: null, simulatedSeconds: 0 }
 *     without sending anything;
 *   - another vote already committed in this round (VoteCommitted events of our voters): throws an Error with
 *     code "VOTE_IN_PROGRESS" and a plain message, before sending anything;
 *   - a second call in the same page or process waits for the first and returns its result ("already-settled");
 *   - if a vote from another page starts at the very same moment, a voter whose commit was overwritten is skipped
 *     (2 of 3 voters still reach the quorum); if the round still does not resolve, it throws code "VOTE_INTERFERED"
 *     ("run the vote again"); the request rolls to the next round and the next call resolves it.
 */
// Votes running in this page / process, by assertion id: a second call waits for the first, then reports its result.
const votesRunning = new Map();

export async function umaVote(ctx, assertionId, fakeProven, { onPhase } = {}) {
  if (ctx.demo.mode === "server") return umaVoteViaServer(ctx, assertionId, fakeProven, { onPhase });
  if (ctx.demo.mode !== "direct") throw new Error("the UMA vote is run by the demo server or with the demo keys: neither is available here");
  assertLocalChain(ctx);
  const key = String(assertionId).toLowerCase();
  if (votesRunning.has(key)) {
    await votesRunning.get(key).catch(() => {});
    const x = await read(ctx.contracts.oo.getAssertion(assertionId));
    if (x.settled) return { status: "already-settled", fakeProven: Boolean(x.settlementResolution), txHashes: [], roundId: null, simulatedSeconds: 0 };
  }
  const run = runVote(ctx, assertionId, fakeProven, { onPhase });
  votesRunning.set(key, run);
  try { return await run; } finally { if (votesRunning.get(key) === run) votesRunning.delete(key); }
}

// Browser: the voters are third parties, run by the demo server. POST /demo/vote starts the vote (409 + code
// VOTE_IN_PROGRESS if one already runs for this assertion); GET /demo/vote/status?assertionId=... is polled every
// 150 ms: { state: "running" | "done" | "error", phases: [{ phase, roundId, txHashes, timestamp }], activity, result,
// error, code }. onPhase is called for every new phase; the result has the same shape as the direct vote.
async function umaVoteViaServer(ctx, assertionId, fakeProven, { onPhase } = {}) {
  await demoPost(ctx, "/demo/vote", { assertionId, fakeProven: Boolean(fakeProven) });
  let seenPhases = 0, seenActivity = 0;
  for (;;) {
    const st = await demoGet(ctx, `/demo/vote/status?assertionId=${encodeURIComponent(assertionId)}`);
    for (const ph of (st.phases || []).slice(seenPhases)) {
      if (onPhase) { try { onPhase(ph); } catch { /* UI callback errors are ignored */ } }
    }
    seenPhases = (st.phases || []).length;
    emitAll(ctx, (st.activity || []).slice(seenActivity));
    seenActivity = (st.activity || []).length;
    if (st.state === "done") return st.result;
    if (st.state === "error") throw Object.assign(new Error(st.error || "the UMA vote failed"), { code: st.code });
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function runVote(ctx, assertionId, fakeProven, { onPhase } = {}) {
  const { oo, voting } = ctx.contracts;
  if (!voting || !ctx.voters.length) throw new Error("this deployment has no UMA voting contract or voters: run `npm run deploy` again");
  const a = await read(oo.getAssertion(assertionId));
  if (a.asserter === ethers.ZeroAddress) throw new Error("unknown assertion id");
  const settledResult = (x) => ({ status: "already-settled", fakeProven: Boolean(x.settlementResolution), txHashes: [], roundId: null, simulatedSeconds: 0 });
  if (a.settled) return settledResult(a);
  if (a.disputer === ethers.ZeroAddress) throw new Error("assertion is not disputed");
  const identifier = a.identifier;
  const time = a.assertionTime;
  const ancillaryData = await read(oo.stampAssertion(assertionId));
  const phaseLength = BigInt(ctx.params.phaseLength || (await read(voting.voteTiming())));
  const roundLength = 2n * phaseLength;
  const inProgress = () => {
    const e = new Error("a vote on this accusation is already running (another tab or the CLI): wait a few seconds, then reload");
    e.code = "VOTE_IN_PROGRESS";
    return e;
  };
  // Commits already made in `round` for this request (by anyone): voter address (lowercase) -> true.
  const committedIn = async (round) => {
    const evs = await queryEvents(ctx, voting, voting.filters.VoteCommitted(null, null, null, identifier));
    const out = new Set();
    for (const ev of evs) {
      if (BigInt(ev.args.roundId) === round && BigInt(ev.args.time) === BigInt(time) && ev.args.ancillaryData === ancillaryData) out.add(ev.args.voter.toLowerCase());
    }
    return out;
  };
  const stillOpen = async () => {
    const x = await read(oo.getAssertion(assertionId));
    return x.settled ? x : null;
  };

  // 1. Status of the DVM request: 1 Active (voted this round), 3 Future (voted next round).
  const [st] = await read(voting.getPriceRequestStatuses([{ identifier, time, ancillaryData }]));
  const status = Number(st.status);
  if (status !== 1 && status !== 3) throw new Error(`no pending UMA vote for this assertion (status ${DVM_STATUS[status] ?? status})`);
  let roundId = BigInt(st.lastVotingRound);
  // Active but already in the reveal phase: too late to commit in this round; the request rolls to the next one.
  if (status === 1 && Number(await read(voting.getVotePhase())) === 1) {
    if ((await committedIn(roundId)).size) throw inProgress();   // someone is revealing in this round right now
    roundId += 1n;
  }
  if ((await committedIn(roundId)).size) throw inProgress();
  const commitStart = roundId * roundLength, revealStart = commitStart + phaseLength, roundEnd = commitStart + roundLength;
  const txHashes = [];
  let simulated = 0n;
  const report = async (phase, hashes) => {
    if (onPhase) {
      try { onPhase({ phase, roundId: Number(roundId), txHashes: hashes, timestamp: Number(await latestTimestamp(ctx)) }); } catch { /* UI callback errors are ignored */ }
    }
  };

  // 2. Commit phase: each voter commits a hidden vote with a random salt.
  simulated += await advanceTo(ctx, commitStart);
  const price = fakeProven ? NUMERICAL_TRUE : 0n;
  const ballots = [];
  const commitHashes = [];
  for (const v of ctx.voters) {
    // Another vote got here first for this voter: leave its commit alone (it will reveal it).
    if ((await committedIn(roundId)).has(v.address.toLowerCase())) {
      if (!ballots.length) throw inProgress();
      continue;
    }
    const salt = BigInt(ethers.hexlify(ethers.randomBytes(31)));   // positive int256
    const hash = ethers.solidityPackedKeccak256(
      ["int256", "int256", "address", "uint256", "bytes", "uint256", "bytes32"],
      [price, salt, v.address, time, ancillaryData, roundId, identifier]);
    try {
      const r = await send(ctx, v, voting, "commitVote", [identifier, time, ancillaryData, hash], "UMA VotingV2.commitVote");
      ballots.push({ v, salt });
      commitHashes.push(r.hash);
    } catch (e) {
      if (!ballots.length) throw /reveal phase|must be active/i.test(e.message) ? inProgress() : e;
    }
  }
  txHashes.push(...commitHashes);
  await report("commit", commitHashes);

  // 3. Reveal phase: each voter reveals its price and salt. A reveal fails only if another vote overwrote that
  //    voter's commit; skip it (the others may still reach the quorum).
  simulated += await advanceTo(ctx, revealStart);
  const revealHashes = [];
  for (const { v, salt } of ballots) {
    try {
      const r = await send(ctx, v, voting, "revealVote", [identifier, time, price, ancillaryData, salt], "UMA VotingV2.revealVote");
      revealHashes.push(r.hash);
    } catch { /* overwritten by a concurrent vote */ }
  }
  txHashes.push(...revealHashes);
  await report("reveal", revealHashes);

  // 4. After the round: settle on OOv3 (reads VotingV2's price, pays out, calls Paprika's callback).
  simulated += await advanceTo(ctx, roundEnd);
  const done = await stillOpen();
  if (done) return { ...settledResult(done), txHashes, roundId: Number(roundId), simulatedSeconds: Number(simulated) };
  let r;
  try {
    r = await send(ctx, "operator", oo, "settleAssertion", [assertionId], "UMA OOv3.settleAssertion");
  } catch (e) {
    const after = await stillOpen();
    if (after) return { ...settledResult(after), txHashes, roundId: Number(roundId), simulatedSeconds: Number(simulated) };
    const err = new Error("the vote did not resolve: another vote on this accusation (another tab or the CLI) ran at the same time; run the vote again");
    err.code = "VOTE_INTERFERED";
    throw err;
  }
  txHashes.push(r.hash);
  await report("settle", [r.hash]);
  const final = await read(oo.getAssertion(assertionId));
  return { status: "settled", fakeProven: Boolean(final.settlementResolution), txHashes, roundId: Number(roundId), simulatedSeconds: Number(simulated) };
}

// ------------------------------------------------------------------ money

/** Credits the deposit back to the depositor once the photo can no longer be accused. Sends Paprika.refund (anyone may call it). */
export async function refund(ctx, role, { photoHash, keyId }) {
  const rec = await read(ctx.contracts.paprika.verify(photoHash, keyId));
  const state = STATES[Number(rec.state)];
  if (state === "attested") {
    const now = Number(await latestTimestamp(ctx));
    // The refund transaction is mined at least one second after the latest block.
    if (now + 1 < Number(rec.refundableAt)) {
      throw new Error(`too early: refundable at ${new Date(Number(rec.refundableAt) * 1000).toISOString()} (in ${Number(rec.refundableAt) - now} s of chain time)`);
    }
  } else if (state === "none") throw new Error("no record for this photo and key");
  else if (state === "refunded") throw new Error("already refunded");
  else if (state === "accused") throw new Error("under accusation: the deposit is held by UMA until the vote");
  else if (state === "fake") throw new Error("proven fake: the deposit was lost");
  const r = await send(ctx, role, ctx.contracts.paprika, "refund", [photoHash, keyId], "Paprika.refund");
  return { txHash: r.hash };
}

/**
 * State of a commitment (reads only): { exists, live, claimant, committedAt, committedBlock, revealDeadline,
 * expired } (times in chain seconds). A live commitment can be revealed until revealDeadline; after that it is
 * expired and anyone can forfeit it (forfeitCommitment).
 */
export async function commitmentStatus(ctx, commitment) {
  const k = await read(ctx.contracts.paprika.commits(commitment));
  const exists = k.claimant !== ethers.ZeroAddress;
  const committedAt = Number(k.committedAt);
  const revealDeadline = exists ? committedAt + ctx.params.revealWindow : 0;
  const now = Number(await latestTimestamp(ctx));
  return {
    exists, live: k.live, claimant: k.claimant, committedAt, committedBlock: Number(k.committedBlock), revealDeadline,
    // A transaction is mined at least one second after the latest block: past the deadline means "too late".
    expired: exists && k.live && now + 1 > revealDeadline,
  };
}

/**
 * Forfeits a commitment that was not revealed within REVEAL_WINDOW: sends Paprika.forfeitCommit(commitment) from
 * `role` (anyone may call it). The commitment's bond B goes to the burn address 0x...dEaD; nobody gets it.
 * Checks first that the commitment is live and its reveal period is over.
 */
export async function forfeitCommitment(ctx, role, commitment) {
  const st = await commitmentStatus(ctx, commitment);
  if (!st.exists) throw new Error("no such commitment on this chain");
  if (!st.live) throw new Error("this commitment was already revealed or forfeited");
  if (!st.expired) throw new Error(`the reveal is still open until ${new Date(st.revealDeadline * 1000).toISOString()}: reveal it instead`);
  const r = await send(ctx, role, ctx.contracts.paprika, "forfeitCommit", [commitment], "Paprika.forfeitCommit");
  return { txHash: r.hash, burned: ctx.params.bond };
}

/** Moves all credit of `role` from Paprika to its wallet, as WETH. Sends Paprika.withdrawCredit. Reverts "no credit" if zero. */
export async function withdrawCredit(ctx, role) {
  const { paprika } = ctx.contracts;
  if ((await read(paprika.credits(addressOf(ctx, role)))) === 0n) throw new Error(`no credit to withdraw for the ${role}`);
  const r = await send(ctx, role, paprika, "withdrawCredit", [], "Paprika.withdrawCredit");
  let amount = 0n;
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ctx.addresses.paprika.toLowerCase()) continue;
    const parsed = paprika.interface.parseLog(log);
    if (parsed?.name === "CreditWithdrawn") amount = parsed.args.amount;
  }
  return { txHash: r.hash, amount };
}

/** Wraps `amount` (bigint, base units) of the role's ETH into WETH. Sends WETH9.deposit{value: amount}. */
export async function wrap(ctx, role, amount) {
  const r = await send(ctx, role, ctx.contracts.token, "deposit", [], `${ctx.params.tokenSymbol}.deposit (wrap ETH)`, { value: BigInt(amount) });
  return { txHash: r.hash, amount: BigInt(amount) };
}

/** Unwraps WETH back to ETH: `amount` (bigint), or the role's whole WETH balance if omitted. Sends WETH9.withdraw. */
export async function unwrap(ctx, role, amount) {
  const value = amount === undefined || amount === null ? await read(ctx.contracts.token.balanceOf(addressOf(ctx, role))) : BigInt(amount);
  if (value <= 0n) throw new Error("no WETH to unwrap");
  const held = await read(ctx.contracts.token.balanceOf(addressOf(ctx, role)));
  if (value > held) throw new Error(`only ${formatToken(ctx, held)} to unwrap`);
  const r = await send(ctx, role, ctx.contracts.token, "withdraw", [value], `${ctx.params.tokenSymbol}.withdraw (unwrap)`);
  return { txHash: r.hash, amount: value };
}

// ------------------------------------------------------------------ demo control

/**
 * Local-chain demo control: moves the chain clock forward (evm_increaseTime) and mines one block (evm_mine).
 * Refuses while an accusation is open, unless { force: true }: UMA's vote on it is scheduled in a given round, and
 * jumping far past it makes the request roll (see the deploy script's MAX_ROLLS). Vote first, then advance.
 */
export async function advanceTime(ctx, seconds, { force = false } = {}) {
  if (ctx.demo.mode === "server") {
    const r = await demoPost(ctx, "/demo/advance", { seconds: Number(seconds), force: Boolean(force) });
    return { timestamp: r.timestamp };
  }
  if (ctx.demo.mode !== "direct") throw new Error("the demo clock is moved by the demo server or with the demo keys: neither is available here");
  assertLocalChain(ctx);
  if (!force) {
    const open = (await listAccusations(ctx)).filter((a) => a.open);
    if (open.length) {
      throw new Error(`${open.length} accusation(s) still open (photo ${open[0].photoHash.slice(0, 10)}...): run the UMA vote first, or force the jump ({ force: true }; CLI: --force)`);
    }
  }
  try {
    await ctx.provider.send("evm_increaseTime", [Math.max(0, Math.floor(Number(seconds)))]);
    await ctx.provider.send("evm_mine", []);
  } catch (e) {
    throw fail(e);
  }
  const { timestamp } = await chainInfo(ctx);
  return { timestamp };
}

// ------------------------------------------------------------------ explorer (data for the built-in block explorer)

// Contract interfaces by address (lowercase) and readable names of known addresses.
function explorerIndex(ctx) {
  if (ctx._explorer) return ctx._explorer;
  const d = ctx.deployment, a = ctx.addresses, abis = d.abis;
  const iface = new Map();
  const add = (addr, contractName, abi) => { if (addr && abi) iface.set(addr.toLowerCase(), { contractName, iface: new ethers.Interface(abi) }); };
  add(a.paprika, "Paprika", abis.Paprika);
  add(a.oo, "UMA OptimisticOracleV3", abis.OptimisticOracleV3);
  add(a.voting, "UMA VotingV2", abis.VotingV2);
  add(a.currency, "WETH", abis.WETH9);
  const names = new Map();
  const name = (addr, n) => { if (addr) names.set(addr.toLowerCase(), n); };
  name(a.paprika, "Paprika"); name(a.oo, "UMA Optimistic Oracle V3"); name(a.voting, "UMA VotingV2 (DVM)");
  name(a.currency, "WETH"); name(a.store, "UMA Store"); name(d.addresses.finder, "UMA Finder");
  name(d.addresses.registry, "UMA Registry"); name(a.votingToken, "UMA voting token");
  name("0x000000000000000000000000000000000000dEaD", "Burn address");
  name(ctx.accounts.operator, "Operator (deployer)");
  name(ctx.accounts.alice, "Alice"); name(ctx.accounts.bob, "Bob");
  ctx.accounts.voters.forEach((v, i) => name(v, `UMA voter ${i + 1}`));
  ctx._explorer = { iface, names };
  return ctx._explorer;
}

/** Readable name of an address: a known contract, a voter, Alice/Bob, the connected roles; else null. */
export function addressName(ctx, address) {
  if (!address) return null;
  const k = address.toLowerCase();
  for (const r of USER_ROLES) if (ctx.accounts[r] && ctx.accounts[r].toLowerCase() === k && !explorerIndex(ctx).names.has(k)) return `You (${r})`;
  return explorerIndex(ctx).names.get(k) || null;
}

/** Link to the explorer for a tx hash, an address or a block number, from the network configuration's templates. */
export function explorerLink(ctx, kind, value) {
  const t = { tx: ctx.network.explorer.txUrl, address: ctx.network.explorer.addressUrl, block: ctx.network.explorer.blockUrl }[kind];
  if (!t) return null;
  return t.replace("{hash}", value).replace("{address}", value).replace("{number}", String(value));
}

// JSON-friendly value: bigints as decimal strings, nested arrays/structs as arrays/objects.
function plain(v) {
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && typeof v.toObject === "function" && v.length !== undefined) {
    try { const o = v.toObject(); if (Object.keys(o).length && !Object.keys(o).every((k) => /^\d+$/.test(k))) return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, plain(x)])); } catch { /* positional */ }
    return Array.from(v, plain);
  }
  if (Array.isArray(v)) return v.map(plain);
  return v;
}
// Named args of a decoded call or event: { name: value } (bytes shown as hex, claims as text when readable).
function namedArgs(fragment, args) {
  const out = {};
  fragment.inputs.forEach((inp, i) => {
    let v = plain(args[i]);
    if (inp.type === "bytes" && typeof v === "string" && /claim|ancillary/i.test(inp.name)) {
      try { v = ethers.toUtf8String(v); } catch { /* not text */ }
    }
    out[inp.name || `arg${i}`] = v;
  });
  return out;
}

function decodeCall(ctx, to, data, value) {
  const c = to && explorerIndex(ctx).iface.get(to.toLowerCase());
  if (!data || data === "0x") return { method: value && BigInt(value) > 0n ? "transfer ETH" : null, args: {} };
  if (!c) return { method: data.slice(0, 10), args: {} };
  try {
    const p = c.iface.parseTransaction({ data, value });
    return { method: `${c.contractName.replace(/^UMA /, "")}.${p.name}`, args: namedArgs(p.fragment, p.args) };
  } catch { return { method: data.slice(0, 10), args: {} }; }
}
function decodeLog(ctx, log) {
  const c = explorerIndex(ctx).iface.get(log.address.toLowerCase());
  if (c) {
    try {
      const p = c.iface.parseLog({ topics: log.topics, data: log.data });
      if (p) return { contractName: c.contractName, address: log.address, name: p.name, args: namedArgs(p.fragment, p.args) };
    } catch { /* unknown event */ }
  }
  return { contractName: addressName(ctx, log.address) || log.address, address: log.address, name: "unknown event", args: { topics: log.topics, data: log.data } };
}

async function rawBlock(ctx, numberOrHash, full) {
  const isHash = typeof numberOrHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(numberOrHash);
  const tag = isHash ? numberOrHash : (numberOrHash === "latest" ? "latest" : ethers.toQuantity(BigInt(numberOrHash)));
  return read(ctx.provider.send(isHash ? "eth_getBlockByHash" : "eth_getBlockByNumber", [tag, full]));
}
function txSummary(ctx, t, timestamp) {
  const call = decodeCall(ctx, t.to, t.input, t.value);
  return { hash: t.hash, block: Number(t.blockNumber), timestamp, from: ethers.getAddress(t.from), fromName: addressName(ctx, t.from),
    to: t.to ? ethers.getAddress(t.to) : null, toName: t.to ? addressName(ctx, t.to) : "contract creation", value: BigInt(t.value).toString(), method: call.method };
}

/** The n latest blocks, newest first: [{ number, hash, timestamp, txCount, gasUsed, txs: [summary] }]. */
async function latestBlocks(ctx, n = 10) {
  const latest = Number(await read(ctx.provider.getBlockNumber()));
  const nums = [];
  for (let i = latest; i >= 0 && nums.length < n; i--) nums.push(i);
  const blocks = await Promise.all(nums.map((i) => rawBlock(ctx, i, true)));
  return blocks.filter(Boolean).map((b) => ({
    number: Number(b.number), hash: b.hash, timestamp: Number(b.timestamp), txCount: b.transactions.length,
    gasUsed: BigInt(b.gasUsed).toString(), txs: b.transactions.map((t) => txSummary(ctx, t, Number(b.timestamp))),
  }));
}

/** One block by number or hash: { number, hash, parentHash, timestamp, gasUsed, gasLimit, txs: [summary] }, or null. */
async function block(ctx, numberOrHash) {
  const b = await rawBlock(ctx, numberOrHash, true);
  if (!b) return null;
  return {
    number: Number(b.number), hash: b.hash, parentHash: b.parentHash, timestamp: Number(b.timestamp),
    gasUsed: BigInt(b.gasUsed).toString(), gasLimit: BigInt(b.gasLimit).toString(),
    txs: b.transactions.map((t) => txSummary(ctx, t, Number(b.timestamp))),
  };
}

/**
 * One transaction, decoded with the deployment's ABIs (Paprika, UMA OOv3 and VotingV2, WETH): { hash, block,
 * timestamp, from, fromName, to, toName, value, status ("success" | "reverted" | "pending"), gasUsed, method,
 * args (named), events: [{ contractName, address, name, args }] }, or null if unknown.
 */
async function tx(ctx, hash) {
  const t = await read(ctx.provider.send("eth_getTransactionByHash", [hash]));
  if (!t) return null;
  const r = await read(ctx.provider.send("eth_getTransactionReceipt", [hash]));
  const b = t.blockNumber ? await rawBlock(ctx, Number(t.blockNumber), false) : null;
  const call = decodeCall(ctx, t.to, t.input, t.value);
  return {
    hash: t.hash, block: t.blockNumber ? Number(t.blockNumber) : null, timestamp: b ? Number(b.timestamp) : null,
    from: ethers.getAddress(t.from), fromName: addressName(ctx, t.from),
    to: t.to ? ethers.getAddress(t.to) : (r?.contractAddress ? ethers.getAddress(r.contractAddress) : null),
    toName: t.to ? addressName(ctx, t.to) : "contract creation",
    value: BigInt(t.value).toString(), status: !r ? "pending" : Number(r.status) === 1 ? "success" : "reverted",
    gasUsed: r ? BigInt(r.gasUsed).toString() : null, method: call.method, args: call.args,
    events: r ? r.logs.map((l) => decodeLog(ctx, l)) : [],
  };
}

/**
 * One address: { address, name, isContract, ethBalance, wethBalance, recentTxs: [summary] } (bigints as decimal
 * strings). recentTxs = up to 25 newest transactions from or to it, scanned over the last 2,000 blocks.
 */
async function address(ctx, addr) {
  addr = ethers.getAddress(addr);
  const [code, eth, weth, latest] = await Promise.all([
    read(ctx.provider.getCode(addr)), read(ctx.provider.getBalance(addr)), read(ctx.contracts.token.balanceOf(addr)),
    read(ctx.provider.getBlockNumber()),
  ]);
  const recentTxs = [];
  const k = addr.toLowerCase();
  for (let hi = Number(latest); hi >= Math.max(0, Number(latest) - 2000) && recentTxs.length < 25; hi -= 100) {
    const nums = [];
    for (let i = hi; i > hi - 100 && i >= 0; i--) nums.push(i);
    const blocks = await Promise.all(nums.map((i) => rawBlock(ctx, i, true)));
    for (const b of blocks) {
      if (!b) continue;
      for (const t of [...b.transactions].reverse()) {
        if (t.from.toLowerCase() === k || (t.to && t.to.toLowerCase() === k)) recentTxs.push(txSummary(ctx, t, Number(b.timestamp)));
      }
    }
  }
  return { address: addr, name: addressName(ctx, addr), isContract: code !== "0x", ethBalance: eth.toString(), wethBalance: weth.toString(), recentTxs: recentTxs.slice(0, 25) };
}

/**
 * What a search box query means: { kind: "block", number } | { kind: "tx", hash } | { kind: "address", address } |
 * { kind: "photo", photoHash } | { kind: "accusation", assertionId, photoHash } | { kind: "none", query }.
 * Accepts a block number, a tx or block hash, an address, a photo hash or a UMA assertion id.
 */
async function search(ctx, query) {
  const q = String(query || "").trim();
  if (/^\d+$/.test(q)) return { kind: "block", number: Number(q) };
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return { kind: "address", address: ethers.getAddress(q) };
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(q)) {
    const h = (q.startsWith("0x") ? q : `0x${q}`).toLowerCase();
    if (await read(ctx.provider.send("eth_getTransactionByHash", [h]))) return { kind: "tx", hash: h };
    const b = await rawBlock(ctx, h, false);
    if (b) return { kind: "block", number: Number(b.number) };
    if ((await read(ctx.contracts.paprika.attestersOf(h))).length) return { kind: "photo", photoHash: h };
    const acc = await read(ctx.contracts.paprika.accusations(h));
    if (acc.claimant !== ethers.ZeroAddress) return { kind: "accusation", assertionId: h, photoHash: acc.photoHash };
  }
  return { kind: "none", query: q };
}

/** Data for the built-in explorer: latestBlocks, block, tx, address, search, plus link and name helpers. */
export const explorer = { latestBlocks, block, tx, address, search, link: explorerLink, name: addressName };

/**
 * Everything the record page needs for one photo: { photoHash, keys: [{ ...record as in verifyPhoto,
 * accusations: [{ assertionId, claimant, evidenceHash, evidenceUrl, openedAt, open, outcome, txHash }],
 * history: [{ label, txHash, block, timestamp }] }] }. Empty keys if the photo has no record.
 */
export async function getRecord(ctx, photoBytesOrHash) {
  const photoHash = await photoHashOf(photoBytesOrHash);
  const recs = await verifyPhoto(ctx, photoHash);
  if (!recs.length) return { photoHash, keys: [] };
  const { paprika } = ctx.contracts;
  const [attested, refunded, flagged, accusations] = await Promise.all([
    queryEvents(ctx, paprika, paprika.filters.Attested(photoHash)),
    queryEvents(ctx, paprika, paprika.filters.Refunded(photoHash)),
    queryEvents(ctx, paprika, paprika.filters.DeviceFlagged()),
    listAccusations(ctx),
  ]);
  const resolved = await queryEvents(ctx, paprika, paprika.filters.AccusationResolved());
  const item = async (label, ev) => ({ label, txHash: ev.transactionHash, block: ev.blockNumber, timestamp: await blockTime(ctx, ev.blockNumber) });
  const keys = [];
  for (const r of recs) {
    const mine = accusations.filter((a) => a.photoHash === photoHash && a.keyId === r.keyId)
      .map((a) => ({ ...a, evidenceUrl: evidenceUrl(ctx, a.evidenceHash) }));
    const history = [];
    for (const ev of attested.filter((e) => e.args.keyId === r.keyId)) history.push(await item("Attested: deposit locked", ev));
    for (const a of mine) {
      history.push({ label: "Accused: sent to UMA's vote", txHash: a.txHash, block: a.blockNumber, timestamp: a.openedAt });
      const res = resolved.find((e) => e.args.assertionId === a.assertionId);
      if (res) history.push(await item(res.args.fakeProven ? "UMA vote: fake proven" : "UMA vote: accusation rejected", res));
    }
    for (const ev of refunded.filter((e) => e.args.keyId === r.keyId)) history.push(await item("Refunded: deposit returned", ev));
    for (const ev of flagged.filter((e) => e.args.keyId === r.keyId)) history.push(await item(`Device flagged (${REASONS[Number(ev.args.reason)]})`, ev));
    history.sort((x, y) => x.block - y.block);
    keys.push({ ...r, accusations: mine, history });
  }
  return { photoHash, keys };
}
