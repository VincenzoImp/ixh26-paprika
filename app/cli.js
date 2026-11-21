#!/usr/bin/env node
// Paprika command-line tool: drives the protocol on the local chain from a terminal, one step per command,
// and `demo` runs the whole demo story (docs/demo.md) end to end with assertions (the back-end smoke check).
//
//   node cli.js <command> [args]          (see `node cli.js help`)
//
// State kept between commands (device key, pending commitments with their salts, last UMA assertion id) lives in
// app/.state/cli/<id>/ (git-ignored), one folder per deployment fingerprint (chain id + Paprika address + block-1
// hash). The state of another chain or deployment is never deleted or overwritten.
// Environment: RPC_PORT (default 8545) or RPC_URL; PAPRIKA_DEPLOYMENT (path of a deployment JSON: its rpcUrl is used
// unless RPC_PORT or RPC_URL is set). With a port other than 8545 the CLI reads
// ../contract/deployments/local-<port>.json. CLI_DEMO_OUTPUT: where `demo` saves its run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { createDevice, exportDevice, importDevice, sha256 } from "./lib/device.js";
import {
  advanceTime, attestPhoto, balances, chainInfo, commitAccusation, commitmentStatus, connect, credits,
  deploymentFingerprint, forfeitCommitment, formatToken, listRecords,
  listAccusations, onActivity, refund, registerDevice, revealAccusation, revokeKey, umaVote, unwrap, verifyPhoto, withdrawCredit,
} from "./lib/paprika.js";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(APP_DIR, ".state");
const RPC_PORT = Number(process.env.RPC_PORT || (process.env.RPC_URL ? new URL(process.env.RPC_URL).port : 0) || 8545);
const RPC_URL_SET = Boolean(process.env.RPC_URL || process.env.RPC_PORT);
const RPC_URL = process.env.RPC_URL || `http://127.0.0.1:${RPC_PORT}`;
const SUFFIX = RPC_PORT === 8545 ? "" : `-${RPC_PORT}`;   // per-port deployment file name
// Set in main() once the deployment fingerprint is known: .state/cli/<id>/state.json and device.json.
let STATE_FILE = null;
let DEVICE_FILE = null;
const DEPLOYMENT_CANDIDATES = [
  process.env.PAPRIKA_DEPLOYMENT,
  path.join(APP_DIR, "..", "contract", "deployments", `local${SUFFIX}.json`),
  path.join(APP_DIR, "web", `deployment${SUFFIX}.json`),
].filter(Boolean);

const HELP = `Paprika CLI (local chain only)

  status                                   chain, contracts, parameters, saved device, balances
  register                                 create a device key (app/.state/device.json) and register it (photographer)
  attest <file>                            photographer attests <file> with the saved device, deposit B
  verify <file>                            show every record of <file>
  accuse-commit <file> --evidence "<text>" accuser commits an accusation (bond B); evidence is required;
                                           --key <keyId> to choose the device. Several commitments can be pending.
  accuse-reveal [#|file]                   accuser reveals a pending commitment: UMA assertion + dispute
                                           (needed only when several are pending; "status" lists them)
  vote <true|false> [assertionId]          real UMA vote (VotingV2, 3 voters) on the open accusation, then settle
                                           (true = fake proven); the chain clock jumps through the vote phases
  refund <file>                            refund the deposit of <file> (after the challenge period)
  withdraw <photographer|accuser|operator> withdraw the role's credit from Paprika (as WETH)
  unwrap <role> [amount]                   turn the role's WETH back into ETH (all of it by default)
  revoke                                   revoke the saved device key (photographer)
  forfeit [#]                              burn the bond of an expired commitment (not revealed in time)
  advance <seconds> [--force]              move the chain clock forward (demo control); refused while an
                                           accusation is open (vote first), unless --force
  balances                                 WETH balances, credits and ETH of the roles
  demo                                     run the whole demo story with checks (exit code 1 on any mismatch);
                                           on port 8545 it saves the run to app/output/cli-demo.txt
                                           (CLI_DEMO_OUTPUT=<file> chooses another file)
`;

// ------------------------------------------------------------------ setup and state

function loadDeployment() {
  for (const file of DEPLOYMENT_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
    // An explicit PAPRIKA_DEPLOYMENT talks to the chain it names, unless RPC_PORT / RPC_URL say otherwise.
    const rpcUrl = file === process.env.PAPRIKA_DEPLOYMENT && !RPC_URL_SET && deployment.rpcUrl ? deployment.rpcUrl : RPC_URL;
    return { file, deployment, rpcUrl };
  }
  throw new Error("no deployment JSON found: run `npm run deploy` first");
}

// Identity of "this chain + this deployment": the Paprika address alone is not enough, because a fresh Hardhat
// chain deploys to the same addresses; the hash of block 1 changes with every new chain (it includes a timestamp).
async function deploymentId(ctx) {
  try { return await deploymentFingerprint(ctx); } catch { throw new Error(`cannot reach the local chain at ${ctx.rpcUrl}: run \`npm run chain\` (or \`npm start\`)`); }
}

// Chooses the state folder of this deployment (one per fingerprint) and loads its state. Nothing else is touched.
async function loadState(fingerprint) {
  const id = (await sha256(new TextEncoder().encode(fingerprint))).slice(2, 18);
  const dir = path.join(STATE_DIR, "cli", id);
  STATE_FILE = path.join(dir, "state.json");
  DEVICE_FILE = path.join(dir, "device.json");
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { deployment: fingerprint }; }
}
function saveState(s) {
  if (!STATE_FILE) return;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
async function loadDevice() {
  if (!fs.existsSync(DEVICE_FILE)) throw new Error("no device yet: run `node cli.js register`");
  return importDevice(fs.readFileSync(DEVICE_FILE, "utf8"));
}

function readFile(file) {
  if (!file) throw new Error("missing <file>");
  if (!fs.existsSync(file)) throw new Error(`file not found: ${file}`);
  return new Uint8Array(fs.readFileSync(file));
}

// True if the bytes start like a JPEG, PNG, GIF, WebP, HEIC/AVIF or TIFF file.
function looksLikeImage(b) {
  const hex = Array.from(b.slice(0, 12), (x) => x.toString(16).padStart(2, "0")).join("");
  return hex.startsWith("ffd8ff") || hex.startsWith("89504e47") || hex.startsWith("47494638") ||
    (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") || hex.slice(8, 16) === "66747970" ||
    hex.startsWith("49492a00") || hex.startsWith("4d4d002a");
}

// Pending commitments (never overwritten). Older state files had a single `lastCommit`.
function pendingCommits(state) {
  if (!state.commits) state.commits = [];
  if (state.lastCommit) { state.commits.push(state.lastCommit); delete state.lastCommit; }
  return state.commits;
}
function describeCommit(c, i) {
  const t = c.chain ? `committed ${when(c.chain.committedAt)} (chain time), reveal by ${when(c.chain.revealDeadline)}${c.chain.expired ? " - EXPIRED: forfeit it with `forfeit " + (i + 1) + "`" : ""}` : "";
  return `#${i + 1}  photo ${short(c.photoHash)}  key ${short(c.keyId)}  evidence "${c.evidence ?? "?"}"  ${t}`;
}
// Adds the chain-side status (times, expired) to each pending commitment; drops those no longer live.
async function refreshCommits(ctx, state) {
  const list = pendingCommits(state);
  for (const c of list) c.chain = await commitmentStatus(ctx, c.commitment);
  state.commits = list.filter((c) => c.chain.exists && c.chain.live);
  return state.commits;
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

// Prints one phase of a UMA vote (callback of umaVote).
function printPhase({ phase, roundId, txHashes, timestamp }) {
  const what = { commit: "voters committed hidden votes", reveal: "voters revealed their votes", settle: "assertion settled on OOv3" }[phase];
  console.log(`   UMA ${phase.padEnd(6)} round ${roundId}, chain time ${new Date(timestamp * 1000).toISOString().replace(".000Z", "Z")}: ${what} (${txHashes.length} tx)`);
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
  // The challenge times only matter while the record can still be accused or refunded.
  if (r.state === "attested" || r.state === "accused") console.log(`    accusable until  ${when(r.accusableUntil)}   refundable at ${when(r.refundableAt)}`);
  console.log(`    device           ${r.device.status}${r.device.status === "flagged" ? ` at block ${r.device.flaggedAtBlock} (${r.device.reason}); record ${r.recordedBeforeFlag ? "predates" : "follows"} the flag` : ""}`);
}

// ------------------------------------------------------------------ commands

// Each command gets (ctx, args, state) and returns nothing; transactions are printed by the activity hook.
const commands = {
  async status(ctx, _args, state) {
    const info = await chainInfo(ctx);
    const p = ctx.params;
    console.log(`chain      id ${info.chainId}, block ${info.blockNumber}, time ${when(info.timestamp)}  (${ctx.rpcUrl})`);
    for (const [k, v] of Object.entries(ctx.addresses)) console.log(`${k.padEnd(13)}${v}`);
    console.log(`params     B = ${formatToken(ctx, p.bond)}, challenge period ${p.photoWindow} s, reveal period ${p.revealWindow} s, UMA fee share ${p.feeShare}`);
    for (const [k, v] of Object.entries(ctx.accounts)) console.log(`${k.padEnd(13)}${v}`);
    console.log(`device     ${fs.existsSync(DEVICE_FILE) ? (await loadDevice()).keyId : "none (run register)"}`);
    const pending = await refreshCommits(ctx, state);
    if (pending.length) { console.log("pending commitments (reveal with accuse-reveal [#|file]):"); pending.forEach((c, i) => console.log(`  ${describeCommit(c, i)}`)); }
    for (const a of (await listAccusations(ctx)).filter((x) => x.open)) console.log(`open accusation ${a.assertionId} on photo ${short(a.photoHash)} (vote with: vote <true|false>)`);
    await commands.balances(ctx);
  },

  async register(ctx, _args, state) {
    const device = await createDevice();
    const r = await registerDevice(ctx, "photographer", device);
    fs.mkdirSync(path.dirname(DEVICE_FILE), { recursive: true });
    if (fs.existsSync(DEVICE_FILE)) fs.renameSync(DEVICE_FILE, DEVICE_FILE.replace(/\.json$/, `-${Date.now()}.json`));   // keep older keys
    fs.writeFileSync(DEVICE_FILE, JSON.stringify(await exportDevice(device), null, 2));
    state.keyId = r.keyId;
    console.log(`Device registered for free. keyId ${r.keyId} (saved in ${path.relative(APP_DIR, DEVICE_FILE)})`);
  },

  async attest(ctx, args, state) {
    const device = await loadDevice();
    const bytes = readFile(args[0]);
    if (bytes.length && !looksLikeImage(bytes)) console.log(`Warning: ${args[0]} does not look like an image file; attesting it anyway.`);
    const r = await attestPhoto(ctx, "photographer", device, bytes);
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
    const evidence = option(args, "--evidence");
    if (!evidence || !evidence.trim()) throw new Error('evidence is required: accuse-commit <file> --evidence "<text or URL>"');
    let keyId = option(args, "--key");
    const photoHash = await sha256(readFile(args[0]));
    if (!keyId) {
      const recs = await verifyPhoto(ctx, photoHash);
      if (!recs.length) throw new Error("this photo has no record; nothing to accuse");
      keyId = recs[0].keyId;
    }
    const r = await commitAccusation(ctx, "accuser", { photoHash, keyId, evidence });
    const list = pendingCommits(state);
    list.push({ photoHash, keyId, evidence, evidenceHash: r.evidenceHash, salt: r.salt, commitment: r.commitment, file: args[0] });
    const st = await commitmentStatus(ctx, r.commitment);
    console.log(`  committed at ${when(st.committedAt)} (chain time); reveal by ${when(st.revealDeadline)}.`);
    console.log(`Accusation committed (#${list.length}): only the hash ${r.commitment} is on chain. Bond ${formatToken(ctx, ctx.params.bond)}.`);
    console.log(`  salt and evidence hash saved in app/.state/ for the reveal (${list.length} pending).`);
    if (r.warning) console.log(`  Warning: ${r.warning}.`);
  },

  async "accuse-reveal"(ctx, args, state) {
    const list = await refreshCommits(ctx, state);
    if (!list.length) throw new Error("no pending commitment: run accuse-commit first");
    let i;
    if (!args[0]) {
      if (list.length > 1) throw new Error(`${list.length} pending commitments; choose one: accuse-reveal <#|file>\n  ${list.map(describeCommit).join("\n  ")}`);
      i = 0;
    } else if (/^#?\d+$/.test(args[0])) {
      i = Number(args[0].replace("#", "")) - 1;
    } else {
      const h = await sha256(readFile(args[0]));
      i = list.findIndex((c) => c.photoHash === h);
    }
    if (!(i >= 0 && i < list.length)) throw new Error(`no such pending commitment: ${args[0]}\n  ${list.map(describeCommit).join("\n  ")}`);
    const c = list[i];
    console.log(`Revealing ${describeCommit(c, i)}`);
    if (c.chain?.expired) throw new Error(`too late: the reveal period of #${i + 1} ended at ${when(c.chain.revealDeadline)}; the bond can only be forfeited (forfeit ${i + 1})`);
    const r = await revealAccusation(ctx, "accuser", c);
    list.splice(i, 1);
    if (r.bondReturned) { console.log(`No new accusation (${r.reason}): the bond is credited back to the accuser (withdraw accuser).`); return; }
    state.lastAssertion = r.assertionId;
    console.log(`Accusation revealed, asserted to UMA and disputed with the photo's deposit. assertionId ${r.assertionId}`);
  },

  async vote(ctx, args, state) {
    if (!["true", "false"].includes(args[0])) throw new Error("usage: vote <true|false> [assertionId]   (true = the evidence proves the fake)");
    // Which accusation: the one given, else the one revealed last if still open, else the only open one.
    const open = (await listAccusations(ctx)).filter((a) => a.open);
    let id = args[1];
    if (!id) {
      if (open.length === 1) id = open[0].assertionId;
      else if (!open.length) throw new Error("no open accusation to vote on (reveal one with accuse-reveal first)");
      else throw new Error(`${open.length} open accusations; choose one: vote <true|false> <assertionId>\n  ${open.map((a) => `${a.assertionId}  photo ${short(a.photoHash)}`).join("\n  ")}`);
    }
    console.log(`Voting on assertion ${id}`);
    const r = await umaVote(ctx, id, args[0] === "true", { onPhase: printPhase });
    console.log(`UMA vote (round ${r.roundId}, ${ctx.voters.length} voters, ${r.simulatedSeconds} s of chain time skipped): ` +
      `${args[0] === "true" ? "fake PROVEN (accuser wins)" : "accusation REJECTED (depositor wins)"}; assertion settled.`);
    delete state.lastAssertion;
  },

  async refund(ctx, args, state) {
    const photoHash = await sha256(readFile(args[0]));
    const all = await verifyPhoto(ctx, photoHash);
    if (!all.length) throw new Error("no record of this photo: nothing to refund");
    const recs = all.filter((r) => r.state === "attested");
    // None refundable: let the library say why (already refunded, proven fake, under accusation).
    if (!recs.length) await refund(ctx, "photographer", { photoHash, keyId: all[0].keyId });
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
    const device = await loadDevice();   // already flagged: the library says so before sending anything
    await revokeKey(ctx, "photographer", device);
    console.log(`Key ${device.keyId} revoked: device flagged, no money moved.`);
  },

  async advance(ctx, args) {
    const force = args.includes("--force");
    const s = Number(args.filter((a) => a !== "--force")[0]);
    if (!Number.isFinite(s) || s < 0) throw new Error("usage: advance <seconds> [--force]");
    const r = await advanceTime(ctx, s, { force });
    console.log(`Chain clock moved forward ${s} s. Now ${when(r.timestamp)}.`);
  },

  async forfeit(ctx, args, state) {
    const list = await refreshCommits(ctx, state);
    const expired = list.map((c, i) => [c, i]).filter(([c]) => c.chain.expired);
    if (!expired.length) throw new Error("no expired commitment to forfeit (status lists the pending ones)");
    let pick = expired[0];
    if (args[0]) pick = expired.find(([, i]) => String(i + 1) === args[0].replace("#", ""));
    else if (expired.length > 1) throw new Error(`${expired.length} expired commitments; choose one: forfeit <#>`);
    if (!pick) throw new Error(`#${args[0]} is not an expired commitment`);
    const [c, i] = pick;
    const r = await forfeitCommitment(ctx, "accuser", c.commitment);
    list.splice(i, 1);
    console.log(`Commitment #${i + 1} forfeited: its bond ${formatToken(ctx, r.burned)} went to the burn address (tx ${r.txHash}).`);
  },

  async balances(ctx) {
    const m = await money(ctx);
    for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(20)} ${formatToken(ctx, v)}`);
    const { eth } = await balances(ctx);
    for (const [k, v] of Object.entries(eth)) console.log(`  ${("ETH " + k).padEnd(20)} ${ethers.formatEther(v)} ETH`);
  },

  async unwrap(ctx, args) {
    const role = args[0];
    if (!["photographer", "accuser", "operator"].includes(role)) throw new Error("usage: unwrap <role> [amount]");
    if (args[1] !== undefined && !(/^\d+(\.\d+)?$/.test(args[1]) && Number(args[1]) > 0)) throw new Error(`amount must be a positive number of WETH, got "${args[1]}"`);
    const r = await unwrap(ctx, role, args[1] ? ethers.parseUnits(args[1], ctx.params.tokenDecimals) : undefined);
    console.log(`Unwrapped ${formatToken(ctx, r.amount)} into ETH for the ${role}.`);
  },

  demo: (ctx) => runDemo(ctx),
};

// Commands whose printed output already includes everything; others print the money that moved.
const NO_MONEY = new Set(["status", "verify", "balances", "advance", "demo", "help"]);

// ------------------------------------------------------------------ demo (smoke check)

// Runs the click path of docs/demo.md, plus the optional "fake proven" and "revoke key" endings.
// Each step prints what happened and checks the expected outcome; any mismatch exits with code 1.
async function runDemo(ctx) {
  // Everything the demo prints is also saved (see below).
  const lines = [];
  const log0 = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); log0(...a); };
  try {
    await runDemoSteps(ctx);
  } finally {
    console.log = log0;
    // Saved only for the default instance, or where CLI_DEMO_OUTPUT says: test runs on other ports leave it alone.
    const out = process.env.CLI_DEMO_OUTPUT || (new URL(ctx.rpcUrl).port === "8545" ? path.join(APP_DIR, "output", "cli-demo.txt") : null);
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, `# node cli.js demo  (${new Date().toISOString()}, ${ctx.rpcUrl})\n${lines.join("\n")}\n`);
    }
  }
}

async function runDemoSteps(ctx) {
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
    await step("0. Wallets: the roles hold ETH; WETH is wrapped on demand", async () => {
      const b = await balances(ctx);
      for (const r of ["photographer", "accuser"]) console.log(`   ${r.padEnd(12)} ${ethers.formatEther(b.eth[r])} ETH, ${formatToken(ctx, b[r])}`);
      console.log(`   UMA voters: ${ctx.voters.map((v) => v.address).join(", ")} (staked UMA voting tokens)`);
      check(b.eth.photographer >= 2n * B && b.eth.accuser >= 2n * B, "both roles hold enough ETH to wrap");
      check(ctx.voters.length >= 3, "three UMA voters in the deployment");
    });

    await step("1. Device -> Register (free)", async (before) => {
      const r = await registerDevice(ctx, "photographer", deviceA);
      console.log(`   keyId ${r.keyId}`);
      const d = await moved(before);
      check(Object.keys(d).length === 0, "no money to move");
      check(r.keyId === deviceA.keyId, "keyId = sha256(x || y) as computed by the contract");
    });

    await step("2. Capture -> sign & submit (deposit B)", async (before) => {
      const ethBefore = (await balances(ctx)).eth.photographer;
      const need = before.photographer >= B ? 0n : B - before.photographer;   // ETH to wrap
      const r = await attestPhoto(ctx, "photographer", deviceA, photo1);
      photo1Hash = r.photoHash;
      console.log(`   photoHash ${r.photoHash}, anchor block ${r.anchorBlock}, ${r.txHashes.length} tx`);
      const ethAfter = (await balances(ctx)).eth.photographer;
      console.log(`   wrapped ${formatToken(ctx, need)} from ETH (ETH spent incl. gas: ${ethers.formatEther(ethBefore - ethAfter)})`);
      const d = await moved(before);
      check((d.photographer ?? 0n) === need - B, "photographer WETH: +wrapped -B");
      check(ethBefore - ethAfter >= need, "the wrapped amount left the ETH balance");
      check(need === 0n || r.txHashes.length === 3, "wrap + approve + attest transactions");
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
      const need = before.accuser >= B ? 0n : B - before.accuser;
      commit1 = await commitAccusation(ctx, "accuser", { photoHash: photo1Hash, keyId: deviceA.keyId, evidence: "https://example.org/evidence-that-does-not-prove-it" });
      commit1 = { ...commit1, photoHash: photo1Hash, keyId: deviceA.keyId };
      console.log(`   commitment ${commit1.commitment}`);
      const d = await moved(before);
      check((d.accuser ?? 0n) === need - B && d.Paprika === B, "accuser WETH +wrapped -B, Paprika +B");
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

    await step("7. Negative case 2: UMA vote 'evidence does not prove it' (real VotingV2 vote)", async (before) => {
      const recBefore = (await verifyPhoto(ctx, photo1Hash))[0];
      const v = await umaVote(ctx, assertion1, false, { onPhase: printPhase });
      console.log(`   vote round ${v.roundId}: ${v.txHashes.length} tx, ${v.simulatedSeconds} s of chain time skipped`);
      const w = await withdrawCredit(ctx, "photographer");
      console.log(`   photographer withdrew ${formatToken(ctx, w.amount)}`);
      const d = await moved(before);
      check(d["UMA Store"] === fee, "UMA Store +f x B");
      check(d.photographer === B - fee, "depositor +(B - f x B)");
      check(d["UMA OOv3"] === -2n * B, "UMA released both bonds");
      const [rec] = await verifyPhoto(ctx, photo1Hash);
      check(rec.state === "attested" && rec.depositLocked === B, "photo back to attested, deposit still locked");
      console.log(`   accusation window extended by ${rec.accusableUntil - recBefore.accusableUntil} s (time under accusation)`);
      check(rec.accusableUntil - recBefore.accusableUntil >= v.simulatedSeconds, "window extended by at least the vote time");
      console.log(`   accuser net over steps 5-7: -${formatToken(ctx, B)}`);
    });

    await step("8. Advance time past the challenge and reveal periods -> Refund", async (before) => {
      const [rec] = await verifyPhoto(ctx, photo1Hash);
      let early = null;
      try { await refund(ctx, "photographer", { photoHash: photo1Hash, keyId: deviceA.keyId }); } catch (e) { early = e.message; }
      console.log(`   refund before the period ends -> error "${early}"`);
      check(String(early).startsWith("too early"), 'refused "too early"');
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
      const needP = before.photographer >= B ? 0n : B - before.photographer;
      const needA = before.accuser >= B ? 0n : B - before.accuser;
      const a = await attestPhoto(ctx, "photographer", deviceA, photo2);
      photo2Hash = a.photoHash;
      const c = await commitAccusation(ctx, "accuser", { photoHash: photo2Hash, keyId: deviceA.keyId, evidence: "The original, published before the anchor block: https://example.org/original.jpg" });
      const r = await revealAccusation(ctx, "accuser", { ...c, photoHash: photo2Hash, keyId: deviceA.keyId });
      assertion2 = r.assertionId;
      const v = await umaVote(ctx, assertion2, true, { onPhase: printPhase });
      console.log(`   vote round ${v.roundId}: ${v.txHashes.length} tx, ${v.simulatedSeconds} s of chain time skipped`);
      const w = await withdrawCredit(ctx, "accuser");
      console.log(`   accuser withdrew ${formatToken(ctx, w.amount)}`);
      const d = await moved(before);
      check(w.amount === 2n * B - fee, "accuser payout B + (B - f x B)");
      check((d.accuser ?? 0n) - needA === B - fee, "accuser net +(B - f x B) (besides wrapping)");
      check((d.photographer ?? 0n) - needP === -B, "photographer lost the deposit B (besides wrapping)");
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
      check(/flagged \(fake-proven\)/.test(String(err)), "refused: device flagged (fake-proven), before any money moves");
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
      console.log(`   revoked device tries to attest -> error "${err2}"`);
      check(/flagged \(key-revoked\)/.test(String(err2)), "revoked device cannot attest");
    });

    await step("12. Unwrap: WETH back to ETH", async () => {
      for (const role of ["photographer", "accuser"]) {
        const b = await balances(ctx);
        if (b[role] === 0n) continue;
        const r = await unwrap(ctx, role);
        const a = await balances(ctx);
        console.log(`   ${role.padEnd(12)} unwrapped ${formatToken(ctx, r.amount)} -> ETH ${ethers.formatEther(b.eth[role])} -> ${ethers.formatEther(a.eth[role])}`);
        check(a[role] === 0n && a.eth[role] > b.eth[role], "WETH 0, ETH up");
      }
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
  if (!cmd || cmd === "help" || cmd === "--help") { console.log(HELP); process.exit(0); }
  if (!commands[cmd]) { console.error(`Unknown command: ${cmd}\n`); console.error(HELP); process.exit(1); }
  const { deployment, rpcUrl } = loadDeployment();
  const ctx = connect({ rpcUrl, deployment });
  const state = await loadState(await deploymentId(ctx));
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
