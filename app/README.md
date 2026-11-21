# Paprika app: library, CLI and start scripts

This folder runs the Paprika demo on a local Ethereum chain. It has a JavaScript library, a command-line
tool and the scripts that start everything. The web UI (`web/`, `server.js`) is built on top of the library.

Local chain only. The code uses no private keys. Hardhat's node holds the keys of its default test accounts
and signs for them. Device keys are made at run time.

## Quick start

```bash
cd app
npm install
npm start            # chain + deploy + web UI; prints http://127.0.0.1:5173/ ; Ctrl-C stops everything
```

Or step by step, in separate terminals:

```bash
npm run chain        # Hardhat node of ../contract on 127.0.0.1:8545 (hardfork osaka, chainId 31337)
npm run deploy       # UMA + token + Paprika; writes ../contract/deployments/local.json and web/deployment.json
npm run web          # node server.js on 127.0.0.1:5173
npm run demo:cli     # node cli.js demo: the whole demo story with checks
npm run stop         # kills leftover chain / web processes
```

The chain lives in memory. A restart starts from block 0, so you must deploy again.

## Files

| File | What it is |
|---|---|
| `lib/device.js` | The device. Makes a P-256 key, exports and imports it (JWK), builds the three signed messages (register, capture, revoke) byte for byte as `Paprika.sol` hashes them, and signs with low-s. It uses only WebCrypto, so it runs in Node and in a browser. |
| `lib/paprika.js` | The chain client (ethers 6). One function per action: register, attest, verify, accuse (commit, reveal), simulated UMA vote, refund, withdraw, revoke, advance time, balances, activity log. |
| `cli.js` | The command-line tool. `node cli.js help` lists the commands. |
| `scripts/chain.js` | `npm run chain`. |
| `scripts/deploy.js` | `npm run deploy`. Calls `../contract/scripts/deploy-local.js` and copies the JSON to `web/`. |
| `scripts/web.js` | `npm run web`. |
| `scripts/start.js` | `npm start`. Chain in the background (log in `.state/chain.log`), wait for the RPC, deploy, web. |
| `scripts/stop.js` | `npm run stop`. |
| `scripts/common.js` | Paths, RPC probe, PID file. |
| `output/cli-demo.txt` | Output of the last `node cli.js demo` run. |
| `.state/` | CLI state (device key, last commitment and salt, last assertion id) and PIDs. Git-ignored. |

## Deploy parameters

Set them as environment variables for `npm run deploy` or `npm start`. Token amounts are whole tokens.

| Variable | Default | Meaning |
|---|---|---|
| `BOND` | 100 | `B`: the photo deposit and the accusation bond. Must be at least UMA's minimum bond (2 x `FINAL_FEE`). |
| `FINAL_FEE` | 50 | UMA Store final fee for the token. |
| `PHOTO_WINDOW` | 3600 | Challenge period in seconds: how long a photo can be accused. |
| `REVEAL_WINDOW` | 600 | Seconds between commit and reveal. |
| `LIVENESS` | 7200 | Seconds, passed to UMA. Every accusation is disputed at once, so it never runs out. |
| `MINT` | 10000 | Test tokens minted to each of the first 5 Hardhat accounts. |

## Role accounts

| Role | Hardhat account | Address |
|---|---|---|
| operator | 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Deploys. Sends the simulated UMA vote. |
| photographer | 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`. Owns the device. Pays the deposits. |
| accuser | 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`. Pays the accusation bonds. |

## CLI commands

```
node cli.js status                                   chain, contracts, parameters, device, balances
node cli.js register                                 new device key, registered for free
node cli.js attest <file>                            attest a photo (deposit B)
node cli.js verify <file>                            show the records of a photo
node cli.js accuse-commit <file> --evidence "<text>" commit an accusation (bond B)
node cli.js accuse-reveal                            reveal it: UMA assertion + dispute
node cli.js vote <true|false>                        simulated UMA vote (true = fake proven) + settle
node cli.js refund <file>                            refund the deposit after the challenge period
node cli.js withdraw <role>                          withdraw the role's credit
node cli.js revoke                                   revoke the device key
node cli.js advance <seconds>                        move the chain clock forward
node cli.js balances                                 token balances and credits
node cli.js demo                                     the whole demo, with checks
```

Each command prints the transaction hashes and the money that moved. `RPC_URL` and `PAPRIKA_DEPLOYMENT`
(path of the deployment JSON) override the defaults.

## Library notes (`lib/paprika.js`)

- `connect({ rpcUrl, deployment })` is synchronous. Awaiting it is harmless.
- `createDevice`, `importDevice`, `exportDevice`, `sha256` and `device.sign` return promises (WebCrypto is async).
  `device.keyId`, `device.x` and `device.y` are `0x` hex strings.
- Payouts are **credits**. `refund` and the vote outcome add credit inside Paprika. Tokens reach a wallet only
  with `withdrawCredit(ctx, role)`.
- `refund` works only after `refundableAt` (= `accusableUntil` + reveal period + 1 s), not after the challenge
  period alone. A rejected accusation extends `accusableUntil` by the time the accusation was open.
- `verifyPhoto` entries also carry `photoHash` and `recordedBeforeFlag`. `device.status` is `none`, `active` or
  `flagged`. `device.reason` is `none`, `fake-proven` or `key-revoked`.
- `revealAccusation` returns `assertionId` = zero hash if the photo was already proven fake. The bond is then
  credited back.
- `balances` also returns `oo` (UMA's oracle, which holds both bonds during an accusation) and `operator`.
- Errors carry the contract's revert reason as the message, for example `too early`, `not active`, `bad sig`.

## What is real and what is simulated

- **Real:** the Paprika contract, UMA's Optimistic Oracle V3, Finder, Store, AddressWhitelist and
  IdentifierWhitelist (UMA's published bytecode from `@uma/contracts-node`). The P-256 signatures, checked by
  the chain's P-256 precompile (hardfork osaka). Deposits, bonds, UMA's fee and all payouts.
- **Simulated:**
  - The UMA vote. UMA's `MockOracleAncillary` replaces the token-holder vote. `umaVote` pushes the result with
    `pushPrice` (1e18 = fake proven, 0 = rejected), then calls `settleAssertion`.
  - The device key. It is a software key, not a camera's secure chip.
  - The token. It is UMA's `TestnetERC20`: anyone can mint it.
  - Time. `advanceTime` moves the local chain clock.
