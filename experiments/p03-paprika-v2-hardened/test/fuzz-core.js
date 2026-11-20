// Randomised stateful test for PaprikaCore, same scale as the v2.3-v2.5 fuzzers: 5 seeds x 5,000 steps,
// 10 accounts, 24 key slots (refilled when a key dies), issuers. Seeds: FUZZC_SEEDS, steps: FUZZC_STEPS.
// The action sequence is reproducible from the seed; P-256 keys and ECDSA nonces come from Node's CSPRNG.
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const SEEDS = (process.env.FUZZC_SEEDS || "1,2,3,4,5").split(",").map(Number);
const STEPS = Number(process.env.FUZZC_STEPS || 5000);
const BURN = "0x000000000000000000000000000000000000dEaD";
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const MN = "test test test test test test test test test test test junk";
const HD = Array.from({ length: 11 }, (_, i) => ethers.HDNodeWallet.fromPhrase(MN, undefined, `m/44'/60'/0'/0/${i}`));
const E = (x) => ethers.parseEther(String(x));
const TOTAL_OK = {};

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const sign = (pre) => { const g = "0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex"); const sv = BigInt("0x" + g.slice(66)); return sv > N_P256 / 2n ? g.slice(0, 66) + (N_P256 - sv).toString(16).padStart(64, "0") : g; };
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}

async function runSeed(seed) {
  const R = mulberry32(seed), pick = (a) => a[Math.floor(R() * a.length)];
  const s = await ethers.getSigners(), actors = s.slice(1, 11);
  const pap = await (await ethers.getContractFactory("PaprikaCore", s[0])).deploy();
  const addr = await pap.getAddress(), chainId = (await ethers.provider.getNetwork()).chainId;
  const mReg = (k, o) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/REGISTER", chainId, addr, k, o]);
  const mCap = (k, p, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", chainId, addr, k, p, bh]);
  const mExt = (k, o) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/EXTRACTED", chainId, addr, k, o]);
  const endorse = (i, k) => { const sg = HD[i].signingKey.sign(ethers.keccak256(ethers.solidityPacked(["string", "uint256", "address", "bytes32"], ["PAPRIKA/ENDORSE", chainId, addr, k]))); return [sg.v, sg.r, sg.s]; };
  const L0 = [ethers.ZeroAddress, 0, ethers.ZeroHash, ethers.ZeroHash];
  const keys = Array.from({ length: 24 }, () => ({ dev: newDevice(), registered: false })), allKeys = [...keys];
  const photos = Array.from({ length: 30 }, (_, i) => ethers.sha256(ethers.toUtf8Bytes(`core${seed}-${i}`)));
  const records = new Map(), hist = {}, reasons = {}, trace = [];
  const stakeIn = {}, rewardsOut = {}, flagged = {}, devLevel = {}, bountyEv = {}, issLast = {};
  let gasSpent = 0n, lastAct = "", lastWho = null, lastOk = false, rotated = 0;
  const watched = [...s.slice(0, 11).map((a) => a.address), addr, BURN];
  const total = async () => { let t = 0n; for (const a of watched) t += await ethers.provider.getBalance(a); return t; };
  const total0 = await total();
  const fail = (step, msg) => { console.log(`\n      FUZZ VIOLATION seed ${seed} step ${step}: ${msg}\n      last actions:\n        ` + trace.slice(-30).join("\n        ")); throw new Error(`fuzz violation (seed ${seed}, step ${step}): ${msg}`); };
  async function send(name, fn, sender) {
    hist[name] ??= { ok: 0, revert: 0 };
    const pre = await ethers.provider.getBalance(sender.address);
    try {
      const r = await (await fn()).wait();
      gasSpent += r.gasUsed * r.gasPrice; hist[name].ok++;
      for (const ev of r.logs.map((l) => { try { return pap.interface.parseLog(l); } catch { return null; } }).filter(Boolean)) {
        if (ev.name === "Registered") stakeIn[ev.args.keyId] = (stakeIn[ev.args.keyId] || 0n) + ev.args.stake;
        if (ev.name === "StakeAdded") stakeIn[ev.args.keyId] = (stakeIn[ev.args.keyId] || 0n) + ev.args.amount;
        if (ev.name === "MisuseProven") { rewardsOut[ev.args.keyId] = (rewardsOut[ev.args.keyId] || 0n) + ev.args.reward; if (ev.args.bounty > 0n) { const iss = (await pap.device(ev.args.keyId)).issuer; bountyEv[iss] = (bountyEv[iss] || 0n) + ev.args.bounty; } }
      }
      return r;
    } catch (e) {
      gasSpent += pre - (await ethers.provider.getBalance(sender.address));
      const m = /reverted with reason string '([^']*)'/.exec(String(e.message));
      const why = m ? m[1] : String(e.shortMessage || e.message).slice(0, 50);
      hist[name].revert++; reasons[name] ??= {}; reasons[name][why] = (reasons[name][why] || 0) + 1;
      return null;
    }
  }
  async function invariants(step) {
    let stakes = 0n;
    for (const k of allKeys) if (k.registered) {
      if (k.frozen && step % 100 !== 0) continue;
      const d = await pap.device(k.dev.keyId), id = k.dev.keyId; stakes += d.stake;
      if (flagged[id] !== undefined && d.flaggedAtBlock !== flagged[id]) fail(step, "flaggedAtBlock changed");
      if (d.flaggedAtBlock !== 0n) flagged[id] = d.flaggedAtBlock;
      if ((rewardsOut[id] || 0n) > (stakeIn[id] || 0n)) fail(step, "rewards exceed stake ever held");
      const li = `${d.level}|${d.issuer}`; if (devLevel[id] !== undefined && devLevel[id] !== li) fail(step, "level/issuer changed"); devLevel[id] = li;
      if ((d.status === 2n || d.withdrawnAtBlock !== 0n) && d.stake === 0n) { if (k.frozen && d.stake !== 0n) fail(step, "frozen key changed"); k.frozen = true; }
    }
    let ib = 0n;
    for (const a of actors) {
      const i = await pap.issuer(a.address); ib += i.bond; const prev = issLast[a.address];
      if (i.bountiesPaid !== (bountyEv[a.address] || 0n)) fail(step, "issuer bountiesPaid != events");
      if (i.bountiesPaid > i.deposited) fail(step, "bounties exceed deposits");
      if (prev && i.bond < prev.bond && !(prev.bond - i.bond === i.bountiesPaid - prev.bountiesPaid) && !(lastOk && lastAct === "issuerWithdraw" && lastWho === a.address && i.bond === 0n)) fail(step, "issuer bond decreased without bounty or withdrawal");
      issLast[a.address] = { bond: i.bond, bountiesPaid: i.bountiesPaid };
    }
    const bal = await ethers.provider.getBalance(addr);
    if (bal !== stakes + ib) fail(step, `balance ${bal} != stakes ${stakes} + issuer bonds ${ib}`);
    if ((await total()) + gasSpent !== total0) fail(step, "ETH not conserved");
  }
  async function checkRecords(step, list) {
    for (const rec of list) { const r = await pap.records(rec.photo, rec.keyId); if (r.anchorBlock !== rec.anchor || r.recordedBlock !== rec.recorded) fail(step, "record changed or disappeared"); }
  }
  const W = [["register", 6], ["attest", 30], ["misuse", 3], ["unbond", 4], ["withdraw", 7], ["issuerRegister", 1.5], ["issuerTopUp", 0.8], ["issuerExit", 0.8], ["issuerWithdraw", 2], ["warp", 4], ["mine", 5]];
  const Wsum = W.reduce((a, [, w]) => a + w, 0);
  const choose = () => { let x = R() * Wsum; for (const [n, w] of W) if ((x -= w) < 0) return n; return "mine"; };
  const t0 = Date.now();
  for (let step = 1; step <= STEPS; step++) {
    const act = choose(), who = pick(actors);
    const reg = keys.filter((x) => x.registered);
    let k = reg.length && R() < 0.85 ? pick(reg) : pick(keys), touched = null, note = "";
    if (act === "register" && R() < 0.85) {
      const free = keys.filter((x) => !x.registered);
      if (free.length) k = pick(free);
      else { const dead = []; for (let i = 0; i < keys.length; i++) { const d = await pap.device(keys[i].dev.keyId); if (d.status === 2n || (d.status === 3n && d.withdrawnAtBlock !== 0n)) dead.push(i); } if (dead.length) { const i = pick(dead); keys[i] = { dev: newDevice(), registered: false }; allKeys.push(keys[i]); k = keys[i]; rotated++; } }
    }
    if (act === "unbond" || act === "withdraw") { const want = act === "unbond" ? 1n : 3n, cand = []; for (const x of reg) if ((await pap.device(x.dev.keyId)).status === want) cand.push(x); if (cand.length && R() < 0.85) k = pick(cand); }
    if (act === "register") {
      const m = R(), stake = m < 0.1 ? E("0.2") : (R() < 0.5 ? E("0.25") : E("0.5"));
      const pop = m > 0.92 ? k.dev.sign(mReg(k.dev.keyId, pick(actors).address)) : k.dev.sign(mReg(k.dev.keyId, who.address));
      let end = L0;
      if (R() < 0.45) { const act_ = []; for (let j = 1; j <= 10; j++) if (await pap.issuerActive(s[j].address)) act_.push(j); const j = act_.length && R() < 0.85 ? pick(act_) : 1 + Math.floor(R() * 10); end = [s[j].address, ...endorse(R() < 0.08 ? 1 + Math.floor(R() * 10) : j, k.dev.keyId)]; }
      const was = k.registered;
      const r = await send(act, () => pap.connect(who).register(k.dev.x, k.dev.y, pop, ...end, { value: stake }), who);
      if (r) { if (was) fail(step, "key registered twice"); k.registered = true; k.owner = who; }
      note = r ? "ok" : "revert";
    } else if (act === "attest") {
      const photo = pick(photos), latest = await ethers.provider.getBlock("latest"), m = R();
      const anchor = m < 0.06 ? Math.max(0, latest.number - 300) : m < 0.12 ? latest.number + 3 : latest.number - Math.floor(R() * 5);
      const bh = anchor <= latest.number ? (await ethers.provider.getBlock(anchor)).hash : ethers.ZeroHash;
      const sig = R() < 0.08 ? k.dev.sign(mCap(k.dev.keyId, pick(photos), bh)) : k.dev.sign(mCap(k.dev.keyId, photo, bh));
      const st = k.registered ? (await pap.device(k.dev.keyId)).status : 0n, key = photo + "|" + k.dev.keyId;
      const r = await send(act, () => pap.connect(who).attest(photo, anchor, k.dev.keyId, sig, { value: R() < 0.1 ? E("0.01") : 0n }), who);
      if (r) { if (st !== 1n) fail(step, `status ${st} key got a record`); if (records.has(key)) fail(step, "record overwritten"); touched = { photo, keyId: k.dev.keyId, anchor: BigInt(anchor), recorded: BigInt(r.blockNumber) }; records.set(key, touched); }
      note = r ? "ok" : "revert";
    } else if (act === "misuse") {
      const prover = R() < 0.9 ? who : pick(actors);
      note = (await send(act, () => pap.connect(who).proveKeyMisuse(k.dev.keyId, k.dev.sign(mExt(k.dev.keyId, prover.address))), who)) ? "ok" : "revert";
    } else if (act === "unbond") {
      const caller = k.owner && R() < 0.85 ? k.owner : who;
      note = (await send(act, () => pap.connect(caller).requestUnbond(k.dev.keyId), caller)) ? "ok" : "revert";
    } else if (act === "withdraw") {
      const caller = k.owner && R() < 0.9 ? k.owner : who;
      note = (await send(act, () => pap.connect(caller).withdraw(k.dev.keyId), caller)) ? "ok" : "revert";
    } else if (act === "issuerRegister") {
      note = (await send(act, () => pap.connect(who).registerIssuer({ value: R() < 0.1 ? E("0.5") : (R() < 0.5 ? E("1") : E("1.3")) }), who)) ? "ok" : "revert";
    } else if (act === "issuerTopUp" || act === "issuerExit" || act === "issuerWithdraw") {
      const cand = []; for (const a of actors) { const i = await pap.issuer(a.address); if (i.registered && (act === "issuerWithdraw" ? i.exitAt !== 0n : i.exitAt === 0n)) cand.push(a); }
      const w = cand.length && R() < 0.85 ? pick(cand) : who;
      const fn = act === "issuerTopUp" ? () => pap.connect(w).topUpIssuer({ value: E("0.2") }) : act === "issuerExit" ? () => pap.connect(w).requestIssuerExit() : () => pap.connect(w).withdrawIssuerBond();
      const r = await send(act, fn, w); note = r ? "ok" : "revert";
      if (act === "issuerWithdraw") { lastWho = w.address; lastOk = !!r; }
    } else if (act === "warp") {
      const sec = R() < 0.3 ? Math.floor(R() * 12 * 86400) : Math.floor(R() * 2 * 86400); await network.provider.send("evm_increaseTime", [sec]); await network.provider.send("hardhat_mine", ["0x1"]);
      hist[act] ??= { ok: 0, revert: 0 }; hist[act].ok++; note = `${sec}s`;
    } else {
      const n = R() < 0.8 ? 1 + Math.floor(R() * 8) : 1 + Math.floor(R() * 60); await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
      hist[act] ??= { ok: 0, revert: 0 }; hist[act].ok++; note = `${n} blocks`;
    }
    trace.push(`#${step} ${act} ${note}`);
    lastAct = act; if (act !== "issuerWithdraw") lastOk = false;
    await invariants(step);
    const recs = [...records.values()];
    if (step % 100 === 0 || step === STEPS) await checkRecords(step, recs);
    else await checkRecords(step, [...(touched ? [touched] : []), ...Array.from({ length: Math.min(6, recs.length) }, () => pick(recs))]);
  }
  for (const [n, v] of Object.entries(hist)) TOTAL_OK[n] = (TOTAL_OK[n] || 0) + v.ok;
  console.log(`      FUZZ Core seed ${seed}: ${STEPS} steps in ${((Date.now() - t0) / 1000).toFixed(1)} s, 0 invariant violations; keys used ${allKeys.filter((x) => x.registered).length} (${rotated} rotations); records ${records.size}; ETH conserved: in ${ethers.formatEther(total0)} = held+out+burned ${ethers.formatEther(await total())} + gas ${ethers.formatEther(gasSpent)}`);
  console.log("        action          ok   revert   top revert reasons");
  for (const [n, v] of Object.entries(hist).sort()) console.log(`        ${n.padEnd(14)} ${String(v.ok).padStart(4)} ${String(v.revert).padStart(7)}   ${Object.entries(reasons[n] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, c]) => `${r} x${c}`).join(", ")}`);
}

describe("PaprikaCore randomised stateful test", function () {
  this.timeout(0);
  for (const seed of SEEDS) it(`seed ${seed}, ${STEPS} steps`, async () => { await runSeed(seed); });
  it("coverage: every action succeeded at least 50 times across all seeds", () => {
    console.log("      FUZZ Core successes across all seeds: " + Object.entries(TOTAL_OK).sort().map(([n, v]) => `${n} ${v}`).join(", "));
    const low = Object.entries(TOTAL_OK).filter(([, v]) => v < 50);
    assert.equal(low.length, 0, "under-covered actions: " + JSON.stringify(low));
  });
});
