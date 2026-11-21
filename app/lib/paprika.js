// Paprika client library: every on-chain action of the demo, for the CLI (Node) and the web UI (browser).
//
// It talks to a LOCAL Hardhat node over JSON-RPC with ethers 6 and sends transactions from Hardhat's default
// unlocked accounts (eth_sendTransaction: the node holds the keys, this code holds none). Roles:
//   operator = account 0 (deployer; settles UMA assertions), photographer = 1, accuser = 2,
//   voters = accounts 3, 4, 5 (they hold staked UMA voting tokens and vote in UMA's VotingV2).
// Deposits and bonds are in WETH (UMA's WETH9): the roles hold ETH and wrap exactly what they need.
// The contract addresses, parameters, RPC URL and ABIs come from the deployment JSON written by
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
const DVM_STATUS = ["NotRequested", "Active", "Resolved", "Future", "ToDelete"];   // VotingV2 RequestStatus

// ------------------------------------------------------------------ connection

/**
 * Connects to the node and the deployed contracts. Synchronous (no network call): awaiting it is harmless.
 * deployment = the parsed JSON written by the deploy script.
 */
export function connect({ rpcUrl, deployment }) {
  if (!deployment?.addresses?.paprika) throw new Error("deployment JSON is missing or has no Paprika address");
  rpcUrl = rpcUrl || deployment.rpcUrl || "http://127.0.0.1:8545";
  const chainId = Number(deployment.chainId ?? 31337);
  // staticNetwork: skip chain detection calls; short polling interval: automine answers at once.
  // cacheTimeout -1: by default ethers shares identical requests for 250 ms, so a read right after a transaction
  // or after evm_mine could return the previous block. A demo must always show fresh state.
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, pollingInterval: 100, cacheTimeout: -1 });

  const known = deployment.accounts || {};
  const minted = deployment.token?.mintedTo || [];
  const accounts = {};
  ROLES.forEach((role, i) => { accounts[role] = ethers.getAddress(known[role] || minted[i] || HARDHAT_ACCOUNTS[i]); });
  const signers = {};
  for (const role of ROLES) signers[role] = new ethers.JsonRpcSigner(provider, accounts[role]);
  // UMA voters (accounts 3-5): unlocked on the node like the roles; they only sign commitVote / revealVote.
  const voters = (deployment.voters || []).map((address, i) => ({
    label: `voter${i + 1}`, address: ethers.getAddress(address), signer: new ethers.JsonRpcSigner(provider, address),
  }));

  const a = deployment.addresses, abis = deployment.abis;
  const p = deployment.parameters;
  const ctx = {
    rpcUrl,
    chainId,
    deployment,
    provider,
    signers,
    accounts,
    voters,
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

// Sends one transaction, waits for it to be mined, reports it to onActivity, returns the receipt.
// `who` is a role name or a voter { label, address, signer }. `label` is the call shown in the activity log,
// e.g. "Paprika.attest". `overrides` (optional) carries e.g. { value } for payable calls.
async function send(ctx, who, contract, method, args, label, overrides) {
  const voter = typeof who === "object" ? who : null;
  const signer = voter ? voter.signer : signerOf(ctx, who);
  const role = voter ? voter.label : who;
  const from = voter ? voter.address : ctx.accounts[who];
  let receipt;
  try {
    const tx = await contract.connect(signer)[method](...args, ...(overrides ? [overrides] : []));
    receipt = await tx.wait();
  } catch (e) {
    throw fail(e);
  }
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  const item = { blockNumber: receipt.blockNumber, txHash: receipt.hash, call: label, from, role };
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

// Makes sure `role` can pay one BOND to Paprika: wraps exactly the missing amount of ETH into WETH
// (WETH9.deposit{value}) and sends approve(BOND) if the allowance is too low. Pushes the tx hashes it sent.
async function ensureFunds(ctx, role, txHashes) {
  const { token } = ctx.contracts;
  const held = await read(token.balanceOf(ctx.accounts[role]));
  if (held < ctx.params.bond) {
    const r = await send(ctx, role, token, "deposit", [], `${ctx.params.tokenSymbol}.deposit (wrap ETH)`, { value: ctx.params.bond - held });
    txHashes.push(r.hash);
  }
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

/**
 * WETH balances (bigint) of photographer, accuser, UMA Store and Paprika; also operator and UMA's oracle (oo, which
 * holds both bonds during a vote). `eth` = native ETH balances of the three roles (they pay gas in ETH). Reads only.
 */
export async function balances(ctx) {
  const { token } = ctx.contracts;
  const who = {
    photographer: ctx.accounts.photographer, accuser: ctx.accounts.accuser, store: ctx.addresses.store,
    paprika: ctx.addresses.paprika, oo: ctx.addresses.oo, operator: ctx.accounts.operator,
  };
  const keys = Object.keys(who);
  const values = await read(Promise.all(keys.map((k) => token.balanceOf(who[k]))));
  const out = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  const eth = await read(Promise.all(ROLES.map((r) => ctx.provider.getBalance(ctx.accounts[r]))));
  out.eth = Object.fromEntries(ROLES.map((r, i) => [r, eth[i]]));
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
 * Attests a photo with a deposit of BOND (WETH) paid by `role`.
 * Sends: WETH.deposit (wraps only the missing ETH), WETH.approve (only if needed), then
 * Paprika.attest(photoHash, anchorBlock, keyId, sig). txHashes lists them in order.
 */
export async function attestPhoto(ctx, role, device, photoBytes) {
  signerOf(ctx, role);
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
  await ensureFunds(ctx, role, txHashes);
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
  const d = await read(ctx.contracts.paprika.devices(device.keyId));
  if (Number(d.status) === 0) throw new Error("this device key is not registered on this chain");
  if (Number(d.status) === 2) throw new Error(`this key is already flagged (${REASONS[Number(d.reason)]}): nothing to revoke`);
  const msg = revokeMessage({ chainId: ctx.chainId, contract: ctx.addresses.paprika, keyId: device.keyId, caller });
  const sig = toHex(await device.sign(msg));
  const r = await send(ctx, role, ctx.contracts.paprika, "revokeKey", [device.keyId, sig], "Paprika.revokeKey");
  return { txHash: r.hash };
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
 * Returns { txHashes, commitment, salt, evidenceHash, warning (string or null) }.
 */
export async function commitAccusation(ctx, role, { photoHash, keyId, evidence }) {
  const claimant = ctx.accounts[role] ?? signerOf(ctx, role);
  if (!String(evidence ?? "").trim()) throw new Error("evidence is required (a text or a URL that shows the photo is not genuine)");
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
  const evidenceHash = await sha256(utf8(String(evidence)));
  const salt = ethers.hexlify(ethers.randomBytes(32));
  // abi.encode (NOT encodePacked): each value padded to 32 bytes, the address first.
  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes32", "bytes32", "bytes32"], [claimant, photoHash, keyId, evidenceHash, salt]));
  const txHashes = [];
  await ensureFunds(ctx, role, txHashes);
  const r = await send(ctx, role, ctx.contracts.paprika, "commitClaim", [commitment], "Paprika.commitClaim");
  txHashes.push(r.hash);
  return { txHashes, commitment, salt, evidenceHash, warning };
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
    paprika.queryFilter(paprika.filters.AccusationOpened(), 0, "latest"),
    paprika.queryFilter(paprika.filters.AccusationResolved(), 0, "latest"),
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
    const evs = await read(voting.queryFilter(voting.filters.VoteCommitted(null, null, null, identifier), 0, "latest"));
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
  if ((await read(paprika.credits(ctx.accounts[role] ?? signerOf(ctx, role)))) === 0n) throw new Error(`no credit to withdraw for the ${role}`);
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
  const value = amount === undefined || amount === null ? await read(ctx.contracts.token.balanceOf(ctx.accounts[role])) : BigInt(amount);
  if (value <= 0n) throw new Error("no WETH to unwrap");
  const held = await read(ctx.contracts.token.balanceOf(ctx.accounts[role]));
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
