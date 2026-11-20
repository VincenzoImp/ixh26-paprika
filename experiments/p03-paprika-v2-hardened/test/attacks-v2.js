// Paprika v2: positive path, then every p01 attack re-run against v2.
// Each attack prints "ATTACK <name>: SUCCEEDS / FAILS / PRICED | numbers".
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const ST = { None: 0n, Active: 1n, Flagged: 2n, Retired: 3n };
const RS = { None: 0n, KeyMisuse: 1n, DisputeUpheld: 2n };
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const BURN = "0x000000000000000000000000000000000000dEaD";
const gasLog = {};
const line = (name, verdict, nums) => console.log(`      ATTACK ${name}: ${verdict} | ${nums}`);

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

// ------------------------------------------------------------------ simulated device (P-256 key in Node)
function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  // the device signs sha256(preimage); the contract recomputes sha256(preimage) and passes it to the precompile
  const sign = (preimage) => "0x" + crypto.sign("sha256", ethers.getBytes(preimage), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}
const msgReg = (c, owner) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/REGISTER", c.chainId, c.addr, owner]);
const msgCap = (c, photo, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32"], ["PAPRIKA-V2/CAPTURE", c.chainId, c.addr, photo, bh]);
const msgExt = (c, sender) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/EXTRACTED", c.chainId, c.addr, sender]);
const highS = (sig) => { const r = sig.slice(0, 66), s = BigInt("0x" + sig.slice(66)); return r + (N_P256 - s).toString(16).padStart(64, "0"); };

// ------------------------------------------------------------------ protocol helpers
async function deploy() {
  const s = await ethers.getSigners();
  const oracle = await (await ethers.getContractFactory("MockOptimisticOracleV3", s[0])).deploy(); // s[0] plays the DVM
  const pap = await (await ethers.getContractFactory("PaprikaV2", s[0])).deploy(await oracle.getAddress());
  const c = { s, oracle, pap, addr: await pap.getAddress(), chainId: (await ethers.provider.getNetwork()).chainId, keys: [] };
  c.STAKE = await pap.MIN_STAKE(); c.BOND = await pap.CLAIM_BOND(); c.LIVENESS = Number(await pap.LIVENESS());
  c.UNBOND = Number(await pap.UNBONDING_PERIOD());
  return c;
}
async function register(c, owner, dev = newDevice(), stake = c.STAKE) {
  const x = await rc(c.pap.connect(owner).register(dev.x, dev.y, dev.sign(msgReg(c, owner.address)), { value: stake }));
  c.keys.push(dev.keyId);
  return { dev, ...x };
}
async function anchorNow() { const b = await ethers.provider.getBlock("latest"); return { n: b.number, hash: b.hash }; }
async function attest(c, relayer, dev, photo, opts = {}) {
  const a = opts.anchor || await anchorNow();
  const sig = dev.sign(msgCap(c, photo, a.hash));
  const x = await rc(c.pap.connect(relayer).attest(photo, a.n, dev.keyId, sig, { value: opts.deposit || 0n }));
  return { ...x, anchor: a, sig };
}
async function claim(c, claimant, photo, keyId, evidence = h("evidence")) {
  const x = await rc(c.pap.connect(claimant).claimFake(photo, keyId, evidence, { value: c.BOND }));
  const ev = x.r.logs.map((l) => { try { return c.pap.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "ClaimOpened");
  return { id: ev.args.assertionId, ...x };
}
const dispute = (c, who, id) => rc(c.oracle.connect(who).disputeAssertion(id, who.address, { value: c.BOND }));
const dvm = (c, id, truthful) => rc(c.oracle.connect(c.s[0]).resolveDispute(id, truthful));
async function settle(c, id, who) { return rc(c.oracle.connect(who || c.s[19]).settleAssertion(id)); }
async function settleUndisputed(c, id, who) { await warp(c.LIVENESS + 1); return settle(c, id, who); }
async function cash(c, who) { const cr = await c.pap.credit(who.address); if (cr > 0n) { const g = await rc(c.pap.connect(who).claimCredit()); gasLog.claimCredit ??= g.gas; } return cr; }
const dev_ = (c, keyId) => c.pap.devices(keyId);
async function invariant(c) {
  let stakes = 0n; for (const k of c.keys) stakes += (await dev_(c, k)).stake;
  let credits = 0n; for (const a of c.s) credits += await c.pap.credit(a.address);
  const bal = await balOf(c.addr), ob = await c.oracle.openBonds(), obal = await balOf(await c.oracle.getAddress());
  assert.equal(bal, stakes + credits, `INVARIANT paprika balance ${bal} != stakes ${stakes} + credits ${credits}`);
  assert.equal(obal, ob, `INVARIANT oracle balance ${obal} != open bonds ${ob}`);
  return { bal, stakes, credits, ob };
}

describe("PaprikaV2 (hardened)", function () {
  let c, s;
  beforeEach(async () => { c = await deploy(); s = c.s; });
  afterEach(async () => { const i = await invariant(c); console.log(`      invariant ok: contract ${F(i.bal)} ETH = stakes ${F(i.stakes)} + unclaimed rewards ${F(i.credits)}; oracle holds open bonds ${F(i.ob)}`); });

  it("0 positive path: register (PoP), attest via relayer, verify, claims (undisputed / disputed both ways), misuse proof, unbond+withdraw", async () => {
    const owner = s[1], relayer = s[2], claimant = s[3], watcher = s[4], challenger = s[5];
    // register + attest through a relayer: the device key holds no ETH, the relayer pays gas
    const d1 = await register(c, owner); gasLog.register = d1.gas;
    const a1 = await attest(c, relayer, d1.dev, h("p1")); gasLog.attest = a1.gas;
    const a1b = await attest(c, relayer, d1.dev, h("p1-deposit"), { deposit: E("0.05") }); gasLog["attest + deposit"] = a1b.gas;
    let v = await c.pap.verify(h("p1"), d1.dev.keyId);
    assert.equal(v.status, ST.Active); assert.equal(v.anchorBlock, BigInt(a1.anchor.n)); assert.equal(v.recordedBlock, BigInt(a1.r.blockNumber));
    assert.equal(v.recordedBeforeFlag, true); assert.equal(v.stake, E("0.15")); assert.equal(await c.pap.firstKeyOf(h("p1")), d1.dev.keyId);
    // undisputed claim -> upheld: verdict, flag, slash 50/50, bond back
    const cb0 = await balOf(claimant), burn0 = await balOf(BURN);
    const cl = await claim(c, claimant, h("p1"), d1.dev.keyId); gasLog.claimFake = cl.gas;
    assert.equal((await dev_(c, d1.dev.keyId)).openClaims, 1n);
    const st = await settleUndisputed(c, cl.id); gasLog["settle undisputed (slash)"] = st.gas;
    v = await c.pap.verify(h("p1"), d1.dev.keyId);
    assert.equal(v.verdict, 1n); assert.equal(v.status, ST.Flagged); assert.equal(v.flagReason, RS.DisputeUpheld); assert.equal(v.stake, 0n);
    assert.equal(v.recordedBeforeFlag, true);
    const rw = await cash(c, claimant);
    const cnet = (await balOf(claimant)) - cb0, burned = (await balOf(BURN)) - burn0;
    assert.equal(rw, E("0.075")); assert.equal(burned, E("0.075"));
    await reverts(attest(c, relayer, d1.dev, h("p1-after")), "not active");
    // disputed, rejected: device untouched, claimant bond -> disputer (owner)
    const d2 = await register(c, owner); await attest(c, relayer, d2.dev, h("p2"));
    const o0 = await balOf(owner);
    const cl2 = await claim(c, claimant, h("p2"), d2.dev.keyId);
    const dg = await dispute(c, owner, cl2.id); gasLog.dispute = dg.gas; await dvm(c, cl2.id, false);
    const st2 = await settle(c, cl2.id); gasLog["settle disputed (rejected, no slash)"] = st2.gas;
    assert.equal((await dev_(c, d2.dev.keyId)).status, ST.Active); assert.equal((await c.pap.verify(h("p2"), d2.dev.keyId)).verdict, 0n);
    const ownerGain = (await balOf(owner)) - o0;
    // disputed, upheld: claimant gets both bonds + reward
    const d3 = await register(c, owner); await attest(c, relayer, d3.dev, h("p3"));
    const c0 = await balOf(claimant);
    const cl3 = await claim(c, claimant, h("p3"), d3.dev.keyId);
    await dispute(c, watcher, cl3.id); await dvm(c, cl3.id, true);
    const st3 = await settle(c, cl3.id); gasLog["settle disputed (upheld, slash)"] = st3.gas;
    await cash(c, claimant);
    assert.equal((await dev_(c, d3.dev.keyId)).status, ST.Flagged);
    const c3net = (await balOf(claimant)) - c0;
    // proof of key misuse (objective, immediate)
    const d4 = await register(c, owner); await attest(c, relayer, d4.dev, h("p4"));
    const pm = await rc(c.pap.connect(challenger).proveKeyMisuse(d4.dev.keyId, d4.dev.sign(msgExt(c, challenger.address)))); gasLog.proveKeyMisuse = pm.gas;
    const d4s = await dev_(c, d4.dev.keyId);
    assert.equal(d4s.status, ST.Flagged); assert.equal(d4s.flagReason, RS.KeyMisuse); assert.equal(await c.pap.credit(challenger.address), E("0.05"));
    await cash(c, challenger);
    // unbond + withdraw
    const d5 = await register(c, owner); await attest(c, relayer, d5.dev, h("p5"));
    const ub = await rc(c.pap.connect(owner).requestUnbond(d5.dev.keyId)); gasLog.requestUnbond = ub.gas;
    await reverts(attest(c, relayer, d5.dev, h("p5b")), "not active");
    await reverts(c.pap.connect(owner).withdraw(d5.dev.keyId), "unbonding");
    await reverts(c.pap.connect(claimant).withdraw(d5.dev.keyId), "not owner");
    await warp(c.UNBOND);
    const o1 = await balOf(owner);
    const wd = await rc(c.pap.connect(owner).withdraw(d5.dev.keyId)); gasLog.withdraw = wd.gas;
    assert.equal((await balOf(owner)) - o1 + wd.cost, c.STAKE);
    console.log(`      POSITIVE PATH OK | undisputed claim: claimant net ${F(cnet)} ETH (bond back + reward 0.075 - gas), burned ${F(burned)} | rejected claim: owner-as-disputer gained ${F(ownerGain)} ETH (claimant bond) | upheld disputed claim: claimant net ${F(c3net)} | misuse proof: challenger reward 0.05 | withdraw returned ${F(c.STAKE)} ETH after ${c.UNBOND / 86400} days`);
  });

  it("1 ban evasion: flagged key cannot come back; a new key costs a new stake", async () => {
    const cheater = s[6], hunter = s[7];
    const k1 = await register(c, cheater); await attest(c, cheater, k1.dev, h("fake-1"));
    await c.pap.connect(hunter).proveKeyMisuse(k1.dev.keyId, k1.dev.sign(msgExt(c, hunter.address)));
    const r1 = await reverts(c.pap.connect(cheater).register(k1.dev.x, k1.dev.y, k1.dev.sign(msgReg(c, cheater.address)), { value: c.STAKE }), "key used");
    const k2 = await register(c, cheater); await attest(c, cheater, k2.dev, h("fake-2"));
    const fresh = s[8]; const k3 = await register(c, fresh); await attest(c, fresh, k3.dev, h("fake-3"));
    const ok = (await c.pap.verify(h("fake-2"), k2.dev.keyId)).recordedBlock > 0n && (await c.pap.verify(h("fake-3"), k3.dev.keyId)).recordedBlock > 0n;
    assert(ok);
    line("ban-evasion", "PRICED", `old key re-register reverts "${r1}"; new key (same or new account) still registers: cost = ${F(c.STAKE)} ETH locked stake + ${k2.gas} gas (${F(k2.cost)} ETH); the stake is lost only if the new key is caught. Not prevented: one identity per forgery costs (1-0.5) x stake when caught, 0 when not`);
  });

  it("2 synthetic content: software key attests random bytes; then the two punishments", async () => {
    const forger = s[9], finder = s[10], claimant = s[11];
    const k = await register(c, forger);
    const ai = ethers.sha256(ethers.concat([ethers.toUtf8Bytes("AI image:"), ethers.randomBytes(4096)]));
    await attest(c, forger, k.dev, ai, { deposit: E("0.05") });
    const v = await c.pap.verify(ai, k.dev.keyId);
    line("synthetic-content", "SUCCEEDS", `register + attest of a hash of 4096 random bytes accepted (recordedBlock ${v.recordedBlock}, status Active); the contract cannot tell a software key from secure hardware`);
    // (a) the key leaks / is found (e.g. in a forging tool): anyone proves misuse
    const f0 = await balOf(finder);
    const g = await rc(c.pap.connect(finder).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, finder.address)))); await cash(c, finder);
    const fnet = (await balOf(finder)) - f0;
    // (b) another forger key caught by an upheld (undisputed) claim
    const k2 = await register(c, forger); const ai2 = h("ai-2"); await attest(c, forger, k2.dev, ai2);
    const c0 = await balOf(claimant);
    const cl = await claim(c, claimant, ai2, k2.dev.keyId); await settleUndisputed(c, cl.id); await cash(c, claimant);
    const cnet = (await balOf(claimant)) - c0;
    line("synthetic-content punished", "PRICED", `(a) misuse proof: forger loses stake+deposit ${F(c.STAKE + E("0.05"))} ETH, finder nets ${F(fnet)} ETH (gas ${g.gas}); (b) upheld claim: forger loses ${F(c.STAKE)} ETH, claimant nets ${F(cnet)} ETH. Both need someone to obtain the key or win a subjective claim; an undetected forgery costs only the gas + locked capital`);
  });

  it("3 attestation theft / front-running (attest copy, same-hash own device, register, proveKeyMisuse)", async () => {
    const honestOwner = s[12], relayer = s[13], thief = s[14], challenger = s[15];
    const dH = await register(c, honestOwner), dT = await register(c, thief);
    const photo = h("honest-scoop.jpg");
    // 3a: thief copies the pending attest calldata verbatim and front-runs it
    await network.provider.send("evm_setAutomine", [false]);
    const a = await anchorNow();
    const tx1 = await c.pap.connect(relayer).attest(photo, a.n, dH.dev.keyId, dH.dev.sign(msgCap(c, photo, a.hash)), { gasPrice: 2_000_000_000n, gasLimit: 500_000n });
    const pend = await ethers.provider.getTransaction(tx1.hash);
    const tx2 = await thief.sendTransaction({ to: c.addr, data: pend.data, gasPrice: 3_000_000_000n, gasLimit: 500_000n });
    await mine(1); await network.provider.send("evm_setAutomine", [true]);
    const r1 = await ethers.provider.getTransactionReceipt(tx1.hash), r2 = await ethers.provider.getTransactionReceipt(tx2.hash);
    const v = await c.pap.verify(photo, dH.dev.keyId), vT = await c.pap.verify(photo, dT.dev.keyId);
    assert.equal(r2.status, 1); assert.equal(r1.status, 0); assert(v.recordedBlock > 0n); assert.equal(vT.recordedBlock, 0n);
    line("front-running (copy attest calldata)", "FAILS", `thief's copy mined first (status ${r2.status}), honest relayer tx reverted "exists" (status ${r1.status}); the record is bound to the HONEST device key; thief only paid ${r2.gasUsed} gas to relay for the victim`);
    // 3b: thief takes the hash from the mempool and signs it with HIS device, same anchor, higher gas price
    const photo2 = h("honest-scoop-2.jpg");
    await network.provider.send("evm_setAutomine", [false]);
    const b = await anchorNow();
    const t3 = await c.pap.connect(relayer).attest(photo2, b.n, dH.dev.keyId, dH.dev.sign(msgCap(c, photo2, b.hash)), { gasPrice: 2_000_000_000n, gasLimit: 500_000n });
    const p3 = c.pap.interface.decodeFunctionData("attest", (await ethers.provider.getTransaction(t3.hash)).data);
    const t4 = await c.pap.connect(thief).attest(p3[0], p3[1], dT.dev.keyId, dT.dev.sign(msgCap(c, p3[0], b.hash)), { gasPrice: 3_000_000_000n, gasLimit: 500_000n });
    await mine(1); await network.provider.send("evm_setAutomine", [true]);
    const vh = await c.pap.verify(photo2, dH.dev.keyId), vt = await c.pap.verify(photo2, dT.dev.keyId), first = await c.pap.firstKeyOf(photo2);
    assert(vh.recordedBlock > 0n && vt.recordedBlock > 0n);
    const firstIsThief = first === dT.dev.keyId;
    line("front-running (same hash, thief's own device)", firstIsThief ? "SUCCEEDS (first-attester field only)" : "FAILS",
      `both records exist, honest [anchor ${vh.anchorBlock}, recorded ${vh.recordedBlock}] vs thief [anchor ${vt.anchorBlock}, recorded ${vt.recordedBlock}]: identical windows, so the chain cannot order them; firstKeyOf(hash) = ${firstIsThief ? "THIEF" : "honest"} key. The honest record is not lost, but "who attested first" is front-runnable (needs commit-reveal / private submission)`);
    // 3c: front-running register: copy (x, y, popSig) from a pending tx
    const dN = newDevice();
    await network.provider.send("evm_setAutomine", [false]);
    const t5 = await c.pap.connect(honestOwner).register(dN.x, dN.y, dN.sign(msgReg(c, honestOwner.address)), { value: c.STAKE, gasPrice: 2_000_000_000n, gasLimit: 500_000n });
    const p5 = await ethers.provider.getTransaction(t5.hash);
    const t6 = await thief.sendTransaction({ to: c.addr, data: p5.data, value: c.STAKE, gasPrice: 3_000_000_000n, gasLimit: 500_000n });
    await mine(1); await network.provider.send("evm_setAutomine", [true]);
    c.keys.push(dN.keyId);
    const r5 = await ethers.provider.getTransactionReceipt(t5.hash), r6 = await ethers.provider.getTransactionReceipt(t6.hash);
    assert.equal(r6.status, 0); assert.equal(r5.status, 1); assert.equal((await dev_(c, dN.keyId)).owner, honestOwner.address);
    line("front-running (register)", "FAILS", `thief's copied register reverted "bad pop" (PoP is bound to msg.sender), honest registration mined (status ${r5.status}), owner = honest`);
    // 3d: front-running proveKeyMisuse
    const dM = await register(c, s[16]);
    await network.provider.send("evm_setAutomine", [false]);
    const t7 = await c.pap.connect(challenger).proveKeyMisuse(dM.dev.keyId, dM.dev.sign(msgExt(c, challenger.address)), { gasPrice: 2_000_000_000n, gasLimit: 500_000n });
    const p7 = await ethers.provider.getTransaction(t7.hash);
    const t8 = await thief.sendTransaction({ to: c.addr, data: p7.data, gasPrice: 3_000_000_000n, gasLimit: 500_000n });
    await mine(1); await network.provider.send("evm_setAutomine", [true]);
    const r7 = await ethers.provider.getTransactionReceipt(t7.hash), r8 = await ethers.provider.getTransactionReceipt(t8.hash);
    assert.equal(r8.status, 0); assert.equal(r7.status, 1); assert.equal(await c.pap.credit(challenger.address), E("0.05")); assert.equal(await c.pap.credit(thief.address), 0n);
    line("front-running (proveKeyMisuse bounty sniping)", "FAILS", `thief's copy reverted "bad sig" (proof names msg.sender), honest challenger credited ${F(await c.pap.credit(challenger.address))} ETH`);
  });

  it("4 self-report loop: owner flags its own device (misuse proof / undisputed claim); no treasury", async () => {
    const a = s[17], sybil = s[18], honest = s[1];
    await register(c, honest, newDevice(), E("1"));        // somebody else's 1 ETH stake sits in the contract
    const t0 = await balOf(c.addr);
    const a0 = (await balOf(a)) + (await balOf(sybil));
    const N = 5;
    for (let i = 0; i < N; i++) {
      const k = await register(c, a); await attest(c, a, k.dev, h("junk" + i));
      await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, sybil.address)));
      await cash(c, sybil);
    }
    const netM = (await balOf(a)) + (await balOf(sybil)) - a0;
    const b0 = (await balOf(a)) + (await balOf(sybil));
    for (let i = 0; i < N; i++) {
      const k = await register(c, a); await attest(c, a, k.dev, h("junkc" + i));
      const cl = await claim(c, sybil, h("junkc" + i), k.dev.keyId); await settleUndisputed(c, cl.id, sybil); await cash(c, sybil);
    }
    const netC = (await balOf(a)) + (await balOf(sybil)) - b0;
    const t1 = await balOf(c.addr);
    assert(netM < -E("0.05") * BigInt(N) + E("0.0001") && netC < -E("0.05") * BigInt(N) + E("0.0001")); assert.equal(t1, t0);
    line("self-report-profit", "FAILS", `${N} cycles via misuse proof: attacker+sybil net ${F(netM)} ETH (= -${N} x 0.5 x ${F(c.STAKE)} - gas); ${N} cycles via undisputed self-claim: net ${F(netC)} ETH; contract balance before/after ${F(t0)} -> ${F(t1)} ETH (only the honest 1 ETH stake; no treasury, nothing to drain)`);
  });

  it("4b double rewards for the same device / record", async () => {
    const owner = s[1], c1 = s[2], c2 = s[3], c3 = s[4];
    const k = await register(c, owner); await attest(c, owner, k.dev, h("x")); await attest(c, owner, k.dev, h("y"));
    const cl1 = await claim(c, c1, h("x"), k.dev.keyId);
    const rOpen = await reverts(c.pap.connect(c2).claimFake(h("x"), k.dev.keyId, h("e"), { value: c.BOND }), "claim open");
    const cl2 = await claim(c, c2, h("y"), k.dev.keyId);
    await settleUndisputed(c, cl1.id); await settle(c, cl2.id);
    const rVerdict = await reverts(c.pap.connect(c3).claimFake(h("x"), k.dev.keyId, h("e"), { value: c.BOND }), "has verdict");
    await c.pap.connect(c3).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, c3.address)));
    const cr = [await c.pap.credit(c1.address), await c.pap.credit(c2.address), await c.pap.credit(c3.address)];
    const rMis = await reverts(c.pap.connect(c2).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, c2.address))), "already misuse");
    assert.equal(cr[0] + cr[1] + cr[2], E("0.05"));
    line("double-dip", "FAILS", `rewards paid for one device: ${F(cr[0])} + ${F(cr[1])} + ${F(cr[2])} = ${F(cr[0] + cr[1] + cr[2])} ETH (= 0.5 x stake, once); 2nd claim on same record: "${rOpen}" while open, "${rVerdict}" after; second upheld record + later misuse proof pay 0 (stake already 0); 2nd misuse proof: "${rMis}"`);
    for (const w of [c1, c2, c3]) await cash(c, w);
  });

  it("5 griefing an honest device: disputed false claim vs. unwatched false claim", async () => {
    const honest = s[5], griefer = s[6];
    const k = await register(c, honest); for (let i = 0; i < 30; i++) await attest(c, honest, k.dev, h("real" + i));
    const g0 = await balOf(griefer), h0 = await balOf(honest);
    const cl = await claim(c, griefer, h("real0"), k.dev.keyId); await dispute(c, honest, cl.id); await dvm(c, cl.id, false); await settle(c, cl.id, honest);
    const gLoss = (await balOf(griefer)) - g0, hGain = (await balOf(honest)) - h0;
    assert.equal((await dev_(c, k.dev.keyId)).status, ST.Active);
    line("griefing (watched: owner disputes, vote rejects)", "FAILS", `device stays Active; griefer net ${F(gLoss)} ETH (bond lost); owner net ${F(hGain)} ETH (posted bond, won both, minus gas). Owner must watch every claim and front ${F(c.BOND)} ETH per dispute`);
    const g1 = await balOf(griefer);
    const cl2 = await claim(c, griefer, h("real1"), k.dev.keyId); await settleUndisputed(c, cl2.id, griefer); await cash(c, griefer);
    const gNet = (await balOf(griefer)) - g1; const ds = await dev_(c, k.dev.keyId);
    assert.equal(ds.status, ST.Flagged);
    let before = 0; for (let i = 0; i < 30; i++) if ((await c.pap.verify(h("real" + i), k.dev.keyId)).recordedBeforeFlag) before++;
    line("griefing (unwatched: nobody disputes within liveness)", "SUCCEEDS", `honest device Flagged (DisputeUpheld) after ${c.LIVENESS / 3600}h liveness, honest owner loses ${F(c.STAKE)} ETH stake, griefer net +${F(gNet)} ETH (reward - gas); ${before}/30 earlier records still visible with recordedBeforeFlag=true (a lenient verifier keeps them). Residual risk of optimistic resolution`);
  });

  it("6 retroactive effect: 100 earlier records after a flag", async () => {
    const owner = s[7], claimant = s[8];
    const k = await register(c, owner); for (let i = 0; i < 100; i++) await attest(c, owner, k.dev, h("old" + i));
    await attest(c, owner, k.dev, h("the-fake"));
    const cl = await claim(c, claimant, h("the-fake"), k.dev.keyId); await settleUndisputed(c, cl.id); await cash(c, claimant);
    let vis = 0, before = 0;
    for (let i = 0; i < 100; i++) { const v = await c.pap.verify(h("old" + i), k.dev.keyId); if (v.recordedBlock > 0n) vis++; if (v.recordedBeforeFlag && v.verdict === 0n) before++; }
    const vf = await c.pap.verify(h("the-fake"), k.dev.keyId);
    await reverts(attest(c, owner, k.dev, h("new")), "not active");
    assert.equal(vis, 100); assert.equal(before, 100); assert.equal(vf.verdict, 1n);
    line("retroactive-censorship", "FAILS", `${vis}/100 earlier records still returned, ${before}/100 with recordedBeforeFlag=true and no verdict; flag reason ${vf.flagReason === RS.DisputeUpheld ? "DisputeUpheld" : vf.flagReason} at block ${vf.flaggedAtBlock}; the judged photo itself carries verdict UpheldFake (unlike baseline future-only); new attestations blocked. Policy is the verifier's`);
  });

  it("7 replay / duplicates / wrong domain / anchors", async () => {
    const owner = s[9], rel = s[10];
    const k = await register(c, owner), k2 = await register(c, owner);
    const a = await attest(c, rel, k.dev, h("p"));
    const R = [];
    R.push(["same (photo,key) replayed", await reverts(c.pap.connect(rel).attest(h("p"), a.anchor.n, k.dev.keyId, a.sig), "exists")]);
    const u = newDevice(); const an = await anchorNow();
    R.push(["unregistered key", await reverts(c.pap.attest(h("q"), an.n, u.keyId, u.sign(msgCap(c, h("q"), an.hash))), "not active")]);
    R.push(["sig by another key", await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k2.dev.sign(msgCap(c, h("q"), an.hash))), "bad sig")]);
    const other = await (await ethers.getContractFactory("PaprikaV2", s[0])).deploy(await c.oracle.getAddress());
    const cOther = { ...c, addr: await other.getAddress() };
    R.push(["sig for another contract", await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap(cOther, h("q"), an.hash))), "bad sig")]);
    R.push(["sig for another chain", await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap({ ...c, chainId: 1n }, h("q"), an.hash))), "bad sig")]);
    R.push(["sig for another photo", await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap(c, h("other"), an.hash))), "bad sig")]);
    R.push(["sig over a different anchor hash", await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), ethers.ZeroHash))), "bad sig")]);
    const stale = await anchorNow(); await mine(300);
    R.push(["stale anchor (300 blocks old)", await reverts(c.pap.attest(h("q"), stale.n, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), stale.hash))), "anchor")]);
    const now = await anchorNow();
    R.push(["anchor = current block", await reverts(c.pap.attest(h("q"), now.n + 1, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), ethers.ZeroHash))), "anchor")]);
    R.push(["anchor in the future (+10)", await reverts(c.pap.attest(h("q"), now.n + 10, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), ethers.ZeroHash))), "anchor")]);
    R.push(["64-byte garbage sig", await reverts(c.pap.attest(h("q"), now.n, k.dev.keyId, ethers.hexlify(ethers.randomBytes(64))), "bad sig")]);
    // the same hash by a second device is a separate record (G-13: all attesters listed)
    await attest(c, rel, k2.dev, h("p"));
    // near-duplicate: 1-byte edit = new hash = new valid record (unchanged from baseline; out of scope)
    await attest(c, rel, k.dev, h("p!"));
    for (const [n, r] of R) line(`replay/domain: ${n}`, "FAILS", `reverts "${r}"`);
    line("same hash, second device", "ALLOWED (by design)", "separate record per (photo, key); verifier sees every attester with its window");
    line("near-duplicate (1-byte edit)", "SUCCEEDS", "new hash gets a new valid record (exact-hash semantics, unchanged from baseline)");
  });

  it("8 no admin: function surface, direct calls, stray ETH", async () => {
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    const bad = fns.filter((n) => /owner|admin|upgrade|set|sweep|rescue|pause|transfer/i.test(n));
    const r1 = await reverts(c.pap.connect(s[11]).assertionResolvedCallback(ethers.ZeroHash, true), "only oracle");
    let r2 = "";
    try { await (await s[11].sendTransaction({ to: c.addr, value: E("1") })).wait(); } catch (e) { r2 = "reverts (no receive/fallback)"; }
    assert(r2 && bad.length === 0);
    const k = await register(c, s[12]);
    const r3 = await reverts(c.pap.connect(s[11]).requestUnbond(k.dev.keyId), "not owner");
    line("admin / treasury drain", "FAILS", `state-changing functions: ${fns.join(", ")}; none admin-like; callback from non-oracle: "${r1}"; plain ETH transfer ${r2}; unbond by non-owner: "${r3}". ETH leaves only via withdraw (owner, own stake), claimCredit (earned reward), burn on slash; invariant balance == sum(stakes) + unclaimed rewards checked after every test`);
  });

  it("9 key squatting and claims on photos the device never attested", async () => {
    const victim = s[13], squatter = s[14], claimant = s[15];
    const vd = newDevice(); const sq = newDevice();
    const r1 = await reverts(c.pap.connect(squatter).register(vd.x, vd.y, sq.sign(msgReg(c, squatter.address)), { value: c.STAKE }), "bad pop");
    const r2 = await reverts(c.pap.connect(squatter).register(vd.x, vd.y, vd.sign(msgReg(c, victim.address)), { value: c.STAKE }), "bad pop");
    await register(c, victim, vd);
    const r3 = await reverts(c.pap.connect(claimant).claimFake(h("never-attested"), vd.keyId, h("e"), { value: c.BOND }), "no record");
    await attest(c, victim, vd, h("real"));
    const r4 = await reverts(c.pap.connect(claimant).claimFake(h("real"), sq.keyId, h("e"), { value: c.BOND }), "no record");
    const r5 = await reverts(c.pap.connect(squatter).register(sq.x, sq.y, sq.sign(msgReg(c, squatter.address)), { value: c.STAKE - 1n }), "stake");
    line("key-squatting", "FAILS", `squatter with own PoP: "${r1}"; squatter replaying victim's PoP: "${r2}"; victim registers normally`);
    line("claim on unattested photo", "FAILS", `"${r3}"; claim naming the wrong device for a real photo: "${r4}"; under-staked register: "${r5}"`);
  });

  it("10 withdrawal races", async () => {
    const owner = s[16], claimant = s[17], forger = s[18];
    // a) unbond while a claim is open
    const k = await register(c, owner); await attest(c, owner, k.dev, h("w1"));
    const cl = await claim(c, claimant, h("w1"), k.dev.keyId);
    await dispute(c, owner, cl.id);                        // owner disputes within liveness; the vote takes longer than 7 days
    await c.pap.connect(owner).requestUnbond(k.dev.keyId); await warp(c.UNBOND);
    const ra = await reverts(c.pap.connect(owner).withdraw(k.dev.keyId), "open claims");
    await dvm(c, cl.id, false); await settle(c, cl.id);
    await c.pap.connect(owner).withdraw(k.dev.keyId);
    line("withdraw with open claim", "FAILS", `withdraw reverts "${ra}" until the claim resolves; after rejection the owner withdraws`);
    // b) claim opened 60 s before the unbonding period ends, undisputed -> slashed
    const k2 = await register(c, owner); await attest(c, owner, k2.dev, h("w2"));
    await c.pap.connect(owner).requestUnbond(k2.dev.keyId); await warp(c.UNBOND - 60);
    const cl2 = await claim(c, claimant, h("w2"), k2.dev.keyId); await warp(61);
    const rb = await reverts(c.pap.connect(owner).withdraw(k2.dev.keyId), "open claims");
    await settleUndisputed(c, cl2.id);
    const rb2 = await reverts(c.pap.connect(owner).withdraw(k2.dev.keyId), "not retired");
    const rb3 = await reverts(c.pap.connect(owner).requestUnbond(k2.dev.keyId), "not active");
    line("last-minute claim vs withdraw / flagged device withdraw", "FAILS", `withdraw at T+1s: "${rb}"; after upheld claim the device is Flagged, stake 0: withdraw "${rb2}", requestUnbond "${rb3}"`);
    await cash(c, claimant);
    // c) forger attests, unbonds at once, nobody claims for 7 days -> full stake back; later claims slash nothing
    const kf = await register(c, forger); await attest(c, forger, kf.dev, h("fake-w"));
    await c.pap.connect(forger).requestUnbond(kf.dev.keyId); await warp(c.UNBOND);
    const f0 = await balOf(forger); const w = await rc(c.pap.connect(forger).withdraw(kf.dev.keyId)); const back = (await balOf(forger)) - f0 + w.cost;
    const cl3 = await claim(c, claimant, h("fake-w"), kf.dev.keyId); await settleUndisputed(c, cl3.id);
    const late = await c.pap.credit(claimant.address);
    line("exit before anyone looks (attest, unbond, wait 7 days)", "SUCCEEDS", `forger gets back ${F(back)} ETH = full stake; a claim after withdrawal still records verdict UpheldFake + flag, but the reward is ${F(late)} ETH (stake gone). Exposure window per key = UNBONDING_PERIOD`);
    await cash(c, claimant);
  });

  it("11 signature malleability (high-s twin)", async () => {
    const owner = s[19], ch = s[5], other = s[6];
    const k = await register(c, owner);
    const a = await attest(c, owner, k.dev, h("m"));
    const twin = highS(a.sig);
    const pre = ethers.concat([ethers.sha256(msgCap(c, h("m"), a.anchor.hash)), twin, k.dev.x, k.dev.y]);
    const out = await network.provider.request({ method: "eth_call", params: [{ to: "0x0000000000000000000000000000000000000100", data: pre }, "latest"] });
    const accepted = out !== "0x" && BigInt(out) === 1n;
    const r1 = await reverts(c.pap.connect(other).attest(h("m"), a.anchor.n, k.dev.keyId, twin), "exists");
    const pop = k.dev.sign(msgReg(c, owner.address));
    const r2 = await reverts(c.pap.connect(owner).register(k.dev.x, k.dev.y, highS(pop), { value: c.STAKE }), "key used");
    const mis = k.dev.sign(msgExt(c, ch.address));
    const r3 = await reverts(c.pap.connect(other).proveKeyMisuse(k.dev.keyId, highS(mis)), "bad sig");
    await c.pap.connect(ch).proveKeyMisuse(k.dev.keyId, highS(mis));
    const r4 = await reverts(c.pap.connect(ch).proveKeyMisuse(k.dev.keyId, mis), "already misuse");
    await cash(c, ch);
    line("signature-malleability", "FAILS (harmless)", `precompile accepts the high-s twin: ${accepted}; twin of a capture sig: "${r1}" (records keyed by (photo,key), not by sig); twin PoP: "${r2}"; twin misuse proof by another sender: "${r3}"; by the same sender it works once, then "${r4}"`);
  });

  it("12 extra: forger snipes its own bounty (self misuse proof while a claim is open)", async () => {
    const forger = s[7], sybil = s[8], hunter = s[9];
    const k = await register(c, forger); await attest(c, forger, k.dev, h("deepfake"));
    const h0 = await balOf(hunter), f0 = (await balOf(forger)) + (await balOf(sybil));
    const cl = await claim(c, hunter, h("deepfake"), k.dev.keyId);
    // during the 2h liveness the forger sees the claim and flags its own key from a sybil account
    await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, sybil.address))); await cash(c, sybil);
    await settleUndisputed(c, cl.id);
    const hc = await c.pap.credit(hunter.address);
    const hNet = (await balOf(hunter)) - h0, fNet = (await balOf(forger)) + (await balOf(sybil)) - f0;
    assert.equal(hc, 0n);
    line("bounty-sniping by the forger (self misuse proof)", "SUCCEEDS", `hunter's upheld claim earns ${F(hc)} ETH (net ${F(hNet)} = gas only); forger+sybil net ${F(fNet)} ETH incl. register, i.e. loses 0.5 x stake instead of the full stake. Any forger can cap its loss at (1-REWARD_BPS) x stake and deny every hunter its reward -> nobody is paid to hunt keys the forger controls`);
  });

  it("13 extra: stolen honest key (F-15) and spam claims blocking withdrawal", async () => {
    const victim = s[10], thief = s[11], griefer = s[12];
    const k = await register(c, victim); for (let i = 0; i < 5; i++) await attest(c, victim, k.dev, h("v" + i));
    // the thief exfiltrates the key: flags it, collects half the victim's stake
    await c.pap.connect(thief).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, thief.address)));
    const got = await cash(c, thief);
    const v = await c.pap.verify(h("v0"), k.dev.keyId);
    line("stolen honest key -> misuse flag", "SUCCEEDS", `thief earns ${F(got)} ETH from the victim's stake; flag reason KeyMisuse, so a lenient verifier drops all 5 honest earlier records (recordedBeforeFlag=${v.recordedBeforeFlag} but reason=KeyMisuse). Inherent: the contract cannot tell extraction from theft`);
    // griefer opens claims on N records to keep the owner from withdrawing
    const k2 = await register(c, victim); for (let i = 0; i < 3; i++) await attest(c, victim, k2.dev, h("u" + i));
    await c.pap.connect(victim).requestUnbond(k2.dev.keyId);
    const ids = []; for (let i = 0; i < 3; i++) { const id = (await claim(c, griefer, h("u" + i), k2.dev.keyId)).id; ids.push(id); await dispute(c, victim, id); }
    await warp(c.UNBOND);
    const r = await reverts(c.pap.connect(victim).withdraw(k2.dev.keyId), "open claims");
    for (const id of ids) { await dvm(c, id, false); await settle(c, id); }
    await c.pap.connect(victim).withdraw(k2.dev.keyId);
    line("withdrawal blocked by spam claims", "PRICED", `3 claims: withdraw "${r}" until all are disputed and voted; griefer loses 3 x ${F(c.BOND)} ETH, owner must front 3 bonds and wait for the vote. Claims per device are bounded only by its number of records`);
  });
});

after(() => {
  console.log("\n      GAS (gasUsed, optimizer 200 runs, hardfork osaka)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(40)} ${g}`);
});
