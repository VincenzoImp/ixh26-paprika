/**
 * Resolve a disputed OOv3 assertion through UMA's real DVM (VotingV2): commit, reveal, settle.
 *
 * On dispute, OOv3 calls VotingV2.requestPrice(assertion.identifier, assertion.assertionTime,
 * stampAssertion(assertionId)). VotingV2 schedules the request for the NEXT round (currentRound + 1).
 * A round is 2 x phaseLength: [commit phase][reveal phase]; roundId = floor(timestamp / (2 x phaseLength)).
 *
 * Steps (all on the local chain; time is moved with evm_setNextBlockTimestamp + evm_mine, which is
 * evm_increaseTime to an exact boundary):
 *   1. find the pending request (VotingV2.getPendingRequests) that matches the assertion;
 *   2. jump to the start of its voting round (commit phase) unless already in it;
 *   3. every voter commits keccak256(abi.encodePacked(price, salt, voter, time, ancillaryData, roundId, identifier));
 *   4. jump to the reveal phase (round start + phaseLength); every voter reveals (price, salt);
 *   5. jump to the end of the round; OOv3.settleAssertion -> VotingV2.getPrice (resolved if revealed stake > GAT
 *      and stake on the winning answer > SPAT x cumulative stake), payout + assertionResolvedCallback.
 * price: 1e18 = assertion true (OOv3 numericalTrue), 0 = false.
 */
const { ethers } = require("ethers");
const { umaArtifact } = require("./deploy-uma-dvm");

const NUMERICAL_TRUE = 10n ** 18n;
const PHASES = ["Commit", "Reveal"];

// Raw RPC on purpose: ethers' getBlock("latest") may return a cached block right after evm_mine.
async function latestTimestamp(provider) {
  return BigInt((await provider.send("eth_getBlockByNumber", ["latest", false])).timestamp);
}

// Move the chain to exactly `ts` (mines one block with that timestamp). Returns seconds advanced.
async function advanceTo(provider, ts) {
  const now = await latestTimestamp(provider);
  if (ts <= now) return 0n;
  await provider.send("evm_setNextBlockTimestamp", [ethers.toQuantity(ts)]);
  await provider.send("evm_mine", []);
  return ts - now;
}

/**
 * @param uma        object returned by deployUmaWithVoting.
 * @param hre        Hardhat runtime environment (kept for API symmetry; the provider of `uma` is used).
 * @param assertionId disputed OOv3 assertion id.
 * @param truthful   true -> every voter votes 1e18, false -> every voter votes 0.
 * @param voters     signers that commit + reveal (default: all uma.voters). Can be a subset (quorum test).
 * @param opts.log   logger (default console.log); opts.settle (default true): call settleAssertion at the end.
 * @returns {Promise<{roundId, price, identifier, time, ancillaryData, commits, reveals, settle, settled,
 *   settleError, timeline, simulatedSeconds}>}  commits/reveals = [{voter, hash, gasUsed}].
 */
async function resolveByVote(uma, hre, assertionId, truthful, voters, opts = {}) {
  const log = opts.log || console.log;
  const doSettle = opts.settle !== false;
  const { oo, voting, provider } = uma;
  voters = voters || uma.voters;
  const vt = await voting.voteTiming(); // VoteTiming.Data { phaseLength }
  const phaseLength = BigInt(typeof vt === "bigint" ? vt : vt[0]);
  const roundLength = 2n * phaseLength;
  const timeline = [];
  let simulatedSeconds = 0n;
  const mark = async (label) => {
    const ts = await latestTimestamp(provider);
    const round = await voting.getCurrentRoundId();
    const phase = PHASES[Number(await voting.getVotePhase())];
    timeline.push({ label, timestamp: ts, round, phase });
    log(`  [${label}] block time ${ts} (${new Date(Number(ts) * 1000).toISOString()}), round ${round}, phase ${phase}`);
  };

  // 1. Rebuild the DVM request from OOv3's own views and find it among VotingV2's pending requests.
  const a = await oo.getAssertion(assertionId);
  if (a.disputer === ethers.ZeroAddress) throw new Error("assertion is not disputed");
  const identifier = a.identifier;
  const time = a.assertionTime;
  const ancillaryData = await oo.stampAssertion(assertionId);
  // getPendingRequests() lists only requests ACTIVE in the current round; a fresh request is "Future" (it is voted
  // in the next round), so query its status directly. Status: 0 NotRequested, 1 Active, 2 Resolved, 3 Future,
  // 4 ToDelete. For an Active request lastVotingRound is the current round (also after a roll).
  const [st] = await voting.getPriceRequestStatuses([{ identifier, time, ancillaryData }]);
  const status = Number(st.status);
  const stored = await voting.priceRequests(ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256", "bytes"], [identifier, time, ancillaryData])));
  await mark("start");
  log(`  DVM request status ${["NotRequested", "Active", "Resolved", "Future", "ToDelete"][status]}, lastVotingRound ${st.lastVotingRound}, stored rollCount ${stored.rollCount}`);
  if (status !== 1 && status !== 3) throw new Error(`DVM request is not pending (status ${status})`);

  // 2. Voting round. If the request is Active but we are already in its reveal phase, it is too late to commit:
  //    it will roll to the next round, so vote there.
  let roundId = BigInt(st.lastVotingRound);
  if (status === 1 && Number(await voting.getVotePhase()) === 1) roundId += 1n;
  const commitStart = roundId * roundLength;
  const revealStart = commitStart + phaseLength;
  const roundEnd = commitStart + roundLength; // = VotingV2.getRoundEndTime(roundId)
  log(`  voting round ${roundId}: commit [${commitStart}, ${revealStart}), reveal [${revealStart}, ${roundEnd})`);
  simulatedSeconds += await advanceTo(provider, commitStart);
  await mark("commit phase");

  // 3. Commit. The salt is random; the hash layout is VotingV2.revealVote's check.
  const price = truthful ? NUMERICAL_TRUE : 0n;
  const votingAbi = umaArtifact("VotingV2").abi;
  const ballots = [];
  const commits = [];
  for (const v of voters) {
    const voter = await v.getAddress();
    const salt = BigInt(ethers.hexlify(ethers.randomBytes(31))); // positive int256
    const hash = ethers.solidityPackedKeccak256(
      ["int256", "int256", "address", "uint256", "bytes", "uint256", "bytes32"],
      [price, salt, voter, time, ancillaryData, roundId, identifier]
    );
    const vv = new ethers.Contract(await voting.getAddress(), votingAbi, v);
    const r = await (await vv.commitVote(identifier, time, ancillaryData, hash)).wait();
    ballots.push({ vv, voter, salt });
    commits.push({ voter, hash: r.hash, gasUsed: r.gasUsed });
    log(`    commit  ${voter} tx ${r.hash} gas ${r.gasUsed}`);
  }

  // 4. Reveal.
  simulatedSeconds += await advanceTo(provider, revealStart);
  await mark("reveal phase");
  const reveals = [];
  for (const { vv, voter, salt } of ballots) {
    const r = await (await vv.revealVote(identifier, time, price, ancillaryData, salt)).wait();
    reveals.push({ voter, hash: r.hash, gasUsed: r.gasUsed });
    log(`    reveal  ${voter} price ${price} tx ${r.hash} gas ${r.gasUsed}`);
  }

  // 5. End of round, then settle on OOv3 (which calls VotingV2.getPrice).
  simulatedSeconds += await advanceTo(provider, roundEnd);
  await mark("round ended");
  let settle = null;
  let settleError = null;
  if (doSettle) {
    try {
      const r = await (await oo.settleAssertion(assertionId)).wait();
      settle = { hash: r.hash, gasUsed: r.gasUsed };
      log(`    settleAssertion tx ${r.hash} gas ${r.gasUsed}`);
    } catch (e) {
      settleError = e.reason || e.shortMessage || e.message;
      log(`    settleAssertion REVERTED: ${settleError}`);
    }
  }
  log(`  simulated time advanced: ${simulatedSeconds} s (${Number(simulatedSeconds) / 3600} h)`);
  return {
    roundId, price, identifier, time, ancillaryData, commits, reveals, settle, settled: settle !== null,
    settleError, timeline, simulatedSeconds,
  };
}

module.exports = { resolveByVote, advanceTo, latestTimestamp, NUMERICAL_TRUE };
