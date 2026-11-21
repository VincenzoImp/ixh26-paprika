# uma-vote: UMA Optimistic Oracle V3 + the real DVM (VotingV2) on a plain local Hardhat chain

**Result: it works.** A disputed OOv3 assertion is resolved by UMA's real voting contract `VotingV2`. There is
no mock oracle. Local accounts act as UMA token holders: they stake, commit a hashed vote, then reveal it. Every
contract comes from UMA's published compiled artifacts (`@uma/contracts-node` 0.4.28, solc 0.8.16). The chain is
plain local Hardhat with `hardfork: "osaka"`: no fork, no public network, no `allowUnlimitedContractSize`
(`VotingV2` runtime is 22,612 bytes, under the 24,576-byte limit; its deployment uses 5.16M gas, under the 2^24
Osaka transaction cap).

Tested cases: TRUE by vote, FALSE by vote, a vote below quorum (no resolution, the request rolls to the next round
and the next vote resolves it), and WETH9 as the bond currency. All 4 tests pass in-process and against a
standalone `hardhat node`.

## Commands

```bash
cd uma-vote
npm install                      # hardhat 2.29.2, ethers 6.17.0, @uma/contracts-node 0.4.28
npx hardhat test                 # phaseLength 86400 s (UMA mainnet value)
PHASE_LENGTH=60 npx hardhat test # same test with 60 s commit/reveal phases

npx hardhat node &               # or against a standalone node
npx hardhat test --network localhost
```

Raw output of both runs: `output/2026-11-21-run.txt`.

## Files

- `lib/deploy-uma-dvm.js`: `deployUmaWithVoting(hre, { finalFee, liveness, phaseLength, voters, stakePerVoter, currency, gat?, spat?, emissionRate?, unstakeCoolDown?, maxRolls?, maxRequestsPerRound?, baseSlashAmount?, governanceSlashAmount?, identifier? })`
  - `voters`: signers or addresses. Default: node accounts 1..3.
  - `currency`: `"TestnetERC20"` (the default), `"WETH9"`, or the address of an existing ERC-20.
  - Returns `{ oo, finder, store, addressWhitelist, identifierWhitelist, registry, votingToken, slashingLibrary, voting, currency, currencyKind, identifier, minimumBond, deployer, voters, voterAddrs, provider, gas, params }`. The contracts are ethers v6 objects. `params` holds every value that was used, including `gat`, `spat` and `totalStake`. `gas` is `[{ step, gasUsed }]`.
- `lib/vote.js`: `resolveByVote(uma, hre, assertionId, truthful, voters?, { log?, settle? }?)`
  - Returns `{ roundId, price, identifier, time, ancillaryData, commits: [{voter, hash, gasUsed}], reveals: [...], settle: {hash, gasUsed} | null, settled, settleError, timeline: [{label, timestamp, round, phase}], simulatedSeconds }`.
  - `settled` is false (and `settleError` holds the revert reason) when the vote did not resolve. It does not throw in that case.
  - Also exports `advanceTo(provider, ts)` and `latestTimestamp(provider)`.
- `contracts/Probe.sol`: copied unchanged from `uma-local`. It asserts and disputes in one transaction and records the callbacks.
- `test/uma-vote.test.js`: the 4 scenarios, with balances, gas, simulated time and wall-clock time.

## Deployment steps (32 transactions, 18.96M gas in total)

Steps marked NEW are not in `uma-local/lib/deploy-uma.js`. The mock oracle is gone.

| # | Call | Why |
|---|---|---|
| 1-4 | `Finder()`, `Store({0},{0},0x0)`, `AddressWhitelist()`, `IdentifierWhitelist()` | Same as in the mock version. |
| 5 NEW | `Registry()` | `VotingV2.requestPrice` / `getPrice` / `hasPrice` are `onlyRegisteredContract`: the caller (OOv3) must be registered here. |
| 6 NEW | `VotingToken()` | The UMA token ("UMA Voting Token v1", 18 decimals). Staked balances are the voting weight. |
| 7 | `TestnetERC20("Default Bond Token","DBT",18)` or `WETH9()` | Bond currency. |
| 8 | Finder: `Store`, `CollateralWhitelist`, `IdentifierWhitelist`, **`Registry`** (NEW) | `VotingV2` looks up `IdentifierWhitelist` and `Registry` through the Finder. |
| 9 | `addToWhitelist(currency)`, `addSupportedIdentifier("ASSERT_TRUTH")`, `setFinalFee(currency, finalFee)` | Must come before OOv3, because its constructor caches these values. `VotingV2` also rejects identifiers that are not whitelisted ("Unsupported identifier"). |
| 10 NEW | `votingToken.addMember(1 /*Minter*/, deployer)`, then `mint(voter_i, stakePerVoter)` | Must come BEFORE `VotingV2`: its constructor calls `setGatAndSpat`, which requires `0 < gat < votingToken.totalSupply()`. |
| 11 NEW | `FixedSlashSlashingLibrary(baseSlashAmount, governanceSlashAmount)` | Required by the `VotingV2` constructor. |
| 12 NEW | `VotingV2(emissionRate, unstakeCoolDown, phaseLength, maxRolls, maxRequestsPerRound, gat, spat, votingToken, finder, slashingLibrary, 0x0)` | The DVM. It uses `block.timestamp`; there is no Timer contract. |
| 13 NEW | `votingToken.addMember(1 /*Minter*/, VotingV2)` | `VotingV2` mints staking rewards in `withdrawRewards`. Mainnet does the same. |
| 14 | `finder.changeImplementationAddress("Oracle", VotingV2)` | Must come before OOv3, which caches it as `cachedOracle`. |
| 15 | `OptimisticOracleV3(finder, currency, liveness)`, Finder `OptimisticOracleV3` | Same as in the mock version. |
| 16 NEW | `registry.addMember(1 /*ContractCreator*/, deployer)`, `registry.registerContract([], OOv3)` | Registers OOv3 with the DVM. Without it, the dispute reverts. |
| 17 NEW | For each voter: `votingToken.approve(VotingV2, stake)`, `VotingV2.stake(stake)` | Only staked tokens vote. `cumulativeStake` is the base for the SPAT. |

### Constructor arguments chosen

The defaults come from UMA's scripts `packages/core/deploy/052_deploy_fixed_slash_slashing_library.js` and `053_deploy_votingV2.js` (mainnet values), except where noted.

| Argument | Value | Reason |
|---|---|---|
| `emissionRate` | **0** (mainnet 0.18e18/s) | Keeps token balances readable. A non-zero value works because `VotingV2` is a Minter. |
| `unstakeCoolDown` | 7 days (mainnet) | Not used in the demo. |
| `phaseLength` | 86400 s in the test (mainnet); configurable | A round is 2 x phaseLength. Use 60 for a short demo. |
| `maxRolls` | 4 (mainnet) | An unresolved request rolls at most 4 times. When `rollCount > 4` it is deleted. |
| `maxRequestsPerRound` | 1000 (UMA script) | |
| `gat` | **totalStake / 2** = 1.5M of 3M (mainnet 5M of ~100M+ supply) | Strictly more than 1.5M must reveal, so 2 of the 3 equal voters are enough and 1 is not. The value must also be below the total supply. |
| `spat` | 0.5e18 (mainnet) | Strictly more than 50% of the cumulative stake must vote for the winning answer. |
| `previousVotingContract` | `0x0` | There is no V1 to fall back on. |
| `baseSlashAmount` | 0.001e18 (mainnet; the UMA script default for other chains is 0.0016) | Missed or wrong votes lose 0.1% of stake per resolved request, which goes to the correct voters. |
| `governanceSlashAmount` | 0 (UMA script) | |
| `stakePerVoter` | 1,000,000e18 x 3 voters (accounts 1..3) | |
| `finalFee` | 50e18 (same as `uma-local`), so the minimum bond is 100e18 | |

## How a vote runs (from `output/2026-11-21-run.txt`)

1. **Dispute.** `VotingV2.requestPrice` schedules the request for the **next** round (`currentRound + 1`). Its status
   is `Future`, and `settleAssertion` reverts with "Price is still to be voted on".
   **`getPendingRequests()` does not list `Future` requests** (it returned length 0 here). `vote.js` therefore uses
   `getPriceRequestStatuses` and the `priceRequests` getter instead.
2. **Move to the start of that round (commit phase).** The commit hash is
   `keccak256(abi.encodePacked(int256 price, int256 salt, address voter, uint256 time, bytes ancillaryData, uint256 roundId, bytes32 identifier))`.
   `time` is the assertion time, `ancillaryData` is `oo.stampAssertion(id)`, and `identifier` is `ASSERT_TRUTH`.
   The price is 1e18 for true and 0 for false. Each voter sends `commitVote`: 1 transaction per voter.
3. **Move to round start + phaseLength (reveal phase).** Each voter sends `revealVote(identifier, time, price, ancillaryData, salt)`: 1 transaction per voter.
4. **Move to the round end.** `oo.settleAssertion(id)` calls `VotingV2.getPrice`. The request is resolved when the
   revealed stake is above the GAT and the stake on the winning answer is above SPAT x cumulative stake. Settlement
   then pays out and calls `assertionResolvedCallback`.

Per vote: **2N + 1 transactions** (7 with 3 voters) and **3 time jumps**. The time jumps are
`evm_setNextBlockTimestamp` + `evm_mine`, which is `evm_increaseTime` to an exact boundary.

**Simulated time per vote:** from 1 to 2 rounds, i.e. between 2 and 4 x phaseLength. It is about 4 days with
mainnet phases: the test measured 345,073 to 345,596 s per vote, because each dispute happened right at the start
of a round. A rolled request needs one more round (172,794 s). The whole test advanced 17.99 days. With
`PHASE_LENGTH=60` it is 114 to 236 s per vote and 970 s in total. Wall-clock time is about 1.4 s for the whole
test (deployment about 0.4 s).

**Gas:**

| Transaction | Gas |
|---|---|
| `commitVote` | 89k to 215k |
| `revealVote` | 82k to 194k |
| `settleAssertion` | 128k to 205k |
| Probe assert + dispute (now including `VotingV2.requestPrice`) | 530k to 598k |
| Deploy `VotingV2` | 5.16M |
| Deploy `VotingToken` | 2.16M |
| Deploy `Registry` | 1.64M |

The first `commitVote` in a round costs more because it runs `processResolvablePriceRequests` and updates the
slashing trackers. The first `revealVote` costs more because it freezes the round's GAT, SPAT and stake. For
comparison, the mock version's assert + dispute cost 514k to 566k.

**Balances (TestnetERC20).** The figures are the same as with the mock:

| Case | Probe | OOv3 holds | Store |
|---|---|---|---|
| TRUE, bond 100 | 1000 -> 800 -> 950 | 200 -> 0 | +50 |
| FALSE, bond 200 | 950 -> 550 -> 850 | 400 -> 0 | +100 |

`VotingV2` holds the 3M staked UMA throughout. Voter stakes stay at 1M each, because everyone voted and voted
correctly, so nobody was slashed.

**Below quorum (only voter0 votes, 1M is not above the 1.5M GAT):**
- At the end of the round, `settleAssertion` reverts with "Current voting round not ended".
- The balances do not change: OOv3 keeps both bonds (200) and no callback runs.
- The request is `Active` again in the next round with `rollCount 1`. Nobody is slashed, because slashing only applies to resolved requests.
- `resolveByVote` again with all voters resolves it one round later: Probe 650 -> 800, Store +50.
- If nobody reaches quorum for more than `maxRolls` (4) rounds, the request is deleted. The assertion then can never settle and the bonds stay locked in OOv3.

**WETH9 as bond currency: it works.** UMA ships `financial-templates/common/WETH9.sol` (runtime 2,262 bytes). It is
deployed, whitelisted, and given a final fee of 50 WETH. In the test, Probe is funded with `deposit{value}` +
`transfer`, and the TRUE vote produces the same 800 -> 950 / Store +50 flow.

## What is real and what is simulated

- **Real UMA code** (published artifacts, nothing recompiled, nothing mocked): `Finder`, `Store`,
  `AddressWhitelist`, `IdentifierWhitelist`, `Registry`, `VotingToken`, `FixedSlashSlashingLibrary`, `VotingV2`,
  `OptimisticOracleV3`, `WETH9`. Request scheduling, commit/reveal, GAT/SPAT resolution, rolling, slashing,
  `getPrice`, bond custody, the fee burn and the callbacks all run UMA's code.
- `TestnetERC20` (the default bond currency) is UMA's test token: anyone can mint it with `allocateTo`. Use `"WETH9"` or your own token to avoid it.
- **Simulated:**
  - The voters are local accounts holding freshly minted UMA. The deployer stays a Minter (UMA's script removes that role), so the demo can mint more.
  - The deployer owns everything that `GovernorV2` owns on mainnet: Finder, Store, whitelists, Registry ContractCreator role, and `VotingV2` ownership. There is no governor, no `EmergencyProposer` and no `DesignatedVoting`/delegation.
  - The total supply is tiny (3M), so the GAT is scaled down.
  - Emissions are 0.
  - Time is jumped on the local chain.
- A single-entity "DVM" is still fully controlled by whoever holds the majority of the stake, which here is the demo team.

## Limits and surprises

- The DVM always votes in the **round after** the dispute. Even with liveness 0, a dispute takes 2 to 4 x phaseLength of chain time. The demo needs time travel (or `phaseLength` around 60 s and real waiting).
- `getPendingRequests()` only lists requests that are Active in the current round. Use `getPriceRequestStatuses` (status enum: 0 NotRequested, 1 Active, 2 Resolved, 3 Future, 4 ToDelete).
- **ethers v6 caches identical RPC requests for 250 ms.** A `settleAssertion` gas estimate that had reverted just
  before a time jump was replayed from the cache after the jump. The symptom: the same "Current voting round not
  ended" error, while a raw `eth_estimateGas` succeeded. `getBlock("latest")` was also stale. The fix is in
  `getProviderAndSigners`: `new BrowserProvider(hre.network.provider, undefined, { cacheTimeout: -1 })`, and
  `vote.js` reads timestamps through raw `eth_getBlockByNumber`. Fast scripted demos with plain ethers need this.
  The `hre.ethers` (hardhat-ethers) path is supported but was not tested here, because hardhat-ethers is not installed.
- To commit, a voter must commit during the commit phase of the active round. If the chain is already in that round's reveal phase, `resolveByVote` targets the next round (the request rolls).
- The undisputed path (settle after liveness) is unchanged and is not exercised here.

## Plugging into a `deploy-uma.js`-based project

1. Copy `lib/deploy-uma-dvm.js` and `lib/vote.js`. They need `@uma/contracts-node` ^0.4.28 and `ethers` ^6.
2. Replace `deployUma(hre, { finalFee, liveness, currency })` with
   `deployUmaWithVoting(hre, { finalFee, liveness, phaseLength, voters, stakePerVoter, currency })`.
   - The returned object keeps the same names (`oo, finder, store, currency, identifier, minimumBond, identifierWhitelist, addressWhitelist, deployer, provider, gas`). It has **no `mockOracle`**, and adds `voting, votingToken, registry, slashingLibrary, voters, voterAddrs, params`.
   - `currencyDecimals` is not supported (TestnetERC20 is always 18 decimals). Pass an address instead.
   - Choose `voters` so they do not collide with the accounts the demo uses for other roles.
3. Replace `resolveDispute(uma, id, truthful)` with `await resolveByVote(uma, hre, id, truthful)` and check
   `.settled`. The function settles the assertion itself; do not call `settleAssertion` again.
4. Anything that reads `uma.mockOracle` or calls `pushPrice` must go. The consumer contract (Probe-like) does not change.
5. Any other contract that must call the DVM directly needs `registry.registerContract([], addr)`. The deployer keeps the ContractCreator role for this.
