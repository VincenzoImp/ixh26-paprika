# Paprika contract

This folder holds the Paprika contract, its tests and the scripts that deploy it with UMA's contracts on a
local chain. The protocol is described in [`../docs/protocol.md`](../docs/protocol.md).

## Files

| File | What it is |
|---|---|
| [`contracts/Paprika.sol`](contracts/Paprika.sol) | The contract: register, attest, refund, commit and reveal an accusation, UMA callbacks, key revocation, credits, verify. No owner, no administrator, no upgrade |
| [`contracts/test/MockOptimisticOracleV3.sol`](contracts/test/MockOptimisticOracleV3.sol) | Test only. A stand-in for UMA's Optimistic Oracle V3 with the same interface and the same payouts on the disputed path. Any account can set the vote result |
| [`contracts/test/TestToken.sol`](contracts/test/TestToken.sol) | Test only. An ERC-20 token with public mint. It can block transfers to an address, to test a depositor that cannot receive tokens |
| [`lib/deploy-uma.js`](lib/deploy-uma.js) | Deploys UMA's contracts from the compiled artifacts in the npm package `@uma/contracts-node`, in the order of UMA's own sandbox script |
| [`lib/resolve.js`](lib/resolve.js) | Enters a vote result on UMA's `MockOracleAncillary` for a disputed assertion, then calls `settleAssertion` |
| [`scripts/deploy-local.js`](scripts/deploy-local.js) | Deploys UMA's contracts, UMA's test token and Paprika on a running local node. Mints test tokens. Writes `deployments/local.json` with addresses, parameters and ABIs |
| [`test/paprika.integration.test.js`](test/paprika.integration.test.js) | 8 tests against UMA's contracts |
| [`test/paprika.test.js`](test/paprika.test.js) | 19 tests against the stand-in oracle: every case and attack, one per test |
| [`output/cases.md`](output/cases.md) | The table of cases, with formulas and measured values, and gas per function |
| [`output/2026-11-21-run.txt`](output/2026-11-21-run.txt) | The raw output of the last test run |
| [`hardhat.config.js`](hardhat.config.js) | Solidity 0.8.28 with the optimizer. The local chain uses hardfork `osaka`, which provides the P-256 precompile |

## Run the tests

Requirements: Node.js 26 or later, and an internet connection for the first install and compiler download.

```bash
cd contract
npm install
npx hardhat test
```

Each test prints one `CASE` line: what happened, then the money that moved, as a formula of `BOND` and the fee and as
the measured value. After every test the suite checks that the tokens held by Paprika equal the open deposits, plus
the unrevealed bonds, plus the credits.

## Deploy on a local chain

```bash
npx hardhat node                 # terminal 1: local chain, chain id 31337, hardfork osaka
npm run deploy:local             # terminal 2: writes deployments/local.json
```

The deployment reads the parameters from environment variables: `BOND`, `FINAL_FEE`, `PHOTO_WINDOW`, `REVEAL_WINDOW`,
`LIVENESS` and `MINT`. The header of `scripts/deploy-local.js` lists their defaults.
The demo app runs these steps for you: see [`../docs/demo.md`](../docs/demo.md).

## What the tests show

- The normal path works: register, attest, verify, refund after the challenge period.
- A changed file has no record.
- A proven accusation pays the accuser `2 × BOND − fee`, marks the record Fake and flags the device.
- A rejected accusation pays the depositor `BOND − fee`, keeps the deposit and extends the challenge period.
- Self-accusation costs the forger the fee. Repeated false accusations cost `BOND` each and delay the refund.
- Copies of pending transactions do not take over a record, a registration or an accusation.
- Invalid signatures, replays, stale or future anchor blocks and invalid accusations are rejected.
- The contract has no administrator function and accepts no ETH. UMA's callbacks are accepted only from the oracle.
- A depositor that cannot receive tokens blocks nobody else.
- UMA's contracts pay exactly as the stand-in oracle does.

The known limits found by the tests are listed at the end of [`output/cases.md`](output/cases.md) and in
[`../docs/limits.md`](../docs/limits.md).

## What is UMA's code and what stands in for UMA's vote

| Part | Origin |
|---|---|
| `OptimisticOracleV3`, `Finder`, `Store`, `AddressWhitelist`, `IdentifierWhitelist` | UMA's production contracts, from `@uma/contracts-node`, compiled by UMA with solc 0.8.16. Bond custody, dispute, fee, payout and callbacks are UMA's code |
| `MockOracleAncillary` | UMA's own test contract. It replaces the token-holder vote: any account enters the result with `pushPrice` |
| `TestnetERC20` | UMA's test token. Anyone can mint it |
| `MockOptimisticOracleV3`, `TestToken` | Ours, for the 19 scenario tests only. Not used by the deployment or the demo |

The tests do not show that UMA's vote decides well, or that a signature comes from a camera.
In the tests and the demo, device keys are software keys made at run time.
