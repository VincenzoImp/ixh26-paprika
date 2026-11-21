# Paprika contract

This folder holds the Paprika contract, its tests and the scripts that deploy it with UMA's contracts on a
local chain. The protocol is described in [`../docs/protocol.md`](../docs/protocol.md).

## Files

| File | What it is |
|---|---|
| [`contracts/Paprika.sol`](contracts/Paprika.sol) | The contract: register, attest, refund, commit and reveal an accusation, UMA callbacks, key revocation, credits, verify. No owner, no administrator, no upgrade |
| [`lib/deploy-uma-dvm.js`](lib/deploy-uma-dvm.js) | Deploys UMA's contracts from the compiled artifacts in the npm package `@uma/contracts-node`: the Optimistic Oracle V3, the voting contract `VotingV2` with the UMA voting token, and the bond currency (`WETH9`). Mints and stakes voting tokens for the voters |
| [`lib/vote.js`](lib/vote.js) | Runs a real UMA vote on a disputed assertion: the voters commit, then reveal, then `settleAssertion`. Moves the local chain clock to each phase |
| [`scripts/deploy-local.js`](scripts/deploy-local.js) | Deploys UMA's contracts, `WETH9` and Paprika on a running local node. Voters: accounts 3, 4, 5. Writes `deployments/local.json` with addresses, parameters, accounts, RPC URL and ABIs |
| [`test/paprika.integration.test.js`](test/paprika.integration.test.js) | 8 tests against the real contracts: honest path, one pixel changed, true and false accusation, second accusation, self-accusation, key revocation, signatures and replay |
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
the measured value. After every test the suite checks that the WETH held by Paprika equals the open deposits, plus
the unrevealed bonds, plus the credits. Every accusation is decided by a real vote in UMA's `VotingV2`. The vote
phases last 60 s; `PHASE_LENGTH=86400 npx hardhat test` uses UMA's mainnet value.

## Deploy on a local chain

```bash
npx hardhat node                 # terminal 1: local chain, chain id 31337, hardfork osaka
npm run deploy:local             # terminal 2: writes deployments/local.json
```

The deployment reads the parameters from environment variables: `BOND`, `FINAL_FEE`, `PHASE_LENGTH`, `PHOTO_WINDOW`,
`REVEAL_WINDOW`, `LIVENESS` and `STAKE`. The header of `scripts/deploy-local.js` lists their defaults and explains
them. To use another port, start the node with `--port 8546` and deploy with `RPC_PORT=8546`. The file is then
`deployments/local-8546.json`.
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
- UMA's vote (commit, reveal, settle in `VotingV2`) decides each accusation, and UMA pays as described.

The known limits found by the tests are listed at the end of [`output/cases.md`](output/cases.md) and in
[`../docs/limits.md`](../docs/limits.md).

## What is real

Nothing is mocked. Every contract is deployed on the local chain from published code.

| Part | Origin |
|---|---|
| `Paprika` | This folder |
| `OptimisticOracleV3`, `Finder`, `Store`, `AddressWhitelist`, `IdentifierWhitelist`, `Registry` | UMA's production contracts, from `@uma/contracts-node`, compiled by UMA with solc 0.8.16 |
| `VotingV2`, `VotingToken`, `FixedSlashSlashingLibrary` | UMA's voting system (the DVM), from the same package. Voters stake the voting token, commit and reveal |
| `WETH9` | The bond currency, UMA's copy of WETH9. Accounts wrap their test ETH |

What differs from mainnet: the voters are three local accounts that hold all the voting tokens, so they decide every
vote. The deployer holds the roles that UMA's governor holds on mainnet. Time is moved forward on the local chain
to reach each vote phase. The tests do not show that UMA's voters decide well, or that a signature comes from a
camera. In the tests and the demo, device keys are software keys made at run time.
