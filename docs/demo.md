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

With the scripts of the app (commands from [`app/package.json`](../app/package.json)):

```bash
cd contract && npm install && cd ..
cd app && npm install
npm start        # starts the chain, deploys the contracts, serves the web app
npm run stop     # stops what npm start started
```

TODO(command): confirm that `npm start` runs the chain, the deployment and the web server, and that `app/scripts/` contains `chain.js`, `deploy.js`, `web.js`, `start.js` and `stop.js`.

Step by step, in three terminals:

```bash
# terminal 1: the local chain (hardfork osaka, chain id 31337)
cd contract && npx hardhat node

# terminal 2: deploy UMA's contracts, the test token and Paprika; writes contract/deployments/local.json
cd contract && npm run deploy:local
cp contract/deployments/local.json app/web/deployment.json

# terminal 3: the web app on http://127.0.0.1:5173
cd app && node server.js
```

The deployment reads the parameters from environment variables: `BOND`, `FINAL_FEE`, `PHOTO_WINDOW`, `REVEAL_WINDOW`,
`LIVENESS` and `MINT`. The defaults are in the header of [`contract/scripts/deploy-local.js`](../contract/scripts/deploy-local.js).

The same sequence also runs in the terminal, with no browser:

```bash
cd app && npm run demo:cli
```

TODO(command): confirm `npm run demo:cli` once `app/cli.js` is in the repository.

## Roles in the demo

| Role | Account | Does |
|---|---|---|
| Operator | Hardhat account 0 | Deploys the contracts. Enters the simulated vote |
| Photographer | Hardhat account 1 | Registers the device, attests, refunds, revokes |
| Accuser | Hardhat account 2 | Commits and reveals accusations |

## Click path

TODO(command): check the button labels below against the final web app.

| Step | Click | What to show |
|---|---|---|
| 1 | Device → Register | The device signs a proof of possession. Registration is free. No manufacturer or authority approves the key |
| 2 | Capture → Take photo, sign and submit | The device reads a recent block hash first, then signs photo hash and block hash. The photographer's balance drops by `B`. The record shows blocks `a` and `r` |
| 3 | Verify this photo | State Attested, deposit locked, challenge period open. Read the sentence: "a registered key signed this exact file between block `a` and block `r`, with a deposit at stake" |
| 4 | Verify → One pixel changed | No record: the photo hash differs |
| 5 | Accuse → Commit | Only a hash goes on the chain, with bond `B`. Nobody can tell which photo is accused |
| 6 | Accuse → Reveal | The contract asserts the accusation at UMA's OOv3 and disputes it at once with the deposit. Every accusation goes to a vote |
| 7 | Vote → "Evidence does not prove it" | Simulated vote. Accuser `−B`. Depositor `+B − f × B`. UMA's Store `+f × B`. The challenge period is extended |
| 8 | Advance time by one challenge period → Deposits → Refund | Demo control on the local chain. The refund succeeds. The record stays, as Refunded |
| 9 | Activity log | Each step is a transaction with a hash on the local chain |

Optional steps:

| Step | Click | What to show |
|---|---|---|
| A | Accuse a second photo → Vote → "Evidence proves the fake" | Accuser `+B − f × B`. Record Fake. Device Flagged (FakeProven). Its other records stay listed, with `recordedBeforeFlag` |
| B | Revoke key (on a device that is still Active) | Device Flagged (KeyRevoked). No money moves. A new capture from that key fails |

Say plainly during the demo: the device key is software, and the UMA vote is simulated by entering its outcome.
The contracts, the signatures, the deposits and the payouts are real, on a local chain.
