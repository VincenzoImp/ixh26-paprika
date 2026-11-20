// End-to-end: real UMA OOv3 stack on a plain local Hardhat chain (hardfork osaka), disputed assertions resolved
// TRUE and FALSE through UMA's MockOracleAncillary. Run: npx hardhat test
const assert = require("node:assert/strict");
const hre = require("hardhat");
const { ethers } = require("ethers");
const { deployUma } = require("../lib/deploy-uma");
const { resolveDispute } = require("../lib/resolve");

const fmt = (x) => ethers.formatUnits(x, 18);
const log = (...a) => console.log("   ", ...a);

describe("UMA OOv3 on a plain local chain", function () {
  let uma, probe, probeAddr, ooAddr, storeAddr, wallStart;
  const FINAL_FEE = ethers.parseEther("50"); // UMA sandbox default: minimumBond 100e18, finalFee = half
  const LIVENESS = 7200n;

  before(async function () {
    wallStart = Date.now();
    log(`network ${hre.network.name}, hardfork ${hre.network.config.hardfork}, chainId ${hre.network.config.chainId}`);
    const t = Date.now();
    uma = await deployUma(hre, { finalFee: FINAL_FEE, liveness: LIVENESS });
    const ms = Date.now() - t;
    ooAddr = await uma.oo.getAddress();
    storeAddr = await uma.store.getAddress();
    log(`deployUma: ${uma.gas.length} transactions in ${ms} ms`);
    let total = 0n;
    for (const g of uma.gas) { log(`  [gas] ${g.step.padEnd(45)} ${g.gasUsed}`); total += g.gasUsed; }
    log(`  [gas] ${"TOTAL deployUma".padEnd(45)} ${total}`);

    const art = await hre.artifacts.readArtifact("Probe");
    probe = await new ethers.ContractFactory(art.abi, art.bytecode, uma.deployer).deploy(ooAddr, await uma.currency.getAddress());
    const r = await probe.deploymentTransaction().wait();
    probeAddr = await probe.getAddress();
    log(`Probe deployed at ${probeAddr}, gas ${r.gasUsed}`);
    // TestnetERC20.allocateTo(owner, amount) mints to anyone.
    await (await uma.currency.allocateTo(probeAddr, ethers.parseEther("1000"))).wait();
  });

  it("exposes the expected UMA parameters", async function () {
    const curr = await uma.currency.getAddress();
    const burned = await uma.oo.burnedBondPercentage();
    const defId = await uma.oo.defaultIdentifier();
    log(`defaultIdentifier     ${ethers.decodeBytes32String(defId)} (${defId})`);
    log(`burnedBondPercentage  ${fmt(burned)} (x1e18)`);
    log(`Store final fee       ${fmt((await uma.store.computeFinalFee(curr)).rawValue)}`);
    log(`getMinimumBond        ${fmt(await uma.oo.getMinimumBond(curr))}`);
    log(`defaultLiveness       ${await uma.oo.defaultLiveness()} s`);
    log(`cachedOracle == mock  ${(await uma.oo.cachedOracle()) === (await uma.mockOracle.getAddress())}`);
    assert.equal(defId, uma.identifier);
    assert.equal(burned, ethers.parseEther("0.5"));
    assert.equal(uma.minimumBond, FINAL_FEE * 2n);
    assert.equal(await uma.oo.getMinimumBond(curr), uma.minimumBond);
  });

  async function balances() {
    return {
      probe: await uma.currency.balanceOf(probeAddr),
      oo: await uma.currency.balanceOf(ooAddr),
      store: await uma.currency.balanceOf(storeAddr),
    };
  }
  const show = (label, b) => log(`  balances ${label.padEnd(22)} Probe ${fmt(b.probe).padStart(8)} | OOv3 ${fmt(b.oo).padStart(6)} | Store ${fmt(b.store).padStart(6)}`);

  async function run(truthful, bond) {
    log(`--- resolve ${truthful ? "TRUE" : "FALSE"}, bond ${fmt(bond)} (min ${fmt(uma.minimumBond)}) ---`);
    const b0 = await balances();
    show("before", b0);
    const claim = ethers.toUtf8Bytes(`Probe claim resolved ${truthful} at ${Date.now()}`);
    const rc = await (await probe.assertAndDispute(claim, bond, LIVENESS)).wait();
    const id = await probe.lastAssertionId();
    log(`  assertionId ${id}`);
    log(`  [gas] assertTruth+disputeAssertion (1 tx)   ${rc.gasUsed}`);
    const b1 = await balances();
    show("after assert+dispute", b1);
    assert.equal(b0.probe - b1.probe, bond * 2n);
    assert.equal(b1.oo - b0.oo, bond * 2n);
    assert.equal(await probe.disputedId(), id);
    log(`  disputed callback: id matches, count ${await probe.disputedCount()}`);

    // Negative check: no price on the mock yet -> settlement must revert.
    await assert.rejects(uma.oo.settleAssertion.staticCall(id), (e) => {
      log(`  settle before price reverts: ${e.shortMessage || e.message}`);
      return true;
    });

    const resolvedBefore = await probe.resolvedCount();
    const res = await resolveDispute(uma, id, truthful);
    log(`  mock request: identifier ${ethers.decodeBytes32String(res.identifier)}, time ${res.time}, ancillary "${ethers.toUtf8String(res.ancillaryData)}"`);
    log(`  [gas] MockOracleAncillary.pushPrice          ${res.pushReceipt.gasUsed}`);
    log(`  [gas] OOv3.settleAssertion                   ${res.settleReceipt.gasUsed}`);
    const b2 = await balances();
    show("after settle", b2);
    const fee = (bond * (await uma.oo.burnedBondPercentage())) / 10n ** 18n;
    log(`  split: winner (Probe as ${truthful ? "asserter" : "disputer"}) +${fmt(b2.probe - b1.probe)} = 2 x bond - fee; Store +${fmt(b2.store - b1.store)} = fee (${fmt(fee)})`);
    assert.equal(b2.probe - b1.probe, bond * 2n - fee);
    assert.equal(b2.store - b1.store, fee);
    assert.equal(b2.oo, b0.oo);

    assert.equal(await probe.resolvedId(), id);
    assert.equal(await probe.resolvedTruthfully(), truthful);
    assert.equal(await probe.resolvedCount(), resolvedBefore + 1n);
    assert.equal(await uma.oo.getAssertionResult(id), truthful);
    log(`  resolved callback: id matches, assertedTruthfully=${await probe.resolvedTruthfully()}; getAssertionResult=${await uma.oo.getAssertionResult(id)}`);
  }

  it("disputed assertion resolved TRUE (bond = minimum bond)", async function () {
    await run(true, uma.minimumBond);
  });

  it("disputed assertion resolved FALSE (bond = 2 x minimum bond)", async function () {
    await run(false, uma.minimumBond * 2n);
  });

  after(function () {
    log(`wall-clock time of the whole test (deploy + 2 runs): ${Date.now() - wallStart} ms`);
  });
});
