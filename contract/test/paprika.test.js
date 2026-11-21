// Paprika scenario suite: one test per use case or attack, on the local in-process Hardhat chain, against
// MockOptimisticOracleV3 (same interface and payouts as UMA's Optimistic Oracle V3; its `resolve` plays UMA's vote)
// and TestToken (the bond currency). The suite against the real UMA contracts is test/uma.integration.test.js.
//
// How to read the output: every test prints `CASE <name>: <what happened> | <numbers>`. Amounts are in tokens and
// are computed from the parameters in P below and from the oracle's fee share (fee = burnedBondPercentage x BOND);
// each number is printed as its formula followed by the measured value. "net" = change of (token balance +
// uncollected credit) of that account during the test.
// After every test the suite checks: Paprika's token balance == deposits of Attested records + unrevealed commit
// bonds + uncollected credits; the oracle holds 2 x BOND per open accusation; no token is created or lost.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers, network, artifacts } = require("hardhat");

// ---------------------------------------------------------------- test parameters (the only place amounts are typed)
const P = { BOND: ethers.parseEther("100"), MIN_BOND: ethers.parseEther("50"), WINDOW: 7 * 86400, REVEAL: 3600, LIVENESS: 7200, VOTE: 2 * 86400 };
const STORE = "0x0000000000000000000000000000000000005707";   // stands in for UMA's Store (receives the oracle fee)
const BURN = "0x000000000000000000000000000000000000dEaD";
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const ST = ["None", "Attested", "Accused", "Refunded", "Fake"];
const DS = ["None", "Active", "Flagged"];
const RS = ["None", "FakeProven", "KeyRevoked"];
const gasLog = {};
const G = (k, r) => { gasLog[k] ??= r.gasUsed; };
const CASE = (name, what, nums) => console.log(`      CASE ${name}: ${what} | ${nums}`);

// ---------------------------------------------------------------- chain helpers
const mine = (n = 1) => network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
const automine = (on) => network.provider.send("evm_setAutomine", [on]);
const setNext = (ts) => network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
const warpTo = async (ts) => { await setNext(ts); await mine(); };
const later = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await mine(); };
const LIM = { gasLimit: 2_000_000 };   // explicit limit: the tx is mined at the timestamp set with setNext
const send = async (p) => (await p).wait();
async function rv(p, reason) {
  try { await send(p); } catch (e) {
    assert(String(e.message).includes(reason), `expected "${reason}", got: ${String(e.message).slice(0, 300)}`);
    return reason;
  }
  throw new Error("expected revert: " + reason);
}

// ---------------------------------------------------------------- keys and signed messages
function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const sign = (pre) => lowS("0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex"));
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}
const flipS = (sig) => sig.slice(0, 66) + (N_P256 - BigInt("0x" + sig.slice(66))).toString(16).padStart(64, "0");
const lowS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? flipS(sig) : sig);
const highS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? sig : flipS(sig));
const named = (label) => (c, keyId, who) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], [label, c.chainId, c.addr, keyId, who]);
const msgReg = named("PAPRIKA/REGISTER"), msgRev = named("PAPRIKA/REVOKE");
const msgCap = (c, keyId, photo, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", c.chainId, c.addr, keyId, photo, bh]);
const commitmentOf = (who, photo, keyId, ev, salt) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"], [who, photo, keyId, ev, salt]));

// ---------------------------------------------------------------- protocol helpers
async function deploy(p = P) {
  const s = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("TestToken", s[0])).deploy();
  const oo = await (await ethers.getContractFactory("MockOptimisticOracleV3", s[0])).deploy(STORE, p.MIN_BOND);
  const pap = await (await ethers.getContractFactory("Paprika", s[0])).deploy(await oo.getAddress(), await token.getAddress(), p.BOND, p.WINDOW, p.REVEAL, p.LIVENESS);
  const addr = await pap.getAddress();
  for (const a of s.slice(1, 16)) { await token.mint(a.address, 20n * p.BOND); await token.connect(a).approve(addr, ethers.MaxUint256); }
  const fee = (p.BOND * (await oo.burnedBondPercentage())) / 10n ** 18n;
  return { s, p, token, oo, pap, addr, fee, payout: 2n * p.BOND - fee, chainId: (await ethers.provider.getNetwork()).chainId, fromBlock: await ethers.provider.getBlockNumber() };
}
async function register(c, who, dev = newDevice()) {
  const r = await send(c.pap.connect(who).register(dev.x, dev.y, dev.sign(msgReg(c, dev.keyId, who.address))));
  return { dev, r };
}
async function attest(c, who, dev, photo) {
  const b = await ethers.provider.getBlock("latest");
  const sig = dev.sign(msgCap(c, dev.keyId, photo, b.hash));
  const r = await send(c.pap.connect(who).attest(photo, b.number, dev.keyId, sig));
  const v = await c.pap.verify(photo, dev.keyId);
  return { r, sig, anchor: b.number, v, refundableAt: Number(v.refundableAt), until: Number(v.accusableUntil) };
}
async function commit(c, who, photo, keyId, ev = h("evidence")) {
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const cm = commitmentOf(who.address, photo, keyId, ev, salt);
  const r = await send(c.pap.connect(who).commitClaim(cm));
  return { who, photo, keyId, ev, salt, cm, r, at: (await ethers.provider.getBlock(r.blockNumber)).timestamp };
}
const openedId = (c, r) => { for (const l of r.logs) { try { const e = c.pap.interface.parseLog(l); if (e && e.name === "AccusationOpened") return e.args.assertionId; } catch {} } return null; };
async function reveal(c, k, o = {}) { const r = await send(c.pap.connect(k.who).revealClaim(k.photo, k.keyId, k.ev, k.salt, o)); return { r, id: openedId(c, r) }; }
async function accuse(c, who, photo, keyId, ev) { const k = await commit(c, who, photo, keyId, ev); const x = await reveal(c, k); return { ...k, ...x }; }
async function vote(c, id, truthful, who) {   // UMA's vote (simulated), then anyone settles the assertion at the oracle
  await send(c.oo.connect(c.s[19]).resolve(id, truthful));
  return send(c.oo.connect(who || c.s[19]).settleAssertion(id));
}
const tok = (c, a) => c.token.balanceOf(typeof a === "string" ? a : a.address);
/// net(a) = change of token balance + uncollected credit since the snapshot
async function snap(c, accounts) {
  const val = async (a) => (await tok(c, a)) + (await c.pap.credits(a.address));
  const m = {}; for (const a of accounts) m[a.address] = await val(a);
  return async (a) => (await val(a)) - m[a.address];
}
async function cash(c, who) { const cr = await c.pap.credits(who.address); if (cr > 0n) G("withdrawCredit", await send(c.pap.connect(who).withdrawCredit())); return cr; }

/// The token invariants, read from storage for every item the contract's events ever named.
async function invariant(c) {
  const logs = await c.pap.queryFilter("*", c.fromBlock);
  const recs = new Map(), cms = new Set(), ids = new Set(), who = new Set();
  for (const l of logs) {
    const a = l.args;
    if (l.eventName === "Attested") recs.set(a.photoHash + a.keyId, [a.photoHash, a.keyId]);
    if (l.eventName === "Committed") cms.add(a.commitment);
    if (l.eventName === "AccusationOpened") ids.add(a.assertionId);
    if (l.eventName === "Credited") who.add(a.account);
  }
  let deposits = 0n, bonds = 0n, credits = 0n, open = 0n;
  for (const [ph, k] of recs.values()) if ((await c.pap.records(ph, k)).state === 1n) deposits += c.p.BOND;
  for (const cm of cms) if ((await c.pap.commits(cm)).live) bonds += c.p.BOND;
  for (const id of ids) if ((await c.pap.accusations(id)).open) open++;
  for (const a of who) credits += await c.pap.credits(a);
  const bal = await tok(c, c.addr);
  assert.equal(bal, deposits + bonds + credits, `INVARIANT ${bal} != deposits ${deposits} + commit bonds ${bonds} + credits ${credits}`);
  assert.equal(await tok(c, await c.oo.getAddress()), 2n * c.p.BOND * open, "INVARIANT oracle holds 2 x BOND per open accusation");
  let sum = 0n; for (const a of [c.addr, await c.oo.getAddress(), STORE, BURN, ...c.s.map((x) => x.address)]) sum += await tok(c, a);
  assert.equal(sum, await c.token.totalSupply(), "INVARIANT tokens conserved");
  return { bal, deposits, bonds, credits, open };
}

describe("Paprika", function () {
  let c, s;
  const extra = [];
  beforeEach(async () => { c = await deploy(); s = c.s; extra.length = 0; });
  afterEach(async () => {
    for (const x of [c, ...extra]) {
      const i = await invariant(x);
      console.log(`      invariant ok: Paprika holds ${F(i.bal)} = deposits ${F(i.deposits)} + unrevealed commit bonds ${F(i.bonds)} + credits ${F(i.credits)}; oracle holds 2 x BOND x ${i.open} open; supply conserved`);
    }
  });

  it("1 honest path: register, relayed attest, verify, wait, refund, verify again", async () => {
    const owner = s[1], relayer = s[2], anyone = s[7];
    const w = await snap(c, [owner, relayer]);
    const d = await register(c, owner); G("register", d.r);
    const a = await attest(c, relayer, d.dev, h("p1")); G("attest", a.r);
    gasLog["verify (view, eth_estimateGas)"] = await c.pap.verify.estimateGas(h("p1"), d.dev.keyId);
    const v1 = a.v;
    assert.equal(v1.state, 1n); assert.equal(v1.depositor, relayer.address); assert.equal(v1.lockedDeposit, P.BOND);
    assert.equal(v1.refundableAt, v1.accusableUntil + BigInt(P.REVEAL + 1)); assert.equal(v1.recordedBeforeFlag, true);
    await setNext(a.refundableAt - 1);
    const r1 = await rv(c.pap.connect(anyone).refund(h("p1"), d.dev.keyId, LIM), "too early");
    G("refund", await send(c.pap.connect(anyone).refund(h("p1"), d.dev.keyId)));
    await cash(c, relayer);
    const v2 = await c.pap.verify(h("p1"), d.dev.keyId);
    assert.equal(v2.state, 3n); assert.equal(v2.lockedDeposit, 0n); assert.equal(v2.recordedBlock, v1.recordedBlock);
    assert.equal(await w(owner), 0n); assert.equal(await w(relayer), 0n);
    CASE("honest path", `owner registers for free; a relayer submits the device-signed photo and pays the deposit BOND; after PHOTO_WINDOW + REVEAL_WINDOW a stranger triggers the refund (one second earlier: "${r1}"); the record stays`, `owner 0 tokens (${d.r.gasUsed} gas); relayer locked BOND = ${F(P.BOND)} for PHOTO_WINDOW + REVEAL_WINDOW + 1 s = ${P.WINDOW + P.REVEAL + 1} s, net ${F(await w(relayer))}; verify before: state ${ST[v1.state]}, anchorBlock ${v1.anchorBlock}, recordedBlock ${v1.recordedBlock}, accusableUntil = attest time + PHOTO_WINDOW, refundableAt = accusableUntil + REVEAL_WINDOW + 1, depositor relayer, lockedDeposit ${F(v1.lockedDeposit)}, device ${DS[v1.deviceStatus]}, recordedBeforeFlag ${v1.recordedBeforeFlag}; after: state ${ST[v2.state]}, lockedDeposit ${F(v2.lockedDeposit)}, recordedBlock ${v2.recordedBlock} unchanged`);
  });

  it("2 one pixel changed: no record", async () => {
    const d = await register(c, s[1]); await attest(c, s[1], d.dev, h("p1"));
    const v = await c.pap.verify(h("p1 with one pixel changed"), d.dev.keyId);
    assert.equal(v.state, 0n); assert.equal(v.recordedBlock, 0n); assert.equal(v.recordedBeforeFlag, false);
    assert.equal((await c.pap.attestersOf(h("p1 with one pixel changed"))).length, 0);
    CASE("one pixel changed", "attestersOf(sha256 of the modified file) is empty and verify(that hash, same key) finds nothing", `state ${ST[v.state]}, recordedBlock ${v.recordedBlock}, lockedDeposit ${F(v.lockedDeposit)}, recordedBeforeFlag ${v.recordedBeforeFlag} (device ${DS[v.deviceStatus]} describes the key, not the photo)`);
  });

  it("3 refund timing: too early, while accused, window extended after a rejected accusation, repeated self-accusation", async () => {
    const owner = s[1], griefer = s[4], forger = s[5], sybil = s[6], anyone = s[7];
    const d = await register(c, owner); const a = await attest(c, owner, d.dev, h("p3"));
    const k = await accuse(c, griefer, h("p3"), d.dev.keyId);
    const r1 = await rv(c.pap.connect(anyone).refund(h("p3"), d.dev.keyId), "not attested");
    await later(P.VOTE);
    const res = await vote(c, k.id, false);
    const tRes = (await ethers.provider.getBlock(res.blockNumber)).timestamp, opened = Number((await c.pap.accusations(k.id)).openedAt);
    const v = await c.pap.verify(h("p3"), d.dev.keyId);
    assert.equal(Number(v.accusableUntil), a.until + (tRes - opened));
    await setNext(a.refundableAt);
    const r2 = await rv(c.pap.connect(anyone).refund(h("p3"), d.dev.keyId, LIM), "too early");
    await warpTo(Number(v.refundableAt)); await send(c.pap.connect(anyone).refund(h("p3"), d.dev.keyId));
    assert.equal(await c.pap.credits(anyone.address), 0n);
    // a forger accusing its own photo with no evidence, round after round
    const f = await register(c, forger); const fa = await attest(c, forger, f.dev, h("p3 fake"));
    const w = await snap(c, [forger, sybil]); const ROUNDS = 3; let accused = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const x = await accuse(c, sybil, h("p3 fake"), f.dev.keyId, h("no evidence " + i));
      await later(P.VOTE); const rr = await vote(c, x.id, false);
      accused += (await ethers.provider.getBlock(rr.blockNumber)).timestamp - Number((await c.pap.accusations(x.id)).openedAt);
    }
    const fv = await c.pap.verify(h("p3 fake"), f.dev.keyId);
    const net = (await w(forger)) + (await w(sybil));
    assert.equal(net, -BigInt(ROUNDS) * c.fee); assert.equal(Number(fv.accusableUntil), fa.until + accused);
    CASE("refund timing", `refund one second before refundableAt: "too early"; while accused: "${r1}"; after a rejected accusation open for ${tRes - opened} s the window is extended by exactly that time, so the old refundableAt gives "${r2}"; a stranger triggers the refund, the depositor is credited`, `extension = time under accusation = ${tRes - opened} s; stranger gets 0`);
    CASE("repeated self-accusation (delay attempt)", `${ROUNDS} rounds of a rejected self-accusation: each round extends accusableUntil by its own duration, so hunters keep the full PHOTO_WINDOW of unaccused time and the window never runs out`, `forger + second account net -ROUNDS x fee = ${F(net)} (fee = ${F(c.fee)} per round); accusableUntil moved by ${accused} s = total time accused`);
  });

  it("4 a true accusation: commit, reveal, UMA vote true, settle", async () => {
    const forger = s[5], hunter = s[3];
    const w = await snap(c, [forger, hunter]), store0 = await tok(c, STORE);
    const d = await register(c, forger);
    await attest(c, forger, d.dev, h("fake")); const other = await attest(c, forger, d.dev, h("other photo"));
    const k = await commit(c, hunter, h("fake"), d.dev.keyId); G("commitClaim", k.r);
    const x = await reveal(c, k); G("revealClaim (assertTruth + disputeAssertion)", x.r);
    const claimLog = (await c.oo.queryFilter(c.oo.filters.AssertionMade(x.id)))[0];
    const claimText = ethers.toUtf8String(claimLog.args.claim);
    assert(claimText.includes(h("fake").slice(2)) && claimText.includes(d.dev.keyId.slice(2)));
    const vA = await c.pap.verify(h("fake"), d.dev.keyId);
    assert.equal(vA.state, 2n); assert.equal(vA.lockedDeposit, P.BOND);
    await send(c.oo.resolve(x.id, true));
    G("oo.settleAssertion -> assertionResolvedCallback (proven)", await send(c.oo.connect(s[19]).settleAssertion(x.id)));
    const vF = await c.pap.verify(h("fake"), d.dev.keyId);
    assert.equal(vF.state, 4n); assert.equal(vF.deviceStatus, 2n); assert.equal(vF.reason, 1n); assert.equal(vF.lockedDeposit, 0n);
    const an = await ethers.provider.getBlock("latest");
    const r2 = await rv(c.pap.connect(forger).attest(h("new"), an.number, d.dev.keyId, d.dev.sign(msgCap(c, d.dev.keyId, h("new"), an.hash))), "not active");
    const vO = await c.pap.verify(h("other photo"), d.dev.keyId);
    assert.equal(vO.state, 1n); assert.equal(vO.recordedBeforeFlag, true);
    await warpTo(other.refundableAt); await send(c.pap.refund(h("other photo"), d.dev.keyId));
    assert.equal(await w(hunter), c.payout - P.BOND); assert.equal(await w(forger), -P.BOND); assert.equal((await tok(c, STORE)) - store0, c.fee);
    CASE("true accusation", `hunter commits + reveals with BOND; Paprika asserts the claim at UMA and disputes it at once with the photo's deposit, so UMA votes; the vote says true: photo ${ST[vF.state]} (final), device ${DS[vF.deviceStatus]} (${RS[vF.reason]}) at block ${vF.flaggedAtBlock}; the device's next attest: "${r2}"; its OTHER record stays ${ST[vO.state]} (recordedBeforeFlag ${vO.recordedBeforeFlag}) and is refunded normally. Claim text sent to UMA: "${claimText}"`, `hunter credited 2 x BOND - fee = ${F(c.payout)}, net +BOND - fee = ${F(await w(hunter))}; forger -BOND = ${F(await w(forger))}; UMA Store +fee = ${F(c.fee)}`);
  });

  it("5 a false accusation: UMA vote false", async () => {
    const owner = s[1], griefer = s[4];
    const w = await snap(c, [owner, griefer]), store0 = await tok(c, STORE);
    const d = await register(c, owner); await attest(c, owner, d.dev, h("real"));
    const k = await accuse(c, griefer, h("real"), d.dev.keyId);
    await later(P.VOTE); await send(c.oo.resolve(k.id, false));
    G("oo.settleAssertion -> assertionResolvedCallback (rejected)", await send(c.oo.connect(s[19]).settleAssertion(k.id)));
    const v = await c.pap.verify(h("real"), d.dev.keyId);
    assert.equal(v.state, 1n); assert.equal(v.deviceStatus, 1n); assert.equal(v.lockedDeposit, P.BOND);
    await warpTo(Number(v.refundableAt)); await send(c.pap.refund(h("real"), d.dev.keyId));
    assert.equal(await w(griefer), -P.BOND); assert.equal(await w(owner), c.payout - P.BOND); assert.equal((await tok(c, STORE)) - store0, c.fee);
    CASE("false accusation", `UMA votes false: the deposit is restored in Paprika, the record is ${ST[v.state]} again with its window extended by the ${P.VOTE} s of the vote, the device stays ${DS[v.deviceStatus]}; refund works afterwards`, `accuser -BOND = ${F(await w(griefer))}; depositor +BOND - fee = ${F(await w(owner))} (deposit back in full); UMA Store +fee = ${F(c.fee)}`);
  });

  it("6 the vote errs", async () => {
    const owner = s[1], liar = s[4], forger = s[5], hunter = s[3];
    const w = await snap(c, [owner, liar, forger, hunter]);
    const d = await register(c, owner); await attest(c, owner, d.dev, h("genuine"));
    const k = await accuse(c, liar, h("genuine"), d.dev.keyId); await vote(c, k.id, true);   // wrong verdict
    const v = await c.pap.verify(h("genuine"), d.dev.keyId);
    assert.equal(await w(owner), -P.BOND); assert.equal(await w(liar), c.payout - P.BOND);
    const f = await register(c, forger); await attest(c, forger, f.dev, h("deepfake"));
    const k2 = await accuse(c, hunter, h("deepfake"), f.dev.keyId); await vote(c, k2.id, false);   // wrong verdict
    assert.equal(await w(hunter), -P.BOND); assert.equal(await w(forger), c.payout - 2n * P.BOND);   // its deposit is restored, still locked
    CASE("the vote errs", `a false accusation voted true: the honest photo reads ${ST[v.state]} for good and the honest device is ${DS[v.deviceStatus]} (${RS[v.reason]}); a true accusation voted false: the fake stays Attested and gets its window extended`, `honest depositor -BOND = ${F(-P.BOND)} and loses its key; false accuser +BOND - fee = ${F(c.payout - P.BOND)}; rejected true accuser -BOND = ${F(-P.BOND)}; forger +BOND - fee = ${F(c.payout - P.BOND)} (its deposit stays at risk). Paprika cannot tell; the outcome is only as good as UMA's vote`);
  });

  it("7 self-accusation by the depositor's second account", async () => {
    const forger = s[5], sybil = s[6];
    const w = await snap(c, [forger, sybil]);
    const d = await register(c, forger); await attest(c, forger, d.dev, h("self"));
    const k = await accuse(c, sybil, h("self"), d.dev.keyId); await vote(c, k.id, true);
    const net = (await w(forger)) + (await w(sybil));
    assert.equal(net, -c.fee);
    CASE("self-accusation", "the forger's second account accuses and wins; no treasury to drain", `forger -BOND = ${F(await w(forger))}, second account +BOND - fee = ${F(await w(sybil))}; net -fee = ${F(net)}: the real penalty for a fake is UMA's fee share, fee = burnedBondPercentage x BOND, not BOND`);
  });

  it("8 a flagged party comes back with a new key", async () => {
    const forger = s[5];
    const d = await register(c, forger); await attest(c, forger, d.dev, h("f8"));
    const k = await accuse(c, s[3], h("f8"), d.dev.keyId); await vote(c, k.id, true);
    const r1 = await rv(c.pap.connect(forger).register(d.dev.x, d.dev.y, d.dev.sign(msgReg(c, d.dev.keyId, forger.address))), "key used");
    const w = await snap(c, [forger]);
    const n = await register(c, forger);
    const a = await attest(c, forger, n.dev, h("f8 again"));
    assert.equal(await w(forger), -P.BOND);
    CASE("flagged party returns with a new key", `the flagged key cannot register again ("${r1}"); a fresh key registers for FREE and attests at once. LIMIT: a flag costs nothing; nothing links the new key to the old one; the only deterrent is the per-photo deposit`, `new key: 0 tokens + ${n.r.gasUsed} gas; its next photo locks BOND = ${F(P.BOND)} as for anyone (state ${ST[a.v.state]})`);
  });

  it("9 front-running: attest, register, commitment, a hunter's reveal", async () => {
    const owner = s[1], relayer = s[2], thief = s[8], hunter = s[3], forger = s[5], sybil = s[6];
    const d = await register(c, owner);
    const w = await snap(c, [relayer, thief]);
    const st = async (t) => (await ethers.provider.getTransactionReceipt(t.hash)).status;
    // (a) copied attest calldata
    await automine(false);
    const b = await ethers.provider.getBlock("latest");
    const t1 = await c.pap.connect(relayer).attest(h("scoop"), b.number, d.dev.keyId, d.dev.sign(msgCap(c, d.dev.keyId, h("scoop"), b.hash)), { gasPrice: 2e9, gasLimit: 500000 });
    const t2 = await thief.sendTransaction({ to: c.addr, data: t1.data, gasPrice: 3e9, gasLimit: 500000 });
    await mine(); await automine(true);
    assert.equal(await st(t1), 0); assert.equal(await st(t2), 1);
    const v = await c.pap.verify(h("scoop"), d.dev.keyId);
    assert.equal(v.depositor, thief.address);
    const relayerNet = await w(relayer), thiefNet = await w(thief);
    assert.equal(relayerNet, 0n); assert.equal(thiefNet, -P.BOND);
    // (b) copied register
    const n = newDevice();
    await automine(false);
    const t3 = await c.pap.connect(owner).register(n.x, n.y, n.sign(msgReg(c, n.keyId, owner.address)), { gasPrice: 2e9, gasLimit: 500000 });
    const t4 = await thief.sendTransaction({ to: c.addr, data: t3.data, gasPrice: 3e9, gasLimit: 500000 });
    await mine(); await automine(true);
    assert.equal(await st(t3), 1); assert.equal(await st(t4), 0);
    // (c) copied commitment
    const fd = await register(c, forger); await attest(c, forger, fd.dev, h("df9"));
    const salt = ethers.hexlify(ethers.randomBytes(32)), ev = h("e9");
    const cm = commitmentOf(hunter.address, h("df9"), fd.dev.keyId, ev, salt);
    await automine(false);
    const t5 = await c.pap.connect(hunter).commitClaim(cm, { gasPrice: 2e9, gasLimit: 300000 });
    const t6 = await c.pap.connect(thief).commitClaim(cm, { gasPrice: 3e9, gasLimit: 300000 });
    await mine(); await automine(true);
    assert.equal(await st(t5), 0); assert.equal(await st(t6), 1);
    const rT = await rv(c.pap.connect(thief).revealClaim(h("df9"), fd.dev.keyId, ev, salt), "no commit");
    const rH = await rv(c.pap.connect(hunter).revealClaim(h("df9"), fd.dev.keyId, ev, salt), "no commit");
    // (d) the hunter commits again; the forger, without an earlier commitment, sees the reveal and commits in that block
    const wd = await snap(c, [hunter, forger, sybil]);
    const kh = await commit(c, hunter, h("df9"), fd.dev.keyId, ev);
    const salt2 = ethers.hexlify(ethers.randomBytes(32)), cm2 = commitmentOf(sybil.address, h("df9"), fd.dev.keyId, h("x"), salt2);
    await automine(false);
    const t7 = await c.pap.connect(hunter).revealClaim(kh.photo, kh.keyId, kh.ev, kh.salt, { gasPrice: 2e9, gasLimit: 2000000 });
    const t8 = await c.pap.connect(sybil).commitClaim(cm2, { gasPrice: 3e9, gasLimit: 300000 });
    const t9 = await c.pap.connect(sybil).revealClaim(h("df9"), fd.dev.keyId, h("x"), salt2, { gasPrice: 3e9, gasLimit: 2000000 });
    await mine(); await automine(true);
    assert.equal(await st(t7), 1); assert.equal(await st(t8), 1); assert.equal(await st(t9), 0);   // a reveal needs a commit at least one block earlier
    const id = openedId(c, await ethers.provider.getTransactionReceipt(t7.hash));
    await vote(c, id, true);
    await send(c.pap.connect(sybil).revealClaim(h("df9"), fd.dev.keyId, h("x"), salt2));   // photo is Fake now: bond back
    assert.equal(await wd(hunter), c.payout - P.BOND); assert.equal(await wd(sybil), 0n);
    await warpTo(kh.at + P.REVEAL + 1); await send(c.pap.forfeitCommit(cm));
    CASE("mempool copies", `(a) copied attest: the copy (higher gas price) lands first; the record carries the HONEST key and the copier is the depositor; the honest tx reverts "exists"; (b) copied register reverts (proof of possession names msg.sender); (c) a copied commitment landing first makes the honest commit revert "commitment used"; nobody can reveal it ("${rT}" / "${rH}"); the hunter commits again with a new salt and the copy is forfeited`, `(a) honest sender ${F(relayerNet)} tokens (gas only); copier -BOND = ${F(thiefNet)}, locked under the honest key (refunded later unless the photo is proven fake); (b) copier gas only; (c) copier -BOND = ${F(-P.BOND)} (to the burn address), hunter gas only and one block`);
    CASE("reveal seen in the mempool", `the forger's account commits in the hunter's reveal block and tries to reveal in the same block: reverts ("too early": a reveal needs a commitment from an earlier block); the hunter's accusation opens and is voted true; the forger's later reveal on the Fake photo just gets its bond back`, `hunter +BOND - fee = ${F(await wd(hunter))}; forger's account ${F(await wd(sybil))}; forger -BOND`);
  });

  it("10 insurance: the forger holds its own earlier commitment and reveals first", async () => {
    const forger = s[5], sybil = s[6], hunter = s[3];
    async function scenario(photo, voteDelay, truthful) {
      const w = await snap(c, [forger, sybil, hunter]);
      const d = await register(c, forger); await attest(c, forger, d.dev, h(photo));
      const ks = await commit(c, sybil, h(photo), d.dev.keyId, h("own evidence"));   // the insurance
      await later(P.REVEAL / 4);
      const kh = await commit(c, hunter, h(photo), d.dev.keyId);
      await automine(false);
      const th = await c.pap.connect(hunter).revealClaim(kh.photo, kh.keyId, kh.ev, kh.salt, { gasPrice: 2e9, gasLimit: 2000000 });
      const ts = await c.pap.connect(sybil).revealClaim(ks.photo, ks.keyId, ks.ev, ks.salt, { gasPrice: 3e9, gasLimit: 2000000 });
      await mine(); await automine(true);
      assert.equal((await ethers.provider.getTransactionReceipt(th.hash)).status, 0);
      const id = openedId(c, await ethers.provider.getTransactionReceipt(ts.hash));
      await later(voteDelay); await vote(c, id, truthful);
      let hunterFate;
      if ((await ethers.provider.getBlock("latest")).timestamp + 1 <= kh.at + P.REVEAL) {
        const x = await reveal(c, kh);
        hunterFate = x.id ? "reveals again: accusation opens" : "reveals again: bond returned";
        if (x.id) await vote(c, x.id, true);
      } else {
        await send(c.pap.forfeitCommit(kh.cm)); hunterFate = "commitment expired during the vote and was forfeited";
      }
      return { fnet: (await w(forger)) + (await w(sybil)), hnet: await w(hunter), hunterFate };
    }
    const A = await scenario("insured A", 60, true);            // vote shorter than REVEAL_WINDOW (only in a test)
    const B = await scenario("insured B", P.VOTE, true);        // realistic: UMA's vote takes days
    const C = await scenario("insured C", P.VOTE, false);       // junk self-accusation, rejected after days
    assert.equal(A.fnet, -c.fee); assert.equal(A.hnet, 0n);
    assert.equal(B.fnet, -c.fee); assert.equal(B.hnet, -P.BOND);
    assert.equal(C.fnet, -c.fee - P.BOND); assert.equal(C.hnet, -P.BOND);   // in C the forger's deposit is still locked (refundable later)
    // insurance that is never needed
    const w2 = await snap(c, [forger, sybil]);
    const d = await register(c, forger); await attest(c, forger, d.dev, h("insured D"));
    const kf = await commit(c, sybil, h("insured D"), d.dev.keyId);
    await warpTo(kf.at + P.REVEAL + 1); await send(c.pap.forfeitCommit(kf.cm));
    const unused = -((await w2(forger)) + (await w2(sybil))) - P.BOND;   // minus the deposit, still locked
    assert.equal(unused, P.BOND);
    CASE("insurance (STATED RESIDUAL)", `the forger's account committed first; when the hunter's reveal appears it reveals with a higher gas price and its accusation opens; the hunter's reveal reverts "accusation open". (A) vote true within REVEAL_WINDOW (test only): hunter ${A.hunterFate}; (B) vote true after ${P.VOTE} s: hunter ${B.hunterFate}; (C) junk self-accusation rejected after ${P.VOTE} s: hunter ${C.hunterFate}, photo stays Attested with a longer window`, `forger + account: A -fee = ${F(A.fnet)}, B -fee = ${F(B.fnet)}, C -fee = ${F(C.fnet + P.BOND)} (plus its deposit BOND still locked and refundable); hunter: A ${F(A.hnet)}, B -BOND = ${F(B.hnet)}, C -BOND = ${F(C.hnet)}. FLAW: whenever UMA's vote outlasts REVEAL_WINDOW, a blocked hunter loses BOND. Unused insurance costs BOND = ${F(unused)} per REVEAL_WINDOW (forfeited), or fee = ${F(c.fee)} per round if revealed as a junk self-accusation`);
  });

  it("11 a second accusation while one is open", async () => {
    const owner = s[5], A = s[3], B = s[4];
    const w = await snap(c, [A, B]);
    const d = await register(c, owner); await attest(c, owner, d.dev, h("p11"));
    const kA = await accuse(c, A, h("p11"), d.dev.keyId);
    const kB = await commit(c, B, h("p11"), d.dev.keyId);
    const r1 = await rv(reveal(c, kB), "accusation open");
    assert.equal((await c.pap.commits(kB.cm)).live, true);
    await vote(c, kA.id, false);   // quick vote in this test
    const xB = await reveal(c, kB);
    assert(xB.id);
    await vote(c, xB.id, true);
    assert.equal(await w(A), -P.BOND); assert.equal(await w(B), c.payout - P.BOND);
    CASE("second accusation while one is open", `B's reveal while A's accusation is open: "${r1}"; B's commitment stays valid until it expires; A is voted false, then B reveals the same commitment (still within REVEAL_WINDOW) and is voted true`, `A -BOND = ${F(await w(A))}; B +BOND - fee = ${F(await w(B))}. Only one accusation per photo at a time`);
  });

  it("12 invalid accusations: no record, refunded, fake, out of window, early / late / other account / wrong salt, forfeit", async () => {
    const owner = s[1], hunter = s[3], other = s[8];
    const d = await register(c, owner);
    const burn0 = await tok(c, BURN);
    const kN = await commit(c, hunter, h("never attested"), d.dev.keyId);
    const R = { never: await rv(reveal(c, kN), "no record") };
    const a = await attest(c, owner, d.dev, h("p12"));
    await warpTo(a.refundableAt); await send(c.pap.refund(h("p12"), d.dev.keyId));
    const kR = await commit(c, hunter, h("p12"), d.dev.keyId);
    R.refunded = await rv(reveal(c, kR), "refunded");
    const b = await attest(c, owner, d.dev, h("p12b"));
    await warpTo(b.until + 1);
    const kL = await commit(c, hunter, h("p12b"), d.dev.keyId);
    R.afterWindow = await rv(reveal(c, kL), "outside window");
    await attest(c, owner, d.dev, h("p12 fake"));
    const x = await accuse(c, s[4], h("p12 fake"), d.dev.keyId); await vote(c, x.id, true);
    const wf = await snap(c, [hunter]);
    const kF = await commit(c, hunter, h("p12 fake"), d.dev.keyId);
    const xf = await reveal(c, kF);
    assert.equal(xf.id, null); assert.equal(await wf(hunter), 0n);
    const d2 = await register(c, owner); await attest(c, owner, d2.dev, h("p12c"));
    const salt = ethers.hexlify(ethers.randomBytes(32)), cm = commitmentOf(hunter.address, h("p12c"), d2.dev.keyId, h("e"), salt);
    await automine(false);
    const tc = await c.pap.connect(hunter).commitClaim(cm, { gasLimit: 300000 });
    const tr = await c.pap.connect(hunter).revealClaim(h("p12c"), d2.dev.keyId, h("e"), salt, { gasLimit: 2000000 });
    await mine(); await automine(true);
    assert.equal((await ethers.provider.getTransactionReceipt(tc.hash)).status, 1); assert.equal((await ethers.provider.getTransactionReceipt(tr.hash)).status, 0);
    R.other = await rv(c.pap.connect(other).revealClaim(h("p12c"), d2.dev.keyId, h("e"), salt), "no commit");
    R.salt = await rv(c.pap.connect(hunter).revealClaim(h("p12c"), d2.dev.keyId, h("e"), ethers.ZeroHash), "no commit");
    R.forfeitEarly = await rv(c.pap.forfeitCommit(cm), "reveal open");
    const at = Number((await c.pap.commits(cm)).committedAt);
    await setNext(at + P.REVEAL + 1);
    R.late = await rv(c.pap.connect(hunter).revealClaim(h("p12c"), d2.dev.keyId, h("e"), salt, LIM), "too late");
    for (const k of [kN, kR, kL]) await send(c.pap.forfeitCommit(k.cm));
    G("forfeitCommit", await send(c.pap.forfeitCommit(cm)));
    R.twice = await rv(c.pap.forfeitCommit(cm), "no commit");
    const burned = (await tok(c, BURN)) - burn0;
    assert.equal(burned, 4n * P.BOND);
    CASE("invalid accusations", `never attested: "${R.never}"; refunded photo: "${R.refunded}"; committed after the window: "${R.afterWindow}"; on a photo already Fake: no accusation, bond credited back (net 0); revealed in the commit block: tx status 0 ("too early"); by another account: "${R.other}"; wrong salt: "${R.salt}"; forfeit before the deadline: "${R.forfeitEarly}"; after REVEAL_WINDOW: "${R.late}"; forfeit twice: "${R.twice}"`, `each unusable commitment is forfeited: accuser -BOND each, burn address +4 x BOND = ${F(burned)}; depositor 0`);
  });

  it("13 griefing: N false accusations in a row against an honest photo", async () => {
    const owner = s[1], griefer = s[4], N = 5;
    const w = await snap(c, [owner, griefer]), store0 = await tok(c, STORE);
    const d = await register(c, owner); const a = await attest(c, owner, d.dev, h("honest"));
    let accused = 0;
    for (let i = 0; i < N; i++) {
      const k = await accuse(c, griefer, h("honest"), d.dev.keyId, h("junk" + i));
      await later(P.VOTE); const r = await vote(c, k.id, false);
      accused += (await ethers.provider.getBlock(r.blockNumber)).timestamp - Number((await c.pap.accusations(k.id)).openedAt);
    }
    const v = await c.pap.verify(h("honest"), d.dev.keyId);
    await warpTo(Number(v.refundableAt)); await send(c.pap.refund(h("honest"), d.dev.keyId));
    const delay = Number(v.refundableAt) - a.refundableAt;
    assert.equal(delay, accused);
    assert.equal(await w(griefer), -BigInt(N) * P.BOND); assert.equal(await w(owner), BigInt(N) * (c.payout - P.BOND)); assert.equal((await tok(c, STORE)) - store0, BigInt(N) * c.fee);
    CASE("griefing", `${N} false accusations, each voted false after ${P.VOTE} s; each one extends the window by its duration`, `griefer -N x BOND = ${F(await w(griefer))}; depositor +N x (BOND - fee) = ${F(await w(owner))}; UMA Store +N x fee = ${F(BigInt(N) * c.fee)}; refund delayed by the total time under accusation = ${delay} s (${(delay / 86400).toFixed(2)} days)`);
  });

  it("14 key revocation", async () => {
    const owner = s[1], holder = s[7], copier = s[8];
    const d = await register(c, owner); const a = await attest(c, owner, d.dev, h("p14"));
    const sig = d.dev.sign(msgRev(c, d.dev.keyId, holder.address));
    await automine(false);
    const t1 = await c.pap.connect(holder).revokeKey(d.dev.keyId, sig, { gasPrice: 2e9, gasLimit: 300000 });
    const t2 = await copier.sendTransaction({ to: c.addr, data: t1.data, gasPrice: 3e9, gasLimit: 300000 });
    await mine(); await automine(true);
    const x1 = await ethers.provider.getTransactionReceipt(t1.hash), x2 = await ethers.provider.getTransactionReceipt(t2.hash);
    assert.equal(x1.status, 1); assert.equal(x2.status, 0); G("revokeKey", x1);
    const b = await ethers.provider.getBlock("latest");
    const r1 = await rv(c.pap.connect(owner).attest(h("p14b"), b.number, d.dev.keyId, d.dev.sign(msgCap(c, d.dev.keyId, h("p14b"), b.hash))), "not active");
    const r2 = await rv(c.pap.connect(holder).revokeKey(d.dev.keyId, sig), "not active");
    const v = await c.pap.verify(h("p14"), d.dev.keyId);
    assert.equal(v.state, 1n); assert.equal(v.lockedDeposit, P.BOND); assert.equal(v.reason, 2n); assert.equal(v.recordedBeforeFlag, true);
    const w = await snap(c, [owner]);
    await warpTo(a.refundableAt); await send(c.pap.refund(h("p14"), d.dev.keyId));
    assert.equal(await w(owner), P.BOND);
    CASE("key revocation", `an account holding the key (not the registering owner) revokes with a signature naming itself; the same tx copied from another address and mined first reverts (status ${x2.status}); the revoked device's attest: "${r1}"; revoke twice: "${r2}"`, `device ${DS[v.deviceStatus]} (${RS[v.reason]}); its record stays ${ST[v.state]} with lockedDeposit ${F(v.lockedDeposit)} and is refunded normally (+BOND = ${F(await w(owner))}); no tokens move at revocation`);
  });

  it("15 signatures: replay, other key, other contract/chain, anchors, high-s, cross-type reuse", async () => {
    const o = s[1];
    const A = await register(c, o), B = await register(c, o);
    const a = await attest(c, o, A.dev, h("p15"));
    const R = {};
    R.replay = await rv(c.pap.connect(o).attest(h("p15"), a.anchor, A.dev.keyId, a.sig), "exists");
    const b = await ethers.provider.getBlock("latest");
    const cap = (dev, cc = c) => dev.sign(msgCap(cc, dev.keyId, h("q"), b.hash));
    R.otherKey = await rv(c.pap.connect(o).attest(h("q"), b.number, A.dev.keyId, cap(B.dev)), "bad sig");
    R.otherChain = await rv(c.pap.connect(o).attest(h("q"), b.number, A.dev.keyId, cap(A.dev, { ...c, chainId: 1n })), "bad sig");
    const c2 = await deploy(); extra.push(c2);
    await send(c2.pap.connect(o).register(A.dev.x, A.dev.y, A.dev.sign(msgReg(c2, A.dev.keyId, o.address))));
    R.otherContract = await rv(c2.pap.connect(o).attest(h("q"), b.number, A.dev.keyId, cap(A.dev)), "bad sig");
    R.highS = await rv(c.pap.connect(o).attest(h("q"), b.number, A.dev.keyId, highS(cap(A.dev))), "bad sig");
    const fresh = newDevice();
    R.highPop = await rv(c.pap.connect(o).register(fresh.x, fresh.y, highS(fresh.sign(msgReg(c, fresh.keyId, o.address)))), "bad sig");
    R.highRev = await rv(c.pap.connect(o).revokeKey(A.dev.keyId, highS(A.dev.sign(msgRev(c, A.dev.keyId, o.address)))), "bad sig");
    const cur = await ethers.provider.getBlockNumber();
    R.future = await rv(c.pap.connect(o).attest(h("q"), cur + 5, A.dev.keyId, A.dev.sign(msgCap(c, A.dev.keyId, h("q"), ethers.ZeroHash))), "anchor");
    const capOld = cap(A.dev);
    await mine(300);
    R.stale = await rv(c.pap.connect(o).attest(h("q"), b.number, A.dev.keyId, capOld), "anchor");
    const X = newDevice();
    const pop = X.sign(msgReg(c, X.keyId, o.address));
    const nb = await ethers.provider.getBlock("latest");
    const capX = X.sign(msgCap(c, X.keyId, h("x"), nb.hash)), revX = X.sign(msgRev(c, X.keyId, o.address));
    R.capAsPop = await rv(c.pap.connect(o).register(X.x, X.y, capX), "bad sig");
    R.revAsPop = await rv(c.pap.connect(o).register(X.x, X.y, revX), "bad sig");
    await send(c.pap.connect(o).register(X.x, X.y, pop));
    R.popAsCap = await rv(c.pap.connect(o).attest(h("x"), nb.number, X.keyId, pop), "bad sig");
    R.revAsCap = await rv(c.pap.connect(o).attest(h("x"), nb.number, X.keyId, revX), "bad sig");
    R.popAsRev = await rv(c.pap.connect(o).revokeKey(X.keyId, pop), "bad sig");
    R.capAsRev = await rv(c.pap.connect(o).revokeKey(X.keyId, capX), "bad sig");
    R.noAllowance = await rv(c.pap.connect(s[17]).attest(h("x"), nb.number, X.keyId, capX), "token call failed");
    await send(c.pap.connect(o).attest(h("x"), nb.number, X.keyId, capX));   // the right one works
    const L = [msgReg(c, X.keyId, o.address), msgCap(c, X.keyId, h("x"), nb.hash), msgRev(c, X.keyId, o.address)].map((m) => ethers.getBytes(m).length);
    assert.equal(new Set(L).size, 3);
    CASE("signatures", Object.entries(R).map(([k, x]) => `${k}: "${x}"`).join("; "), `signed messages: REGISTER ${L[0]} bytes, CAPTURE ${L[1]}, REVOKE ${L[2]} (distinct labels and lengths); no tokens move on any rejection`);
  });

  it("16 no admin: exact function list, callbacks only from the oracle, no ETH", async () => {
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function").map((f) => `${f.name}${["view", "pure"].includes(f.stateMutability) ? " (view)" : ""}`).sort();
    assert.deepEqual(fns, ["BOND (view)", "BURN (view)", "LIVENESS (view)", "PHOTO_WINDOW (view)", "REVEAL_WINDOW (view)", "accusations (view)",
      "assertionDisputedCallback (view)", "assertionResolvedCallback", "attest", "attestersOf (view)", "commitClaim", "commits (view)", "credits (view)", "currency (view)",
      "devices (view)", "forfeitCommit", "identifier (view)", "oo (view)", "records (view)", "refund", "register", "revealClaim", "revokeKey", "verify (view)", "withdrawCredit"]);
    assert.equal(c.pap.interface.fragments.some((f) => f.payable), false);
    const r1 = await rv(s[1].sendTransaction({ to: c.addr, value: 1n }), "receive");
    const r2 = await rv(c.pap.connect(s[1]).assertionResolvedCallback(h("x"), true), "only oracle");
    const r3 = await rv(c.pap.connect(s[1]).assertionDisputedCallback.staticCall(h("x")), "only oracle");
    // a third party's assertion that names Paprika as callback recipient changes nothing
    await send(c.token.connect(s[9]).approve(await c.oo.getAddress(), ethers.MaxUint256));
    const args = ["0x01", s[9].address, c.addr, ethers.ZeroAddress, 1, await c.token.getAddress(), P.BOND, ethers.ZeroHash, ethers.ZeroHash];
    const ar = await send(c.oo.connect(s[9]).assertTruth(...args));
    const id = c.oo.interface.parseLog(ar.logs.find((l) => l.address === c.oo.target && c.oo.interface.parseLog(l)?.name === "AssertionMade")).args.assertionId;
    await send(c.oo.connect(s[9]).disputeAssertion(id, s[9].address));
    await vote(c, id, true);
    assert.equal((await c.pap.accusations(id)).open, false);
    CASE("no admin", `external functions (exact list): ${fns.join(", ")}; nothing is payable and plain ETH reverts (no ${r1} function); the UMA callbacks only from the oracle: "${r2}" / "${r3}"; a third party's assertion naming Paprika as callback recipient is ignored`, "no owner, no upgrade, no treasury");
  });

  it("17 a depositor that cannot receive tokens blocks nobody", async () => {
    const owner = s[1], blockedDep = s[9], griefer = s[4], hunter = s[3];
    const d = await register(c, owner);
    await attest(c, blockedDep, d.dev, h("p17")); await attest(c, blockedDep, d.dev, h("p17 fake"));
    await send(c.token.setBlocked(blockedDep.address, true));
    const k = await accuse(c, griefer, h("p17"), d.dev.keyId); await vote(c, k.id, false);
    const k2 = await accuse(c, hunter, h("p17 fake"), d.dev.keyId); await vote(c, k2.id, true);
    const v = await c.pap.verify(h("p17"), d.dev.keyId);
    await warpTo(Number(v.refundableAt)); await send(c.pap.refund(h("p17"), d.dev.keyId));
    const cr = await c.pap.credits(blockedDep.address);
    const r1 = await rv(c.pap.connect(blockedDep).withdrawCredit(), "token call failed");
    assert.equal(cr, P.BOND + (c.payout - P.BOND)); assert.equal(await cash(c, hunter), c.payout);
    CASE("depositor that cannot receive tokens", `the token refuses transfers to it (blacklist); a rejected accusation, the refund and a proven accusation on its other photo all settle; only its own withdrawCredit fails ("${r1}")`, `it is credited BOND + (BOND - fee) = ${F(cr)}, which stays in Paprika (counted in the invariant); the hunter collects 2 x BOND - fee = ${F(c.payout)}`);
  });

  it("18 constructor checks and a second deployment with other parameters", async () => {
    const Fy = await ethers.getContractFactory("Paprika", s[0]);
    const oo = await c.oo.getAddress(), tk = await c.token.getAddress();
    const bad = [[P.MIN_BOND - 1n, P.WINDOW, P.REVEAL, P.LIVENESS], [0n, P.WINDOW, P.REVEAL, P.LIVENESS], [P.BOND, 0, P.REVEAL, P.LIVENESS], [P.BOND, P.WINDOW, 0, P.LIVENESS], [P.BOND, P.WINDOW, P.REVEAL, 0]];
    for (const x of bad) await rv(Fy.deploy(oo, tk, ...x), "bad params");
    const P2 = { ...P, BOND: P.BOND * 3n, WINDOW: P.WINDOW / 7, REVEAL: P.REVEAL / 6 };
    const c2 = await deploy(P2); extra.push(c2);
    const w = await snap(c2, [s[1], s[3]]);
    const d = await register(c2, s[1]);
    const a = await attest(c2, s[1], d.dev, h("p18")), a2 = await attest(c2, s[1], d.dev, h("p18 b"));
    assert.equal(a.until - (await ethers.provider.getBlock(a.r.blockNumber)).timestamp, P2.WINDOW);
    const k = await accuse(c2, s[3], h("p18"), d.dev.keyId); await vote(c2, k.id, true);
    await warpTo(a2.refundableAt); await send(c2.pap.refund(h("p18 b"), d.dev.keyId));
    assert.equal(await w(s[3]), c2.payout - P2.BOND); assert.equal(await w(s[1]), -P2.BOND);
    CASE("constructor and parameters", `BOND below the oracle's minimum bond, BOND 0, PHOTO_WINDOW 0, REVEAL_WINDOW 0 or LIVENESS 0: each reverts "bad params"; a second deployment uses its own values`, `second deployment (BOND x3, PHOTO_WINDOW /7, REVEAL_WINDOW /6): attest locks ${F(P2.BOND)}; refundableAt = attest time + ${P2.WINDOW + P2.REVEAL + 1} s; winner net +BOND - fee = ${F(await w(s[3]))}; depositor of the fake -BOND = ${F(await w(s[1]))}`);
  });
  it("19 verification from a file alone: attestersOf(photoHash)", async () => {
    const A = await register(c, s[1]), B = await register(c, s[2]);
    const a = await attest(c, s[1], A.dev, h("shared file"));
    await later(1000);
    const b = await attest(c, s[2], B.dev, h("shared file"));
    const list = [...(await c.pap.attestersOf(h("shared file")))], none = [...(await c.pap.attestersOf(h("unknown file")))];
    assert.deepEqual(list, [A.dev.keyId, B.dev.keyId]); assert.deepEqual(none, []);
    gasLog["attestersOf (view, eth_estimateGas, 2 keys)"] = await c.pap.attestersOf.estimateGas(h("shared file"));
    const k = await accuse(c, s[3], h("shared file"), A.dev.keyId); await vote(c, k.id, true);
    const vA = await c.pap.verify(h("shared file"), A.dev.keyId), vB = await c.pap.verify(h("shared file"), B.dev.keyId);
    assert.equal(vA.state, 4n); assert.equal(vB.state, 1n); assert.equal(vB.lockedDeposit, P.BOND); assert.equal(vB.depositor, s[2].address);
    assert.equal(Number(vB.accusableUntil) - Number(vA.accusableUntil), b.until - a.until);
    await warpTo(b.refundableAt); await send(c.pap.refund(h("shared file"), B.dev.keyId));
    CASE("verification from a file alone", `a verifier hashes the file, calls attestersOf(hash), then verify(hash, keyId) for each key; two devices attested the same file: both key ids are returned in order; an unknown hash returns []`, `${list.length} keys; A's record proven Fake (lockedDeposit ${F(vA.lockedDeposit)}), B's record independent: ${ST[vB.state]}, its own depositor, deposit BOND = ${F(vB.lockedDeposit)} and window (${b.until - a.until} s later), refunded on its own schedule`);
  });
});

after(async () => {
  console.log("\n      GAS Paprika with MockOptimisticOracleV3 (gasUsed, optimizer 200 runs, hardfork osaka; oracle rows include the mock's own work)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(62)} ${g}`);
  console.log("\n      SIZE (non-empty, non-comment lines of Solidity; deployed bytecode bytes)");
  const loc = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;
  for (const [n, f] of [["Paprika", "Paprika.sol"], ["MockOptimisticOracleV3", "test/MockOptimisticOracleV3.sol"], ["TestToken", "test/TestToken.sol"]])
    console.log(`        ${n.padEnd(24)} ${String(loc(path.join(__dirname, "..", "contracts", f))).padStart(4)} lines  ${String(((await artifacts.readArtifact(n)).deployedBytecode.length - 2) / 2).padStart(6)} bytes`);
});
