#!/usr/bin/env node
// Paprika command-line tool: drives the protocol on the local chain from a terminal, one step per command,
// and `demo` runs the whole story of impl/mock/DEMO.md end to end with assertions (the back-end smoke check).
//
//   node cli.js <command> [args]          (see `node cli.js help`)
//
// State kept between commands (device key, last commitment and salt, last UMA assertion id) lives in
// app/.state/ (git-ignored). It is reset automatically when the Paprika address changes (new deployment).
// Environment: RPC_URL (default http://127.0.0.1:8545), PAPRIKA_DEPLOYMENT (path of the deployment JSON).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDevice, exportDevice, importDevice, sha256 } from "./lib/device.js";
import {
  advanceTime, attestPhoto, balances, chainInfo, commitAccusation, connect, credits, formatToken, listRecords,
  onActivity, refund, registerDevice, revealAccusation, revokeKey, umaVote, verifyPhoto, withdrawCredit,
} from "./lib/paprika.js";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(APP_DIR, ".state");
const STATE_FILE = path.join(STATE_DIR, "cli-state.json");
const DEVICE_FILE = path.join(STATE_DIR, "device.json");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYMENT_CANDIDATES = [
  process.env.PAPRIKA_DEPLOYMENT,
  path.join(APP_DIR, "..", "contract", "deployments", "local.json"),
  path.join(APP_DIR, "web", "deployment.json"),
].filter(Boolean);

const HELP = `Paprika CLI (local chain only)

  status                                   chain, contracts, parameters, saved device, balances
  register                                 create a device key (app/.state/device.json) and register it (photographer)
  attest <file>                            photographer attests <file> with the saved device, deposit B
  verify <file>                            show every record of <file>
  accuse-commit <file> --evidence "<text>" accuser commits an accusation (bond B); --key <keyId> to choose the device
  accuse-reveal                            accuser reveals the last commitment: UMA assertion + dispute
  vote <true|false>                        simulated UMA vote on the last assertion (true = fake proven) and settle
  refund <file>                            refund the deposit of <file> (after the challenge period)
  withdraw <photographer|accuser|operator> withdraw the role's credit from Paprika
  revoke                                   revoke the saved device key (photographer)
  advance <seconds>                        move the chain clock forward (demo control)
  balances                                 token balances and credits
  demo                                     run the whole demo story with checks (exit code 1 on any mismatch)
`;

// ------------------------------------------------------------------ setup and state

function loadDeployment() {
  for (const file of DEPLOYMENT_CANDIDATES) {
    if (fs.existsSync(file)) return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  throw new Error("no deployment JSON found: run `npm run deploy` first");
}

// Identity of "this chain + this deployment": the Paprika address alone is not enough, because a fresh Hardhat
// chain deploys to the same addresses; the hash of block 1 changes with every new chain (it includes a timestamp).
async function deploymentId(ctx) {
  let b1;
  try { b1 = await ctx.provider.getBlock(1); } catch { throw new Error(`cannot reach the local chain at ${ctx.rpcUrl}: run \`npm run chain\` (or \`npm start\`)`); }
  return `${ctx.addresses.paprika}@${b1 ? b1.hash : "none"}`;
}

function loadState(id) {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { /* first run */ }
  if (s.deployment !== id) {
    // New deployment (or new chain): earlier device registration and accusations do not exist there.
    s = { deployment: id };
    fs.rmSync(DEVICE_FILE, { force: true });
  }
  return s;
}
function saveState(s) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
async function loadDevice() {
  if (!fs.existsSync(DEVICE_FILE)) throw new Error("no device yet: run `node cli.js register`");
  return importDevice(fs.readFileSync(DEVICE_FILE, "utf8"));
}

function readFile(file) {
  if (!file) throw new Error("missing <file>");
  return new Uint8Array(fs.readFileSync(file));
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

const short = (h) => (h ? `${h.slice(0, 10)}...${h.slice(-6)}` : "-");
const when = (t) => (t ? new Date(t * 1000).toISOString().replace(".000Z", "Z") : "-");

// ------------------------------------------------------------------ money printing

// Snapshot of token balances and credits, to print "the money that moved" after a command.
async function money(ctx) {
  const b = await balances(ctx);
  const c = {
    "credit photographer": await credits(ctx, ctx.accounts.photographer),
    "credit accuser": await credits(ctx, ctx.accounts.accuser),
  };
  return {
    photographer: b.photographer, accuser: b.accuser, "UMA Store": b.store, Paprika: b.paprika, "UMA OOv3": b.oo, ...c,
  };
}
function diff(before, after) {
  const out = {};
  for (const k of Object.keys(after)) if (after[k] !== before[k]) out[k] = after[k] - before[k];
  return out;
}
function printMoved(ctx, d) {
  const entries = Object.entries(d);
  if (!entries.length) { console.log("  money moved: none"); return; }
  console.log("  money moved:");
  for (const [k, v] of entries) console.log(`    ${k.padEnd(20)} ${v > 0n ? "+" : "-"}${formatToken(ctx, v < 0n ? -v : v)}`);
}

function printRecord(ctx, r) {
  console.log(`  record  photo ${short(r.photoHash)}  key ${short(r.keyId)}`);
  console.log(`    state            ${r.state}`);
  console.log(`    signed between   block ${r.anchorBlock} and block ${r.recordedBlock} (recorded ${when(r.recordedAt)})`);
  console.log(`    depositor        ${r.depositor}`);
  console.log(`    deposit locked   ${formatToken(ctx, r.depositLocked)}`);
  console.log(`    accusable until  ${when(r.accusableUntil)}   refundable at ${when(r.refundableAt)}`);
  console.log(`    device           ${r.device.status}${r.device.status === "flagged" ? ` at block ${r.device.flaggedAtBlock} (${r.device.reason}); record ${r.recordedBeforeFlag ? "predates" : "follows"} the flag` : ""}`);
}

// ------------------------------------------------------------------ commands

// Each command gets (ctx, args, state) and returns nothing; transactions are printed by the activity hook.
const commands = {
  async status(ctx, _args, state) {
    const info = await chainInfo(ctx);
    const p = ctx.params;
    console.log(`chain      id ${info.chainId}, block ${info.blockNumber}, time ${when(info.timestamp)}  (${ctx.rpcUrl})`);
    for (const [k, v] of Object.entries(ctx.addresses)) console.log(`${k.padEnd(11)}${v}`);
    console.log(`params     B = ${formatToken(ctx, p.bond)}, challenge period ${p.photoWindow} s, reveal period ${p.revealWindow} s, UMA fee share ${p.feeShare}`);
    for (const [k, v] of Object.entries(ctx.accounts)) console.log(`${k.padEnd(13)}${v}`);
    console.log(`device     ${fs.existsSync(DEVICE_FILE) ? (await loadDevice()).keyId : "none (run register)"}`);
    if (state.lastCommit) console.log(`last commitment ${state.lastCommit.commitment}`);
    if (state.lastAssertion) console.log(`last assertion  ${state.lastAssertion}`);
    await commands.balances(ctx);
  },

  async register(ctx, _args, state) {
    const device = await createDevice();
    const r = await registerDevice(ctx, "photographer", device);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(DEVICE_FILE, JSON.stringify(await exportDevice(device), null, 2));
    state.keyId = r.keyId;
    console.log(`Device registered for free. keyId ${r.keyId} (saved in app/.state/device.json)`);
  },

  async attest(ctx, args, state) {
    const device = await loadDevice();
    const r = await attestPhoto(ctx, "photographer", device, readFile(args[0]));
    state.lastPhoto = r.photoHash;
    console.log(`Photo attested. photoHash ${r.photoHash}, anchor block ${r.anchorBlock}, deposit ${formatToken(ctx, ctx.params.bond)} locked.`);
  },

  async verify(ctx, args) {
    const hash = await sha256(readFile(args[0]));
    const recs = await verifyPhoto(ctx, hash);
    if (!recs.length) { console.log(`No record for photo ${hash}: this exact file was never attested.`); return; }
    console.log(`Photo ${hash}: ${recs.length} record(s).`);
    for (const r of recs) printRecord(ctx, r);
  },

  async "accuse-commit"(ctx, args, state) {
    const evidence = option(args, "--evidence") ?? "";
    let keyId = option(args, "--key");
    const photoHash = await sha256(readFile(args[0]));
    if (!keyId) {
      const recs = await verifyPhoto(ctx, photoHash);
      if (!recs.length) throw new Error("this photo has no record; nothing to accuse");
      keyId = recs[0].keyId;
    }
    const r = await commitAccusation(ctx, "accuser", { photoHash, keyId, evidence });
    state.lastCommit = { photoHash, keyId, evidenceHash: r.evidenceHash, salt: r.salt, commitment: r.commitment };
    console.log(`Accusation committed: only the hash ${r.commitment} is on chain. Bond ${formatToken(ctx, ctx.params.bond)}.`);
    console.log(`  salt and evidence hash saved in app/.state/ for the reveal.`);
  },

  async "accuse-reveal"(ctx, _args, state) {
    if (!state.lastCommit) throw new Error("no commitment saved: run accuse-commit first");
    const r = await revealAccusation(ctx, "accuser", state.lastCommit);
    delete state.lastCommit;
    if (/^0x0+$/.test(r.assertionId)) { console.log("Photo already proven fake: no new accusation, the bond is credited back."); return; }
    state.lastAssertion = r.assertionId;
    console.log(`Accusation revealed, asserted to UMA and disputed with the photo's deposit. assertionId ${r.assertionId}`);
  },

  async vote(ctx, args, state) {
    if (!["true", "false"].includes(args[0])) throw new Error("usage: vote <true|false>   (true = the evidence proves the fake)");
    if (!state.lastAssertion) throw new Error("no assertion saved: run accuse-reveal first");
    await umaVote(ctx, state.lastAssertion, args[0] === "true");
    console.log(`Simulated UMA vote: ${args[0] === "true" ? "fake PROVEN (accuser wins)" : "accusation REJECTED (depositor wins)"}; assertion settled.`);
    delete state.lastAssertion;
  },

  async refund(ctx, args, state) {
    const photoHash = await sha256(readFile(args[0]));
    const recs = (await verifyPhoto(ctx, photoHash)).filter((r) => r.state === "attested");
    if (!recs.length) throw new Error("no attested record of this photo to refund");
    for (const r of recs) {
      await refund(ctx, "photographer", { photoHash, keyId: r.keyId });
      console.log(`Deposit refunded (credited to ${r.depositor}) for key ${short(r.keyId)}.`);
    }
  },

  async withdraw(ctx, args) {
    const role = args[0];
    if (!["photographer", "accuser", "operator"].includes(role)) throw new Error("usage: withdraw <photographer|accuser|operator>");
    const r = await withdrawCredit(ctx, role);
    console.log(`Withdrew ${formatToken(ctx, r.amount)} to the ${role}.`);
  },

  async revoke(ctx) {
    const device = await loadDevice();
    await revokeKey(ctx, "photographer", device);
    console.log(`Key ${device.keyId} revoked: device flagged, no money moved.`);
  },

  async advance(ctx, args) {
    const s = Number(args[0]);
    if (!Number.isFinite(s) || s < 0) throw new Error("usage: advance <seconds>");
    const r = await advanceTime(ctx, s);
    console.log(`Chain clock moved forward ${s} s. Now ${when(r.timestamp)}.`);
  },

  async balances(ctx) {
    const m = await money(ctx);
    for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(20)} ${formatToken(ctx, v)}`);
  },

  demo: (ctx) => runDemo(ctx),
};

// Commands whose printed output already includes everything; others print the money that moved.
const NO_MONEY = new Set(["status", "verify", "balances", "advance", "demo", "help"]);

// ------------------------------------------------------------------ demo (smoke check)

// Runs the click path of impl/mock/DEMO.md, plus the optional "fake proven" and "revoke key" endings.
// Each step prints what happened and checks the expected outcome; any mismatch exits with code 1.
async function runDemo(ctx) {
  const B = ctx.params.bond;
  const fee = (B * BigInt(Math.round(ctx.params.feeShare * 1e6))) / 1_000_000n;   // f x B, what UMA keeps
  const results = [];
  let current = "";
  const check = (cond, what) => {
    if (!cond) throw new Error(`step "${current}": expected ${what}`);
  };
  async function step(name, fn) {
    current = name;
    console.log(`\n== ${name}`);
    const before = await money(ctx);
    try {
      await fn(before);
      results.push([name, "PASS"]);
      console.log(`   PASS`);
    } catch (e) {
      results.push([name, `FAIL: ${e.message}`]);
      console.log(`   FAIL: ${e.message}`);
      throw e;
    }
  }
  const moved = async (before) => { const d = diff(before, await money(ctx)); printMoved(ctx, d); return d; };
  const randomPhoto = () => crypto.getRandomValues(new Uint8Array(4096));   // stands in for a JPEG

  console.log(`Demo on chain ${ctx.chainId}: B = ${formatToken(ctx, B)}, f = ${ctx.params.feeShare}, challenge period ${ctx.params.photoWindow} s, reveal period ${ctx.params.revealWindow} s`);
  const txCountAtStart = ctx.activity.length;
  const deviceA = await createDevice();
  const photo1 = randomPhoto();
  let photo1Hash, assertion1;

  try {
    await step("1. Device -> Register (free)", async (before) => {
      const r = await registerDevice(ctx, "photographer", deviceA);
      console.log(`   keyId ${r.keyId}`);
      const d = await moved(before);
      check(Object.keys(d).length === 0, "no money to move");
      check(r.keyId === deviceA.keyId, "keyId = sha256(x || y) as computed by the contract");
    });

    await step("2. Capture -> sign & submit (deposit B)", async (before) => {
      const r = await attestPhoto(ctx, "photographer", deviceA, photo1);
      photo1Hash = r.photoHash;
      console.log(`   photoHash ${r.photoHash}, anchor block ${r.anchorBlock}, ${r.txHashes.length} tx`);
      const d = await moved(before);
      check(d.photographer === -B, "photographer -B");
      check(d.Paprika === B, "Paprika +B");
    });

    await step("3. Verify this photo", async () => {
      const recs = await verifyPhoto(ctx, photo1);
      for (const r of recs) printRecord(ctx, r);
      check(recs.length === 1, "one record");
      check(recs[0].state === "attested" && recs[0].depositLocked === B, "state attested with B locked");
      check(recs[0].device.status === "active" && recs[0].anchorBlock < recs[0].recordedBlock, "active device, anchor before record");
      console.log("   A registered device signed this exact file between block", recs[0].anchorBlock, "and block", recs[0].recordedBlock, "and a deposit was at stake.");
    });

    await step("4. Negative case 1: one pixel changed", async () => {
      const changed = photo1.slice();
      changed[100] ^= 1;
      const recs = await verifyPhoto(ctx, changed);
      console.log(`   ${recs.length} record(s) for the changed file`);
      check(recs.length === 0, "no record");
    });

    let commit1;
    await step("5. Accuse -> Commit (bond B, only a hash on chain)", async (before) => {
      commit1 = await commitAccusation(ctx, "accuser", { photoHash: photo1Hash, keyId: deviceA.keyId, evidence: "https://example.org/evidence-that-does-not-prove-it" });
      commit1 = { ...commit1, photoHash: photo1Hash, keyId: deviceA.keyId };
      console.log(`   commitment ${commit1.commitment}`);
      const d = await moved(before);
      check(d.accuser === -B && d.Paprika === B, "accuser -B, Paprika +B");
    });

    await step("6. Reveal -> UMA assertion, disputed at once", async (before) => {
      const r = await revealAccusation(ctx, "accuser", commit1);
      assertion1 = r.assertionId;
      console.log(`   assertionId ${r.assertionId}`);
      const d = await moved(before);
      check(!/^0x0+$/.test(r.assertionId), "a UMA assertion id");
      check(d["UMA OOv3"] === 2n * B && d.Paprika === -2n * B, "both bonds (2B) held by UMA's OOv3");
      const [rec] = await verifyPhoto(ctx, photo1Hash);
      check(rec.state === "accused", "state accused");
    });

    await step("7. Negative case 2: vote 'evidence does not prove it' (simulated)", async (before) => {
      await umaVote(ctx, assertion1, false);
      const w = await withdrawCredit(ctx, "photographer");
      console.log(`   photographer withdrew ${formatToken(ctx, w.amount)}`);
      const d = await moved(before);
      check(d["UMA Store"] === fee, "UMA Store +f x B");
      check(d.photographer === B - fee, "depositor +(B - f x B)");
      check(d["UMA OOv3"] === -2n * B, "UMA released both bonds");
      const [rec] = await verifyPhoto(ctx, photo1Hash);
      check(rec.state === "attested" && rec.depositLocked === B, "photo back to attested, deposit still locked");
      console.log(`   accuser net over steps 5-7: -${formatToken(ctx, B)}`);
    });

    await step("8. Advance time by one challenge period -> Refund", async (before) => {
      const [rec] = await verifyPhoto(ctx, photo1Hash);
      let early = null;
      try { await refund(ctx, "photographer", { photoHash: photo1Hash, keyId: deviceA.keyId }); } catch (e) { early = e.message; }
      console.log(`   refund before the period ends -> error "${early}"`);
      check(early === "too early", 'revert reason "too early"');
      const now = (await chainInfo(ctx)).timestamp;
      const secs = Math.max(ctx.params.photoWindow, rec.refundableAt - now);
      const t = await advanceTime(ctx, secs);
      console.log(`   advanced ${secs} s, now ${when(t.timestamp)} (refundable at ${when(rec.refundableAt)})`);
      await refund(ctx, "photographer", { photoHash: photo1Hash, keyId: deviceA.keyId });
      await withdrawCredit(ctx, "photographer");
      const d = await moved(before);
      check(d.photographer === B && d.Paprika === -B, "photographer +B back");
      const [after] = await verifyPhoto(ctx, photo1Hash);
      check(after.state === "refunded" && after.depositLocked === 0n, "record stays, state refunded");
    });

    await step("9. Activity log", async () => {
      const log = ctx.activity.slice(txCountAtStart);
      for (const a of log) console.log(`   block ${String(a.blockNumber).padStart(4)}  ${a.txHash}  ${a.role.padEnd(12)} ${a.call}`);
      check(log.length > 0 && log.every((a) => /^0x[0-9a-f]{64}$/.test(a.txHash)), "every step is a transaction with a hash");
    });

    // ---------------------------------------------- optional endings
    const photo2 = randomPhoto();
    let photo2Hash, assertion2;
    await step("10. Optional: evidence PROVES the fake", async (before) => {
      const a = await attestPhoto(ctx, "photographer", deviceA, photo2);
      photo2Hash = a.photoHash;
      const c = await commitAccusation(ctx, "accuser", { photoHash: photo2Hash, keyId: deviceA.keyId, evidence: "The original, published before the anchor block: https://example.org/original.jpg" });
      const r = await revealAccusation(ctx, "accuser", { ...c, photoHash: photo2Hash, keyId: deviceA.keyId });
      assertion2 = r.assertionId;
      await umaVote(ctx, assertion2, true);
      const w = await withdrawCredit(ctx, "accuser");
      console.log(`   accuser withdrew ${formatToken(ctx, w.amount)}`);
      const d = await moved(before);
      check(w.amount === 2n * B - fee, "accuser payout B + (B - f x B)");
      check(d.accuser === B - fee, "accuser net +(B - f x B)");
      check(d.photographer === -B, "photographer lost the deposit B");
      check(d["UMA Store"] === fee, "UMA Store +f x B");
      const [rec2] = await verifyPhoto(ctx, photo2Hash);
      printRecord(ctx, rec2);
      check(rec2.state === "fake" && rec2.device.status === "flagged" && rec2.device.reason === "fake-proven", "photo fake, device flagged (fake-proven)");
      const [rec1] = await verifyPhoto(ctx, photo1Hash);
      check(rec1.state === "refunded" && rec1.recordedBeforeFlag, "earlier record still listed, predates the flag");
      const all = await listRecords(ctx);
      check(all.some((r) => r.photoHash === photo1Hash) && all.some((r) => r.photoHash === photo2Hash), "both records in listRecords");
      let err = null;
      try { await attestPhoto(ctx, "photographer", deviceA, randomPhoto()); } catch (e) { err = e.message; }
      console.log(`   flagged device tries to attest again -> error "${err}"`);
      check(err === "not active", 'revert reason "not active"');
    });

    await step("11. Optional: revoke key (no money moves)", async (before) => {
      const deviceB = await createDevice();
      await registerDevice(ctx, "photographer", deviceB);
      await revokeKey(ctx, "photographer", deviceB);
      const d = await moved(before);
      check(Object.keys(d).length === 0, "no money to move");
      let err = null;
      try { await registerDevice(ctx, "photographer", deviceB); } catch (e) { err = e.message; }
      console.log(`   re-register the revoked key -> error "${err}"`);
      check(err === "key used", 'revert reason "key used"');
      // The revoke is checked through a record-less device status: attest with it must fail.
      let err2 = null;
      try { await attestPhoto(ctx, "photographer", deviceB, randomPhoto()); } catch (e) { err2 = e.message; }
      check(err2 === "not active", "revoked device cannot attest");
    });
  } finally {
    console.log("\n== Summary");
    for (const [name, res] of results) console.log(`   ${res.startsWith("PASS") ? "PASS" : "FAIL"}  ${name}${res.startsWith("FAIL") ? `  (${res.slice(6)})` : ""}`);
  }
  console.log(`\nDemo passed: ${results.length} steps.`);
}

// ------------------------------------------------------------------ main

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || !commands[cmd]) {
    console.log(HELP);
    process.exit(cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0);
  }
  const { deployment } = loadDeployment();
  const ctx = connect({ rpcUrl: RPC_URL, deployment });
  const state = loadState(await deploymentId(ctx));
  onActivity(ctx, (a) => { if (cmd !== "demo") console.log(`  tx ${a.txHash}  block ${a.blockNumber}  ${a.role}: ${a.call}`); });
  const before = NO_MONEY.has(cmd) ? null : await money(ctx);
  try {
    await commands[cmd](ctx, args, state);
  } finally {
    saveState(state);
  }
  if (before) printMoved(ctx, diff(before, await money(ctx)));
}

main().then(
  () => process.exit(0),
  (e) => { console.error(`Error: ${e.message}`); process.exit(1); },
);
