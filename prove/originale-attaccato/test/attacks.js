// Attack tests against PaprikaBaseline. Each test prints "ATTACK <name>: SUCCEEDS / FAILS" plus numbers.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));           // SHA(photo)
const pk = (w) => w.signingKey.publicKey;                           // uncompressed device public key
const id = (k) => ethers.keccak256(k);
const DEF = { attestFee: E("0.001"), oracleFee: E("0.01"), reward: E("0.05"), seed: E("10") };
const gasLog = {};
async function reverts(pr, reason) {
  try { await (await pr).wait(); } catch (e) { expect(String(e.message)).to.contain(reason); return; }
  throw new Error("expected revert: " + reason);
}

async function deploy(past, p = DEF) {
  const [voter] = await ethers.getSigners();
  const oracle = await (await ethers.getContractFactory("MockOracle", voter)).deploy(p.oracleFee);
  const pap = await (await ethers.getContractFactory("PaprikaBaseline", voter))
    .deploy(await oracle.getAddress(), p.attestFee, p.reward, past, { value: p.seed });
  return { voter, oracle, pap, p };
}
async function gasOf(txp) { const r = await (await txp).wait(); return { gas: r.gasUsed, cost: r.gasUsed * r.gasPrice }; }
async function bal(c) { return ethers.provider.getBalance(await c.getAddress()); }
async function claimAndResolve(ctx, claimant, photo, dev, verdict) {
  const { pap, oracle, voter, p } = ctx;
  const g1 = await gasOf(pap.connect(claimant).claimFake(photo, dev, { value: p.oracleFee }));
  const ev = (await pap.queryFilter(pap.filters.Claimed())).pop();
  const g2 = await gasOf(oracle.connect(voter).resolve(ev.args.claimId, verdict));
  return { claimGas: g1.gas, claimGasCost: g1.cost, resolveGas: g2.gas, claimId: ev.args.claimId };
}
const line = (name, ok, nums) => console.log(`      ATTACK ${name}: ${ok ? "SUCCEEDS" : "FAILS"} | ${nums}`);

for (const past of [false, true]) {
  const R = past ? "ban-invalidates-past" : "ban-blocks-future-only";
  describe(`PaprikaBaseline [reading: ${R}]`, function () {
    let ctx, s;
    beforeEach(async () => { ctx = await deploy(past); s = await ethers.getSigners(); });

    it("positive path: register, attest, verify, claim->no, claim->yes", async () => {
      const { pap, p } = ctx; const owner = s[1], claimant = s[2]; const dev = ethers.Wallet.createRandom();
      const g = {};
      g.register = (await gasOf(pap.connect(owner).register(pk(dev)))).gas;
      g.attest = (await gasOf(pap.connect(owner).attest(id(pk(dev)), h("photo-1"), { value: p.attestFee }))).gas;
      expect((await pap.verify(h("photo-1")))[0]).to.equal(true);
      const b0 = await ethers.provider.getBalance(claimant.address);
      const r0 = await claimAndResolve(ctx, claimant, h("photo-1"), id(pk(dev)), false);
      expect((await pap.devices(id(pk(dev)))).banned).to.equal(false);
      const r1 = await claimAndResolve(ctx, claimant, h("photo-1"), id(pk(dev)), true);
      g.claimFake = r1.claimGas; g.resolveNo = r0.resolveGas; g.resolveYesBan = r1.resolveGas;
      expect((await pap.devices(id(pk(dev)))).banned).to.equal(true);
      await reverts(pap.connect(owner).attest(id(pk(dev)), h("photo-2"), { value: p.attestFee }), "banned");
      const b1 = await ethers.provider.getBalance(claimant.address);
      const v = await pap.verify(h("photo-1"));
      console.log(`      POSITIVE PATH OK | claimant net ${F(b1 - b0)} ETH (2 oracle fees + gas, 1 reward) | photo-1 still verifies after ban: ${v[0]}`);
      gasLog[R] = g;
    });

    it("1 ban evasion: fresh key (+ fresh account) after ban", async () => {
      const { pap, p } = ctx; const cheater = s[3], hunter = s[4];
      const k1 = ethers.Wallet.createRandom();
      await pap.connect(cheater).register(pk(k1));
      await pap.connect(cheater).attest(id(pk(k1)), h("fake-1"), { value: p.attestFee });
      await claimAndResolve(ctx, hunter, h("fake-1"), id(pk(k1)), true);
      await reverts(pap.connect(cheater).register(pk(k1)), "banned");
      const k2 = ethers.Wallet.createRandom();                      // same account, new key
      const g1 = await gasOf(pap.connect(cheater).register(pk(k2)));
      await pap.connect(cheater).attest(id(pk(k2)), h("fake-2"), { value: p.attestFee });
      const fresh = ethers.Wallet.createRandom().connect(ethers.provider);  // new account, new key
      await s[0].sendTransaction({ to: fresh.address, value: E(1) });
      const k3 = ethers.Wallet.createRandom();
      const g2 = await gasOf(pap.connect(fresh).register(pk(k3)));
      await pap.connect(fresh).attest(id(pk(k3)), h("fake-3"), { value: p.attestFee });
      const ok = (await pap.verify(h("fake-2")))[0] && (await pap.verify(h("fake-3")))[0];
      line("ban-evasion", ok, `new key same account: register gas ${g1.gas} (${F(g1.cost)} ETH); new key new account: register gas ${g2.gas}; no ETH fee for registration; account that owned banned device is not itself blocked`);
    });

    it("2 synthetic content: hash of non-camera bytes", async () => {
      const { pap, p } = ctx; const u = s[5]; const dev = ethers.Wallet.createRandom();
      await pap.connect(u).register(pk(dev));
      const aiBytes = ethers.randomBytes(4096);
      const hh = ethers.sha256(ethers.concat([ethers.toUtf8Bytes("AI image:"), aiBytes]));
      await pap.connect(u).attest(id(pk(dev)), hh, { value: p.attestFee });
      const v = await pap.verify(hh);
      line("synthetic-content", v[0], `verify(hash of 4096 random bytes labelled "AI image") = ${v[0]}; contract only sees a 32-byte hash, no capture evidence`);
    });

    it("3 attestation theft / front-running", async () => {
      const { pap, p } = ctx; const honest = s[6], thief = s[7];
      const dH = ethers.Wallet.createRandom(), dT = ethers.Wallet.createRandom();
      await pap.connect(honest).register(pk(dH)); await pap.connect(thief).register(pk(dT));
      const photo = h("honest-scoop.jpg");
      await network.provider.send("evm_setAutomine", [false]);
      const tx1 = await pap.connect(honest).attest(id(pk(dH)), photo, { value: p.attestFee, gasPrice: 2_000_000_000n });
      // thief reads the pending tx's calldata from the mempool, copies the hash, pays a higher gas price
      const pending = await ethers.provider.getTransaction(tx1.hash);
      const stolen = pap.interface.decodeFunctionData("attest", pending.data)[1];
      const tx2 = await pap.connect(thief).attest(id(pk(dT)), stolen, { value: p.attestFee, gasPrice: 3_000_000_000n });
      await network.provider.send("evm_mine"); await network.provider.send("evm_setAutomine", [true]);
      const r1 = await ethers.provider.getTransactionReceipt(tx1.hash), r2 = await ethers.provider.getTransactionReceipt(tx2.hash);
      const origin = (await pap.verify(photo))[1];
      const thiefWins = origin === id(pk(dT));
      line("front-running", thiefWins, `recorded origin = ${thiefWins ? "THIEF device" : "honest device"}; honest tx status ${r1.status} (reverted "already attested"), thief tx status ${r2.status}; thief cost ${F(p.attestFee)} ETH + gas`);
    });

    it("4 self-report reward loop: parameter sweep", async () => {
      const cases = [
        { attestFee: E("0.001"), oracleFee: E("0.01"), reward: E("0.05") },
        { attestFee: E("0.001"), oracleFee: E("0.05"), reward: E("0.05") },
        { attestFee: E("0.01"), oracleFee: E("0.1"), reward: E("0.05") },
        { attestFee: E("0.03"), oracleFee: E("0.001"), reward: E("0.05") },
      ];
      for (const c of cases) {
        const cx = await deploy(past, { ...c, seed: E("1") });
        const a = s[8], claimant = s[9];
        const t0 = await bal(cx.pap), a0 = await ethers.provider.getBalance(a.address), c0 = await ethers.provider.getBalance(claimant.address);
        let cycles = 0;
        while ((await bal(cx.pap)) > 0n && cycles < 60) {
          const dev = ethers.Wallet.createRandom();
          await cx.pap.connect(a).register(pk(dev));
          await cx.pap.connect(a).attest(id(pk(dev)), h("junk" + cycles), { value: c.attestFee });
          await claimAndResolve(cx, claimant, h("junk" + cycles), id(pk(dev)), true);   // oracle truthfully says "fake"
          cycles++;
        }
        const net = (await ethers.provider.getBalance(a.address)) + (await ethers.provider.getBalance(claimant.address)) - a0 - c0;
        const perCycle = c.reward - c.attestFee - c.oracleFee;
        line(`self-report-profit(attest=${F(c.attestFee)},oracle=${F(c.oracleFee)},reward=${F(c.reward)})`, net > 0n,
          `cycles ${cycles}; treasury ${F(t0)} -> ${F(await bal(cx.pap))} ETH; attacker net incl. gas ${F(net)} ETH; analytic per-cycle ex-gas ${F(perCycle)} ETH; treasury drained: ${(await bal(cx.pap)) === 0n} (drains whenever reward > attestFee, even when the attacker loses money)`);
      }
    });

    it("4b double-dip: several 'yes' claims on the same already-banned device", async () => {
      const { pap, p } = ctx; const a = s[10]; const dev = ethers.Wallet.createRandom();
      await pap.connect(a).register(pk(dev));
      await pap.connect(a).attest(id(pk(dev)), h("x"), { value: p.attestFee });
      const t0 = await bal(pap);
      for (let i = 0; i < 5; i++) await claimAndResolve(ctx, a, h("x"), id(pk(dev)), true);
      line("double-dip", t0 - (await bal(pap)) === 5n * p.reward, `5 rewards paid for 1 device/1 photo: treasury -${F(t0 - (await bal(pap)))} ETH; nothing marks a device/photo as already judged`);
    });

    it("5 griefing an honest device", async () => {
      const { pap, p } = ctx; const honest = s[11], griefer = s[12]; const dev = ethers.Wallet.createRandom();
      await pap.connect(honest).register(pk(dev));
      const N = 30;
      for (let i = 0; i < N; i++) await pap.connect(honest).attest(id(pk(dev)), h("real" + i), { value: p.attestFee });
      const g0 = await ethers.provider.getBalance(griefer.address);
      for (let i = 0; i < 5; i++) await claimAndResolve(ctx, griefer, h("real" + i), id(pk(dev)), false);
      const costNo = g0 - (await ethers.provider.getBalance(griefer.address));
      await claimAndResolve(ctx, griefer, h("real0"), id(pk(dev)), true);   // one wrong vote
      let valid = 0; for (let i = 0; i < N; i++) if ((await pap.verify(h("real" + i)))[0]) valid++;
      const g1 = await ethers.provider.getBalance(griefer.address);
      line("griefing", true, `5 rejected claims cost griefer ${F(costNo)} ETH (honest party pays nothing, has no defence/appeal path in contract); after ONE wrong yes: device banned forever, griefer net ${F(g1 - g0)} ETH, ${N - valid}/${N} past attestations invalidated, all future blocked`);
    });

    it("6 retroactive effect on 100 earlier attestations", async () => {
      const { pap, p } = ctx; const ph = s[13], x = s[14]; const dev = ethers.Wallet.createRandom();
      await pap.connect(ph).register(pk(dev));
      for (let i = 0; i < 100; i++) await pap.connect(ph).attest(id(pk(dev)), h("p" + i), { value: p.attestFee });
      await claimAndResolve(ctx, x, h("p57"), id(pk(dev)), true);
      let valid = 0; for (let i = 0; i < 100; i++) if ((await pap.verify(h("p" + i)))[0]) valid++;
      line("retroactive-censorship", valid < 100, `${valid}/100 earlier attestations still verify after the ban (1 photo judged)`);
      if (!past) line("ban-ineffective-on-past-fakes", valid === 100, `the judged-fake photo p57 itself still verifies: ${(await pap.verify(h("p57")))[0]}`);
    });

    it("7 replay / duplicates / unregistered key", async () => {
      const { pap, p } = ctx; const u = s[15], v = s[16]; const d1 = ethers.Wallet.createRandom(), d2 = ethers.Wallet.createRandom();
      await pap.connect(u).register(pk(d1)); await pap.connect(v).register(pk(d2));
      await pap.connect(u).attest(id(pk(d1)), h("dup"), { value: p.attestFee });
      await reverts(pap.connect(u).attest(id(pk(d1)), h("dup"), { value: p.attestFee }), "already attested");
      await reverts(pap.connect(v).attest(id(pk(d2)), h("dup"), { value: p.attestFee }), "already attested");
      const un = ethers.Wallet.createRandom();
      await reverts(pap.connect(u).attest(id(pk(un)), h("u"), { value: p.attestFee }), "unregistered");
      await reverts(pap.connect(v).attest(id(pk(d1)), h("w"), { value: p.attestFee }), "not device owner");
      line("replay-same-device", false, "reverts 'already attested'");
      line("replay-other-device", false, "reverts 'already attested' (first writer wins, see attack 3)");
      line("unregistered-key", false, "reverts 'unregistered'; other account using someone's device id reverts 'not device owner'");
      // 1-bit change: a trivially edited photo is a brand-new hash, attestable as original
      const edited = ethers.sha256(ethers.toUtf8Bytes("dup "));
      await pap.connect(v).attest(id(pk(d2)), edited, { value: p.attestFee });
      line("near-duplicate (1-byte edit)", (await pap.verify(edited))[0], "an edited copy gets its own fresh attestation; exact-hash scheme cannot link it");
    });

    it("8 treasury control", async () => {
      const { pap, oracle, voter, p } = ctx;
      const hasWithdraw = pap.interface.fragments.some((f) => f.type === "function" && /withdraw|sweep|transfer/i.test(f.name));
      let direct = false;
      try { await s[17].call({ to: await pap.getAddress(), data: "0x3ccfd60b" }); direct = true; } catch { }
      await reverts(pap.connect(s[17]).onClaimResolved(0, true), "only oracle");
      const ob = await ethers.provider.getBalance(await oracle.getAddress());
      line("treasury-direct-withdraw", hasWithdraw || direct, `no withdraw function exists (fees locked; only outflow is rewards); onClaimResolved guarded by 'only oracle'`);
      line("treasury-via-oracle", true, `whoever controls oracle resolution (MockOracle.voter=${voter.address.slice(0, 10)}..., in UMA the token-holder vote) moves treasury in reward-sized steps by approving claims; oracle fees go to the oracle, never to the treasury`);
    });

    it("9 key squatting: attacker registers an honest device's public key first", async () => {
      const { pap, p } = ctx; const honest = s[18], att = s[19]; const dev = ethers.Wallet.createRandom();
      await pap.connect(att).register(pk(dev));               // public key is public; no proof of possession
      await reverts(pap.connect(honest).register(pk(dev)), "already registered");
      await pap.connect(att).attest(id(pk(dev)), h("junk"), { value: p.attestFee });
      await claimAndResolve(ctx, att, h("junk"), id(pk(dev)), true);   // truthfully fake -> key banned forever
      await reverts(pap.connect(honest).register(pk(dev)), "banned");
      line("key-squatting", true, `honest key unusable: first 'already registered', then permanently 'banned'; attacker also earned reward ${F(p.reward)} ETH minus fees`);
    });

    it("10 claim against unattested photo / mismatched device", async () => {
      const { pap, p } = ctx; const honest = s[1], att = s[2]; const dev = ethers.Wallet.createRandom();
      await pap.connect(honest).register(pk(dev));
      await claimAndResolve(ctx, att, h("never-attested-anywhere"), id(pk(dev)), true);
      line("claim-without-attestation", (await pap.devices(id(pk(dev)))).banned, `device banned on a claim naming a photo it never attested; contract does not check photo<->device link, relies fully on oracle`);
    });
  });
}

after(() => {
  console.log("\n      GAS TABLE (gasUsed)");
  for (const [r, g] of Object.entries(gasLog))
    console.log(`      ${r}: register ${g.register} | attest ${g.attest} | claimFake ${g.claimFake} | resolve(no) ${g.resolveNo} | resolve(yes)+ban+reward ${g.resolveYesBan}`);
});
