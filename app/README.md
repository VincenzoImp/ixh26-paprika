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
npm run deploy       # UMA + WETH9 + Paprika; writes ../contract/deployments/local.json and web/deployment.json
npm run web          # node server.js on 127.0.0.1:5173
npm run demo:cli     # node cli.js demo: the whole demo story with checks
npm run stop         # stops the default instance (8545); `npm run stop -- 8546` stops only the one on 8546
```

`npm start` also refuses a chain on its port that is already in use but holds no Paprika of this folder (block
number above 0): it never adds a second Paprika to someone else's chain. `npm start` refuses to run when its instance already runs (the chain already has this instance's Paprika, or the
web port is busy). It prints "Paprika is already running at ..." and changes nothing. `npm run deploy` also refuses
to deploy over a live deployment; `npm run deploy -- --force` replaces it (every open page then resets). If the web
server exits, `npm start` restarts it and keeps the chain. If the chain exits, everything stops: the chain lives in
memory, so its state is lost. `npm run stop` matches the port exactly (944 never stops 9445) and, for a non-default
port, deletes that instance's per-port files.

The chain lives in memory. A restart starts from block 0, so you must deploy again.

Ports: `RPC_PORT` (chain, default 8545) and `WEB_PORT` (UI, default 5173). Every script and the CLI read them, so
two instances can run side by side. Example: `RPC_PORT=8546 WEB_PORT=5174 npm start`, then
`RPC_PORT=8546 node cli.js demo`. `npm run stop` only stops the instance on its own `RPC_PORT`. The deployment JSON
carries `rpcUrl`, and `connect` uses it by default.

The page always loads `/deployment.json`. `npm start` and `npm run web` tell `server.js` which file that is, through
the environment variable `DEPLOYMENT_FILE` (an absolute path). `npm run deploy` writes that file for the current
`RPC_PORT`. You do not need to know its name. (Internally: `web/deployment.json` for port 8545, and
`web/deployment-<RPC_PORT>.json` for other ports; the same suffix applies to `../contract/deployments/` and
`.state/`.)

Host: the web server listens on 127.0.0.1. Set `HOST` (for example `HOST=0.0.0.0`) to open it to other machines.
The scripts then print a warning: the page relays JSON-RPC to a node whose accounts are unlocked.
Browsers allow WebCrypto and the camera only on `localhost` or over HTTPS, so the page does not work on a plain network
address. From another computer, use an SSH tunnel: `ssh -L 5173:127.0.0.1:5173 <this-machine>`, then open
`http://localhost:5173`.

## Tests

The browser tests use Playwright (a dev dependency). On a new machine, install its browser once:

```bash
npx playwright install chromium
```

| Command | What it does |
|---|---|
| `npm run e2e` | The whole demo story in the web app, checked against the chain at each step (168 checks) |
| `npm run e2e:edge` | Edge cases of the web app, the server and the scripts (15 checks) |
| `npm run screens` | One screenshot per state into `output/screens/` (set `OUT` to write elsewhere) |
| `npm run demo:cli` | The 13-step demo in the terminal, with checks. Needs a running, deployed chain |

Each browser test starts its own chain and web server on spare ports and stops them at the end.
`HEADED=1` shows the browser.

## Files

| File | What it is |
|---|---|
| `lib/device.js` | The device. Makes a P-256 key, exports and imports it (JWK), builds the three signed messages (register, capture, revoke) byte for byte as `Paprika.sol` hashes them, and signs with low-s. It uses only WebCrypto, so it runs in Node and in a browser. |
| `lib/paprika.js` | The chain client (ethers 6). One function per action: register, attest, verify, accuse (commit, reveal), UMA vote, refund, withdraw, wrap and unwrap WETH, revoke, advance time, balances, activity log. |
| `cli.js` | The command-line tool. `node cli.js help` lists the commands. |
| `scripts/chain.js` | `npm run chain`. |
| `scripts/deploy.js` | `npm run deploy`. Calls `../contract/scripts/deploy-local.js` and copies the JSON to `web/`. The header explains the defaults. |
| `scripts/web.js` | `npm run web`. |
| `scripts/start.js` | `npm start`. Chain in the background (log in `.state/chain.log`), wait for the RPC, deploy, web. |
| `scripts/stop.js` | `npm run stop`. |
| `scripts/common.js` | Paths, RPC probe, PID file. |
| `output/cli-demo.txt` | A saved `node cli.js demo` run. The demo writes it on port 8545 only, or where `CLI_DEMO_OUTPUT` says. |
| `.state/` | PIDs, and the CLI state in `.state/cli/<id>/` (device key, pending commitments with their salts), one folder per deployment fingerprint. The CLI never deletes or overwrites the state of another chain. Git-ignored. |

## Deploy parameters

Set them as environment variables for `npm run deploy` or `npm start`. Amounts are in whole WETH.

| Variable | Default | Meaning |
|---|---|---|
| `BOND` | 1 | `B`: the photo deposit and the accusation bond. Must be at least UMA's minimum bond (2 x `FINAL_FEE`). |
| `FINAL_FEE` | 0.5 | UMA Store final fee for WETH. |
| `PHASE_LENGTH` | 60 | Seconds of each UMA vote phase (commit, then reveal). UMA uses 86400 on mainnet. |
| `PHOTO_WINDOW` | 3600 | Challenge period in seconds: how long a photo can be accused. |
| `REVEAL_WINDOW` | 900 | Seconds between commit and reveal. |
| `LIVENESS` | 7200 | Seconds, passed to UMA. Every accusation is disputed at once, so it never runs out. |
| `STAKE` | 1000000 | UMA voting tokens staked by each voter. |
| `MAX_ROLLS` | 4294967295 | `VotingV2.maxRolls`. UMA deletes a vote request after this many rounds without a result. Every round skipped by a clock jump counts. The default (the uint32 maximum) means "never" in a demo. UMA uses 4 on mainnet. |

Why these values: one vote moves the chain clock forward by 2 to 4 phases, so at most 240 s. `REVEAL_WINDOW`
(900 s) is longer than three votes. A commitment made before a vote on another photo can still be revealed after
it. `PHOTO_WINDOW` (3600 s) is longer than about 15 votes. The accused photo does not lose time: the contract adds
the time it spent under accusation to its window.

## Role accounts

| Role | Hardhat account | Address |
|---|---|---|
| operator | 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Deploys. Calls `settleAssertion` after a vote. |
| photographer | 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`. Owns the device. Pays the deposits. |
| accuser | 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`. Pays the accusation bonds. |
| voters | 3, 4, 5 | `0x90F7...b906`, `0x15d3...6A65`, `0x9965...A4dc`. Hold and stake UMA voting tokens. Vote in `VotingV2`. |

The roles get no tokens at deployment. They hold Hardhat's test ETH (10,000 each). `attestPhoto` and
`commitAccusation` wrap exactly the missing ETH into WETH before they pay.

## CLI commands

```
node cli.js status                                   chain, contracts, parameters, device, balances
node cli.js register                                 new device key, registered for free
node cli.js attest <file>                            attest a photo (deposit B)
node cli.js verify <file>                            show the records of a photo
node cli.js accuse-commit <file> --evidence "<text>" commit an accusation (bond B); evidence is required
node cli.js accuse-reveal [#|file]                   reveal a pending commitment: UMA assertion + dispute
node cli.js vote <true|false> [assertionId]          real UMA vote by 3 voters (true = fake proven) + settle
node cli.js refund <file>                            refund the deposit after the challenge period
node cli.js withdraw <role>                          withdraw the role's credit (as WETH)
node cli.js unwrap <role> [amount]                   turn the role's WETH back into ETH
node cli.js revoke                                   revoke the device key
node cli.js forfeit [#]                              burn the bond of a commitment not revealed in time
node cli.js advance <seconds> [--force]              move the chain clock forward (refused while an accusation is open)
node cli.js balances                                 WETH balances, credits and ETH
node cli.js demo                                     the whole demo, with checks
```

Each command prints the transaction hashes and the money that moved. `RPC_PORT` (or `RPC_URL`) and `PAPRIKA_DEPLOYMENT`
(path of the deployment JSON; the CLI then uses its `rpcUrl` unless `RPC_PORT` or `RPC_URL` is set) override the
defaults. Several commitments can be pending at once: `status` lists them,
with chain times and the reveal deadline, and `accuse-reveal` names the one it reveals. An expired one can only be
forfeited (`forfeit`). `vote` takes the only open accusation; with several open it lists them and asks for an id.

## Library notes (`lib/paprika.js`)

- `connect({ rpcUrl, deployment })` is synchronous. Awaiting it is harmless.
- `createDevice`, `importDevice`, `exportDevice`, `sha256` and `device.sign` return promises (WebCrypto is async).
  `device.keyId`, `device.x` and `device.y` are `0x` hex strings.
- Money is **WETH** (`ctx.params.tokenSymbol` = "WETH"). `attestPhoto` and `commitAccusation` first wrap the
  missing ETH (`WETH9.deposit`), then approve, then pay; `txHashes` lists every transaction. `wrap(ctx, role, amount)`
  and `unwrap(ctx, role, amount?)` convert by hand.
- Payouts are **credits**. `refund` and the vote outcome add credit inside Paprika. WETH reaches a wallet only
  with `withdrawCredit(ctx, role)`.
- `umaVote(ctx, assertionId, fakeProven, { onPhase })` runs a real vote. The three voters commit, then reveal, then
  the operator settles. The chain clock jumps to each phase. `onPhase({ phase, roundId, txHashes, timestamp })` is
  called for `commit`, `reveal` and `settle`. It returns `{ txHashes, roundId, simulatedSeconds }` (7 transactions,
  2 to 4 phases of chain time). It takes well under a second of real time.
  It is safe to call twice for the same accusation (two tabs, or a tab and the CLI). If the accusation is already
  decided, it sends nothing and returns `{ status: "already-settled", fakeProven }`. If another vote is already
  running in this round, it throws an error with `code` = `VOTE_IN_PROGRESS` and a plain message. A second call in
the same page waits for the first and returns `already-settled`. Two pages that start at the very same moment can
spoil the round: then the error has `code` = `VOTE_INTERFERED` and the next call resolves it. A normal vote
  returns `status: "settled"` and `fakeProven`.
- `refund` works only after `refundableAt` (= `accusableUntil` + reveal period + 1 s), not after the challenge
  period alone. A rejected accusation extends `accusableUntil` by the time the accusation was open. Too early, it
  throws `too early: refundable at <time> (in N s of chain time)` before sending anything.
- The library checks before it spends. `attestPhoto` refuses an empty photo, an unregistered or flagged key, and a
  file this key already attested, before any wrap or approve. `commitAccusation` refuses empty evidence, a photo
  without a record, `this photo was refunded`, `this photo is already proven fake` and `the challenge period is over`.
  When another accusation is open on the photo, it commits anyway and returns `warning` (a string; else `null`).
- `advanceTime(ctx, seconds, { force })` refuses while an accusation is open. Vote first. A long jump would make UMA
  roll the vote request through many rounds. `{ force: true }` jumps anyway.
- `listAccusations(ctx)` returns every accusation from the chain events: `{ assertionId, photoHash, keyId, claimant,
  evidenceHash, openedAt, blockNumber, txHash, open, outcome }`, with `outcome` = `pending`, `fake-proven` or
  `rejected`. Use it to find an open accusation again after a reload.
- `commitmentStatus(ctx, commitment)` returns `{ exists, live, claimant, committedAt, committedBlock,
  revealDeadline, expired }` (chain seconds). `forfeitCommitment(ctx, role, commitment)` sends `forfeitCommit` for an
  expired commitment (anyone may); the bond goes to the burn address. It returns `{ txHash, burned }`.
- `deploymentFingerprint(ctx)` returns `"<chainId>:<paprika>:<hash of block 1>"` (or `...:no-contract`). A restarted
  chain or a new deployment gives a new value.
- `verifyPhoto` entries also carry `photoHash` and `recordedBeforeFlag`. `device.status` is `none`, `active` or
  `flagged`. `device.reason` is `none`, `fake-proven` or `key-revoked`.
- `revealAccusation` returns `{ txHash, assertionId, bondReturned, reason }`. When the photo is already proven fake,
  or another accusation is still open on it, no accusation opens: `assertionId` is the zero hash, `bondReturned` is
  true, `reason` is `already proven fake` or `another accusation is open`, and the bond is credited back.
- `balances` returns WETH amounts. It also returns `oo` (UMA's oracle, which holds both bonds during an
  accusation), `operator`, and `eth` = `{ operator, photographer, accuser }` ETH balances.
- Errors carry a plain message: the library's own check, or the contract's revert reason (for example `bad sig`).

## What is real

Nothing is mocked. Every contract runs on the local chain and comes from published code:

- **Paprika**, from `../contract`.
- **UMA's Optimistic Oracle V3** and its plumbing: Finder, Store, AddressWhitelist, IdentifierWhitelist, Registry.
- **UMA's voting system**: `VotingV2` and the UMA voting token. Voters stake, commit a hidden vote, then reveal it.
- **WETH9**, the bond currency. The roles wrap their test ETH.
- The P-256 signatures are checked by the chain's P-256 precompile (hardfork osaka).

What is specific to this demo:

- The voters are three demo accounts (3, 4, 5). They hold all the voting tokens, so they decide every vote. The
  CLI and the UI choose how they vote.
- Time is advanced on the local chain: for the vote phases, and with `advanceTime` for the challenge period.
- The device key is a software key, not a camera's secure chip.

## Tests

| Command | Where | What it checks |
|---|---|---|
| `npx hardhat test` | `../contract` | The contract with the real UMA contracts and WETH9 (9 cases). |
| `npm run demo:cli` | `app` | The whole demo story through the library, against a running chain (13 steps). |
| `npm run e2e` | `app` | The web demo story in Chromium. Starts and stops its own instance (8645/5273). |
| `npm run e2e:edge` | `app` | One check per edge case found in testing. Own instance (9445/5973). |
| `npm run screens` | `app` | Screenshots of every page state. |

The web suites need Playwright's browser once per machine: `npx playwright install chromium`.
