# uma-local: UMA Optimistic Oracle V3 on a plain local Hardhat chain

**Result: it works.** UMA's real `OptimisticOracleV3` and its DVM plumbing (`Finder`, `Store`, `AddressWhitelist`,
`IdentifierWhitelist`) deploy from UMA's published compiled artifacts on a plain local Hardhat chain (no fork, no
network) with `hardfork: "osaka"`. A disputed assertion goes through the whole lifecycle (assert, dispute, mock vote,
settle) with both callbacks, for TRUE and FALSE. No UMA source is compiled.

## Commands

```bash
cd uma-local
npm install                 # hardhat 2.29.2, ethers 6.17.0, @uma/contracts-node 0.4.28
npx hardhat test            # in-process chain, ~0.45 s for deploy + 2 disputed runs

# or against a standalone node (same osaka config):
npx hardhat node &          # terminal 1
npx hardhat test --network localhost
```

Raw output: `output/2026-11-21-run.txt`.

## Files

- `lib/deploy-uma.js`: `deployUma(hre, { finalFee, liveness, identifier?, currency?, currencyDecimals? })`
  returns `{ oo, finder, store, mockOracle, currency, identifier, minimumBond, identifierWhitelist,
  addressWhitelist, deployer, provider, gas }` (ethers v6 contracts). Works with or without `hardhat-ethers`.
- `lib/resolve.js`: `resolveDispute(uma, assertionId, truthful)`. Rebuilds the mock-oracle request from OOv3's own
  views (`getAssertion(id).identifier`, `.assertionTime`, `stampAssertion(id)` as ancillary data), checks it is in
  `mockOracle.getPendingQueries()`, calls `pushPrice(..., truthful ? 1e18 : 0)`, then `oo.settleAssertion(id)`.
- `contracts/Probe.sol`: test consumer; asserts and disputes its own claim in one transaction and records callbacks.
- `test/uma-local.test.js`: end-to-end test with balances, split, callbacks, gas, timing, negative check.

## Versions

| Item | Version |
|---|---|
| `@uma/contracts-node` | 0.4.28 (artifacts under `dist/packages/core/artifacts/contracts/`) |
| solc of UMA artifacts | 0.8.16 (read from the CBOR metadata of the bytecode); pre-Shanghai, no PUSH0/MCOPY, so any later hardfork runs it |
| solc for `Probe.sol` | 0.8.28, evmVersion cancun, optimizer 200 |
| Hardhat / ethers / Node | 2.29.2 / 6.17.0 / 26.4.0 |
| Chain | Hardhat network, `hardfork: "osaka"`, chainId 31337, `gas: 16_000_000` (below the EIP-7825 2^24 cap) |

`OptimisticOracleV3` runtime is 17,837 bytes, under the 24,576-byte EIP-170 limit; no `allowUnlimitedContractSize` needed.
No artifact has library link references.

## Deployment steps (same order as UMA's `dev-quickstart-oov3/script/OracleSandbox.s.sol`)

1. `Finder()`
2. `Store({0}, {0}, address(0))` (no regular fees, timer 0 = block time)
3. `AddressWhitelist()`
4. `IdentifierWhitelist()`
5. `MockOracleAncillary(finder, address(0))`
6. `TestnetERC20("Default Bond Token", "DBT", 18)` (unless `currency` is passed)
7. `finder.changeImplementationAddress` for `Store`, `CollateralWhitelist` (= AddressWhitelist), `IdentifierWhitelist`, `Oracle` (= mock)
8. `addressWhitelist.addToWhitelist(currency)`, `identifierWhitelist.addSupportedIdentifier("ASSERT_TRUTH")`, `store.setFinalFee(currency, {finalFee})`
9. `OptimisticOracleV3(finder, currency, liveness)`, then `finder.changeImplementationAddress("OptimisticOracleV3", oo)`

Step 8 must come before step 9: the OOv3 constructor calls `syncUmaParams` and caches the whitelist status,
final fee and oracle address.

### Deviations from UMA's sandbox script

- Done in JS with ethers + Hardhat, not Foundry. The bytecode is the npm artifact, not a fresh compile.
- The sandbox sets `finalFee = minimumBond / 2`. `deployUma` takes `finalFee` directly, and the resulting
  `minimumBond` (`getMinimumBond`, `= finalFee * 1e18 / burnedBondPercentage = 2 x finalFee`) is returned.
- Optional extras the sandbox does not have: a custom `identifier` (whitelisted, then `oo.syncUmaParams`) and
  `currencyDecimals`.
- Same defaults otherwise: identifier `ASSERT_TRUTH`, the test uses finalFee 50e18, so minimumBond is 100e18 and liveness is 7200.

## What is real and what is mocked

- **Real UMA production code** (same contracts UMA deploys on mainnet, built with solc 0.8.16): `OptimisticOracleV3`, `Finder`, `Store`,
  `AddressWhitelist`, `IdentifierWhitelist`. Bond custody, dispute, fee burn to the Store, payout and callbacks are UMA's code.
- **UMA's mock**: `MockOracleAncillary` replaces the DVM (UMA token-holder vote). Anyone can call `pushPrice`,
  so the "vote" is whatever the test pushes. `TestnetERC20` is UMA's test token: anyone can mint with `allocateTo`.

## Measured (from `output/2026-11-21-run.txt`)

- `defaultIdentifier` = `ASSERT_TRUTH`, `burnedBondPercentage` = 0.5e18, final fee 50, `getMinimumBond` = 100.
- Split: the dispute fee is `burnedBondPercentage x bond`, which is **50% of the bond, not the final fee**. The two match only when
  bond = minimum bond.
  - TRUE, bond 100: Probe 1000 -> 800 after assert+dispute (OOv3 holds 200) -> 950 after settle (+150 = 2x100 - 50); Store +50.
  - FALSE, bond 200: Probe 950 -> 550 (OOv3 holds 400) -> 850 (+300 = 2x200 - 100); Store +100.
- Gas: full stack deploy 10,025,964 over 15 transactions (OOv3 alone 4,097,379; Store 2,099,879). Probe
  assert+dispute in one tx: 565,638 the first time and 514,350 after that. `pushPrice` 117,732 / 101,754. `settleAssertion` 184,250 / 108,260.
- Time: `deployUma` about 300 ms. The whole test (deploy + 2 disputed runs) takes about 450 ms in-process and about 370 ms over `hardhat node`.
  `npx hardhat test` takes about 0.7 s as a process.
- Negative check: `settleAssertion` before `pushPrice` reverts with no reason data (the mock's `getPrice` has a bare `require`).

## Requirements for a consumer contract

- Approve OOv3 for the bond (twice the bond if the same contract also disputes) in `currency`. The currency
  must be whitelisted and have a final fee, which `deployUma` takes care of.
- `bond >= oo.getMinimumBond(currency)`, and identifier = `oo.defaultIdentifier()` (`ASSERT_TRUTH`) or another whitelisted one.
- Implement `assertionResolvedCallback(bytes32,bool)` and `assertionDisputedCallback(bytes32)`, with
  `require(msg.sender == oo)`. OOv3 calls them on the `callbackRecipient`. If either one reverts, settle or dispute reverts too.
- Bonds and winnings go to the `asserter` and `disputer` addresses, not to the callback recipient (unless they are the same).
- Undisputed path: settle after `liveness` (use `evm_increaseTime`). It is not exercised here; the earlier fork experiment covered it.

## Limits

- The vote is a mock. There is no DVM, no voting period and no UMA token economics. `Store` fees just accumulate.
- No `Registry`, no escalation manager, no `OptimisticOracleV2`: only what OOv3 needs.
- `hardfork: "osaka"` is set on the chain. Probe itself is compiled for cancun. The team's contract can use whatever
  evmVersion its solc supports; UMA's 0.8.16 bytecode is unaffected.
