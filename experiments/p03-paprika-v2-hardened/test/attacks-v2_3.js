// Paprika v2.3 (spec/PROTOCOL.md): the attack list re-run against PaprikaV2_3, plus signature hygiene (I),
// prior existence (J) and the claim grace (K). Derived from attacks-v2_2.js. Former header:
// Paprika v2.2: the attack list re-run against PaprikaV2_2 (auto-dispute always on, commit-reveal claims,
// escrowed misuse rewards, several claims per device with a reserved bond each). Mock oracle with UMA's bond split.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers, network, artifacts } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const ST = { None: 0n, Active: 1n, Flagged: 2n, Retired: 3n };
const RS = { None: 0n, KeyMisuse: 1n, DisputeUpheld: 2n };
const RSN = ["None", "KeyMisuse", "DisputeUpheld"];
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const gasLog = {};
const line = (name, verdict, nums) => console.log(`      ATTACK ${name}: ${verdict} | ${nums}`);
const G = (k, g) => { gasLog[k] ??= g; };

async function reverts(pr, reason) {
  try { await (await pr).wait(); } catch (e) {
    assert(String(e.message).includes(reason), `expected "${reason}", got: ${String(e.message).slice(0, 200)}`); return reason;
  }
  throw new Error("expected revert: " + reason);
}
async function rc(txp) { const r = await (await txp).wait(); return { r, gas: r.gasUsed, cost: r.gasUsed * r.gasPrice }; }
const balOf = (a) => ethers.provider.getBalance(typeof a === "string" ? a : a.address);
const mine = (n) => network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
const warp = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await mine(1); };
const automine = (on) => network.provider.send("evm_setAutomine", [on]);

function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const raw = (preimage) => "0x" + crypto.sign("sha256", ethers.getBytes(preimage), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  const sign = (preimage) => lowS(raw(preimage));
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}
// spec/PROTOCOL.md section 4: every message carries the label, chain, contract and keyId
const msgRegK = (c, keyId, owner) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/REGISTER", c.chainId, c.addr, keyId, owner]);
const msgCapK = (c, keyId, photo, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", c.chainId, c.addr, keyId, photo, bh]);
const msgExtK = (c, keyId, sender) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/EXTRACTED", c.chainId, c.addr, keyId, sender]);
const flipS = (sig) => { const r = sig.slice(0, 66), s = BigInt("0x" + sig.slice(66)); return r + (N_P256 - s).toString(16).padStart(64, "0"); };
const lowS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? flipS(sig) : sig);
const highS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? sig : flipS(sig));
const commitment = (claimant, photo, keyId, ev, salt) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"], [claimant, photo, keyId, ev, salt]));

async function deploy() {
  const s = await ethers.getSigners();
  const oracle = await (await ethers.getContractFactory("MockOptimisticOracleV3Burn", s[0])).deploy();
  const pap = await (await ethers.getContractFactory("PaprikaV2_3", s[0])).deploy(await oracle.getAddress());
  const c = { s, oracle, pap, addr: await pap.getAddress(), chainId: (await ethers.provider.getNetwork()).chainId, keys: [] };
  c.STAKE = await pap.MIN_STAKE(); c.BOND = await pap.CLAIM_BOND(); c.UNBOND = Number(await pap.UNBONDING_PERIOD()); c.W = Number(await pap.REVEAL_WINDOW()); c.GRACE = Number(await pap.CLAIM_GRACE());
  return c;
}
async function register(c, owner, dev = newDevice(), stake = c.STAKE) {
  const x = await rc(c.pap.connect(owner).register(dev.x, dev.y, dev.sign(msgRegK(c, dev.keyId, owner.address)), { value: stake }));
  c.keys.push(dev.keyId);
  return { dev, ...x };
}
async function anchorNow() { const b = await ethers.provider.getBlock("latest"); return { n: b.number, hash: b.hash }; }
async function attest(c, relayer, dev, photo) {
  const a = await anchorNow();
  const sig = dev.sign(msgCapK(c, dev.keyId, photo, a.hash));
  return { ...(await rc(c.pap.connect(relayer).attest(photo, a.n, dev.keyId, sig))), anchor: a, sig };
}
async function commit(c, who, photo, keyId, ev = h("evidence")) {
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const cm = commitment(who.address, photo, keyId, ev, salt);
  const x = await rc(c.pap.connect(who).commitClaim(cm, { value: c.BOND })); G("commitClaim", x.gas);
  return { who, photo, keyId, ev, salt, cm, block: x.r.blockNumber };
}
async function reveal(c, k) {
  const x = await rc(c.pap.connect(k.who).revealClaim(k.photo, k.keyId, k.ev, k.salt));
  const ev = x.r.logs.map((l) => { try { return c.pap.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
  const op = ev.find((p) => p.name === "ClaimOpened");
  return { id: op ? op.args.assertionId : null, rejected: !!ev.find((p) => p.name === "RevealRejected"), ...x };
}
async function claim(c, who, photo, keyId, ev) { const k = await commit(c, who, photo, keyId, ev); return reveal(c, k); }
const dvm = (c, id, t) => rc(c.oracle.connect(c.s[0]).resolveDispute(id, t));
const settle = (c, id, who) => rc(c.oracle.connect(who || c.s[19]).settleAssertion(id));
async function uphold(c, id, who) { await dvm(c, id, true); return settle(c, id, who); }
async function reject(c, id, who) { await dvm(c, id, false); return settle(c, id, who); }
async function cash(c, who) { const cr = await c.pap.credit(who.address); if (cr > 0n) G("claimCredit", (await rc(c.pap.connect(who).claimCredit())).gas); return cr; }
const dev_ = (c, keyId) => c.pap.device(keyId);
async function invariant(c) {
  let stakes = 0n, reserved = 0n, open = 0n;
  for (const k of c.keys) { const d = await dev_(c, k); stakes += d.stake; reserved += d.reserved; open += d.openClaims; }
  let credits = 0n; for (const a of c.s) credits += await c.pap.credit(a.address);
  const cb = await c.pap.commitBondsHeld(), inbox = await c.pap.inbox();
  const bal = await balOf(c.addr), ob = await c.oracle.openBonds(), obal = await balOf(await c.oracle.getAddress());
  assert.equal(inbox, 0n, "INVARIANT inbox");
  assert.equal(bal, stakes + credits + cb, `INVARIANT balance ${bal} != stakes ${stakes} + credits ${credits} + commit bonds ${cb}`);
  assert.equal(obal, ob, "INVARIANT oracle balance");
  assert.equal(ob, 2n * reserved, "INVARIANT oracle bonds != 2 x reserved");
  assert.equal(reserved, open * c.BOND, "INVARIANT reserved != open x bond");
  return { bal, stakes, credits, cb, ob };
}

describe("PaprikaV2_3", function () {
  let c, s;
  beforeEach(async () => { c = await deploy(); s = c.s; });
  afterEach(async () => { const i = await invariant(c); console.log(`      invariant ok: contract ${F(i.bal)} = stakes ${F(i.stakes)} + unpaid rewards ${F(i.credits)} + unrevealed commit bonds ${F(i.cb)}; oracle open bonds ${F(i.ob)} = 2 x reserved`); });

  it("0 positive path", async () => {
    const owner = s[1], relayer = s[2], claimant = s[3], challenger = s[5];
    const d1 = await register(c, owner); G("register", d1.gas);
    const a1 = await attest(c, relayer, d1.dev, h("p1")); G("attest", a1.gas);
    const c0 = await balOf(claimant);
    const k = await commit(c, claimant, h("p1"), d1.dev.keyId);
    const rv = await reveal(c, k); G("revealClaim (assert + auto-dispute)", rv.gas);
    let v = await c.pap.verify(h("p1"), d1.dev.keyId);
    assert.equal(v.stake, c.STAKE - c.BOND); assert.equal(v.stakeAtRisk, c.STAKE); assert.equal(v.openClaims, 1n);
    await dvm(c, rv.id, true); G("settle upheld (flag + slash)", (await settle(c, rv.id)).gas);
    v = await c.pap.verify(h("p1"), d1.dev.keyId);
    assert.equal(v.verdict, 1n); assert.equal(v.status, ST.Flagged); assert.equal(v.stakeAtRisk, 0n);
    await cash(c, claimant);
    const cnet = (await balOf(claimant)) - c0;
    const d2 = await register(c, owner); await attest(c, relayer, d2.dev, h("p2"));
    const rv2 = await claim(c, claimant, h("p2"), d2.dev.keyId); await dvm(c, rv2.id, false); G("settle rejected", (await settle(c, rv2.id)).gas);
    assert.equal((await dev_(c, d2.dev.keyId)).stake, c.STAKE + c.BOND / 2n);
    const d4 = await register(c, owner);
    const pm = await rc(c.pap.connect(challenger).proveKeyMisuse(d4.dev.keyId, d4.dev.sign(msgExtK(c, d4.dev.keyId, challenger.address)))); G("proveKeyMisuse (flag, escrow)", pm.gas);
    assert.equal(await c.pap.credit(challenger.address), 0n);
    await reverts(c.pap.settleStake(d4.dev.keyId), "not settleable");
    await mine(c.W);
    G("settleStake (after window)", (await rc(c.pap.settleStake(d4.dev.keyId))).gas);
    assert.equal(await c.pap.credit(challenger.address), c.STAKE / 2n); await cash(c, challenger);
    const d5 = await register(c, owner); await attest(c, relayer, d5.dev, h("p5"));
    G("requestUnbond", (await rc(c.pap.connect(owner).requestUnbond(d5.dev.keyId))).gas);
    await warp(c.UNBOND);
    const wd = await rc(c.pap.connect(owner).withdraw(d5.dev.keyId)); G("withdraw", wd.gas);
    v = await c.pap.verify(h("p5"), d5.dev.keyId); assert.equal(v.withdrawnAtBlock, BigInt(wd.r.blockNumber));
    console.log(`      POSITIVE PATH OK | upheld claim (commit+reveal): claimant net ${F(cnet)} ETH | rejected claim: device stake ${F(c.STAKE)} -> ${F(c.STAKE + c.BOND / 2n)} | misuse reward collectable only after ${c.W} blocks | withdraw ok, withdrawnAtBlock ${v.withdrawnAtBlock}`);
  });

  it("1 ban evasion", async () => {
    const k1 = await register(c, s[6]);
    await c.pap.connect(s[7]).proveKeyMisuse(k1.dev.keyId, k1.dev.sign(msgExtK(c, k1.dev.keyId, s[7].address)));
    const r1 = await reverts(c.pap.connect(s[6]).register(k1.dev.x, k1.dev.y, k1.dev.sign(msgRegK(c, k1.dev.keyId, s[6].address)), { value: c.STAKE }), "key used");
    const k2 = await register(c, s[6]);
    line("ban-evasion", "PRICED", `old key: "${r1}"; new key: ${F(c.STAKE)} ETH stake + ${k2.gas} gas`);
  });

  it("2 synthetic content and its punishment", async () => {
    const forger = s[9], claimant = s[11];
    const k = await register(c, forger); await attest(c, forger, k.dev, h("ai-1"));
    line("synthetic-content", "SUCCEEDS", "software key registers and attests random bytes");
    const c0 = await balOf(claimant);
    const rv = await claim(c, claimant, h("ai-1"), k.dev.keyId); await uphold(c, rv.id); await cash(c, claimant);
    line("synthetic-content punished (upheld claim)", "PRICED", `forger loses ${F(c.STAKE)} ETH; claimant nets ${F((await balOf(claimant)) - c0)} ETH`);
  });

  it("3 front-running: attest copy, same hash, register, misuse proof, commit copy", async () => {
    const honest = s[12], relayer = s[13], thief = s[14], ch = s[15];
    const dH = await register(c, honest), dT = await register(c, thief);
    await automine(false);
    const a = await anchorNow();
    const t1 = await c.pap.connect(relayer).attest(h("scoop"), a.n, dH.dev.keyId, dH.dev.sign(msgCapK(c, dH.dev.keyId, h("scoop"), a.hash)), { gasPrice: 2e9, gasLimit: 500000 });
    const t2 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t1.hash)).data, gasPrice: 3e9, gasLimit: 500000 });
    await c.pap.connect(thief).attest(h("scoop"), a.n, dT.dev.keyId, dT.dev.sign(msgCapK(c, dT.dev.keyId, h("scoop"), a.hash)), { gasPrice: 3e9, gasLimit: 500000 });
    await mine(1); await automine(true);
    const vh = await c.pap.verify(h("scoop"), dH.dev.keyId), vt = await c.pap.verify(h("scoop"), dT.dev.keyId);
    assert(vh.recordedBlock > 0n && vt.recordedBlock > 0n);
    line("front-running (copy attest calldata)", "FAILS", `copied tx records the honest key (status ${(await ethers.provider.getTransactionReceipt(t2.hash)).status}), honest tx reverts "exists"`);
    line("front-running (same hash, thief's own device)", "FAILS (nothing to steal)", `two independent records, windows [${vh.anchorBlock},${vh.recordedBlock}] and [${vt.anchorBlock},${vt.recordedBlock}]; no priority field`);
    const dN = newDevice();
    await automine(false);
    const t5 = await c.pap.connect(honest).register(dN.x, dN.y, dN.sign(msgRegK(c, dN.keyId, honest.address)), { value: c.STAKE, gasPrice: 2e9, gasLimit: 500000 });
    const t6 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t5.hash)).data, value: c.STAKE, gasPrice: 3e9, gasLimit: 500000 });
    await mine(1); await automine(true); c.keys.push(dN.keyId);
    assert.equal((await ethers.provider.getTransactionReceipt(t6.hash)).status, 0);
    line("front-running (register)", "FAILS", "copied register reverts (PoP bound to msg.sender)");
    // commit copy: thief copies a pending commitment; it can never reveal it (commitment names the claimant)
    const k = { who: ch, photo: h("scoop"), keyId: dH.dev.keyId, ev: h("e"), salt: ethers.hexlify(ethers.randomBytes(32)) };
    k.cm = commitment(ch.address, k.photo, k.keyId, k.ev, k.salt);
    await automine(false);
    await c.pap.connect(ch).commitClaim(k.cm, { value: c.BOND, gasPrice: 2e9, gasLimit: 300000 });
    await c.pap.connect(thief).commitClaim(k.cm, { value: c.BOND, gasPrice: 3e9, gasLimit: 300000 });
    await mine(1); await automine(true);
    const rT = await reverts(c.pap.connect(thief).revealClaim(k.photo, k.keyId, k.ev, k.salt), "no commit");
    const rv = await reveal(c, k);
    assert(rv.id);
    await mine(c.W + 1);
    await c.pap.forfeitCommit(thief.address, k.cm);
    line("front-running (copy a pending commitment)", "FAILS", `thief's copy cannot be revealed by the thief ("${rT}"), the honest reveal opens the claim; the thief's bond is forfeited (burned)`);
    await reject(c, rv.id);
  });

  it("4 self-report loop; effective penalty (1 - alpha) x S", async () => {
    const a = s[17], sybil = s[18];
    await register(c, s[1], newDevice(), E("1"));
    const t0 = await balOf(c.addr), a0 = (await balOf(a)) + (await balOf(sybil));
    const N = 5;
    for (let i = 0; i < N; i++) {
      const k = await register(c, a);
      await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExtK(c, k.dev.keyId, sybil.address)));
      await mine(c.W); await c.pap.settleStake(k.dev.keyId); await cash(c, sybil);
    }
    const netM = (await balOf(a)) + (await balOf(sybil)) - a0;
    const b0 = (await balOf(a)) + (await balOf(sybil));
    for (let i = 0; i < N; i++) {
      const k = await register(c, a); await attest(c, a, k.dev, h("junk" + i));
      const rv = await claim(c, sybil, h("junk" + i), k.dev.keyId); await uphold(c, rv.id, sybil); await cash(c, sybil);
    }
    const netC = (await balOf(a)) + (await balOf(sybil)) - b0;
    assert.equal(await balOf(c.addr), t0);
    line("self-report-profit", "FAILS", `${N} misuse self-reports: ${F(netM)} ETH; ${N} upheld self-claims: ${F(netC)} ETH; contract balance ${F(t0)} -> ${F(await balOf(c.addr))}`);
    line("self-slash before any commit: effective penalty", "RESIDUAL (by design)", `per key ${F(-netM / BigInt(N))} ETH = (1 - 0.5) x ${F(c.STAKE)} + gas. Effective penalty = (1 - alpha) x S, not S`);
  });

  it("4b double rewards; first upheld by COMMIT order takes the stake", async () => {
    const owner = s[1], early = s[2], late = s[3], other = s[4];
    const k = await register(c, owner, newDevice(), E("0.5")); await attest(c, owner, k.dev, h("x")); await attest(c, owner, k.dev, h("y"));
    const kE = await commit(c, early, h("x"), k.dev.keyId);
    const kL = await commit(c, late, h("y"), k.dev.keyId);
    const rL = await reveal(c, kL);                        // the later commit is revealed first
    const rE = await reveal(c, kE);
    const r2 = await claim(c, other, h("x"), k.dev.keyId);  // same record already has an open claim
    assert(r2.rejected);
    await uphold(c, rL.id);                                // later-committed claim upheld first: payout waits
    const midLate = await c.pap.credit(late.address);
    await uphold(c, rE.id);
    const cE = await c.pap.credit(early.address), cL = await c.pap.credit(late.address);
    assert.equal(midLate, 0n); assert(cE > 0n); assert.equal(cL, 0n);
    const r3 = await claim(c, other, h("y"), k.dev.keyId);
    line("double-dip / order of upheld claims", "FAILS", `two claims upheld; the later-committed one settled first and waited (credit ${F(midLate)}), the earlier-committed one took the reward share ${F(cE)} ETH; the later one got only its oracle payout (bond + half the device bond), no stake share; 2nd claim on a record with an open claim: rejected, bond credited back; claim after the slash: ${r3.rejected ? "rejected (refund)" : "?"}; other refund ${F(await c.pap.credit(other.address))}`);
    for (const w of [early, other]) await cash(c, w);
  });

  it("5 griefing an honest device (unwatched)", async () => {
    const honest = s[5], griefer = s[6];
    const k = await register(c, honest); await attest(c, honest, k.dev, h("real0"));
    const g0 = await balOf(griefer), h0 = await balOf(honest), sk0 = (await dev_(c, k.dev.keyId)).stake;
    const rv = await claim(c, griefer, h("real0"), k.dev.keyId); await reject(c, rv.id);
    const gNet = (await balOf(griefer)) - g0, hNet = (await balOf(honest)) - h0 + ((await dev_(c, k.dev.keyId)).stake - sk0);
    line("griefing unwatched", "FAILS", `owner did nothing; forced vote rejects; griefer ${F(gNet)} ETH, owner +${F(hNet)} ETH (stake); griefing factor ${(Number(-hNet) / Number(-gNet)).toFixed(3)}. Needs an honest vote (F-17)`);
  });

  it("6 retroactive effect: 100 earlier records", async () => {
    const owner = s[7];
    const k = await register(c, owner); for (let i = 0; i < 100; i++) await attest(c, owner, k.dev, h("old" + i));
    await attest(c, owner, k.dev, h("fake"));
    const rv = await claim(c, s[8], h("fake"), k.dev.keyId); await uphold(c, rv.id); await cash(c, s[8]);
    let n = 0; for (let i = 0; i < 100; i++) { const v = await c.pap.verify(h("old" + i), k.dev.keyId); if (v.recordedBlock > 0n && v.recordedBeforeFlag && v.verdict === 0n) n++; }
    assert.equal(n, 100);
    line("retroactive-censorship", "FAILS", `${n}/100 earlier records kept with recordedBeforeFlag=true; judged photo marked UpheldFake`);
  });

  it("7 replay / domain / anchors", async () => {
    const k = await register(c, s[9]), k2 = await register(c, s[9]);
    const a = await attest(c, s[10], k.dev, h("p"));
    const R = [await reverts(c.pap.attest(h("p"), a.anchor.n, k.dev.keyId, a.sig), "exists")];
    const an = await anchorNow();
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k2.dev.sign(msgCapK(c, k2.dev.keyId, h("q"), an.hash))), "bad sig"));
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCapK({ ...c, chainId: 1n }, k.dev.keyId, h("q"), an.hash))), "bad sig"));
    await mine(300);
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCapK(c, k.dev.keyId, h("q"), an.hash))), "anchor"));
    const now = await anchorNow();
    R.push(await reverts(c.pap.attest(h("q"), now.n + 5, k.dev.keyId, k.dev.sign(msgCapK(c, k.dev.keyId, h("q"), ethers.ZeroHash))), "anchor"));
    line("replay/domain/anchor", "FAILS", R.map((r) => `"${r}"`).join(", "));
  });

  it("8 no admin", async () => {
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    assert.equal(fns.filter((n) => (/owner|admin|upgrade|sweep|rescue|pause|transfer/i.test(n) || /^set[A-Z]/.test(n))).length, 0);
    const r1 = await reverts(s[11].sendTransaction({ to: c.addr, value: E("1") }), "only oracle");
    line("admin / treasury drain", "FAILS", `functions: ${fns.join(", ")}; ETH from non-oracle: "${r1}"`);
  });

  it("9 key squatting; claim on an unattested photo", async () => {
    const vd = newDevice(), sq = newDevice();
    const r1 = await reverts(c.pap.connect(s[14]).register(vd.x, vd.y, sq.sign(msgRegK(c, sq.keyId, s[14].address)), { value: c.STAKE }), "bad pop");
    await register(c, s[13], vd);
    const k = await commit(c, s[14], h("never"), vd.keyId);
    const r2 = await reverts(c.pap.connect(s[14]).revealClaim(k.photo, k.keyId, k.ev, k.salt), "no record");
    await mine(c.W); await c.pap.forfeitCommit(s[14].address, k.cm);
    line("key-squatting / unattested claim", "FAILS", `"${r1}"; reveal "${r2}" (the commit is then forfeited)`);
  });

  it("10 withdrawal races; 10c optimistic finality", async () => {
    const owner = s[16], claimant = s[17], forger = s[18];
    const k = await register(c, owner); await attest(c, owner, k.dev, h("w1"));
    const rv = await claim(c, claimant, h("w1"), k.dev.keyId);
    await c.pap.connect(owner).requestUnbond(k.dev.keyId); await warp(c.UNBOND);
    const ra = await reverts(c.pap.connect(owner).withdraw(k.dev.keyId), "open claims");
    await reject(c, rv.id);
    const rg = await reverts(c.pap.connect(owner).withdraw(k.dev.keyId), "claim grace");
    await mine(c.GRACE); await c.pap.connect(owner).withdraw(k.dev.keyId);
    const k2 = await register(c, owner); await attest(c, owner, k2.dev, h("w2"));
    await c.pap.connect(owner).requestUnbond(k2.dev.keyId);
    await c.pap.connect(s[15]).proveKeyMisuse(k2.dev.keyId, k2.dev.sign(msgExtK(c, k2.dev.keyId, s[15].address)));
    await warp(c.UNBOND);
    const rb = await reverts(c.pap.connect(owner).withdraw(k2.dev.keyId), "not retired");
    await mine(c.W); await c.pap.settleStake(k2.dev.keyId); await cash(c, s[15]);
    line("withdraw races", "FAILS", `open claim: "${ra}"; right after the claim settled: "${rg}" for ${c.GRACE} blocks; escrowed misuse (flagged during unbonding): "${rb}"`);
    const kf = await register(c, forger); await attest(c, forger, kf.dev, h("fake-w"));
    const v0 = await c.pap.verify(h("fake-w"), kf.dev.keyId);
    await c.pap.connect(forger).requestUnbond(kf.dev.keyId); await warp(c.UNBOND);
    const f0 = await balOf(forger); const w = await rc(c.pap.connect(forger).withdraw(kf.dev.keyId));
    const v1 = await c.pap.verify(h("fake-w"), kf.dev.keyId);
    const late = await claim(c, claimant, h("fake-w"), kf.dev.keyId);
    line("exit after the challenge window (10c)", "BY DESIGN (optimistic finality)", `stakeAtRisk ${F(v0.stakeAtRisk)} -> ${F(v1.stakeAtRisk)}, withdrawnAtBlock 0 -> ${v1.withdrawnAtBlock}; forger got ${F((await balOf(forger)) - f0 + w.cost)} ETH back; late claim ${late.rejected ? "rejected, bond refunded" : "?"}`);
    await cash(c, claimant);
  });

  it("11 signature malleability", async () => {
    const k = await register(c, s[19]); const a = await attest(c, s[19], k.dev, h("m"));
    const r1 = await reverts(c.pap.connect(s[6]).attest(h("m"), a.anchor.n, k.dev.keyId, highS(a.sig)), "exists");
    const r2 = await reverts(c.pap.connect(s[6]).proveKeyMisuse(k.dev.keyId, highS(k.dev.sign(msgExtK(c, k.dev.keyId, s[5].address)))), "bad sig");
    line("signature-malleability", "FAILS (harmless)", `"${r1}", "${r2}"`);
  });

  it("12 bounty sniping: open claim, hidden commit, self-slash before any commit", async () => {
    const forger = s[7], sybil = s[8], hunter = s[9];
    // 12a: claim already open
    const k = await register(c, forger); await attest(c, forger, k.dev, h("df"));
    const rv = await claim(c, hunter, h("df"), k.dev.keyId);
    await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExtK(c, k.dev.keyId, sybil.address)));
    await mine(c.W); await reverts(c.pap.settleStake(k.dev.keyId), "not settleable");
    await uphold(c, rv.id);
    const a1 = [await c.pap.credit(hunter.address), await c.pap.credit(sybil.address)];
    assert(a1[0] > 0n && a1[1] === 0n);
    line("sniping an open claim", "FAILS", `hunter reward ${F(a1[0])}, misuse prover ${F(a1[1])}`);
    await cash(c, hunter);
    // 12a': open claim rejected -> prover paid
    const k2 = await register(c, forger); await attest(c, forger, k2.dev, h("ok"));
    const rv2 = await claim(c, hunter, h("ok"), k2.dev.keyId);
    await c.pap.connect(sybil).proveKeyMisuse(k2.dev.keyId, k2.dev.sign(msgExtK(c, k2.dev.keyId, sybil.address)));
    await mine(c.W); await reject(c, rv2.id);
    line("misuse proof after a rejected open claim", "PAID TO PROVER", `prover ${F(await cash(c, sybil))} ETH`);
    // 12b: the hunter COMMITS (target hidden); the forger self-slashes after seeing the commit; the reveal has priority
    const k3 = await register(c, forger); await attest(c, forger, k3.dev, h("df3"));
    const h0 = await balOf(hunter), f0 = (await balOf(forger)) + (await balOf(sybil));
    await automine(false);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const cm = commitment(hunter.address, h("df3"), k3.dev.keyId, h("e"), salt);
    await c.pap.connect(hunter).commitClaim(cm, { value: c.BOND, gasPrice: 2e9, gasLimit: 300000 });
    // the forger sees only an opaque commitment in the mempool; it self-slashes anyway, with a higher gas price
    const tm = await c.pap.connect(sybil).proveKeyMisuse(k3.dev.keyId, k3.dev.sign(msgExtK(c, k3.dev.keyId, sybil.address)), { gasPrice: 3e9, gasLimit: 300000 });
    await mine(1); await automine(true);
    const sameBlock = (await ethers.provider.getTransactionReceipt(tm.hash)).blockNumber;
    const rvA = await reveal(c, { who: hunter, photo: h("df3"), keyId: k3.dev.keyId, ev: h("e"), salt });
    await mine(c.W); await uphold(c, rvA.id); await cash(c, hunter);
    const sc = await c.pap.credit(sybil.address);
    line("self-slash in the SAME block as an opaque commit (12b)", sc > 0n ? "= 12c RESIDUAL (ties go to the prover)" : "FAILS", `commit and misuse proof both in block ${sameBlock}; the claim has priority only if its commit block is EARLIER: prover ${F(sc)} ETH, hunter net ${F((await balOf(hunter)) - h0)} ETH (oracle split only), forger+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f0 + sc)} of 0.1. The forger cannot tell which device the commit targets; reacting to every commit is just the 12c strategy`);
    await cash(c, sybil);
    // 12b': self-slash one block AFTER the commit -> the revealed claim takes priority
    const k4 = await register(c, forger); await attest(c, forger, k4.dev, h("df4"));
    const h4 = await balOf(hunter), f4 = (await balOf(forger)) + (await balOf(sybil));
    const kc = await commit(c, hunter, h("df4"), k4.dev.keyId);
    await c.pap.connect(sybil).proveKeyMisuse(k4.dev.keyId, k4.dev.sign(msgExtK(c, k4.dev.keyId, sybil.address)));
    const rv4 = await reveal(c, kc);
    await mine(c.W); await reverts(c.pap.settleStake(k4.dev.keyId), "not settleable");
    await uphold(c, rv4.id);
    const hc = await c.pap.credit(hunter.address), sc4 = await c.pap.credit(sybil.address);
    await cash(c, hunter);
    assert(hc > 0n && sc4 === 0n);
    line("sniping via self-slash after the commit (12b')", "FAILS", `revealed claim (commit block earlier than proof) takes priority: hunter reward ${F(hc)}, net ${F((await balOf(hunter)) - h4)}; prover ${F(sc4)}; forger+sybil net ${F((await balOf(forger)) + (await balOf(sybil)) - f4)} (full stake lost)`);
    // 12c: self-slash BEFORE any commit -> (1 - alpha) x S
    const k5 = await register(c, forger); await attest(c, forger, k5.dev, h("df5"));
    const f5 = (await balOf(forger)) + (await balOf(sybil)), h5 = await balOf(hunter);
    await c.pap.connect(sybil).proveKeyMisuse(k5.dev.keyId, k5.dev.sign(msgExtK(c, k5.dev.keyId, sybil.address)));
    const rv5 = await claim(c, hunter, h("df5"), k5.dev.keyId);   // committed after the proof: no priority
    await mine(c.W); await c.pap.settleStake(k5.dev.keyId); await cash(c, sybil);
    await uphold(c, rv5.id); await cash(c, hunter);
    line("self-slash before any commit (12c)", "RESIDUAL (by design)", `prover (forger's sybil) gets ${F(c.STAKE - c.BOND)} x 0.5 of the free stake; forger+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f5)} of its 0.1 stake (with no later claim it would recover (alpha) x S = 0.05, i.e. lose (1 - alpha) x S); a late hunter's claim still reserved a bond from the stake and nets ${F((await balOf(hunter)) - h5)} ETH from the oracle split, no stake share`);
  });

  it("13 stolen honest key; several claims per device", async () => {
    const victim = s[10], thief = s[11], griefer = s[12];
    const k = await register(c, victim); await attest(c, victim, k.dev, h("v0"));
    await c.pap.connect(thief).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExtK(c, k.dev.keyId, thief.address)));
    await mine(c.W); await c.pap.settleStake(k.dev.keyId);
    line("stolen honest key -> misuse flag", "SUCCEEDS (accepted, level-0 custody risk)", `thief earns ${F(await cash(c, thief))} ETH after the escrow window`);
    const k2 = await register(c, victim); for (let i = 0; i < 3; i++) await attest(c, victim, k2.dev, h("u" + i));
    await c.pap.connect(victim).requestUnbond(k2.dev.keyId);
    const r = []; for (let i = 0; i < 3; i++) r.push(await claim(c, griefer, h("u" + i), k2.dev.keyId));
    await warp(c.UNBOND);
    const rw = await reverts(c.pap.connect(victim).withdraw(k2.dev.keyId), "open claims");
    for (const x of r) if (x.id) await reject(c, x.id);
    await mine(c.GRACE); await c.pap.connect(victim).withdraw(k2.dev.keyId); await cash(c, griefer);
    line("spam claims vs withdrawal", "PRICED", `${r.filter((x) => x.id).length} claims opened (stake ${F(c.STAKE)} / bond ${F(c.BOND)}), 3rd ${r[2].rejected ? "rejected, refunded" : "opened"}; withdraw "${rw}" until voted; griefer loses ${F(c.BOND)} per rejected claim`);
  });

  it("14 claim-slot squatting: partial and full", async () => {
    const forger = s[13], sybil = s[14], hunter = s[15];
    // partial: one weak claim does not block the hunter
    const k = await register(c, forger); await attest(c, forger, k.dev, h("harmless")); await attest(c, forger, k.dev, h("deepfake")); await attest(c, forger, k.dev, h("harmless2"));
    const w1 = await claim(c, sybil, h("harmless"), k.dev.keyId);
    const hv = await claim(c, hunter, h("deepfake"), k.dev.keyId);
    assert(hv.id);
    line("claim-slot squatting, one weak claim", "FAILS", "hunter's claim opens next to the forger's (stake 0.25 = 2 bond slots of 0.11)");
    await reject(c, w1.id); await uphold(c, hv.id); await cash(c, hunter);
    // full: the forger fills every reservable slot right after retiring
    const k2 = await register(c, forger); await attest(c, forger, k2.dev, h("a")); await attest(c, forger, k2.dev, h("b")); await attest(c, forger, k2.dev, h("df"));
    const f0 = (await balOf(forger)) + (await balOf(sybil)), h0 = await balOf(hunter);
    await c.pap.connect(forger).requestUnbond(k2.dev.keyId);
    const sq = [await claim(c, sybil, h("a"), k2.dev.keyId), await claim(c, sybil, h("b"), k2.dev.keyId)];
    const hb = await claim(c, hunter, h("df"), k2.dev.keyId);
    assert(hb.rejected);
    await warp(c.UNBOND);
    for (const x of sq) await dvm(c, x.id, false);
    // end of the window: forger settles both and tries to withdraw in the same block, ahead of the hunter's reveal
    const kh = await commit(c, hunter, h("df"), k2.dev.keyId);
    await automine(false);
    const tx = [];
    for (const x of sq) tx.push(await c.oracle.connect(forger).settleAssertion(x.id, { gasPrice: 3e9, gasLimit: 800000 }));
    tx.push(await c.pap.connect(forger).withdraw(k2.dev.keyId, { gasPrice: 3e9, gasLimit: 300000 }));
    tx.push(await c.pap.connect(hunter).revealClaim(kh.photo, kh.keyId, kh.ev, kh.salt, { gasPrice: 2e9, gasLimit: 800000 }));
    await mine(1); await automine(true);
    const st = []; for (const t of tx) st.push((await ethers.provider.getTransactionReceipt(t.hash)).status);
    const v = await c.pap.verify(h("df"), k2.dev.keyId);
    assert.equal(st[2], 0); assert.equal(st[3], 1); assert.equal(v.openClaims, 1n);
    // and if the forger instead refills both slots in the settlement block, it cannot withdraw until those settle + grace
    const hid = (await c.pap.openClaimIds(k2.dev.keyId))[0];
    await uphold(c, hid); await cash(c, hunter);
    const fNet = (await balOf(forger)) + (await balOf(sybil)) - f0, hNet = (await balOf(hunter)) - h0;
    line("claim-slot squatting, all slots filled, same-block exit (K)", "FAILS", `settle/settle/withdraw/hunter-reveal in one block: statuses ${st.join("/")} - withdraw reverts "claim grace" (needs ${c.GRACE} blocks after the last settlement), the hunter's reveal opens a claim (slots free again) and is upheld. Forger+sybil net ${F(fNet)} ETH (full stake lost + 2 weak bonds' net), hunter net ${F(hNet)} ETH. Squatting now buys delay only: ${F(c.BOND / 2n)} ETH per slot per vote period (k = ${c.STAKE / c.BOND} slots at S=${F(c.STAKE)}, B=${F(c.BOND)} -> ${F((c.STAKE / c.BOND) * c.BOND / 2n)} per period) and the forger can never withdraw without a ${c.GRACE}-block period with no open claim`);
  });

  it("15 commit-reveal mechanics", async () => {
    const owner = s[1], hunter = s[2], other = s[3], hunter2 = s[4];
    const k = await register(c, owner); await attest(c, owner, k.dev, h("r"));
    const kc = await commit(c, hunter, h("r"), k.dev.keyId);
    const R = {};
    R.other = await reverts(c.pap.connect(other).revealClaim(kc.photo, kc.keyId, kc.ev, kc.salt), "no commit");
    R.salt = await reverts(c.pap.connect(hunter).revealClaim(kc.photo, kc.keyId, kc.ev, ethers.ZeroHash), "no commit");
    R.window = await reverts(c.pap.forfeitCommit(hunter.address, kc.cm), "window open");
    await mine(c.W);
    R.late = await reverts(c.pap.connect(hunter).revealClaim(kc.photo, kc.keyId, kc.ev, kc.salt), "too late");
    const b0 = await balOf("0x000000000000000000000000000000000000dEaD");
    G("forfeitCommit", (await rc(c.pap.forfeitCommit(hunter.address, kc.cm))).gas);
    const burned = (await balOf("0x000000000000000000000000000000000000dEaD")) - b0;
    R.twice = await reverts(c.pap.forfeitCommit(hunter.address, kc.cm), "no commit");
    // too early: commit and reveal in the same block
    const salt = ethers.hexlify(ethers.randomBytes(32)); const cm = commitment(hunter.address, h("r"), k.dev.keyId, h("e"), salt);
    await automine(false);
    await c.pap.connect(hunter).commitClaim(cm, { gasLimit: 300000, value: c.BOND });
    const te = await c.pap.connect(hunter).revealClaim(h("r"), k.dev.keyId, h("e"), salt, { gasLimit: 800000 });
    await mine(1); await automine(true);
    const early = (await ethers.provider.getTransactionReceipt(te.hash)).status;
    let reason = "";
    try { await c.pap.connect(hunter).revealClaim.staticCall(h("r"), k.dev.keyId, h("e"), salt); } catch (e) { reason = e.message; }
    const ok = await reveal(c, { who: hunter, photo: h("r"), keyId: k.dev.keyId, ev: h("e"), salt });
    // two hunters, same record: second reveal rejected, bond refunded (not queued)
    const k2c = await commit(c, hunter2, h("r"), k.dev.keyId);
    const second = await reveal(c, k2c);
    assert(early === 0 && ok.id && second.rejected && burned === c.BOND);
    line("commit-reveal mechanics", "AS DESIGNED", `reveal by another account: "${R.other}"; wrong salt: "${R.salt}"; same block as commit: status ${early} (reverts "too early"); after ${c.W} blocks: "${R.late}"; forfeit before window: "${R.window}"; forfeit burns ${F(burned)} ETH, twice: "${R.twice}"; second hunter on the same record: rejected, ${F(await c.pap.credit(hunter2.address))} ETH credited back (not queued)`);
    void reason; await cash(c, hunter2); await reject(c, ok.id);
  });

  it("16 signature hygiene: low-s, keyId binding, cross-domain reuse, layouts", async () => {
    const owner = s[1], ch = s[2];
    const A = await register(c, owner), B = await register(c, owner);
    const a = await anchorNow();
    const capA = A.dev.sign(msgCapK(c, A.dev.keyId, h("hs"), a.hash));
    const R = {};
    R.highCap = await reverts(c.pap.attest(h("hs"), a.n, A.dev.keyId, highS(capA)), "bad sig");
    const fresh = newDevice();
    R.highPop = await reverts(c.pap.connect(owner).register(fresh.x, fresh.y, highS(fresh.sign(msgRegK(c, fresh.keyId, owner.address))), { value: c.STAKE }), "bad pop");
    R.highExt = await reverts(c.pap.connect(ch).proveKeyMisuse(A.dev.keyId, highS(A.dev.sign(msgExtK(c, A.dev.keyId, ch.address)))), "bad sig");
    // keyId binding: B signs a capture message that names A; accepted for neither A nor B
    const bNamesA = B.dev.sign(msgCapK(c, A.dev.keyId, h("kb"), a.hash));
    R.bNamesAasB = await reverts(c.pap.attest(h("kb"), a.n, B.dev.keyId, bNamesA), "bad sig");
    R.bNamesAasA = await reverts(c.pap.attest(h("kb"), a.n, A.dev.keyId, bNamesA), "bad sig");
    R.aSigWithB = await reverts(c.pap.attest(h("hs"), a.n, B.dev.keyId, capA), "bad sig");
    // cross-domain: each signature type at every other entry point
    const D = newDevice();
    const popD = D.sign(msgRegK(c, D.keyId, owner.address));
    const regE = await register(c, owner, D);
    const capD = D.sign(msgCapK(c, D.keyId, h("cd"), a.hash));
    const extD = D.sign(msgExtK(c, D.keyId, ch.address));
    R.popAsCap = await reverts(c.pap.attest(h("cd"), a.n, D.keyId, popD), "bad sig");
    R.popAsExt = await reverts(c.pap.connect(ch).proveKeyMisuse(D.keyId, popD), "bad sig");
    R.capAsExt = await reverts(c.pap.connect(ch).proveKeyMisuse(D.keyId, capD), "bad sig");
    R.extAsCap = await reverts(c.pap.attest(h("cd"), a.n, D.keyId, extD), "bad sig");
    const E2 = newDevice();
    const capE = E2.sign(msgCapK(c, E2.keyId, h("cd"), a.hash)), extE = E2.sign(msgExtK(c, E2.keyId, owner.address));
    R.capAsPop = await reverts(c.pap.connect(owner).register(E2.x, E2.y, capE, { value: c.STAKE }), "bad pop");
    R.extAsPop = await reverts(c.pap.connect(owner).register(E2.x, E2.y, extE, { value: c.STAKE }), "bad pop");
    // the valid low-s ones still work
    await c.pap.attest(h("cd"), a.n, D.keyId, capD);
    void regE;
    // layouts
    const L = { REGISTER: ethers.getBytes(msgRegK(c, D.keyId, owner.address)).length, CAPTURE: ethers.getBytes(msgCapK(c, D.keyId, h("x"), a.hash)).length, EXTRACTED: ethers.getBytes(msgExtK(c, D.keyId, ch.address)).length };
    const labels = ["PAPRIKA/REGISTER", "PAPRIKA/CAPTURE", "PAPRIKA/EXTRACTED"];
    const prefix = labels.some((x) => labels.some((y) => x !== y && y.startsWith(x)));
    assert(!prefix && new Set(Object.values(L)).size === 3);
    const sigFns = c.pap.interface.fragments.filter((f) => f.type === "function" && f.inputs.some((i) => i.type === "bytes")).map((f) => `${f.name}(${f.inputs.map((i) => i.type + " " + i.name).join(", ")})`);
    line("signature hygiene (I)", "FAILS (all rejected)", `high-s capture/PoP/misuse: "${R.highCap}"/"${R.highPop}"/"${R.highExt}"; B's sig over a message naming A, as B / as A: "${R.bNamesAasB}"/"${R.bNamesAasA}"; A's sig with B's keyId: "${R.aSigWithB}"; cross-domain PoP->capture "${R.popAsCap}", PoP->misuse "${R.popAsExt}", capture->misuse "${R.capAsExt}", misuse->capture "${R.extAsCap}", capture->PoP "${R.capAsPop}", misuse->PoP "${R.extAsPop}"`);
    line("message layouts", "NO COLLISION", `preimage bytes REGISTER ${L.REGISTER} (16+32+20+32+20), CAPTURE ${L.CAPTURE} (15+32+20+32+32+32), EXTRACTED ${L.EXTRACTED} (17+32+20+32+20); labels diverge at byte 8 (R/C/E), none is a prefix of another; signature-taking functions: ${sigFns.join("; ")} - none takes a digest`);
  });

  it("17 proof of prior existence (J)", async () => {
    const alice = s[1], bob = s[2], third = s[3], hunter = s[4];
    const A = await register(c, alice), B = await register(c, bob), B2 = await register(c, alice);
    // a) recycled photo: A records H at block n; B re-attests H later with a fresh anchor
    const ra = await attest(c, alice, A.dev, h("orig"));
    await mine(3);
    await attest(c, bob, B.dev, h("orig"));
    const t0 = await balOf(third);
    const pe = await rc(c.pap.connect(third).provePriorExistence(h("orig"), B.dev.keyId, A.dev.keyId)); G("provePriorExistence (flag, escrow)", pe.gas);
    const vb = await c.pap.verify(h("orig"), B.dev.keyId);
    assert.equal(vb.status, ST.Flagged); assert.equal(vb.flagReason, 2n); assert.equal(vb.verdict, 1n); assert.equal(await c.pap.credit(third.address), 0n);
    await mine(c.W); await c.pap.settleStake(B.dev.keyId);
    const got = await cash(c, third);
    // b) the honest original cannot be slashed through the later record
    const rb = await reverts(c.pap.connect(third).provePriorExistence(h("orig"), A.dev.keyId, B.dev.keyId), "not prior");
    // c) same owner
    await attest(c, alice, B2.dev, h("orig"));
    const rc_ = await reverts(c.pap.connect(third).provePriorExistence(h("orig"), B2.dev.keyId, A.dev.keyId), "same owner");
    line("prior existence: recycled photo", "CAUGHT", `B's re-use flagged PriorExistence at once, record verdict Upheld, reward escrowed ${c.W} blocks then ${F(got)} ETH to the third party (net ${F((await balOf(third)) - t0)}); A via B's later record: "${rb}"; same owner on both keys: "${rc_}" (cosmetic: a second address costs nothing)`);
    // d) mempool: attacker sees A's pending attest and records H under its own key in the same block, ahead of A
    const A2 = await register(c, alice), X = await register(c, bob);
    await automine(false);
    const an = await anchorNow();
    const txA = await c.pap.connect(alice).attest(h("scoop"), an.n, A2.dev.keyId, A2.dev.sign(msgCapK(c, A2.dev.keyId, h("scoop"), an.hash)), { gasPrice: 2e9, gasLimit: 400000 });
    const pend = c.pap.interface.decodeFunctionData("attest", (await ethers.provider.getTransaction(txA.hash)).data);
    await c.pap.connect(bob).attest(pend[0], an.n, X.dev.keyId, X.dev.sign(msgCapK(c, X.dev.keyId, pend[0], an.hash)), { gasPrice: 3e9, gasLimit: 400000 });
    await mine(1); await automine(true);
    const vA = await c.pap.verify(h("scoop"), A2.dev.keyId), vX = await c.pap.verify(h("scoop"), X.dev.keyId);
    const r1 = await reverts(c.pap.provePriorExistence(h("scoop"), A2.dev.keyId, X.dev.keyId), "not prior");
    const r1b = await reverts(c.pap.provePriorExistence(h("scoop"), X.dev.keyId, A2.dev.keyId), "not prior");
    // d') A uses an older anchor and its tx is delayed; the attacker's record lands strictly between A's anchor and A's record
    const A3 = await register(c, alice), Y = await register(c, bob);
    const old = await anchorNow(); await mine(5);
    const sigA3 = A3.dev.sign(msgCapK(c, A3.dev.keyId, h("scoop2"), old.hash));   // A captured after block `old`
    await c.pap.connect(bob).attest(h("scoop2"), old.n + 3, Y.dev.keyId, Y.dev.sign(msgCapK(c, Y.dev.keyId, h("scoop2"), (await ethers.provider.getBlock(old.n + 3)).hash)));
    await mine(2);
    await c.pap.connect(alice).attest(h("scoop2"), old.n, A3.dev.keyId, sigA3);
    const vA3 = await c.pap.verify(h("scoop2"), A3.dev.keyId), vY = await c.pap.verify(h("scoop2"), Y.dev.keyId);
    const r2 = await reverts(c.pap.provePriorExistence(h("scoop2"), A3.dev.keyId, Y.dev.keyId), "not prior");
    line("prior existence: mempool attacker vs honest A", "FAILS (cannot slash A)", `same block: A [${vA.anchorBlock},${vA.recordedBlock}], attacker [${vX.anchorBlock},${vX.recordedBlock}]: "${r1}" both ways (the earliest the attacker can record is A's anchor + 1, since A's anchor block exists before H does); between A's anchor and A's record: A [${vA3.anchorBlock},${vA3.recordedBlock}], attacker [${vY.anchorBlock},${vY.recordedBlock}]: "${r2}" (rule needs attacker.recorded < A.anchor = ${vA3.anchorBlock})`);
    // d'') the assumption: an honest device that takes its anchor AFTER the file became public is slashable
    const A4 = await register(c, alice), Z = await register(c, bob);
    await attest(c, bob, Z.dev, h("shared-first"));     // the file was shared before the honest device anchored it
    await mine(2);
    await attest(c, alice, A4.dev, h("shared-first"));   // honest app that fetches the anchor at signing time, not at capture
    await c.pap.connect(third).provePriorExistence(h("shared-first"), A4.dev.keyId, Z.dev.keyId);
    line("prior existence: honest device anchoring AFTER publication", "SUCCEEDS (assumption violated)", "an honest owner whose app fetched the anchor block after the photo was shared is slashed: the rule is sound only if the anchor is fetched before capture (spec section 4, 'Time bounds')");
    await mine(c.W); await c.pap.settleStake(A4.dev.keyId); await cash(c, third);
    // e) forger chooses the oldest allowed anchor (256 blocks back)
    const O1 = await register(c, alice), O2 = await register(c, alice), F1 = await register(c, bob), F2 = await register(c, bob);
    const rOld = await attest(c, alice, O1.dev, h("old-orig")); await mine(300);
    let lt = await anchorNow(); let an1 = lt.n - 255;
    await c.pap.connect(bob).attest(h("old-orig"), an1, F1.dev.keyId, F1.dev.sign(msgCapK(c, F1.dev.keyId, h("old-orig"), (await ethers.provider.getBlock(an1)).hash)));
    await c.pap.connect(third).provePriorExistence(h("old-orig"), F1.dev.keyId, O1.dev.keyId);
    const rYoung = await attest(c, alice, O2.dev, h("young-orig")); await mine(100);
    lt = await anchorNow(); const an2 = lt.n - 255;
    await c.pap.connect(bob).attest(h("young-orig"), an2, F2.dev.keyId, F2.dev.sign(msgCapK(c, F2.dev.keyId, h("young-orig"), (await ethers.provider.getBlock(an2)).hash)));
    const r3 = await reverts(c.pap.provePriorExistence(h("young-orig"), F2.dev.keyId, O2.dev.keyId), "not prior");
    line("prior existence: forger picks the oldest anchor", "PARTLY ESCAPES", `original recorded at ${rOld.r.blockNumber}, forger anchors at ${an1} (oldest allowed): caught. Original recorded at ${rYoung.r.blockNumber}, forger anchors at ${an2} <= that: "${r3}". Every re-use of an original recorded less than ~256 blocks (~51 min at 12 s) before the forger's attest escapes this rule; so does re-use of anything never attested, and any non-byte-identical copy`);
    await mine(c.W); for (const k of [F1]) await c.pap.settleStake(k.dev.keyId).catch(() => {}); await cash(c, third);
    // f) an accomplice's earlier record cannot pre-empt a committed claim
    const V = await register(c, bob), W2 = await register(c, s[5]);
    await attest(c, s[5], W2.dev, h("acc")); await mine(2); await attest(c, bob, V.dev, h("acc"));
    const kc = await commit(c, hunter, h("acc"), V.dev.keyId);
    await c.pap.connect(s[6]).provePriorExistence(h("acc"), V.dev.keyId, W2.dev.keyId);   // accomplice of the owner, one block after the commit
    const rv = await reveal(c, kc);
    assert(rv.id, "reveal after an accomplice's later objective proof must open the claim (D17)");
    await mine(c.W);
    const early = await reverts(c.pap.settleStake(V.dev.keyId), "not settleable");
    await uphold(c, rv.id);
    const hc = await c.pap.credit(hunter.address), ac = await c.pap.credit(s[6].address);
    assert(hc > 0n && ac === 0n);
    line("prior existence used by an accomplice after a commit (D17)", "FAILS (claim keeps priority)", `the hunter's reveal opens the claim although the record already carries the objective verdict; settleStake before the vote: "${early}"; after the upheld vote: hunter reward ${F(hc)}, accomplice ${F(ac)}. The first draft of v2.3 rejected this reveal ("has verdict") and the accomplice took the reward: fixed in D17`);
    for (const w of [hunter, s[6]]) await cash(c, w);
  });
});

after(async () => {
  console.log("\n      GAS v2.3 (gasUsed, optimizer 200 runs, hardfork osaka)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(40)} ${g}`);
  console.log("\n      SIZE (non-empty, non-comment lines of Solidity; deployed bytecode bytes)");
  const p01 = "/home/tux/crypto2/experiments/p01-paprika-baseline-attacks";
  const loc = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;
  const rows = [["PaprikaBaseline (p01)", path.join(p01, "contracts/PaprikaBaseline.sol"), JSON.parse(fs.readFileSync(path.join(p01, "artifacts/contracts/PaprikaBaseline.sol/PaprikaBaseline.json"))).deployedBytecode]];
  for (const n of ["PaprikaV2", "PaprikaV2_1", "PaprikaV2_2", "PaprikaV2_3"]) rows.push([n, path.join(__dirname, "..", "contracts", n + ".sol"), (await artifacts.readArtifact(n)).deployedBytecode]);
  for (const [n, f, bc] of rows) console.log(`        ${n.padEnd(24)} ${String(loc(f)).padStart(4)} lines  ${String((bc.length - 2) / 2).padStart(6)} bytes`);
});
