// Paprika v2.1: the v2 suite re-run against PaprikaV2_1 in both modes (AUTO_DISPUTE off / on), with the
// UMA-like bond split (loser's bond: half to the winner, half to the Store). Prints "ATTACK <name>: ... | numbers".
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const ST = { None: 0n, Active: 1n, Flagged: 2n, Retired: 3n };
const RS = { None: 0n, KeyMisuse: 1n, DisputeUpheld: 2n };
const RSN = ["None", "KeyMisuse", "DisputeUpheld"];
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

function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const sign = (preimage) => "0x" + crypto.sign("sha256", ethers.getBytes(preimage), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}
const msgReg = (c, owner) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/REGISTER", c.chainId, c.addr, owner]);
const msgCap = (c, photo, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32"], ["PAPRIKA-V2/CAPTURE", c.chainId, c.addr, photo, bh]);
const msgExt = (c, sender) => ethers.solidityPacked(["string", "uint256", "address", "address"], ["PAPRIKA-V2/EXTRACTED", c.chainId, c.addr, sender]);
const highS = (sig) => { const r = sig.slice(0, 66), s = BigInt("0x" + sig.slice(66)); return r + (N_P256 - s).toString(16).padStart(64, "0"); };

async function deploy(auto) {
  const s = await ethers.getSigners();
  const oracle = await (await ethers.getContractFactory("MockOptimisticOracleV3Burn", s[0])).deploy();
  const pap = await (await ethers.getContractFactory("PaprikaV2_1", s[0])).deploy(await oracle.getAddress(), auto);
  const c = { s, oracle, pap, auto, addr: await pap.getAddress(), chainId: (await ethers.provider.getNetwork()).chainId, keys: [] };
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
const settle = (c, id, who) => rc(c.oracle.connect(who || c.s[19]).settleAssertion(id));
// mode-aware resolution
async function contest(c, id, who) { if (!c.auto) await dispute(c, who, id); }               // human dispute only needed when auto is off
async function uphold(c, id, who) { if (c.auto) { await dvm(c, id, true); return settle(c, id, who); } await warp(c.LIVENESS + 1); return settle(c, id, who); }
async function reject(c, id, disputer) { await contest(c, id, disputer); await dvm(c, id, false); return settle(c, id); }
async function cash(c, who) { const cr = await c.pap.credit(who.address); if (cr > 0n) { const g = await rc(c.pap.connect(who).claimCredit()); gasLog.claimCredit ??= g.gas; } return cr; }
const dev_ = (c, keyId) => c.pap.devices(keyId);
async function invariant(c) {
  let stakes = 0n; for (const k of c.keys) stakes += (await dev_(c, k)).stake;
  let credits = 0n; for (const a of c.s) credits += await c.pap.credit(a.address);
  const inbox = await c.pap.inbox();
  const bal = await balOf(c.addr), ob = await c.oracle.openBonds(), obal = await balOf(await c.oracle.getAddress());
  assert.equal(inbox, 0n, "INVARIANT inbox not empty");
  assert.equal(bal, stakes + credits, `INVARIANT paprika balance ${bal} != stakes ${stakes} + credits ${credits}`);
  assert.equal(obal, ob, `INVARIANT oracle balance ${obal} != open bonds ${ob}`);
  return { bal, stakes, credits, ob };
}
const G = (k, g, c) => { gasLog[`${k} [auto=${c.auto ? "on" : "off"}]`] ??= g; };

for (const AUTO of [false, true]) {
  const M = AUTO ? "AUTO_DISPUTE on" : "AUTO_DISPUTE off";
  describe(`PaprikaV2_1 [${M}]`, function () {
    let c, s;
    beforeEach(async () => { c = await deploy(AUTO); s = c.s; });
    afterEach(async () => { const i = await invariant(c); console.log(`      invariant ok: contract ${F(i.bal)} ETH = stakes ${F(i.stakes)} + unclaimed rewards ${F(i.credits)}; oracle holds open bonds ${F(i.ob)}`); });

    it("0 positive path: register, relayed attest, verify, upheld claim, rejected claim, misuse proof, unbond+withdraw", async () => {
      const owner = s[1], relayer = s[2], claimant = s[3], challenger = s[5];
      const d1 = await register(c, owner); G("register", d1.gas, c);
      const a1 = await attest(c, relayer, d1.dev, h("p1")); G("attest", a1.gas, c);
      let v = await c.pap.verify(h("p1"), d1.dev.keyId);
      assert.equal(v.status, ST.Active); assert.equal(v.stakeAtRisk, c.STAKE); assert.equal(v.withdrawnAtBlock, 0n); assert.equal(v.recordedBeforeFlag, true);
      const cb0 = await balOf(claimant);
      const cl = await claim(c, claimant, h("p1"), d1.dev.keyId); G("claimFake", cl.gas, c);
      v = await c.pap.verify(h("p1"), d1.dev.keyId);
      assert.equal(v.stake, AUTO ? c.STAKE - c.BOND : c.STAKE); assert.equal(v.stakeAtRisk, c.STAKE);
      const st = await uphold(c, cl.id); G("settle upheld (flag + slash)", st.gas, c);
      v = await c.pap.verify(h("p1"), d1.dev.keyId);
      assert.equal(v.verdict, 1n); assert.equal(v.status, ST.Flagged); assert.equal(v.flagReason, RS.DisputeUpheld); assert.equal(v.stake, 0n);
      await cash(c, claimant);
      const cnet = (await balOf(claimant)) - cb0;
      // rejected claim
      const d2 = await register(c, owner); await attest(c, relayer, d2.dev, h("p2"));
      const o0 = await balOf(owner);
      const cl2 = await claim(c, claimant, h("p2"), d2.dev.keyId);
      await contest(c, cl2.id, owner); await dvm(c, cl2.id, false); const st2 = await settle(c, cl2.id); G("settle rejected", st2.gas, c);
      const d2s = await dev_(c, d2.dev.keyId);
      assert.equal(d2s.status, ST.Active);
      const ownerNet = (await balOf(owner)) - o0 + (d2s.stake - c.STAKE);
      // misuse proof, no open claim -> immediate
      const d4 = await register(c, owner);
      const pm = await rc(c.pap.connect(challenger).proveKeyMisuse(d4.dev.keyId, d4.dev.sign(msgExt(c, challenger.address)))); G("proveKeyMisuse (no claim)", pm.gas, c);
      assert.equal(await c.pap.credit(challenger.address), E("0.05")); await cash(c, challenger);
      // unbond + withdraw, withdrawnAtBlock exposed
      const d5 = await register(c, owner); await attest(c, relayer, d5.dev, h("p5"));
      G("requestUnbond", (await rc(c.pap.connect(owner).requestUnbond(d5.dev.keyId))).gas, c);
      await reverts(c.pap.connect(owner).withdraw(d5.dev.keyId), "unbonding");
      await warp(c.UNBOND);
      const wd = await rc(c.pap.connect(owner).withdraw(d5.dev.keyId)); G("withdraw", wd.gas, c);
      v = await c.pap.verify(h("p5"), d5.dev.keyId);
      assert.equal(v.withdrawnAtBlock, BigInt(wd.r.blockNumber)); assert.equal(v.stakeAtRisk, 0n);
      console.log(`      POSITIVE PATH OK [${M}] | upheld claim: claimant net ${F(cnet)} ETH | rejected claim: owner net ${F(ownerNet)} ETH (wallet + stake change) | misuse proof pays 0.05 at once | withdraw at block ${v.withdrawnAtBlock}, verify shows stakeAtRisk 0`);
    });

    it("1 ban evasion", async () => {
      const cheater = s[6], hunter = s[7];
      const k1 = await register(c, cheater);
      await c.pap.connect(hunter).proveKeyMisuse(k1.dev.keyId, k1.dev.sign(msgExt(c, hunter.address)));
      const r1 = await reverts(c.pap.connect(cheater).register(k1.dev.x, k1.dev.y, k1.dev.sign(msgReg(c, cheater.address)), { value: c.STAKE }), "key used");
      const k2 = await register(c, cheater); await attest(c, cheater, k2.dev, h("fake-2"));
      line("ban-evasion", "PRICED", `old key: "${r1}"; new key registers for ${F(c.STAKE)} ETH stake + ${k2.gas} gas`);
    });

    it("2 synthetic content and its punishment", async () => {
      const forger = s[9], finder = s[10], claimant = s[11];
      const k = await register(c, forger);
      const ai = ethers.sha256(ethers.concat([ethers.toUtf8Bytes("AI image:"), ethers.randomBytes(4096)]));
      await attest(c, forger, k.dev, ai);
      line("synthetic-content", "SUCCEEDS", "software key registers and attests random bytes");
      const k2 = await register(c, forger); await attest(c, forger, k2.dev, h("ai-2"));
      const c0 = await balOf(claimant);
      const cl = await claim(c, claimant, h("ai-2"), k2.dev.keyId); await uphold(c, cl.id); await cash(c, claimant);
      line("synthetic-content punished (upheld claim)", "PRICED", `forger loses ${F(c.STAKE)} ETH; claimant nets ${F((await balOf(claimant)) - c0)} ETH${AUTO ? " (incl. +0.025 = half of the device's auto-dispute bond)" : ""}`);
    });

    it("3 front-running; 3b nothing left to steal", async () => {
      const honestOwner = s[12], relayer = s[13], thief = s[14];
      const dH = await register(c, honestOwner), dT = await register(c, thief);
      const photo2 = h("honest-scoop-2.jpg");
      await network.provider.send("evm_setAutomine", [false]);
      const b = await anchorNow();
      const t3 = await c.pap.connect(relayer).attest(photo2, b.n, dH.dev.keyId, dH.dev.sign(msgCap(c, photo2, b.hash)), { gasPrice: 2_000_000_000n, gasLimit: 500_000n });
      const p3 = c.pap.interface.decodeFunctionData("attest", (await ethers.provider.getTransaction(t3.hash)).data);
      await c.pap.connect(thief).attest(p3[0], p3[1], dT.dev.keyId, dT.dev.sign(msgCap(c, p3[0], b.hash)), { gasPrice: 3_000_000_000n, gasLimit: 500_000n });
      await mine(1); await network.provider.send("evm_setAutomine", [true]);
      const vh = await c.pap.verify(photo2, dH.dev.keyId), vt = await c.pap.verify(photo2, dT.dev.keyId);
      const hasFirst = c.pap.interface.fragments.some((f) => f.type === "function" && /first/i.test(f.name));
      assert(!hasFirst && vh.recordedBlock > 0n && vt.recordedBlock > 0n);
      line("front-running (same hash, thief's own device)", "FAILS (nothing to steal)", `both records stand alone: honest [${vh.anchorBlock}, ${vh.recordedBlock}], thief [${vt.anchorBlock}, ${vt.recordedBlock}]; no first-attester/priority function exists (ABI check: ${hasFirst ? "found" : "none"}). The thief gets a record of its own, which claims nothing about the honest one`);
    });

    it("4 self-report loop and 12c effective penalty (1 - alpha) x S", async () => {
      const a = s[17], sybil = s[18], honest = s[1];
      await register(c, honest, newDevice(), E("1"));
      const t0 = await balOf(c.addr), a0 = (await balOf(a)) + (await balOf(sybil));
      const N = 5;
      for (let i = 0; i < N; i++) {
        const k = await register(c, a); await attest(c, a, k.dev, h("junk" + i));
        await c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, sybil.address))); await cash(c, sybil);
      }
      const netM = (await balOf(a)) + (await balOf(sybil)) - a0;
      const b0 = (await balOf(a)) + (await balOf(sybil));
      for (let i = 0; i < N; i++) {
        const k = await register(c, a); await attest(c, a, k.dev, h("junkc" + i));
        const cl = await claim(c, sybil, h("junkc" + i), k.dev.keyId); await uphold(c, cl.id, sybil); await cash(c, sybil);
      }
      const netC = (await balOf(a)) + (await balOf(sybil)) - b0;
      assert.equal(await balOf(c.addr), t0);
      line("self-report-profit", "FAILS", `${N} misuse self-reports: net ${F(netM)} ETH; ${N} upheld self-claims: net ${F(netC)} ETH; contract balance ${F(t0)} -> ${F(await balOf(c.addr))}`);
      line("self-slash cap (no claim open): effective penalty", "RESIDUAL (by design)", `per key the forger loses ${F(-netM / BigInt(N))} ETH = (1 - 0.5) x ${F(c.STAKE)} + gas, not the full stake: a forger expecting to be caught self-reports first. Effective penalty = (1 - alpha) x S`);
    });

    it("4b double rewards", async () => {
      const owner = s[1], c1 = s[2], c2 = s[3], c3 = s[4];
      const k = await register(c, owner); await attest(c, owner, k.dev, h("x")); await attest(c, owner, k.dev, h("y"));
      const cl1 = await claim(c, c1, h("x"), k.dev.keyId);
      const rOpen = await reverts(c.pap.connect(c2).claimFake(h("x"), k.dev.keyId, h("e"), { value: c.BOND }), "claim open");
      let second = "";
      if (AUTO) second = `2nd record while 1st open: "${await reverts(c.pap.connect(c2).claimFake(h("y"), k.dev.keyId, h("e"), { value: c.BOND }), "device busy")}"`;
      else { const cl2 = await claim(c, c2, h("y"), k.dev.keyId); await uphold(c, cl1.id); await settle(c, cl2.id); second = "2nd record upheld too, pays 0"; }
      if (AUTO) await uphold(c, cl1.id);
      const after = AUTO ? await reverts(c.pap.connect(c2).claimFake(h("y"), k.dev.keyId, h("e"), { value: c.BOND }), "stake < bond") : "-";
      await c.pap.connect(c3).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, c3.address)));
      const cr = [await c.pap.credit(c1.address), await c.pap.credit(c2.address), await c.pap.credit(c3.address)];
      const sum = cr[0] + cr[1] + cr[2];
      assert(sum <= E("0.05"));
      line("double-dip", "FAILS", `rewards credited ${F(cr[0])} + ${F(cr[1])} + ${F(cr[2])} = ${F(sum)} ETH; same record: "${rOpen}"; ${second}; after the slash: ${AUTO ? `"${after}"` : "claims allowed, pay 0"}; later misuse proof pays 0`);
      for (const w of [c1, c2, c3]) await cash(c, w);
    });

    it("5 griefing an honest device: watched and unwatched false claims", async () => {
      const honest = s[5], griefer = s[6];
      // 5a watched: the owner disputes (auto: the contract already did)
      const k = await register(c, honest); await attest(c, honest, k.dev, h("real0")); await attest(c, honest, k.dev, h("real1"));
      let g0 = await balOf(griefer), h0 = await balOf(honest), sk0 = (await dev_(c, k.dev.keyId)).stake;
      const cl = await claim(c, griefer, h("real0"), k.dev.keyId); await contest(c, cl.id, honest); await dvm(c, cl.id, false); await settle(c, cl.id, s[19]);
      let gNet = (await balOf(griefer)) - g0, hNet = (await balOf(honest)) - h0 + ((await dev_(c, k.dev.keyId)).stake - sk0);
      line(`griefing watched [${M}]`, "FAILS", `griefer net ${F(gNet)} ETH; owner net ${F(hNet)} ETH (wallet + stake); griefing factor (victim loss / attacker cost) = ${(Number(-hNet) / Number(-gNet)).toFixed(3)} ${AUTO ? "(owner did nothing: the contract disputed with stake)" : "(owner had to watch and front a bond)"}`);
      // 5b unwatched: nobody acts after the claim
      g0 = await balOf(griefer); h0 = await balOf(honest); sk0 = (await dev_(c, k.dev.keyId)).stake;
      const cl2 = await claim(c, griefer, h("real1"), k.dev.keyId);
      if (AUTO) { await dvm(c, cl2.id, false); await settle(c, cl2.id, s[19]); } else { await warp(c.LIVENESS + 1); await settle(c, cl2.id, griefer); }
      await cash(c, griefer);
      const ds = await dev_(c, k.dev.keyId);
      gNet = (await balOf(griefer)) - g0; hNet = (await balOf(honest)) - h0 + (ds.stake - sk0);
      const factor = gNet >= 0n ? "infinite (attacker profits)" : (Number(-hNet) / Number(-gNet)).toFixed(3);
      line(`griefing unwatched [${M}]`, AUTO ? "FAILS" : "SUCCEEDS", `device ${ds.status === ST.Flagged ? "FLAGGED" : "stays Active"}; griefer net ${F(gNet)} ETH; owner net ${F(hNet)} ETH (wallet + stake); griefing factor = ${factor}${AUTO ? "; requires an honest vote (the vote happens on every claim)" : ""}`);
    });

    it("6 retroactive effect: 100 earlier records", async () => {
      const owner = s[7], claimant = s[8];
      const k = await register(c, owner); for (let i = 0; i < 100; i++) await attest(c, owner, k.dev, h("old" + i));
      await attest(c, owner, k.dev, h("the-fake"));
      const cl = await claim(c, claimant, h("the-fake"), k.dev.keyId); await uphold(c, cl.id); await cash(c, claimant);
      let before = 0;
      for (let i = 0; i < 100; i++) { const v = await c.pap.verify(h("old" + i), k.dev.keyId); if (v.recordedBlock > 0n && v.recordedBeforeFlag && v.verdict === 0n) before++; }
      const vf = await c.pap.verify(h("the-fake"), k.dev.keyId);
      assert.equal(before, 100); assert.equal(vf.verdict, 1n);
      line("retroactive-censorship", "FAILS", `${before}/100 earlier records returned with recordedBeforeFlag=true; judged photo verdict UpheldFake; flag ${RSN[Number(vf.flagReason)]} at block ${vf.flaggedAtBlock}`);
    });

    it("7 replay / domain / anchors", async () => {
      const owner = s[9], rel = s[10];
      const k = await register(c, owner), k2 = await register(c, owner);
      const a = await attest(c, rel, k.dev, h("p"));
      const R = [];
      R.push(await reverts(c.pap.connect(rel).attest(h("p"), a.anchor.n, k.dev.keyId, a.sig), "exists"));
      const an = await anchorNow();
      R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k2.dev.sign(msgCap(c, h("q"), an.hash))), "bad sig"));
      R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap({ ...c, chainId: 1n }, h("q"), an.hash))), "bad sig"));
      R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(msgCap({ ...c, addr: ethers.Wallet.createRandom().address }, h("q"), an.hash))), "bad sig"));
      const stale = await anchorNow(); await mine(300);
      R.push(await reverts(c.pap.attest(h("q"), stale.n, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), stale.hash))), "anchor"));
      const now = await anchorNow();
      R.push(await reverts(c.pap.attest(h("q"), now.n + 10, k.dev.keyId, k.dev.sign(msgCap(c, h("q"), ethers.ZeroHash))), "anchor"));
      line("replay/domain/anchor", "FAILS", `replay, other key, other chain, other contract, stale (300 blocks), future anchor -> ${R.map((r) => `"${r}"`).join(", ")}`);
    });

    it("8 no admin; stray ETH only from the oracle", async () => {
      const fns = c.pap.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
      const bad = fns.filter((n) => /owner|admin|upgrade|set|sweep|rescue|pause|transfer/i.test(n));
      const r1 = await reverts(s[11].sendTransaction({ to: c.addr, value: E("1") }), "only oracle");
      const r2 = await reverts(c.pap.connect(s[11]).assertionResolvedCallback(ethers.ZeroHash, true), "only oracle");
      assert.equal(bad.length, 0);
      line("admin / treasury drain", "FAILS", `functions: ${fns.join(", ")}; plain ETH from non-oracle: "${r1}"; callback from non-oracle: "${r2}"`);
    });

    it("9 key squatting; claim on unattested photo", async () => {
      const victim = s[13], squatter = s[14];
      const vd = newDevice(), sq = newDevice();
      const r1 = await reverts(c.pap.connect(squatter).register(vd.x, vd.y, sq.sign(msgReg(c, squatter.address)), { value: c.STAKE }), "bad pop");
      const r2 = await reverts(c.pap.connect(squatter).register(vd.x, vd.y, vd.sign(msgReg(c, victim.address)), { value: c.STAKE }), "bad pop");
      await register(c, victim, vd);
      const r3 = await reverts(c.pap.connect(squatter).claimFake(h("never"), vd.keyId, h("e"), { value: c.BOND }), "no record");
      line("key-squatting / unattested claim", "FAILS", `"${r1}", "${r2}", "${r3}"`);
    });

    it("10 withdrawal races; 10c optimistic finality after the window", async () => {
      const owner = s[16], claimant = s[17], forger = s[18];
      const k = await register(c, owner); await attest(c, owner, k.dev, h("w1"));
      const cl = await claim(c, claimant, h("w1"), k.dev.keyId); await contest(c, cl.id, owner);
      await c.pap.connect(owner).requestUnbond(k.dev.keyId); await warp(c.UNBOND);
      const ra = await reverts(c.pap.connect(owner).withdraw(k.dev.keyId), "open claims");
      await dvm(c, cl.id, false); await settle(c, cl.id); await c.pap.connect(owner).withdraw(k.dev.keyId);
      const k2 = await register(c, owner); await attest(c, owner, k2.dev, h("w2"));
      await c.pap.connect(owner).requestUnbond(k2.dev.keyId); await warp(c.UNBOND - 60);
      const cl2 = await claim(c, claimant, h("w2"), k2.dev.keyId); await warp(61);
      const rb = await reverts(c.pap.connect(owner).withdraw(k2.dev.keyId), "open claims");
      await uphold(c, cl2.id); await cash(c, claimant);
      const rb2 = await reverts(c.pap.connect(owner).withdraw(k2.dev.keyId), "not retired");
      line("withdraw races", "FAILS", `open claim: "${ra}"; claim 60 s before the end: "${rb}"; flagged device: "${rb2}"`);
      // 10c
      const kf = await register(c, forger); await attest(c, forger, kf.dev, h("fake-w"));
      const v0 = await c.pap.verify(h("fake-w"), kf.dev.keyId);
      await c.pap.connect(forger).requestUnbond(kf.dev.keyId); await warp(c.UNBOND);
      const f0 = await balOf(forger); const w = await rc(c.pap.connect(forger).withdraw(kf.dev.keyId)); const back = (await balOf(forger)) - f0 + w.cost;
      const v1 = await c.pap.verify(h("fake-w"), kf.dev.keyId);
      let late;
      if (AUTO) late = `late claim: "${await reverts(c.pap.connect(claimant).claimFake(h("fake-w"), kf.dev.keyId, h("e"), { value: c.BOND }), "stake < bond")}"`;
      else { const cl3 = await claim(c, claimant, h("fake-w"), kf.dev.keyId); await uphold(c, cl3.id); late = `late claim upheld, reward ${F(await c.pap.credit(claimant.address))} ETH`; }
      line("exit after the challenge window (10c)", "BY DESIGN (optimistic finality)", `before: stakeAtRisk ${F(v0.stakeAtRisk)}, withdrawnAtBlock ${v0.withdrawnAtBlock}; forger withdraws ${F(back)} ETH after ${c.UNBOND / 86400} days; after: stakeAtRisk ${F(v1.stakeAtRisk)}, withdrawnAtBlock ${v1.withdrawnAtBlock}; ${late}. An unchallenged forgery cost only the lock-up + gas`);
    });

    it("11 signature malleability", async () => {
      const owner = s[19], ch = s[5], other = s[6];
      const k = await register(c, owner); const a = await attest(c, owner, k.dev, h("m"));
      const r1 = await reverts(c.pap.connect(other).attest(h("m"), a.anchor.n, k.dev.keyId, highS(a.sig)), "exists");
      const mis = k.dev.sign(msgExt(c, ch.address));
      const r3 = await reverts(c.pap.connect(other).proveKeyMisuse(k.dev.keyId, highS(mis)), "bad sig");
      line("signature-malleability", "FAILS (harmless)", `twin capture sig: "${r1}"; twin misuse proof by another sender: "${r3}"`);
    });

    it("12 forger tries to snipe the hunter's open claim; 12b mempool front-run of claimFake", async () => {
      const forger = s[7], sybil = s[8], hunter = s[9];
      // 12a: claim open, forger's sybil proves misuse -> pending; claim upheld -> hunter paid, sybil 0
      const k = await register(c, forger); await attest(c, forger, k.dev, h("deepfake"));
      const h0 = await balOf(hunter), f0 = (await balOf(forger)) + (await balOf(sybil));
      const cl = await claim(c, hunter, h("deepfake"), k.dev.keyId);
      const pm = await rc(c.pap.connect(sybil).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, sybil.address)))); G("proveKeyMisuse (pending, claim open)", pm.gas, c);
      const vp = await c.pap.verify(h("deepfake"), k.dev.keyId);
      assert.equal(vp.status, ST.Flagged); assert.equal(vp.flagReason, RS.KeyMisuse); assert.equal(vp.misusePending, true); assert.equal(await c.pap.credit(sybil.address), 0n);
      const st = await uphold(c, cl.id); G("settle upheld with pending misuse", st.gas, c);
      const hc = await c.pap.credit(hunter.address), sc = await c.pap.credit(sybil.address);
      await cash(c, hunter);
      const hNet = (await balOf(hunter)) - h0, fNet = (await balOf(forger)) + (await balOf(sybil)) - f0;
      assert.equal(sc, 0n); assert(hc > 0n);
      line("bounty-sniping by the forger (claim already open)", "FAILS", `device flagged KeyMisuse at once (block kept), payout deferred; claim upheld -> hunter reward ${F(hc)} ETH (net ${F(hNet)}), misuse prover ${F(sc)} ETH; forger+sybil net since registering ${F(fNet)} ETH (gas only): none of the ${F(c.STAKE)} ETH stake comes back`);
      // 12a': claim rejected -> the pending misuse prover is paid
      const k2 = await register(c, forger); await attest(c, forger, k2.dev, h("real-ish"));
      const cl2 = await claim(c, hunter, h("real-ish"), k2.dev.keyId);
      await c.pap.connect(sybil).proveKeyMisuse(k2.dev.keyId, k2.dev.sign(msgExt(c, sybil.address)));
      await reject(c, cl2.id, s[10]);
      const sc2 = await cash(c, sybil);
      line("pending misuse proof after a rejected claim", "PAID TO PROVER", `misuse prover credited ${F(sc2)} ETH after the claim was rejected${AUTO ? " (stake incl. the dispute winnings from the claimant)" : ""}`);
      // 12b: the hunter's claimFake is still in the mempool -> the forger front-runs it with a self misuse proof
      const k3 = await register(c, forger); await attest(c, forger, k3.dev, h("deepfake-3"));
      const h3 = await balOf(hunter);
      await network.provider.send("evm_setAutomine", [false]);
      const tc = await c.pap.connect(hunter).claimFake(h("deepfake-3"), k3.dev.keyId, h("e"), { value: c.BOND, gasPrice: 2_000_000_000n, gasLimit: 800_000n });
      const tm = await c.pap.connect(sybil).proveKeyMisuse(k3.dev.keyId, k3.dev.sign(msgExt(c, sybil.address)), { gasPrice: 3_000_000_000n, gasLimit: 500_000n });
      await mine(1); await network.provider.send("evm_setAutomine", [true]);
      const rcC = await ethers.provider.getTransactionReceipt(tc.hash), rcM = await ethers.provider.getTransactionReceipt(tm.hash);
      const sc3 = await c.pap.credit(sybil.address);
      let outcome = `hunter claimFake status ${rcC.status}`;
      if (rcC.status === 1) {
        const ev = rcC.logs.map((l) => { try { return c.pap.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "ClaimOpened");
        await uphold(c, ev.args.assertionId); outcome += `, claim upheld, hunter reward ${F(await c.pap.credit(hunter.address))} ETH`;
      } else outcome += AUTO ? ' (reverted "stake < bond")' : "";
      await cash(c, sybil); await cash(c, hunter);
      assert.equal(rcM.status, 1);
      line("bounty-sniping via mempool front-run of claimFake (12b)", sc3 > 0n ? "SUCCEEDS" : "FAILS", `self misuse proof mined first, sybil credited ${F(sc3)} ETH; ${outcome}; hunter net ${F((await balOf(hunter)) - h3)} ETH. A only protects claims that are already open: claims need commit-reveal or private submission`);
    });

    it("13 stolen honest key; spam claims vs. withdrawal", async () => {
      const victim = s[10], thief = s[11], griefer = s[12];
      const k = await register(c, victim); await attest(c, victim, k.dev, h("v0"));
      await c.pap.connect(thief).proveKeyMisuse(k.dev.keyId, k.dev.sign(msgExt(c, thief.address)));
      const got = await cash(c, thief);
      line("stolen honest key -> misuse flag", "SUCCEEDS (accepted, level-0 custody risk)", `thief earns ${F(got)} ETH; reason KeyMisuse discredits the archive for lenient verifiers`);
      const k2 = await register(c, victim); for (let i = 0; i < 3; i++) await attest(c, victim, k2.dev, h("u" + i));
      await c.pap.connect(victim).requestUnbond(k2.dev.keyId);
      const ids = []; let busy = "";
      for (let i = 0; i < 3; i++) {
        if (AUTO && i > 0) { busy = await reverts(c.pap.connect(griefer).claimFake(h("u" + i), k2.dev.keyId, h("e"), { value: c.BOND }), "device busy"); continue; }
        const id = (await claim(c, griefer, h("u" + i), k2.dev.keyId)).id; ids.push(id); await contest(c, id, victim);
      }
      await warp(c.UNBOND);
      const r = await reverts(c.pap.connect(victim).withdraw(k2.dev.keyId), "open claims");
      for (const id of ids) { await dvm(c, id, false); await settle(c, id); }
      await c.pap.connect(victim).withdraw(k2.dev.keyId);
      line("withdrawal blocked by spam claims", "PRICED", `${ids.length} open claim(s) block withdraw ("${r}") until voted; ${AUTO ? `extra claims: "${busy}"; ` : ""}griefer loses ${F(c.BOND)} ETH per rejected claim`);
    });

    it("14 new: claim-slot squatting (one open claim per device)", async function () {
      const forger = s[13], sybil = s[14], hunter = s[15];
      const k = await register(c, forger); await attest(c, forger, k.dev, h("harmless")); await attest(c, forger, k.dev, h("deepfake"));
      const f0 = (await balOf(forger)) + (await balOf(sybil));
      const cl = await claim(c, sybil, h("harmless"), k.dev.keyId);      // weak claim on a genuine photo
      await c.pap.connect(forger).requestUnbond(k.dev.keyId);
      let blocked = "no";
      try { await (await c.pap.connect(hunter).claimFake(h("deepfake"), k.dev.keyId, h("strong evidence"), { value: c.BOND })).wait(); } catch (e) { blocked = String(e.message).includes("device busy") ? "device busy" : "other"; }
      if (!AUTO) { line("claim-slot squatting", "FAILS (n/a: per-record claims)", "hunter can open its own claim on the deepfake record"); const ids = (await c.pap.queryFilter(c.pap.filters.ClaimOpened())).map((e) => e.args.assertionId); for (const id of ids) await uphold(c, id).catch(() => {}); return; }
      await warp(c.UNBOND);                                               // the vote on the weak claim takes the rest of the window
      await dvm(c, cl.id, false);
      // settle and withdraw in the same block, ahead of the hunter (an owner contract could batch them atomically)
      await network.provider.send("evm_setAutomine", [false]);
      const t1 = await c.oracle.connect(forger).settleAssertion(cl.id, { gasPrice: 3_000_000_000n, gasLimit: 800_000n });
      const t2 = await c.pap.connect(forger).withdraw(k.dev.keyId, { gasPrice: 3_000_000_000n, gasLimit: 500_000n });
      const t3 = await c.pap.connect(hunter).claimFake(h("deepfake"), k.dev.keyId, h("strong evidence"), { value: c.BOND, gasPrice: 2_000_000_000n, gasLimit: 800_000n });
      await mine(1); await network.provider.send("evm_setAutomine", [true]);
      const st = [t1, t2, t3]; const rs = []; for (const t of st) rs.push((await ethers.provider.getTransactionReceipt(t.hash)).status);
      const fNet = (await balOf(forger)) + (await balOf(sybil)) - f0;
      assert.equal(blocked, "device busy"); assert.equal(rs[1], 1); assert.equal(rs[2], 0);
      line("claim-slot squatting by the forger's sybil (new, AUTO only)", "SUCCEEDS", `hunter's claim on the deepfake: "${blocked}" for the whole window; after the vote the forger settles + withdraws first (statuses ${rs.join("/")}), hunter's claim reverts; forger+sybil cost vs. a plain withdrawal ${F(fNet - c.STAKE)} ETH (sybil bond 0.05 lost, half of it comes back into the device stake, half to the Store; plus gas) to keep the deepfake unchallengeable and recover the stake`);
    });
  });
}

after(() => {
  console.log("\n      GAS v2.1 (gasUsed, optimizer 200 runs, hardfork osaka)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(52)} ${g}`);
});
