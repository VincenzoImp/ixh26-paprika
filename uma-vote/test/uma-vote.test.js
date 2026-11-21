// End-to-end: real UMA OOv3 + real UMA DVM (VotingV2) on a plain local Hardhat chain (hardfork osaka).
// Disputed assertions are resolved by a commit/reveal vote of staked UMA voting tokens. No mock oracle.
// Run: npx hardhat test
const assert = require("node:assert/strict");
const hre = require("hardhat");
const { ethers } = require("ethers");
const { deployUmaWithVoting } = require("../lib/deploy-uma-dvm");
const { resolveByVote } = require("../lib/vote");

const fmt = (x) => ethers.formatUnits(x, 18);
const log = (...a) => console.log("   ", ...a);
const FINAL_FEE = ethers.parseEther("50");
const LIVENESS = 7200n;
const PHASE_LENGTH = BigInt(process.env.PHASE_LENGTH || 86400); // default = UMA mainnet: 1 day commit + 1 day reveal
let totalSimulated = 0n;
const votingGas = [];
const wallStart = Date.now();

async function setup(currency) {
  const t = Date.now();
  const uma = await deployUmaWithVoting(hre, { finalFee: FINAL_FEE, liveness: LIVENESS, phaseLength: PHASE_LENGTH, currency });
  log(`deployUmaWithVoting(${uma.currencyKind}): ${uma.gas.length} transactions in ${Date.now() - t} ms`);
  let total = 0n;
  for (const g of uma.gas) { log(`  [gas] ${g.step.padEnd(45)} ${g.gasUsed}`); total += g.gasUsed; }
  log(`  [gas] ${"TOTAL deployUmaWithVoting".padEnd(45)} ${total}`);
  const p = uma.params;
  log(`params: finalFee ${fmt(p.finalFee)}, minimumBond ${fmt(uma.minimumBond)}, liveness ${p.liveness}s, phaseLength ${p.phaseLength}s, ` +
    `voters ${uma.voters.length} x ${fmt(p.stakePerVoter)} staked, GAT ${fmt(p.gat)}, SPAT ${fmt(p.spat)}, emissionRate ${p.emissionRate}, ` +
    `maxRolls ${p.maxRolls}, baseSlash ${fmt(p.baseSlashAmount)}`);
  assert.equal(await uma.oo.cachedOracle(), await uma.voting.getAddress());
  assert.equal(await uma.registry.isContractRegistered(await uma.oo.getAddress()), true);
  assert.equal(await uma.voting.cumulativeStake(), p.totalStake);

  const art = await hre.artifacts.readArtifact("Probe");
  const probe = await new ethers.ContractFactory(art.abi, art.bytecode, uma.deployer).deploy(await uma.oo.getAddress(), await uma.currency.getAddress());
  await probe.deploymentTransaction().wait();
  const probeAddr = await probe.getAddress();
  if (uma.currencyKind === "WETH9") {
    // WETH9: wrap ETH, then transfer to Probe.
    await (await uma.currency.deposit({ value: ethers.parseEther("1000") })).wait();
    await (await uma.currency.transfer(probeAddr, ethers.parseEther("1000"))).wait();
  } else {
    await (await uma.currency.allocateTo(probeAddr, ethers.parseEther("1000"))).wait();
  }
  return { uma, probe, probeAddr };
}

function makeHelpers(ctx) {
  const { uma } = ctx;
  const balances = async () => ({
    probe: await uma.currency.balanceOf(ctx.probeAddr),
    oo: await uma.currency.balanceOf(await uma.oo.getAddress()),
    store: await uma.currency.balanceOf(await uma.store.getAddress()),
  });
  const show = (label, b) =>
    log(`  balances ${label.padEnd(24)} Probe ${fmt(b.probe).padStart(8)} | OOv3 ${fmt(b.oo).padStart(6)} | Store ${fmt(b.store).padStart(6)}  (${uma.currencyKind})`);
  const stakes = async (label) => {
    const out = [];
    for (const a of uma.voterAddrs) out.push(fmt(await uma.voting.getVoterStakePostUpdate.staticCall(a)));
    log(`  voter stakes ${label.padEnd(20)} ${out.join(" | ")}  (VotingV2 holds ${fmt(await uma.votingToken.balanceOf(await uma.voting.getAddress()))} UMA)`);
  };
  async function assertAndDispute(bond, tag) {
    const claim = ethers.toUtf8Bytes(`Probe claim ${tag} at ${Date.now()}`);
    const rc = await (await ctx.probe.assertAndDispute(claim, bond, LIVENESS)).wait();
    const id = await ctx.probe.lastAssertionId();
    log(`  assertionId ${id}; [gas] assertTruth+disputeAssertion (incl. VotingV2.requestPrice) ${rc.gasUsed}`);
    const [st] = await uma.voting.getPriceRequestStatuses([
      { identifier: uma.identifier, time: (await uma.oo.getAssertion(id)).assertionTime, ancillaryData: await uma.oo.stampAssertion(id) },
    ]);
    log(`  VotingV2 request status ${st.status} (3 = Future), voting round ${st.lastVotingRound}, current round ${await uma.voting.getCurrentRoundId()}; getPendingRequests() length ${(await uma.voting.getPendingRequests()).length}`);
    // Settling before the vote must fail (DVM has no price yet).
    await assert.rejects(uma.oo.settleAssertion.staticCall(id), (e) => {
      log(`  settle before the vote reverts: ${e.reason || e.shortMessage}`);
      return true;
    });
    return id;
  }
  function record(res, label) {
    totalSimulated += res.simulatedSeconds;
    for (const c of res.commits) votingGas.push({ label, kind: "commitVote", gas: c.gasUsed });
    for (const r of res.reveals) votingGas.push({ label, kind: "revealVote", gas: r.gasUsed });
    if (res.settle) votingGas.push({ label, kind: "settleAssertion", gas: res.settle.gasUsed });
  }
  async function fullRun(truthful, bond) {
    log(`--- ${uma.currencyKind}: resolve ${truthful ? "TRUE" : "FALSE"} by vote of all ${uma.voters.length} voters, bond ${fmt(bond)} ---`);
    const b0 = await balances();
    show("before", b0);
    const id = await assertAndDispute(bond, truthful);
    const b1 = await balances();
    show("after assert+dispute", b1);
    assert.equal(b0.probe - b1.probe, bond * 2n);
    const res = await resolveByVote(uma, hre, id, truthful, uma.voters, { log });
    record(res, truthful ? "TRUE" : "FALSE");
    assert.equal(res.settled, true, res.settleError);
    const b2 = await balances();
    show("after settle", b2);
    const fee = (bond * (await uma.oo.burnedBondPercentage())) / 10n ** 18n;
    assert.equal(b2.probe - b1.probe, bond * 2n - fee);
    assert.equal(b2.store - b1.store, fee);
    assert.equal(b2.oo, b0.oo);
    assert.equal(await ctx.probe.resolvedId(), id);
    assert.equal(await ctx.probe.resolvedTruthfully(), truthful);
    assert.equal(await uma.oo.getAssertionResult(id), truthful);
    log(`  round ${res.roundId}: resolved callback assertedTruthfully=${await ctx.probe.resolvedTruthfully()}, Store +${fmt(fee)}`);
    await stakes("after round");
    return res;
  }
  return { balances, show, stakes, assertAndDispute, record, fullRun };
}

describe("UMA OOv3 + real DVM (VotingV2) on a plain local chain", function () {
  const ctx = {};
  let h;
  before(async function () {
    log(`network ${hre.network.name}, hardfork ${hre.network.config.hardfork}, chainId ${hre.network.config.chainId}`);
    Object.assign(ctx, await setup());
    h = makeHelpers(ctx);
    await h.stakes("after deploy");
  });

  it("disputed assertion resolved TRUE by a real commit/reveal vote", async function () {
    await h.fullRun(true, ctx.uma.minimumBond);
  });

  it("disputed assertion resolved FALSE by a real commit/reveal vote", async function () {
    await h.fullRun(false, ctx.uma.minimumBond * 2n);
  });

  it("vote below quorum (1 of 3 voters, stake <= GAT): no resolution, request rolls; next round resolves it", async function () {
    const { uma } = ctx;
    const bond = uma.minimumBond;
    log(`--- below quorum: only voter0 (${fmt(uma.params.stakePerVoter)} staked) votes; GAT ${fmt(uma.params.gat)} ---`);
    const b0 = await h.balances();
    h.show("before", b0);
    const id = await h.assertAndDispute(bond, "quorum");
    const b1 = await h.balances();
    h.show("after assert+dispute", b1);
    const res = await resolveByVote(uma, hre, id, true, [uma.voters[0]], { log });
    h.record(res, "below-quorum");
    assert.equal(res.settled, false);
    const b2 = await h.balances();
    h.show("after failed settle", b2);
    assert.deepEqual(b2, b1);
    const pend = await uma.voting.getPendingRequests();
    const r = pend.find((p) => p.ancillaryData === res.ancillaryData);
    assert.ok(r, "request should still be pending (Active) after the failed round");
    log(`  request still pending (Active): lastVotingRound ${r.lastVotingRound}, rollCount ${r.rollCount} (current round ${await uma.voting.getCurrentRoundId()}; deleted once rollCount > maxRolls=${uma.params.maxRolls})`);
    assert.equal(await uma.oo.getAssertion(id).then((a) => a.settled), false);
    await h.stakes("after failed round");

    log(`--- same request, next round, all voters vote TRUE ---`);
    const res2 = await resolveByVote(uma, hre, id, true, uma.voters, { log });
    h.record(res2, "after roll");
    assert.equal(res2.settled, true, res2.settleError);
    assert.equal(res2.roundId, res.roundId + 1n);
    const b3 = await h.balances();
    h.show("after settle", b3);
    assert.equal(await uma.oo.getAssertionResult(id), true);
    await h.stakes("after round");
  });

  describe("bond currency = UMA's WETH9 (fresh stack)", function () {
    const ctx2 = {};
    let h2;
    before(async function () {
      Object.assign(ctx2, await setup("WETH9"));
      h2 = makeHelpers(ctx2);
    });
    it("disputed assertion with a WETH9 bond resolved TRUE by vote", async function () {
      await h2.fullRun(true, ctx2.uma.minimumBond);
    });
  });

  after(function () {
    log(`--- summary ---`);
    const byKind = {};
    for (const g of votingGas) (byKind[g.kind] = byKind[g.kind] || []).push(g.gas);
    for (const [k, v] of Object.entries(byKind)) {
      const min = v.reduce((a, b) => (b < a ? b : a)), max = v.reduce((a, b) => (b > a ? b : a));
      log(`  [gas] ${k.padEnd(16)} n=${v.length} min ${min} max ${max}`);
    }
    log(`  total simulated time advanced on the chain: ${totalSimulated} s = ${(Number(totalSimulated) / 86400).toFixed(2)} days (${votingGas.filter((g) => g.kind === "settleAssertion").length} settled votes + 1 failed round)`);
    log(`  wall-clock time of the whole test: ${Date.now() - wallStart} ms`);
  });
});
