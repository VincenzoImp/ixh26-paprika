# Paprika: the demo

The demo runs the whole protocol on a local Ethereum chain, with UMA's contracts deployed on the same chain.
Terms and symbols are defined in [protocol.md](protocol.md).

## What is real and what is simulated

| Part | Real or simulated | Detail |
|---|---|---|
| Paprika contract | Real | [`Paprika.sol`](../contract/contracts/Paprika.sol), deployed unchanged |
| UMA Optimistic Oracle V3, Finder, Store, AddressWhitelist, IdentifierWhitelist | Real | UMA's compiled contracts from the npm package `@uma/contracts-node`, deployed by [`contract/lib/deploy-uma.js`](../contract/lib/deploy-uma.js). Nothing from UMA is recompiled |
| Bond custody, dispute, fee to UMA's Store, payouts, callbacks | Real | UMA's own code does this. The measured split is `2 × B − f × B` to the winner and `f × B` to the Store |
| P-256 signatures | Real | The device library signs with WebCrypto. The chain checks with its P-256 precompile (Hardhat, hardfork `osaka`) |
| Photo hash | Real | SHA-256 of the file bytes |
| Tokens, deposits, bonds, credits | Real transfers | The token is UMA's test token `TestnetERC20`. Anyone can mint it. It has no value |
| The device | Simulated | A software key in the browser or in Node. No camera sensor and no secure hardware |
| UMA token-holder vote | Simulated | UMA's `MockOracleAncillary` replaces the vote. The operator enters the outcome with `pushPrice`, then calls `settleAssertion` |
| The passage of time | Simulated | The demo moves the chain clock with `evm_increaseTime`, so the challenge period ends in seconds |
| The chain | Local | One Hardhat node, chain id 31337. Accounts are Hardhat's default test accounts. No real network is used |

## Requirements

- Node.js 26 or later.
- An internet connection for the first `npm install` and the first compiler download.

## Run the contract tests

```bash
cd contract
npm install
npx hardhat test
```

The tests run Paprika against UMA's contracts on an in-process chain. They print one `CASE` line per case.
The case table with measured values is [`contract/output/cases.md`](../contract/output/cases.md).

## Start the demo

One command starts everything (scripts in [`app/scripts/`](../app/scripts/), listed in [`app/package.json`](../app/package.json)):

```bash
cd app
npm install
npm start        # local chain, deployment of UMA's contracts, the test token and Paprika, web app
                 # prints http://127.0.0.1:5173/ ; Ctrl-C stops everything
```

`npm start` installs the dependencies of `contract/` if they are missing.
It starts the Hardhat node in the background, waits for it, deploys, copies the deployment JSON into `app/web/`,
and serves the web app.

Step by step, in separate terminals, from `app/`:

```bash
npm run chain        # Hardhat node of contract/ on 127.0.0.1:8545 (hardfork osaka, chain id 31337)
npm run deploy       # writes contract/deployments/local.json and app/web/deployment.json
npm run web          # the web app on http://127.0.0.1:5173
npm run stop         # stops a chain or web server left running
```

The chain lives in memory. After a restart it starts from block 0, so deploy again.

The deployment reads the parameters from environment variables: `BOND`, `FINAL_FEE`, `PHOTO_WINDOW`, `REVEAL_WINDOW`,
`LIVENESS` and `MINT`. [`app/README.md`](../app/README.md) lists them with their defaults.

### The demo in a terminal

With the chain running and the contracts deployed:

```bash
cd app
npm run demo:cli     # same as: node cli.js demo
```

It runs every step of the click path below, checks each result and exits with code 1 on any mismatch.
The last run is in [`app/output/cli-demo.txt`](../app/output/cli-demo.txt).
`node cli.js help` lists the single-step commands (`register`, `attest <file>`, `verify <file>`, `accuse-commit`,
`accuse-reveal`, `vote <true|false>`, `refund <file>`, `withdraw <role>`, `revoke`, `advance <seconds>`, `balances`).

## Roles in the demo

| Role | Account | Does |
|---|---|---|
| Operator | Hardhat account 0 | Deploys the contracts. Enters the simulated vote |
| Photographer | Hardhat account 1 | Registers the device, attests, refunds, revokes |
| Accuser | Hardhat account 2 | Commits and reveals accusations |

## Click path

The web app has six tabs: Device, Capture, Verify, Accuse, Deposits and Revoke key.
The header shows the chain, the contract addresses, the parameters read from the contract
(`B`, `T_photo`, `T_reveal`, `f`) and the token balances of the photographer, the accuser and UMA's Store.
An activity log lists every transaction of the session.

| Step | Click | What to show |
|---|---|---|
| 1 | Device → "1 · Generate key" → "2 · Register (free)" | The device signs a proof of possession. Registration is free. No manufacturer or authority approves the key |
| 2 | Capture → "Take photo" (or "Use a sample image") → "Sign & submit this photo" | The device reads a recent block hash first, then signs photo hash and block hash. The photographer's balance drops by `B`. The record shows blocks `a` and `r` |
| 3 | "Verify this photo →" | State Attested, deposit locked, challenge period open. Read the sentence: "a registered key signed this exact file between block `a` and block `r`, with a deposit at stake" |
| 4 | Verify → "Change one pixel and verify again" | No record: the photo hash differs |
| 5 | Accuse → enter evidence → "1 · Commit (lock B)" | Only a hash goes on the chain, with bond `B`. Nobody can tell which photo is accused |
| 6 | "2 · Reveal" | The contract asserts the accusation at UMA's OOv3 and disputes it at once with the deposit. Every accusation goes to a vote |
| 7 | "Evidence does not prove it" | Simulated vote, then settlement. Accuser `−B`. Depositor `+B − f × B`. UMA's Store `+f × B`. The challenge period is extended |
| 8 | "Advance time by one challenge period" → Deposits → Refund | Demo control on the local chain: the clock moves past `accusableUntil + T_reveal`. The refund succeeds. The record stays, as Refunded |
| 9 | Activity log | Each step is a transaction with a hash on the local chain |

Optional steps:

| Step | Click | What to show |
|---|---|---|
| A | Accuse another photo → "Evidence proves the fake" | Accuser `+B − f × B`. Record Fake. Device Flagged (FakeProven). Its other records stay listed, with `recordedBeforeFlag` |
| B | Revoke key → "Revoke key" (on a device that is still Active) | Device Flagged (KeyRevoked). No money moves. A new capture from that key fails |

Credits reach a wallet only with "Withdraw credit" (Accuse or Deposits tab).

Say plainly during the demo: the device key is software, and the UMA vote is simulated by entering its outcome.
The contracts, the signatures, the deposits and the payouts are real, on a local chain.
