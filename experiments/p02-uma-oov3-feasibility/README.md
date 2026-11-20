# p02 - UMA Optimistic Oracle V3: feasibility check (2026-11-20, about 21:24-22:05 CET)

Question: can the real UMA OOv3 be run end to end on this machine tonight, with a consumer contract that bans a
device when the claim "photo X of device Y is fake" is resolved as true?

**Answer: yes, path 3a (Hardhat fork of live Sepolia) worked on the first try.** It runs the real deployed OOv3
bytecode, real USDC token, real Finder/Store/whitelists, and UMA's own deployed `MockOracleAncillary` as the dispute
resolver. Paths 3b (deploy from `@uma/core`) and 3c (hand-written mock) were **not tried**, because 3a succeeded.
No public-network transaction was sent; Sepolia was only read through a keyless RPC.

## Setup / commands

```bash
cd /home/tux/crypto2/experiments/p02-uma-oov3-feasibility
npm install                                   # hardhat ^2.29.2, ethers ^6.17.0 only; no Foundry, no hardhat-ethers plugin
node scripts/readonly-sepolia.js              # step 2: read-only views on live Sepolia -> output/readonly-sepolia.json
npx hardhat run scripts/e2e-fork.js           # step 3a + 4: fork, raw OOv3 run, 3 consumer scenarios -> output/e2e-fork.log
```

Fork RPC: `https://ethereum-sepolia-rpc.publicnode.com` (keyless), pinned at block 12177408
(override with `FORK_URL` / `FORK_BLOCK`). Config note: the forked chain enforces the EIP-7825 per-transaction gas cap
(16,777,216), so `hardhat.config.js` sets `gas: 16_000_000`; the first run failed without it (`transaction gas limit
(60000000) is greater than the cap (16777216)`, kept in this README as the recorded error).

Runtime [TEST]: first run about 5 minutes wall clock; second run (`output/e2e-fork-run2-warmcache.log`, same pinned
block, `cache/hardhat-network-fork` present) **7 m 30 s**, identical results and gas. So the fork cache did not make it
fast; several seconds to tens of seconds per transaction. Cause not isolated in the time box (candidates: uncached
RPC lookups for new storage keys over the public endpoint, or ethers `BrowserProvider` receipt polling). This is the
main open risk for a live demo.

## 1. Addresses and sources

[SOURCE] `https://raw.githubusercontent.com/UMAprotocol/protocol/master/packages/core/networks/<chainId>.json`
(downloaded copies in `output/networks-*.json`).

| Network | Contract | Address | Line quoted |
|---|---|---|---|
| Sepolia 11155111 | OptimisticOracleV3 | `0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944` | `"contractName": "OptimisticOracleV3", "address": "0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944"` |
| Sepolia | Finder | `0xf4C48eDAd256326086AEfbd1A53e1896815F8f13` | `"contractName": "Finder", ...` |
| Sepolia | Store | `0x39e7FFA77A4ac4D34021C6BbE4C8778d47F684F2` | `"contractName": "Store", ...` |
| Sepolia | MockOracleAncillary | `0x5FE28AEa36420414692b1C907F7d0114d304eb0C` | `"contractName": "MockOracleAncillary", ...` |
| Sepolia | VotingV2 | `0xd6Fc66498aE366892BDa974Fd4eF903Ca7202F76` | `"contractName": "VotingV2", ...` |
| Sepolia | AddressWhitelist / IdentifierWhitelist | `0xE8DE4bcE...7B84` / `0xfcb6f771...AA77` | |
| Ethereum 1 | OptimisticOracleV3 | `0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE` | line 175-176 of `1.json` |
| Ethereum 1 | Finder / Store | `0x40f941E48A552bF496B154Af6bf55725f18D77c3` / `0x54f44eA3D2e7aA0ac089c4d8F7C93C27844057BF` | |
| Polygon 137 | OptimisticOracleV3 | `0x5953f2538F613E05bAED8A5AeFa8e6622467AD3D` | line 91-92 of `137.json` |
| Polygon 137 | Finder / Store | `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` / `0xE58480CA74f1A819faFd777BEDED4E2D5629943d` | |

Bond currency (Sepolia): [TEST] `OOv3.defaultCurrency()` = `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
(`name()`/`symbol()` = USDC, 6 decimals; it is Circle-style FiatToken, not freely mintable).

[SOURCE] https://docs.uma.xyz/resources/network-addresses (text extract in `output/docs-network-addresses.txt`):
"Ethereum Sepolia (testnet) 11155111 Yes No Yes" (columns: Fully Permissionless Settlement / DVM Support / Oracle UI),
i.e. Sepolia has **no DVM support**. Same table lists 1, 137, 10, 42161, 8453, 81457, 1514, 43114 and testnets 80002,
84532, 168587773.

**XRPL EVM sidechain: no UMA deployment found.**
- [SOURCE] https://chainid.network/chains.json (`output/xrpl-chainids.txt`): `1440000 XRPL EVM Sidechain`,
  `1449000 XRPL EVM Sidechain Testnet`, `1440002 XRPL EVM Sidechain Devnet` - your ids are correct.
- [SOURCE] UMA networks directory listing via GitHub API (`output/networks-dirlist.txt`): files are 1, 10, 100, 1115,
  11155111, 1116, 137, 1513, 1514, 1516, 168587773, 288, 4, 416, 42, 42161, 421611, 421614, 43114, 5, 80001, 80002,
  81457, 82, 8453, 84531, 84532, 9001. No 1440000/1449000/1440002 (raw fetch returned HTTP 404 for each).
- The docs address table does not mention XRPL either (grep for "xrpl" on the page: no hit).

## 2. Read-only check on live Sepolia [TEST] (`output/readonly-sepolia.json`)

`eth_getCode(OOv3)` = 17,837 bytes. `defaultIdentifier()` = `ASSERT_TRUTH`; `defaultLiveness()` = 7200 s (2 h);
`defaultCurrency()` = USDC above; `getMinimumBond(USDC)` = 400 USDC (400000000); `burnedBondPercentage()` = 50%;
`finder()` = the Finder above; owner `0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D`.
Finder lookups: `Oracle` -> **VotingV2** `0xd6Fc...2F76` (not the mock), Store -> `0x39e7...84F2`,
`Store.computeFinalFee(USDC)` = 0 (so the 400 USDC minimum is a stale cached value in OOv3).

## 3a. Lifecycle on a local Sepolia fork [TEST] (`output/e2e-fork.log`)

- Test accounts: Hardhat defaults #0-#3. USDC funded with `hardhat_setStorageAt` (balance mapping found at slot 9).
- **Run 1, raw OOv3, untouched config**: `assertTruthWithDefaults` (400 USDC bond, 7200 s liveness) -> settle before
  liveness reverts `"Assertion not expired"` -> `evm_increaseTime 7201` -> `settleAssertion` ->
  `getAssertionResult = true`, bond returned to asserter (+400).
- **Dispute plumbing (fork-only change)**: since the Sepolia Finder points `Oracle` at VotingV2 (no DVM votes happen on
  Sepolia), the script impersonates the Finder owner and calls
  `Finder.changeImplementationAddress("Oracle", MockOracleAncillary)`, then the permissionless
  `OOv3.syncUmaParams(ASSERT_TRUTH, USDC)` so OOv3 caches the new oracle. This side effect also re-caches the final
  fee (0), so the minimum bond becomes 0 after the switch. Disputes are then resolved by calling UMA's own
  `MockOracleAncillary.pushPrice(identifier, time, ancillaryData, price)` (no access control; source:
  `output/src-MockOracleAncillary.sol`), with price `1e18` = true and `0` = false. Ancillary data seen by the oracle:
  `assertionId:<id>,ooAsserter:<asserter>`.

## 4. Consumer `contracts/BanByAssertion.sol` - three scenarios [TEST]

Parameters: bond 400 USDC (pulled from the claimant, claimant is the `asserter` so UMA pays it back directly),
reward 100 USDC from the contract's pool on a truthful resolution, liveness 120 s. Gas = `gasUsed` on the fork.

| Scenario | claimFake | disputeAssertion | pushPrice (mock) | settleAssertion | Result | Banned | Claimant | Disputer | Pool |
|---|---|---|---|---|---|---|---|---|---|
| S1 undisputed | 345,739 | - | - | 119,003 | true | yes | +100 | 0 | -100 |
| S2 disputed, resolved false | 345,739 | 338,651 | 103,994 | 123,422 | false | no | **-400** | +200 | 0 |
| S3 disputed, resolved true | 345,739 | 338,651 | 119,972 | 159,258 | true | yes | +300 | **-400** | -100 |

(USDC deltas; in S2/S3 the loser's 400 bond is split 50/50 between the winner and the UMA Store, as
`burnedBondPercentage` = 50%.) Other gas: BanByAssertion deploy 823,348; raw `assertTruthWithDefaults` 204,728;
raw `settleAssertion` 73,676; approve 55,785; Finder switch 30,737; `syncUmaParams` 64,818.

Simulated time: S1 needs the 120 s liveness (fast-forwarded with `evm_increaseTime`); production default is 7200 s.
In S2/S3 the dispute is resolved instantly by `pushPrice`. In reality:
- [SOURCE] https://docs.uma.xyz/developers/resolving-disputes: "If the dispute is on a live network, it will be resolved
  by the DVM on Ethereum, and the results returned within 48-72 hours (depending on when the dispute was raised during
  the DVM voting cycle)." and, for testnets, "you will need to manually resolve the dispute through the Mock Oracle"
  ("Click pushPrice ...").
- [SOURCE] https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work: "secret votes during a 24-hour commit period
  and subsequently reveal them in a 24-hour reveal period. Voting rounds follow a fixed schedule with transitions at
  24:00 UTC. Disputes must be at least 4 hours old to enter a new voting round."
- [MEMORY] the "48-96 h" figure in the brief: UMA docs I read say 48-72 h; I did not find 96 h stated.

## 5. What this means for the demo

- **Real UMA code**: OptimisticOracleV3 (deployed Sepolia bytecode), Finder, Store, whitelists, USDC, and UMA's
  deployed `MockOracleAncillary`. **Not real**: the dispute resolution (a mock oracle where anyone pushes the answer,
  standing in for the DVM token-holder vote), the impersonated Finder-owner switch, minted-by-storage-write USDC, and
  fast-forwarded time. All of it runs on a local fork, not on Sepolia itself.
- **In 90 seconds a live audience can see**: claim submitted with the human-readable claim string, bond leaving the
  claimant, "too early to settle" revert, time jump, settle -> device banned + reward; or a dispute, the oracle
  receiving `assertionId:...,ooAsserter:...`, a pushed answer, settle -> no ban and the claimant losing 400 USDC.
  Caveat [TEST]: the full script took 5-7.5 minutes per run here, so 90 seconds is not met as-is. Untested options:
  start `npx hardhat node --fork <rpc> --fork-block-number 12177408` before the talk and run setup (funding, Finder
  switch, deploy) in advance so only claim/dispute/settle happen live; or profile and remove the per-tx latency.
- **Cannot be shown live**: a real DVM vote (48-72 h per docs, commit+reveal 24 h each, plus the 2 h default liveness),
  real economic bonds, and anything on XRPL EVM (no UMA deployment there; on such a chain UMA would have to deploy or
  the demo would need its own oracle).
- Sending real Sepolia transactions (outside these limits) would also only reach VotingV2 on dispute, with
  "DVM Support: No" per UMA's table; that path was not tested.
