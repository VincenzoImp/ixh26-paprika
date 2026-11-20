// Paprika: scenario and attack suite on a local chain with the MockArbiter oracle.
// Each test prints ATTACK lines (`ATTACK <attack>: <outcome> | <details>`) and CASE lines
// (`CASE <short name>: <what happened> | <numbers in ETH>`).
// After every test: contract balance = stakes + credits + unrevealed commit bonds; oracle bonds = 2 x reserved.
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
const CASE = (name, what, nums) => console.log(`      CASE ${name}: ${what} | ${nums}`);
const BURN = "0x000000000000000000000000000000000000dEaD", STORE = "0x0000000000000000000000000000000000057073";
const VF = (v) => `anchorBlock ${v.anchorBlock}, recordedBlock ${v.recordedBlock}, verdict ${["None", "UpheldFake"][Number(v.verdict)]}, status ${["None", "Active", "Flagged", "Retired"][Number(v.status)]}, flaggedAtBlock ${v.flaggedAtBlock}, flagReason ${["None", "KeyMisuse", "ClaimUpheld"][Number(v.flagReason)]}, stake ${F(v.stake)}, recordedBeforeFlag ${v.recordedBeforeFlag}, stakeAtRisk ${F(v.stakeAtRisk)}, withdrawnAtBlock ${v.withdrawnAtBlock}, misusePending ${v.misusePending}, openClaims ${v.openClaims}, reservedForClaims ${F(v.reservedForClaims)}`;
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
  const oracle = await (await ethers.getContractFactory("MockArbiter", s[0])).deploy();
  const pap = await (await ethers.getContractFactory("Paprika", s[0])).deploy(await oracle.getAddress());
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
  let credits = 0n; for (const a of [...c.s.map((x) => x.address), ...(c.extraCredit || [])]) credits += await c.pap.credit(a);
  const cb = await c.pap.commitBondsHeld(), inbox = await c.pap.inbox();
  const bal = await balOf(c.addr), ob = await c.oracle.openBonds(), obal = await balOf(await c.oracle.getAddress());
  assert.equal(inbox, 0n, "INVARIANT inbox");
  assert.equal(bal, stakes + credits + cb, `INVARIANT balance ${bal} != stakes ${stakes} + credits ${credits} + commit bonds ${cb}`);
  assert.equal(obal, ob, "INVARIANT oracle balance");
  assert.equal(ob, 2n * reserved, "INVARIANT oracle bonds != 2 x reserved");
  assert.equal(reserved, open * c.BOND, "INVARIANT reserved != open x bond");
  return { bal, stakes, credits, cb, ob };
}

describe("Paprika", function () {
  let c, s;
  beforeEach(async () => { c = await deploy(); s = c.s; });
  afterEach(async () => { const i = await invariant(c); console.log(`      invariant ok: contract ${F(i.bal)} = stakes ${F(i.stakes)} + unpaid rewards ${F(i.credits)} + unrevealed commit bonds ${F(i.cb)}; oracle open bonds ${F(i.ob)} = 2 x reserved`); });

  it("0 honest path: register, attest, verify, claims both ways, misuse proof, unbond, withdraw", async () => {
    const owner = s[1], relayer = s[2], claimant = s[3], challenger = s[5];
    const d1 = await register(c, owner); G("register", d1.gas);
    const a1 = await attest(c, relayer, d1.dev, h("p1")); G("attest", a1.gas);
    const vh = await c.pap.verify(h("p1"), d1.dev.keyId); G("verify (view; eth_estimateGas)", await c.pap.verify.estimateGas(h("p1"), d1.dev.keyId));
    const vx = await c.pap.verify(h("p1, one pixel changed"), d1.dev.keyId);
    const c0 = await balOf(claimant);
    const k = await commit(c, claimant, h("p1"), d1.dev.keyId);
    const rv = await reveal(c, k); G("revealClaim (assert + auto-dispute)", rv.gas);
    let v = await c.pap.verify(h("p1"), d1.dev.keyId);
    assert.equal(v.stake, c.STAKE - c.BOND); assert.equal(v.stakeAtRisk, c.STAKE - c.BOND); assert.equal(v.reservedForClaims, c.BOND); assert.equal(v.openClaims, 1n);
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
    CASE("honest path", "owner registers (stake + proof of possession), a relayer submits the device-signed attestation, anyone calls verify", `owner pays stake ${F(c.STAKE)} + gas ${F(d1.cost)}; relayer pays gas ${F(a1.cost)}; verify returns: ${VF(vh)}`);
    CASE("one pixel changed", "verify(sha256 of the modified file, same key): no record for that hash", `recordedBlock ${vx.recordedBlock}, anchorBlock ${vx.anchorBlock}, recordedBeforeFlag ${vx.recordedBeforeFlag} (status ${["None", "Active", "Flagged", "Retired"][Number(vx.status)]} and stake ${F(vx.stake)} are the key's, not the photo's)`);
    CASE("misuse proof escrow (honest path)", `misuse proof flags the key at once; settleStake reverts until ${c.W} blocks have passed, then pays`, `prover credited ${F(c.STAKE / 2n)}, burned ${F(c.STAKE / 2n)}`);
    console.log(`      POSITIVE PATH OK | upheld claim (commit+reveal): claimant net ${F(cnet)} ETH | rejected claim: device stake ${F(c.STAKE)} -> ${F(c.STAKE + c.BOND / 2n)} | misuse reward collectable only after ${c.W} blocks | withdraw ok, withdrawnAtBlock ${v.withdrawnAtBlock}`);
  });

  it("1 ban evasion", async () => {
    const k1 = await register(c, s[6]);
    await c.pap.connect(s[7]).proveKeyMisuse(k1.dev.keyId, k1.dev.sign(msgExtK(c, k1.dev.keyId, s[7].address)));
    const r1 = await reverts(c.pap.connect(s[6]).register(k1.dev.x, k1.dev.y, k1.dev.sign(msgRegK(c, k1.dev.keyId, s[6].address)), { value: c.STAKE }), "key used");
    const k2 = await register(c, s[6]);
    line("ban-evasion", "PRICED", `old key: "${r1}"; new key: ${F(c.STAKE)} ETH stake + ${k2.gas} gas`);
    CASE("flagged party returns with a new key", `the flagged key cannot register again ("${r1}"); a fresh key registers like any newcomer`, `cost ${F(c.STAKE)} stake + ${F(k2.cost)} gas (${k2.gas} gas) per new key`);
  });

  it("2 synthetic content and its punishment", async () => {
    const forger = s[9], claimant = s[11];
    const k = await register(c, forger); await attest(c, forger, k.dev, h("ai-1"));
    line("synthetic-content", "SUCCEEDS", "software key registers and attests random bytes");
    const c0 = await balOf(claimant), bu0 = await balOf(BURN), so0 = await balOf(STORE);
    const rv = await claim(c, claimant, h("ai-1"), k.dev.keyId); await uphold(c, rv.id); await cash(c, claimant);
    line("synthetic-content punished (upheld claim)", "PRICED", `forger loses ${F(c.STAKE)} ETH; claimant nets ${F((await balOf(claimant)) - c0)} ETH`);
    const v2 = await c.pap.verify(h("ai-1"), k.dev.keyId);
    CASE("software key attests synthetic bytes", "allowed: a registered software key signs any bytes and the attestation is recorded", "no cost beyond stake + gas");
    CASE("claim with public evidence, upheld", `claimant commits+reveals (bond ${F(c.BOND)}); the contract disputes with ${F(c.BOND)} of the device stake; the vote upholds: record ${["None", "UpheldFake"][Number(v2.verdict)]}, key ${["None", "Active", "Flagged", "Retired"][Number(v2.status)]} (${["None", "KeyMisuse", "ClaimUpheld"][Number(v2.flagReason)]}), free stake paid out`, `claimant net +${F((await balOf(claimant)) - c0)} (after gas); owner -${F(c.STAKE)}; burned ${F((await balOf(BURN)) - bu0)} at 0xdEaD + ${F((await balOf(STORE)) - so0)} oracle fee to the Store`);
  });

  it("3 front-running: attest copy, same hash, register copy, commit copy (misuse-proof copy: test 19)", async () => {
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
    const bu3 = await balOf(BURN);
    await c.pap.forfeitCommit(thief.address, k.cm);
    const burned3 = (await balOf(BURN)) - bu3;
    line("front-running (copy a pending commitment)", "FAILS", `thief's copy cannot be revealed by the thief ("${rT}"), the honest reveal opens the claim; the thief's bond is forfeited (burned)`);
    CASE("mempool copies (attestation, registration, commitment)", `copied attestation records the honest key (the honest tx then reverts "exists"); copied registration reverts (proof of possession names msg.sender); copied commitment cannot be revealed by the copier ("${rT}"); misuse-proof copy: test 19`, `honest parties lose nothing; the copier loses its commit bond ${F(burned3)} (burned) + gas`);
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
    CASE("owner accuses itself", `${N} keys flagged by its own sybil via misuse proof, ${N} keys via an upheld self-claim; the contract balance is unchanged (no treasury to drain)`, `owner+sybil net per key: misuse path ${F(netM / BigInt(N))}, claim path ${F(netC / BigInt(N))} (incl. gas); total ${F(netM)} and ${F(netC)}`);
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
    assert.equal(midLate, c.BOND * 3n / 2n); assert(cE > c.BOND * 3n / 2n); assert.equal(cL, c.BOND * 3n / 2n);   // oracle payouts are credited to the claimant
    const r3 = await claim(c, other, h("y"), k.dev.keyId);
    line("double-dip / order of upheld claims", "FAILS", `two claims upheld; the later-committed one settled first and waited (credit ${F(midLate)}), the earlier-committed one took the reward share ${F(cE)} ETH; the later one got only its oracle payout (bond + half the device bond), no stake share; 2nd claim on a record with an open claim: rejected, bond credited back; claim after the slash: ${r3.rejected ? "rejected (refund)" : "?"}; other refund ${F(await c.pap.credit(other.address))}`);
    CASE("two upheld claims on one key", "the claim committed first takes the stake share even if settled second; the other gets only its oracle payout; a 2nd claim on a record with an open claim is refunded", `earlier-committed claimant credited ${F(cE)}, later ${F(cL)}, refunds ${F(await c.pap.credit(other.address))} (bonds ${F(c.BOND)} each)`);
    for (const w of [early, late, other]) await cash(c, w);
  });

  it("5 griefing an honest device (unwatched)", async () => {
    const honest = s[5], griefer = s[6];
    const k = await register(c, honest); await attest(c, honest, k.dev, h("real0"));
    const g0 = await balOf(griefer), h0 = await balOf(honest), sk0 = (await dev_(c, k.dev.keyId)).stake, so5 = await balOf(STORE);
    const rv = await claim(c, griefer, h("real0"), k.dev.keyId); await reject(c, rv.id);
    const gNet = (await balOf(griefer)) - g0, hNet = (await balOf(honest)) - h0 + ((await dev_(c, k.dev.keyId)).stake - sk0);
    CASE("false claim against an honest device, rejected", "the owner does nothing; the contract contests with its stake; the vote rejects; the device stays Active", `claimant ${F(gNet)} (bond + gas); owner +${F(hNet)} added to its stake; ${F((await balOf(STORE)) - so5)} oracle fee to the Store`);
    line("griefing unwatched", "FAILS", `owner did nothing; forced vote rejects; griefer ${F(gNet)} ETH, owner +${F(hNet)} ETH (stake); griefing factor ${(Number(-hNet) / Number(-gNet)).toFixed(3)}. Needs an honest vote`);
  });

  it("6 retroactive effect: 100 earlier records", async () => {
    const owner = s[7];
    const k = await register(c, owner); for (let i = 0; i < 100; i++) await attest(c, owner, k.dev, h("old" + i));
    await attest(c, owner, k.dev, h("fake"));
    const rv = await claim(c, s[8], h("fake"), k.dev.keyId); await uphold(c, rv.id); await cash(c, s[8]);
    let n = 0; for (let i = 0; i < 100; i++) { const v = await c.pap.verify(h("old" + i), k.dev.keyId); if (v.recordedBlock > 0n && v.recordedBeforeFlag && v.verdict === 0n) n++; }
    assert.equal(n, 100);
    CASE("100 earlier records after a flag", "100 records, then one judged fake: the key is flagged; every earlier record is still returned", `${n}/100 with recordedBlock > 0, recordedBeforeFlag true, verdict None`);
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
    CASE("replay, other key, other chain, stale or future anchor", "all rejected", R.map((r) => `"${r}"`).join(", ") + "; no ETH moves");
  });

  it("8 no admin", async () => {
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    assert.equal(fns.filter((n) => (/owner|admin|upgrade|sweep|rescue|pause|transfer/i.test(n) || /^set[A-Z]/.test(n))).length, 0);
    const r1 = await reverts(s[11].sendTransaction({ to: c.addr, value: E("1") }), "only oracle");
    CASE("admin or treasury", "no admin, owner, upgrade or sweep function; plain ETH from anyone but the oracle is refused", `state-changing functions: ${fns.join(", ")}; ETH: "${r1}"`);
    line("admin / treasury drain", "FAILS", `functions: ${fns.join(", ")}; ETH from non-oracle: "${r1}"`);
  });

  it("9 key squatting; claim on an unattested photo", async () => {
    const vd = newDevice(), sq = newDevice();
    const r1 = await reverts(c.pap.connect(s[14]).register(vd.x, vd.y, sq.sign(msgRegK(c, sq.keyId, s[14].address)), { value: c.STAKE }), "bad pop");
    await register(c, s[13], vd);
    const k = await commit(c, s[14], h("never"), vd.keyId);
    const r2 = await reverts(c.pap.connect(s[14]).revealClaim(k.photo, k.keyId, k.ev, k.salt), "no record");
    const bu9 = await balOf(BURN);
    await mine(c.W); await c.pap.forfeitCommit(s[14].address, k.cm);
    CASE("claim against a photo the device never attested", `reveal reverts "${r2}" (nothing to contest); the commit expires and anyone forfeits it`, `claimant loses its bond ${F((await balOf(BURN)) - bu9)} (burned) + gas; owner 0`);
    CASE("key squatting", `registering someone else's public key without its signature: "${r1}"`, "no ETH moves");
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
    CASE("withdraw races", `withdraw with an open claim: "${ra}"; right after the claim settles: "${rg}" for ${c.GRACE} blocks; key flagged during unbonding: "${rb}"`, "the stake stays until the rules allow it");
    CASE("owner withdraws after unbonding, nobody claimed", `requestUnbond, ${c.UNBOND / 86400} days, withdraw; a later claim is refunded (nothing left to contest)`, `owner got back ${F((await balOf(forger)) - f0 + w.cost)} (net of gas ${F((await balOf(forger)) - f0)}); late claimant refunded ${F(await c.pap.credit(claimant.address))}; verify after: ${VF(v1)}`);
    line("exit after the challenge window (10c)", "BY DESIGN (optimistic finality)", `stakeAtRisk ${F(v0.stakeAtRisk)} -> ${F(v1.stakeAtRisk)}, withdrawnAtBlock 0 -> ${v1.withdrawnAtBlock}; forger got ${F((await balOf(forger)) - f0 + w.cost)} ETH back; late claim ${late.rejected ? "rejected, bond refunded" : "?"}`);
    await cash(c, claimant);
  });

  it("11 signature malleability", async () => {
    const k = await register(c, s[19]); const a = await attest(c, s[19], k.dev, h("m"));
    const r1 = await reverts(c.pap.connect(s[6]).attest(h("m"), a.anchor.n, k.dev.keyId, highS(a.sig)), "exists");
    const r2 = await reverts(c.pap.connect(s[6]).proveKeyMisuse(k.dev.keyId, highS(k.dev.sign(msgExtK(c, k.dev.keyId, s[5].address)))), "bad sig");
    line("signature-malleability", "FAILS (harmless)", `"${r1}", "${r2}"`);
    CASE("high-s twin signatures", "rejected (low-s rule)", `attest twin: "${r1}"; misuse twin: "${r2}"; no ETH moves`);
  });

  it("12 reward sniping: open claim, hidden commit, self-slash before any commit", async () => {
    const forger = s[7], sybil = s[8], hunter = s[9];
    // 12a: claim already open
    const k = await register(c, forger); await attest(c, forger, k.dev, h("df"));
    const rv = await claim(c, hunter, h("df"), k.dev.keyId);
    await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExtK(c, k.dev.keyId, sybil.address)));
    await mine(c.W); await reverts(c.pap.settleStake(k.dev.keyId), "not settleable");
    await uphold(c, rv.id);
    const a1 = [await c.pap.credit(hunter.address), await c.pap.credit(sybil.address)];
    assert(a1[0] > 0n && a1[1] === 0n);
    CASE("misuse proof while an earlier claim is open", "the claim was committed first: it has priority on the stake", `claimant credited ${F(a1[0])}, prover ${F(a1[1])}`);
    line("sniping an open claim", "FAILS", `hunter reward ${F(a1[0])}, misuse prover ${F(a1[1])}`);
    await cash(c, hunter);
    // 12a': open claim rejected -> prover paid
    const k2 = await register(c, forger); await attest(c, forger, k2.dev, h("ok"));
    const rv2 = await claim(c, hunter, h("ok"), k2.dev.keyId);
    await c.pap.connect(sybil).proveKeyMisuse(k2.dev.keyId, k2.dev.sign(msgExtK(c, k2.dev.keyId, sybil.address)));
    await mine(c.W); await reject(c, rv2.id);
    const pr12 = await cash(c, sybil);
    line("misuse proof after a rejected open claim", "PAID TO PROVER", `prover ${F(pr12)} ETH`);
    CASE("misuse proof after a rejected earlier claim", "the claim loses, so the prover is next in line", `prover ${F(pr12)} (half of the stake incl. the ${F(c.BOND / 2n)} won from the rejected claimant)`);
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
    line("self-slash in the SAME block as an opaque commit (12b)", sc > 0n ? "= 12c RESIDUAL (ties go to the prover)" : "FAILS", `commit and misuse proof both in block ${sameBlock}; the claim has priority only if its commit block is EARLIER: prover ${F(sc)} ETH, hunter net ${F((await balOf(hunter)) - h0)} ETH (oracle split only), forger+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f0 + sc)} of ${F(c.STAKE)}. The forger cannot tell which device the commit targets; reacting to every commit is just the 12c strategy`);
    CASE("owner self-slashes in the same block as an opaque commit", "ties go to the misuse proof (same as self-slashing before any commit)", `owner+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f0 + sc)} of ${F(c.STAKE)}; hunter net ${F((await balOf(hunter)) - h0)}`);
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
    CASE("owner self-slashes after a claim was committed", "the claim (earlier commit block) keeps priority; the self-slash buys nothing", `hunter credited ${F(hc)}, net ${F((await balOf(hunter)) - h4)}; prover ${F(sc4)}; the ${F(c.STAKE)} stake is lost in full; owner+sybil spend a further ${F(-((await balOf(forger)) + (await balOf(sybil)) - f4))} (gas)`);
    line("sniping via self-slash after the commit (12b')", "FAILS", `revealed claim (commit block earlier than proof) takes priority: hunter reward ${F(hc)}, net ${F((await balOf(hunter)) - h4)}; prover ${F(sc4)}; forger+sybil net ${F((await balOf(forger)) + (await balOf(sybil)) - f4)} (full stake lost)`);
    // 12c: self-slash BEFORE any commit -> (1 - alpha) x S
    const k5 = await register(c, forger); await attest(c, forger, k5.dev, h("df5"));
    const f5 = (await balOf(forger)) + (await balOf(sybil)), h5 = await balOf(hunter), bu5 = await balOf(BURN), so12 = await balOf(STORE);
    await c.pap.connect(sybil).proveKeyMisuse(k5.dev.keyId, k5.dev.sign(msgExtK(c, k5.dev.keyId, sybil.address)));
    const rv5 = await claim(c, hunter, h("df5"), k5.dev.keyId);   // committed after the proof: no priority
    await mine(c.W); await c.pap.settleStake(k5.dev.keyId); await cash(c, sybil);
    await uphold(c, rv5.id); await cash(c, hunter);
    line("self-slash before any commit (12c)", "RESIDUAL (by design)", `prover (forger's sybil) gets ${F(c.STAKE - c.BOND)} x 0.5 of the free stake; forger+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f5)} of its ${F(c.STAKE)} stake (with no later claim it would recover (alpha) x S = ${F(c.STAKE / 2n)}, i.e. lose (1 - alpha) x S); a late hunter's claim still reserved a bond from the stake and nets ${F((await balOf(hunter)) - h5)} ETH from the oracle split, no stake share`);
    CASE("owner self-slashes before anyone accuses it", "its sybil proves misuse first; a hunter who commits later only wins the oracle split", `owner+sybil recovered ${F((await balOf(forger)) + (await balOf(sybil)) - f5)} of the ${F(c.STAKE)} stake (net ${F((await balOf(forger)) + (await balOf(sybil)) - f5 - c.STAKE)}, gas incl.; ${F(c.STAKE / 2n)} recovered if nobody claims); later hunter net ${F((await balOf(hunter)) - h5)}; burned ${F((await balOf(BURN)) - bu5)} at 0xdEaD + ${F((await balOf(STORE)) - so12)} oracle fee`);
  });

  it("13 stolen honest key; several claims per device", async () => {
    const victim = s[10], thief = s[11], griefer = s[12];
    const k = await register(c, victim); await attest(c, victim, k.dev, h("v0"));
    await c.pap.connect(thief).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExtK(c, k.dev.keyId, thief.address)));
    const bu13 = await balOf(BURN), cr13 = await c.pap.credit(thief.address);
    const r13 = await reverts(c.pap.settleStake.staticCall(k.dev.keyId), "not settleable");   // eth_call: no block mined
    await mine(c.W); await c.pap.settleStake(k.dev.keyId);
    const v13 = await c.pap.verify(h("v0"), k.dev.keyId), th13 = await cash(c, thief);
    line("stolen honest key -> misuse flag", "SUCCEEDS (accepted, custody risk)", `thief earns ${F(th13)} ETH after the escrow window`);
    CASE("proof of key misuse / stolen key of an honest owner", `whoever holds the key flags it at once; the reward is escrowed (${r13 === "not settleable" ? `settleStake "${r13}"` : "?"} for ${c.W} blocks) and then paid; the earlier record stays, marked recorded before the flag`, `prover/thief +${F(th13)} (credit before the window ${F(cr13)}); owner -${F(c.STAKE)}; burned ${F((await balOf(BURN)) - bu13)}; earlier record: ${VF(v13)}`);
    const k2 = await register(c, victim); for (let i = 0; i < 3; i++) await attest(c, victim, k2.dev, h("u" + i));
    await c.pap.connect(victim).requestUnbond(k2.dev.keyId);
    const r = []; for (let i = 0; i < 3; i++) r.push(await claim(c, griefer, h("u" + i), k2.dev.keyId));
    await warp(c.UNBOND);
    const rw = await reverts(c.pap.connect(victim).withdraw(k2.dev.keyId), "open claims");
    for (const x of r) if (x.id) await reject(c, x.id);
    await mine(c.GRACE); await c.pap.connect(victim).withdraw(k2.dev.keyId); await cash(c, griefer);
    CASE("many claims against one device", `each open claim reserves ${F(c.BOND)} of free stake: ${r.filter((x) => x.id).length} fit in ${F(c.STAKE)}, the 3rd is refunded; withdraw waits for the votes ("${rw}")`, `claimant loses ${F(c.BOND)} per rejected claim (half to the device stake, half oracle fee)`);
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
    CASE("owner fills its own claim slots", `sybil claims fill both slots, so a real claim is refunded; the owner settles them and tries to withdraw in the same block: "claim grace"; the real claim then opens and is upheld`, `owner+sybil net ${F(fNet)} (whole stake lost); hunter net ${F(hNet)}; what it buys: delay only, at ${F(c.BOND / 2n)} per slot per vote (${F((c.STAKE / c.BOND) * c.BOND / 2n)} per period for ${c.STAKE / c.BOND} slots)`);
    line("claim-slot squatting, all slots filled, same-block exit", "FAILS", `settle/settle/withdraw/hunter-reveal in one block: statuses ${st.join("/")} - withdraw reverts "claim grace" (needs ${c.GRACE} blocks after the last settlement), the hunter's reveal opens a claim (slots free again) and is upheld. Forger+sybil net ${F(fNet)} ETH (full stake lost + 2 weak bonds' net), hunter net ${F(hNet)} ETH. Squatting now buys delay only: ${F(c.BOND / 2n)} ETH per slot per vote period (k = ${c.STAKE / c.BOND} slots at S=${F(c.STAKE)}, B=${F(c.BOND)} -> ${F((c.STAKE / c.BOND) * c.BOND / 2n)} per period) and the forger can never withdraw without a ${c.GRACE}-block period with no open claim`);
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
    CASE("claim never revealed / revealed late", `not revealed within ${c.W} blocks: reveal "${R.late}"; anyone may then forfeit the commit (before: "${R.window}"); reveal in the commit block: "too early"`, `claimant loses the bond ${F(burned)} (burned); owner 0`);
    CASE("two claimants on the same record", "the second reveal is refunded (not queued)", `refund ${F(await c.pap.credit(hunter2.address))}`);
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
    line("signature hygiene", "FAILS (all rejected)", `high-s capture/PoP/misuse: "${R.highCap}"/"${R.highPop}"/"${R.highExt}"; B's sig over a message naming A, as B / as A: "${R.bNamesAasB}"/"${R.bNamesAasA}"; A's sig with B's keyId: "${R.aSigWithB}"; cross-domain PoP->capture "${R.popAsCap}", PoP->misuse "${R.popAsExt}", capture->misuse "${R.capAsExt}", misuse->capture "${R.extAsCap}", capture->PoP "${R.capAsPop}", misuse->PoP "${R.extAsPop}"`);
    CASE("signature reuse across keys, domains and chains", "high-s, a signature naming another key, and every signature type at every other entry point: all rejected", "no ETH moves");
    line("message layouts", "NO COLLISION", `preimage bytes REGISTER ${L.REGISTER} (16+32+20+32+20), CAPTURE ${L.CAPTURE} (15+32+20+32+32+32), EXTRACTED ${L.EXTRACTED} (17+32+20+32+20); labels diverge at byte 8 (R/C/E), none is a prefix of another; signature-taking functions: ${sigFns.join("; ")} - none takes a digest`);
  });

  it("17 regressions from the independent review", async () => {
    // a claimant contract that refuses ETH cannot block settlement: the claim is upheld and settled; only its own collect() fails
    const owner = s[1], prover = s[2];
    const d = await register(c, owner); await attest(c, owner, d.dev, h("refuses-eth"));
    const rcl = await (await ethers.getContractFactory("RevertingClaimant", s[0])).deploy(c.addr);
    const ev = h("e"), salt = ethers.hexlify(ethers.randomBytes(32));
    await (await rcl.commit(commitment(await rcl.getAddress(), h("refuses-eth"), d.dev.keyId, ev, salt), { value: c.BOND })).wait();
    await c.pap.connect(prover).proveKeyMisuse(d.dev.keyId, d.dev.sign(msgExtK(c, d.dev.keyId, prover.address)));
    const rx = await (await rcl.reveal(h("refuses-eth"), d.dev.keyId, ev, salt)).wait();
    const id = rx.logs.map((l) => { try { return c.pap.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "ClaimOpened").args.assertionId;
    await dvm(c, id, true);
    const st = await rc(c.oracle.settleAssertion(id));
    c.extraCredit = [await rcl.getAddress()];
    await mine(c.W); await c.pap.settleStake(d.dev.keyId);   // the misuse proof's escrow window, then payout to the claim (priority)
    const dv = await dev_(c, d.dev.keyId);
    const crC = await c.pap.credit(await rcl.getAddress());
    const collect = await reverts(rcl.collect(), "send");
    assert.equal(st.r.status, 1); assert(dv.stakeSettled); assert.equal(dv.reserved, 0n);
    line("claimant that refuses ETH", "CANNOT BLOCK SETTLEMENT", `settleAssertion succeeds (status ${st.r.status}); device stake settled, reserved ${F(dv.reserved)}; the refusing claimant is credited ${F(crC)} ETH and only its own collect() fails ("${collect}") - nobody else is blocked`);
    CASE("claimant that cannot receive ETH", "its claim is upheld and settled normally; it is credited; only its own collect() fails", `credited ${F(crC)}; settleAssertion status ${st.r.status}; device stake settled; nobody else blocked`);
    c.extraCredit = [await rcl.getAddress()];
    // stated limit: the mock oracle takes the bond in native ETH; UMA's real oracle takes an ERC-20 bond (non-payable calls)
    const np = await (await ethers.getContractFactory("NonPayableOOv3", s[0])).deploy();
    const p2 = await (await ethers.getContractFactory("Paprika", s[0])).deploy(await np.getAddress());
    const c2 = { ...c, pap: p2, addr: await p2.getAddress(), keys: [] };
    const d2 = newDevice();
    await (await p2.connect(owner).register(d2.x, d2.y, d2.sign(msgRegK(c2, d2.keyId, owner.address)), { value: c.STAKE })).wait();
    const a2 = await anchorNow();
    await (await p2.attest(h("erc20-oracle"), a2.n, d2.keyId, d2.sign(msgCapK(c2, d2.keyId, h("erc20-oracle"), a2.hash)))).wait();
    const salt2 = ethers.hexlify(ethers.randomBytes(32));
    await (await p2.connect(s[3]).commitClaim(commitment(s[3].address, h("erc20-oracle"), d2.keyId, ev, salt2), { value: c.BOND })).wait();
    let rOracle = "accepted"; try { await (await p2.connect(s[3]).revealClaim(h("erc20-oracle"), d2.keyId, ev, salt2)).wait(); } catch (e) { rOracle = "reverts"; }
    line("oracle with UMA's real bond interface (ERC-20, not payable)", "STATED LIMIT", `revealClaim ${rOracle} against a non-payable oracle; the contract takes the bond in native ETH and the vote path is tested against a mock only`);
    // free and reserved stake are reported separately
    const g = await register(c, owner); for (const p of ["w1", "w2"]) await attest(c, owner, g.dev, h(p));
    for (const p of ["w1", "w2"]) await claim(c, s[8], h(p), g.dev.keyId);
    const v6 = await c.pap.verify(h("w1"), g.dev.keyId);
    assert.equal(v6.stakeAtRisk, c.STAKE - 2n * c.BOND); assert.equal(v6.reservedForClaims, 2n * c.BOND);
    CASE("free vs reserved stake", "verify reports the winnable free stake and the stake locked for open claims separately", `2 open claims: stakeAtRisk ${F(v6.stakeAtRisk)}, reservedForClaims ${F(v6.reservedForClaims)}`);
    line("free vs reserved stake", "REPORTED SEPARATELY", `verify reports stakeAtRisk (free, winnable) ${F(v6.stakeAtRisk)} and reservedForClaims (locked at the oracle) ${F(v6.reservedForClaims)}`);
    for (const id6 of await c.pap.openClaimIds(g.dev.keyId)) await reject(c, id6);
    // every decision on a key is logged, also after the first flag
    const f = await register(c, owner); await attest(c, owner, f.dev, h("f1")); await attest(c, owner, f.dev, h("f2"));
    const ca = await claim(c, s[4], h("f1"), f.dev.keyId); const cb = await claim(c, s[5], h("f2"), f.dev.keyId);
    await uphold(c, ca.id); await c.pap.connect(s[6]).proveKeyMisuse(f.dev.keyId, f.dev.sign(msgExtK(c, f.dev.keyId, s[6].address))); await uphold(c, cb.id);
    const logs = await c.pap.queryFilter(c.pap.filters.Flagged(f.dev.keyId));
    CASE("every decision on a key is logged", "one Flagged event per decision, flaggedAtBlock stays the first", `${logs.length} Flagged events`);
    line("flag history", "LOGGED", `${logs.length} Flagged events for one key: ${logs.map((l) => `[block ${l.blockNumber}, ${["None", "KeyMisuse", "ClaimUpheld"][Number(l.args.reason)]}, first=${l.args.firstFlag}]`).join(" ")}; flaggedAtBlock stays the first`);
    for (const w of [s[4], s[5], s[6], s[8]]) await cash(c, w);
    await mine(c.W); await c.pap.settleStake(f.dev.keyId).catch(() => {});
    line("block-denominated windows", "STATED LIMIT", "REVEAL_WINDOW, CLAIM_GRACE and the 256-block anchor are counted in blocks (chain-dependent)");
  });

  it("18 registration takes only (x, y, popSig); the contract has no admin or approval function", async () => {
    const reg = c.pap.interface.getFunction("register");
    assert.deepEqual(reg.inputs.map((i) => `${i.type} ${i.name}`), ["bytes32 x", "bytes32 y", "bytes popSig"]);
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function").map((f) => f.name).sort();
    assert.deepEqual(fns, ["BURN", "CLAIM_BOND", "CLAIM_GRACE", "LIVENESS", "MIN_STAKE", "REVEAL_WINDOW", "REWARD_BPS", "UNBONDING_PERIOD",
      "assertionDisputedCallback", "assertionResolvedCallback", "attest", "claimCredit", "claims", "commitBondsHeld", "commitClaim", "commits",
      "credit", "device", "forfeitCommit", "inbox", "openClaimIds", "oracle", "proveKeyMisuse", "records", "register", "requestUnbond",
      "revealClaim", "settleStake", "verify", "withdraw"]);
    const writes = c.pap.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    assert.deepEqual(writes, ["assertionResolvedCallback", "attest", "claimCredit", "commitClaim", "forfeitCommit", "proveKeyMisuse", "register", "requestUnbond", "revealClaim", "settleStake", "withdraw"]);
    const vOut = c.pap.interface.getFunction("verify").outputs[0].components.map((x) => x.name);
    const dOut = c.pap.interface.getFunction("device").outputs[0].components.map((x) => x.name);
    CASE("who can register", `anyone: register(${reg.inputs.map((i) => i.type + " " + i.name).join(", ")}) with the stake; no approval step exists`, `external functions (exact list): ${fns.join(", ")}; state-changing: ${writes.join(", ")}; verify fields: ${vOut.join(", ")}; device fields: ${dOut.join(", ")}`);
  });

  it("19 front-running a misuse proof: a copied proof is useless", async () => {
    const owner = s[1], prover = s[2], thief = s[3];
    const k = await register(c, owner); await attest(c, owner, k.dev, h("mp"));
    const sig = k.dev.sign(msgExtK(c, k.dev.keyId, prover.address));
    const rT = await reverts(c.pap.connect(thief).proveKeyMisuse.staticCall(k.dev.keyId, sig), "bad sig");
    const p0 = await balOf(prover), t0 = await balOf(thief);
    await automine(false);
    const t1 = await c.pap.connect(prover).proveKeyMisuse(k.dev.keyId, sig, { gasPrice: 2e9, gasLimit: 300000 });
    const t2 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t1.hash)).data, gasPrice: 3e9, gasLimit: 300000 });
    await mine(1); await automine(true);
    const st1 = (await ethers.provider.getTransactionReceipt(t1.hash)).status, st2 = (await ethers.provider.getTransactionReceipt(t2.hash)).status;
    assert.equal(st1, 1); assert.equal(st2, 0);
    await mine(c.W); await c.pap.settleStake(k.dev.keyId);
    const got = await cash(c, prover);
    assert.equal(got, c.STAKE / 2n); assert.equal(await c.pap.credit(thief.address), 0n);
    line("front-running (copy a pending misuse proof)", "FAILS", `the proof names its sender; the copy (mined first, higher gas price) reverts (status ${st2}, "${rT}"), the original succeeds (status ${st1})`);
    CASE("mempool copy of a misuse proof", `the copier's tx is mined first and reverts ("${rT}": the signed message names the prover); the original flags the key and is paid after ${c.W} blocks`, `prover +${F(got)} (net of gas ${F((await balOf(prover)) - p0)}); copier ${F((await balOf(thief)) - t0)} (gas only)`);
  });
});

after(async () => {
  console.log("\n      GAS Paprika (gasUsed, optimizer 200 runs, hardfork osaka; settle rows = MockArbiter.settleAssertion incl. the callback)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(40)} ${g}`);
  console.log("\n      SIZE (non-empty, non-comment lines of Solidity; deployed bytecode bytes)");
  const loc = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;
  for (const n of ["Paprika", "MockArbiter"]) console.log(`        ${n.padEnd(24)} ${String(loc(path.join(__dirname, "..", "contracts", n + ".sol"))).padStart(4)} lines  ${String(((await artifacts.readArtifact(n)).deployedBytecode.length - 2) / 2).padStart(6)} bytes`);
});
