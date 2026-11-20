// Randomised stateful test for PaprikaV2_2. A seeded PRNG drives valid and invalid actions by 6 accounts over
// 8 P-256 device keys; after every step the invariants below are checked. Seeds: FUZZ_SEEDS="1,2,3", steps: FUZZ_STEPS.
// Note: the ACTION sequence is reproducible from the seed; P-256 keys and ECDSA nonces come from Node's CSPRNG.
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const SEEDS = (process.env.FUZZ_SEEDS || "1,2,3").split(",").map(Number);
const STEPS = Number(process.env.FUZZ_STEPS || 2500);
const BURN = "0x000000000000000000000000000000000000dEaD";
const STORE = "0x0000000000000000000000000000000000057073";
const E = (x) => ethers.parseEther(String(x));

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const sign = (pre) => "0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}

async function runSeed(seed) {
  const R = mulberry32(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const s = await ethers.getSigners();
  const dvmAcc = s[0], actors = s.slice(1, 7);
  const oracle = await (await ethers.getContractFactory("MockOptimisticOracleV3Burn", dvmAcc)).deploy();
  const pap = await (await ethers.getContractFactory("PaprikaV2_2", dvmAcc)).deploy(await oracle.getAddress());
  const addr = await pap.getAddress(), oaddr = await oracle.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const BOND = await pap.CLAIM_BOND();
  const msgReg = (o) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/REGISTER", chainId, addr, o]);
  const msgCap = (p, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32"], ["PAPRIKA-V2/CAPTURE", chainId, addr, p, bh]);
  const msgExt = (o) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/EXTRACTED", chainId, addr, o]);
  const keys = Array.from({ length: 8 }, () => ({ dev: newDevice(), registered: false }));
  const photos = Array.from({ length: 12 }, (_, i) => ethers.sha256(ethers.toUtf8Bytes(`seed${seed}-photo${i}`)));
  const records = new Map();           // "photo|keyId" -> {photo, keyId, anchor, recorded}
  const commits = [], asserts = [];
  const hist = {}, reasons = {};
  const trace = [];
  let gasSpent = 0n;
  const watched = [...s.slice(0, 7).map((a) => a.address), addr, oaddr, BURN, STORE];
  const total = async () => { let t = 0n; for (const a of watched) t += await ethers.provider.getBalance(a); return t; };
  const total0 = await total();

  async function send(name, fn, sender) {
    hist[name] ??= { ok: 0, revert: 0 };
    const pre = await ethers.provider.getBalance(sender.address);
    try {
      const tx = await fn();
      const r = await tx.wait();
      gasSpent += r.gasUsed * r.gasPrice;
      hist[name].ok++;
      return r;
    } catch (e) {
      gasSpent += pre - (await ethers.provider.getBalance(sender.address));   // Hardhat mines reverting txs: they still cost gas
      const m = /reverted with reason string '([^']*)'/.exec(String(e.message)) || /reason="([^"]*)"/.exec(String(e.message));
      const why = m ? m[1] : String(e.shortMessage || e.message).slice(0, 60);
      hist[name].revert++; reasons[name] ??= {}; reasons[name][why] = (reasons[name][why] || 0) + 1;
      return null;
    }
  }
  const parse = (r) => r.logs.map((l) => { try { return pap.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
  const fail = (step, msg) => {
    console.log(`\n      FUZZ VIOLATION seed ${seed} step ${step}: ${msg}\n      last actions:\n        ` + trace.slice(-30).join("\n        "));
    throw new Error(`fuzz violation (seed ${seed}, step ${step}): ${msg}`);
  };
  async function checkRecords(step, list) {
    for (const rec of list) {
      const r = await pap.records(rec.photo, rec.keyId);
      if (r.anchorBlock !== rec.anchor || r.recordedBlock !== rec.recorded) fail(step, `record changed or disappeared: ${rec.photo.slice(0, 10)}|${rec.keyId.slice(0, 10)} was [${rec.anchor},${rec.recorded}] now [${r.anchorBlock},${r.recordedBlock}]`);
    }
  }
  async function invariants(step) {
    let stakes = 0n, reserved = 0n, open = 0n;
    for (const k of keys) if (k.registered) { const d = await pap.device(k.dev.keyId); stakes += d.stake; reserved += d.reserved; open += d.openClaims; }
    let credits = 0n; for (const a of s.slice(0, 7)) credits += await pap.credit(a.address);
    const cb = await pap.commitBondsHeld(), inbox = await pap.inbox();
    const bal = await ethers.provider.getBalance(addr), ob = await oracle.openBonds(), obal = await ethers.provider.getBalance(oaddr);
    if (inbox !== 0n) fail(step, "inbox not empty");
    if (bal !== stakes + credits + cb) fail(step, `balance ${bal} != stakes ${stakes} + credits ${credits} + commit bonds ${cb}`);
    if (obal !== ob || ob !== 2n * reserved || reserved !== open * BOND) fail(step, `oracle ${obal} / openBonds ${ob} / reserved ${reserved} / open ${open}`);
    const t = await total();
    if (t + gasSpent !== total0) fail(step, `ETH not conserved: in ${total0}, now held+out+burned ${t} + gas ${gasSpent}`);
  }

  const W = [["register", 6], ["attest", 22], ["commit", 12], ["reveal", 12], ["vote", 9], ["settle", 9], ["misuse", 0.15], ["unbond", 0.8],
    ["withdraw", 4], ["claimCredit", 5], ["forfeit", 3], ["settleStake", 3], ["warp", 4], ["mine", 5]];
  const Wsum = W.reduce((a, [, w]) => a + w, 0);
  const choose = () => { let x = R() * Wsum; for (const [n, w] of W) { if ((x -= w) < 0) return n; } return "mine"; };
  const t0 = Date.now();
  let activeSteps = 0;

  for (let step = 1; step <= STEPS; step++) {
    const act = choose();
    const who = pick(actors);
    const reg = keys.filter((x) => x.registered);
    const k = reg.length && R() < 0.85 ? pick(reg) : pick(keys);    // mostly registered keys, sometimes any
    let touched = null, note = "";
    if (act === "register") {
      const mode = R(), stake = mode < 0.1 ? E("0.05") : (R() < 0.5 ? E("0.1") : E("0.2"));
      const pop = mode > 0.9 ? k.dev.sign(msgReg(pick(actors).address)) : k.dev.sign(msgReg(who.address));
      const was = k.registered;
      const r = await send(act, () => pap.connect(who).register(k.dev.x, k.dev.y, pop, { value: stake }), who);
      note = `key ${keys.indexOf(k)} by ${who.address.slice(0, 6)} stake ${ethers.formatEther(stake)} ${r ? "ok" : "revert"}`;
      if (r) { if (was) fail(step, "key registered twice"); k.registered = true; k.owner = who; }
    } else if (act === "attest") {
      const photo = pick(photos);
      const latest = await ethers.provider.getBlock("latest");
      const m = R();
      const anchor = m < 0.08 ? Math.max(0, latest.number - 300) : m < 0.16 ? latest.number + 3 : latest.number - Math.floor(R() * 5);
      const bh = anchor <= latest.number ? (await ethers.provider.getBlock(anchor)).hash : ethers.ZeroHash;
      const sig = R() < 0.1 ? k.dev.sign(msgCap(pick(photos), bh)) : k.dev.sign(msgCap(photo, bh));
      const st = k.registered ? (await pap.device(k.dev.keyId)).status : 0n;
      const key = photo + "|" + k.dev.keyId;
      const r = await send(act, () => pap.connect(who).attest(photo, anchor, k.dev.keyId, sig, { value: R() < 0.1 ? E("0.01") : 0n }), who);
      note = `key ${keys.indexOf(k)} photo ${photos.indexOf(photo)} anchor ${anchor - latest.number} status ${st} ${r ? "ok" : "revert"}`;
      if (r) {
        if (st !== 1n) fail(step, `key with status ${st} got a new record`);
        if (records.has(key)) fail(step, "record overwritten");
        touched = { photo, keyId: k.dev.keyId, anchor: BigInt(anchor), recorded: BigInt(r.blockNumber) };
        records.set(key, touched);
      }
    } else if (act === "commit") {
      const recs = [...records.values()];
      const tgt = recs.length && R() < 0.8 ? pick(recs) : { photo: pick(photos), keyId: k.dev.keyId };
      const c = { who, photo: tgt.photo, keyId: tgt.keyId, ev: ethers.hexlify(ethers.randomBytes(32)), salt: ethers.hexlify(ethers.randomBytes(32)), done: false };
      c.cm = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"], [who.address, c.photo, c.keyId, c.ev, c.salt]));
      const r = await send(act, () => pap.connect(who).commitClaim(c.cm, { value: R() < 0.05 ? E("0.01") : BOND }), who);
      if (r) { c.block = r.blockNumber; commits.push(c); }
      note = `${r ? "ok" : "revert"}`;
    } else if (act === "reveal") {
      const open = commits.filter((c) => !c.done);
      const bn = await ethers.provider.getBlockNumber();
      const fresh = open.filter((c) => bn - c.block < 50);
      if (open.length) {
        const c = fresh.length && R() < 0.85 ? pick(fresh) : pick(open), m = R();
        const caller = m < 0.15 ? pick(actors) : c.who, salt = m > 0.9 ? ethers.ZeroHash : c.salt;
        const r = await send(act, () => pap.connect(caller).revealClaim(c.photo, c.keyId, c.ev, salt), caller);
        if (r) {
          c.done = true;
          const op = parse(r).find((p) => p.name === "ClaimOpened");
          if (op) asserts.push({ id: op.args.assertionId, voted: false, settled: false });
          note = op ? "opened" : "rejected (refund)";
        } else note = "revert";
      } else note = "none";
    } else if (act === "vote") {
      const a = asserts.filter((x) => !x.voted);
      if (a.length) { const x = pick(a), t = R() < 0.2; const r = await send(act, () => oracle.connect(dvmAcc).resolveDispute(x.id, t), dvmAcc); if (r) x.voted = true; note = `truth=${t}`; }
    } else if (act === "settle") {
      const a = asserts.filter((x) => !x.settled && (x.voted || R() < 0.1));
      if (a.length) { const x = pick(a); const r = await send(act, () => oracle.connect(who).settleAssertion(x.id), who); if (r) x.settled = true; note = r ? "ok" : "revert"; }
    } else if (act === "misuse") {
      const prover = R() < 0.9 ? who : pick(actors);
      const r = await send(act, () => pap.connect(who).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(prover.address))), who);
      note = `key ${keys.indexOf(k)} ${r ? "ok" : "revert"}`;
    } else if (act === "unbond") {
      const caller = k.owner && R() < 0.8 ? k.owner : who;
      const r = await send(act, () => pap.connect(caller).requestUnbond(k.dev.keyId), caller); note = `key ${keys.indexOf(k)} ${r ? "ok" : "revert"}`;
    } else if (act === "withdraw") {
      const caller = k.owner && R() < 0.85 ? k.owner : who;
      const r = await send(act, () => pap.connect(caller).withdraw(k.dev.keyId), caller); note = `key ${keys.indexOf(k)} ${r ? "ok" : "revert"}`;
    } else if (act === "claimCredit") {
      await send(act, () => pap.connect(who).claimCredit(), who);
    } else if (act === "forfeit") {
      const open = commits.filter((c) => !c.done);
      if (open.length) { const c = pick(open); const r = await send(act, () => pap.connect(who).forfeitCommit(c.who.address, c.cm), who); if (r) c.done = true; note = r ? "ok" : "revert"; }
    } else if (act === "settleStake") {
      await send(act, () => pap.connect(who).settleStake(k.dev.keyId), who);
    } else if (act === "warp") {
      const sec = Math.floor(R() * 3 * 86400); await network.provider.send("evm_increaseTime", [sec]); await network.provider.send("hardhat_mine", ["0x1"]); note = `${sec}s`;
      hist[act] ??= { ok: 0, revert: 0 }; hist[act].ok++;
    } else if (act === "mine") {
      const n = R() < 0.8 ? 1 + Math.floor(R() * 8) : 1 + Math.floor(R() * 60); await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]); note = `${n} blocks`;
      hist[act] ??= { ok: 0, revert: 0 }; hist[act].ok++;
    }
    trace.push(`#${step} ${act} ${note}`);
    if (keys.some((x) => x.registered)) { let act1 = false; for (const x of keys) if (x.registered && (await pap.device(x.dev.keyId)).status === 1n) { act1 = true; break; } if (act1) activeSteps++; }
    await invariants(step);
    const recs = [...records.values()];
    if (step % 100 === 0 || step === STEPS) await checkRecords(step, recs);
    else await checkRecords(step, [...(touched ? [touched] : []), ...Array.from({ length: Math.min(6, recs.length) }, () => pick(recs))]);
  }
  const statuses = {}; for (const k of keys) if (k.registered) { const st = Number((await pap.device(k.dev.keyId)).status); statuses[st] = (statuses[st] || 0) + 1; }
  console.log(`      FUZZ seed ${seed}: ${STEPS} steps in ${((Date.now() - t0) / 1000).toFixed(1)} s, 0 invariant violations; steps with >= 1 Active device ${activeSteps}; records ${records.size}, commits ${commits.length}, claims opened ${asserts.length} (settled ${asserts.filter((a) => a.settled).length}); device status counts (1 Active, 2 Flagged, 3 Retired): ${JSON.stringify(statuses)}; ETH conserved: in ${ethers.formatEther(total0)} = held+out+burned ${ethers.formatEther(await total())} + gas ${ethers.formatEther(gasSpent)}`);
  console.log("        action          ok   revert   top revert reasons");
  for (const [n, v] of Object.entries(hist).sort()) {
    const top = Object.entries(reasons[n] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, c]) => `${r} x${c}`).join(", ");
    console.log(`        ${n.padEnd(14)} ${String(v.ok).padStart(4)} ${String(v.revert).padStart(7)}   ${top}`);
  }
}

describe("PaprikaV2_2 randomised stateful test", function () {
  this.timeout(0);
  for (const seed of SEEDS) it(`seed ${seed}, ${STEPS} steps`, async () => { await runSeed(seed); });
});
