// Paprika client library: every on-chain action of the demo, for the CLI (Node) and the web UI (browser).
//
// It talks to a LOCAL Hardhat node over JSON-RPC with ethers 6 and sends transactions from Hardhat's default
// unlocked accounts (eth_sendTransaction: the node holds the keys, this code holds none). Roles:
//   operator = account 0 (deployer; also plays UMA's vote on the mock oracle), photographer = 1, accuser = 2.
// The contract addresses, parameters and ABIs come from the deployment JSON written by
// contract/scripts/deploy-local.js (copied to app/web/deployment.json for the browser).
//
// In the browser, "ethers" is resolved through an import map; device.js has no dependencies.
// Every function throws an Error whose message is the contract's revert reason when a transaction reverts.

import { ethers } from "ethers";
import { captureMessage, registerMessage, revokeMessage, sha256, toHex, utf8 } from "./device.js";

// Hardhat's well-known default accounts 0..2 (mnemonic "test test ... junk"); used only if the deployment JSON
// does not list the accounts it minted to. They are public test accounts, not secrets: we never use their keys.
const HARDHAT_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
];
const ROLES = ["operator", "photographer", "accuser"];
const STATES = ["none", "attested", "accused", "refunded", "fake"];          // Paprika.State
const DEVICE_STATUS = ["none", "active", "flagged"];                          // Paprika.Status
const REASONS = ["none", "fake-proven", "key-revoked"];                       // Paprika.Reason
const NUMERICAL_TRUE = 10n ** 18n;   // OOv3 reads price 1e18 as "the assertion is true", anything else as false

// ------------------------------------------------------------------ connection

/**
 * Connects to the node and the deployed contracts. Synchronous (no network call): awaiting it is harmless.
 * deployment = the parsed JSON written by the deploy script.
 */
export function connect({ rpcUrl = "http://127.0.0.1:8545", deployment }) {
  if (!deployment?.addresses?.paprika) throw new Error("deployment JSON is missing or has no Paprika address");
  const chainId = Number(deployment.chainId ?? 31337);
  // staticNetwork: skip chain detection calls; short polling interval: automine answers at once.
  // cacheTimeout -1: by default ethers shares identical requests for 250 ms, so a read right after a transaction
  // or after evm_mine could return the previous block. A demo must always show fresh state.
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, pollingInterval: 100, cacheTimeout: -1 });

  const minted = deployment.token?.mintedTo || [];
  const accounts = {};
  ROLES.forEach((role, i) => { accounts[role] = ethers.getAddress(minted[i] || HARDHAT_ACCOUNTS[i]); });
  const signers = {};
  for (const role of ROLES) signers[role] = new ethers.JsonRpcSigner(provider, accounts[role]);

  const a = deployment.addresses, abis = deployment.abis;
  const p = deployment.parameters;
  const ctx = {
    rpcUrl,
    chainId,
    deployment,
    provider,
    signers,
    accounts,
    addresses: { paprika: a.paprika, oo: a.oo, store: a.store, mockOracle: a.mockOracle, currency: a.currency },
    params: {
      bond: BigInt(p.BOND),
      photoWindow: Number(p.PHOTO_WINDOW),
      revealWindow: Number(p.REVEAL_WINDOW),
      feeShare: Number(BigInt(p.burnedBondPercentage ?? "500000000000000000")) / 1e18,   // UMA's burnedBondPercentage
      tokenSymbol: deployment.token?.symbol ?? "TOKEN",
      tokenDecimals: Number(deployment.token?.decimals ?? 18),
    },
    contracts: {
      paprika: new ethers.Contract(a.paprika, abis.Paprika, provider),
      token: new ethers.Contract(a.currency, abis.TestnetERC20, provider),
      oo: new ethers.Contract(a.oo, abis.OptimisticOracleV3, provider),
      mockOracle: new ethers.Contract(a.mockOracle, abis.MockOracleAncillary, provider),
    },
    activity: [],          // every transaction sent through this ctx, oldest first
    listeners: new Set(),  // onActivity callbacks
    blockTimes: new Map(), // block number -> timestamp cache
  };
  return ctx;
}

/** Registers a callback called with { blockNumber, txHash, call, from, role } after every transaction sent through ctx. Returns an unsubscribe function. */
export function onActivity(ctx, callback) {
  ctx.listeners.add(callback);
  return () => ctx.listeners.delete(callback);
}

// ------------------------------------------------------------------ errors and sending

// Turns an ethers / Hardhat error into the bare revert reason (e.g. "bad sig"), or the shortest useful message.
function revertReason(e) {
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

function signerOf(ctx, role) {
  const s = ctx.signers[role];
  if (!s) throw new Error(`unknown role "${role}" (use photographer, accuser or operator)`);
  return s;
}

// Sends one transaction from a role, waits for it to be mined, reports it to onActivity, returns the receipt.
// `label` is the human name of the call shown in the activity log, e.g. "Paprika.attest".
async function send(ctx, role, contract, method, args, label) {
  const signer = signerOf(ctx, role);
  let receipt;
  try {
    const tx = await contract.connect(signer)[method](...args);
    receipt = await tx.wait();
  } catch (e) {
    throw fail(e);
  }
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  const item = { blockNumber: receipt.blockNumber, txHash: receipt.hash, call: label, from: ctx.accounts[role], role };
  ctx.activity.push(item);
  for (const cb of ctx.listeners) {
    try { cb(item); } catch { /* a broken listener must not break the transaction flow */ }
  }
  return receipt;
}

// Read-only call with the same error translation.
async function read(promise) {
  try { return await promise; } catch (e) { throw fail(e); }
}

// Makes sure `role` has approved Paprika to pull at least one BOND; sends approve(BOND) if not.
async function ensureAllowance(ctx, role, txHashes) {
  const { token } = ctx.contracts;
  const have = await read(token.allowance(ctx.accounts[role], ctx.addresses.paprika));
  if (have >= ctx.params.bond) return;
  const r = await send(ctx, role, token, "approve", [ctx.addresses.paprika, ctx.params.bond], `${ctx.params.tokenSymbol}.approve`);
  txHashes.push(r.hash);
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

/** Token balances (bigint) of photographer, accuser, UMA Store and Paprika; also operator and the UMA oracle. Reads only. */
export async function balances(ctx) {
  const { token } = ctx.contracts;
  const who = {
    photographer: ctx.accounts.photographer, accuser: ctx.accounts.accuser, store: ctx.addresses.store,
    paprika: ctx.addresses.paprika, oo: ctx.addresses.oo, operator: ctx.accounts.operator,
  };
  const keys = Object.keys(who);
  const values = await read(Promise.all(keys.map((k) => token.balanceOf(who[k]))));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
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
  const events = await read(paprika.queryFilter(paprika.filters.Attested(), 0, "latest"));
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
  const owner = ctx.accounts[role] ?? signerOf(ctx, role);
  const msg = registerMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, owner });
  const sig = toHex(await device.sign(msg));
  const r = await send(ctx, role, ctx.contracts.paprika, "register", [device.x, device.y, sig], "Paprika.register");
  return { txHash: r.hash, keyId: device.keyId };
}

/**
 * Attests a photo with a deposit of BOND tokens paid by `role`.
 * Sends: token.approve (only if the allowance is too low), then Paprika.attest(photoHash, anchorBlock, keyId, sig).
 */
export async function attestPhoto(ctx, role, device, photoBytes) {
  signerOf(ctx, role);
  // The block hash is read FIRST, before the photo is hashed and signed: a block hash cannot be known in
  // advance, so a signature over it proves the photo was signed after block `anchorBlock`. The block that
  // records the attestation gives the upper bound. The contract checks blockhash(anchorBlock), which only
  // exists for the 256 most recent blocks, so the anchor must be recent.
  const anchor = await read(ctx.provider.getBlock("latest"));
  const photoHash = await sha256(asBytes(photoBytes));
  const msg = captureMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, photoHash, blockHash: anchor.hash });
  const sig = toHex(await device.sign(msg));
  const txHashes = [];
  await ensureAllowance(ctx, role, txHashes);
  const r = await send(ctx, role, ctx.contracts.paprika, "attest", [photoHash, anchor.number, device.keyId, sig], "Paprika.attest");
  txHashes.push(r.hash);
  return { txHashes, photoHash, keyId: device.keyId, anchorBlock: anchor.number };
}

/**
 * Revokes a device key: the device signs revokeMessage naming the role's account; sends Paprika.revokeKey.
 * The device becomes Flagged (reason key-revoked). No money moves.
 */
export async function revokeKey(ctx, role, device) {
  const caller = ctx.accounts[role] ?? signerOf(ctx, role);
  const msg = revokeMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, caller });
  const sig = toHex(await device.sign(msg));
  const r = await send(ctx, role, ctx.contracts.paprika, "revokeKey", [device.keyId, sig], "Paprika.revokeKey");
  return { txHash: r.hash };
}

// ------------------------------------------------------------------ accusation

/**
 * Step 1 of an accusation. Only a hash goes on chain, so nobody can tell which photo is accused:
 * commitment = keccak256(abi.encode(claimant, photoHash, keyId, evidenceHash, salt)), with a random salt.
 * Sends: token.approve (if needed), then Paprika.commitClaim(commitment), which pulls BOND from `role`.
 * KEEP the returned salt and evidenceHash: the reveal needs them.
 */
export async function commitAccusation(ctx, role, { photoHash, keyId, evidence }) {
  const claimant = ctx.accounts[role] ?? signerOf(ctx, role);
  const evidenceHash = await sha256(utf8(String(evidence ?? "")));
  const salt = ethers.hexlify(ethers.randomBytes(32));
  // abi.encode (NOT encodePacked): each value padded to 32 bytes, the address first.
  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes32", "bytes32", "bytes32"], [claimant, photoHash, keyId, evidenceHash, salt]));
  const txHashes = [];
  await ensureAllowance(ctx, role, txHashes);
  const r = await send(ctx, role, ctx.contracts.paprika, "commitClaim", [commitment], "Paprika.commitClaim");
  txHashes.push(r.hash);
  return { txHashes, commitment, salt, evidenceHash };
}

/**
 * Step 2: reveals the commitment (at least one block after the commit; under automine every transaction is its
 * own block, so any later call works). Sends Paprika.revealClaim, which asserts the accusation at UMA's
 * Optimistic Oracle V3 with the accuser's bond and disputes it at once with the photo's deposit: UMA's vote
 * decides. Returns the UMA assertionId (ZeroHash if the photo was already proven fake: the bond is credited back).
 */
export async function revealAccusation(ctx, role, { photoHash, keyId, evidenceHash, salt }) {
  const { paprika } = ctx.contracts;
  const r = await send(ctx, role, paprika, "revealClaim", [photoHash, keyId, evidenceHash, salt], "Paprika.revealClaim");
  let assertionId = ethers.ZeroHash;
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ctx.addresses.paprika.toLowerCase()) continue;
    const parsed = paprika.interface.parseLog(log);
    if (parsed?.name === "AccusationOpened") assertionId = parsed.args.assertionId;
  }
  return { txHash: r.hash, assertionId };
}

/**
 * THE SIMULATED VOTE. On a real network UMA token holders vote (DVM). Locally, UMA's MockOracleAncillary stands in
 * for the DVM: when Paprika disputed the assertion, OOv3 called mockOracle.requestPrice(identifier, assertionTime,
 * stampAssertion(assertionId)). We rebuild that exact triple from OOv3's own views, push the "vote result" for it
 * (1e18 = the accusation is true = fake proven; 0 = rejected), then call OOv3.settleAssertion. UMA pays the winner
 * (via Paprika's callback) and sends its fee to the Store. Both transactions are sent by the operator account.
 */
export async function umaVote(ctx, assertionId, fakeProven) {
  const { oo, mockOracle } = ctx.contracts;
  const a = await read(oo.getAssertion(assertionId));
  if (a.asserter === ethers.ZeroAddress) throw new Error("unknown assertion id");
  if (a.settled) throw new Error("assertion already settled");
  if (a.disputer === ethers.ZeroAddress) throw new Error("assertion is not disputed");
  const identifier = a.identifier;
  const time = a.assertionTime;
  const ancillaryData = await read(oo.stampAssertion(assertionId));
  const pending = await read(mockOracle.getPendingQueries());
  const match = pending.find((q) => q.identifier === identifier && q.time === time && q.ancillaryData === ancillaryData);
  if (!match) throw new Error("no pending vote for this assertion on UMA's mock oracle");
  const price = fakeProven ? NUMERICAL_TRUE : 0n;
  const txHashes = [];
  const r1 = await send(ctx, "operator", mockOracle, "pushPrice", [identifier, time, ancillaryData, price], "UMA MockOracle.pushPrice (simulated vote)");
  txHashes.push(r1.hash);
  const r2 = await send(ctx, "operator", oo, "settleAssertion", [assertionId], "UMA OOv3.settleAssertion");
  txHashes.push(r2.hash);
  return { txHashes };
}

// ------------------------------------------------------------------ money

/** Credits the deposit back to the depositor once the photo can no longer be accused. Sends Paprika.refund (anyone may call it). */
export async function refund(ctx, role, { photoHash, keyId }) {
  const r = await send(ctx, role, ctx.contracts.paprika, "refund", [photoHash, keyId], "Paprika.refund");
  return { txHash: r.hash };
}

/** Moves all credit of `role` from Paprika to its wallet. Sends Paprika.withdrawCredit. Reverts "no credit" if zero. */
export async function withdrawCredit(ctx, role) {
  const { paprika } = ctx.contracts;
  const r = await send(ctx, role, paprika, "withdrawCredit", [], "Paprika.withdrawCredit");
  let amount = 0n;
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ctx.addresses.paprika.toLowerCase()) continue;
    const parsed = paprika.interface.parseLog(log);
    if (parsed?.name === "CreditWithdrawn") amount = parsed.args.amount;
  }
  return { txHash: r.hash, amount };
}

// ------------------------------------------------------------------ demo control

/** Local-chain demo control: moves the chain clock forward (evm_increaseTime) and mines one block (evm_mine). */
export async function advanceTime(ctx, seconds) {
  try {
    await ctx.provider.send("evm_increaseTime", [Math.max(0, Math.floor(Number(seconds)))]);
    await ctx.provider.send("evm_mine", []);
  } catch (e) {
    throw fail(e);
  }
  const { timestamp } = await chainInfo(ctx);
  return { timestamp };
}
