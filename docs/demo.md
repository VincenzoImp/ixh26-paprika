# Paprika: the demo

The demo runs the whole protocol on a local Ethereum chain. Every contract on that chain comes from published code.
Terms and symbols are defined in [protocol.md](protocol.md).

## What runs

| Part | What it is |
|---|---|
| Paprika | [`Paprika.sol`](../contract/contracts/Paprika.sol), deployed unchanged |
| UMA's Optimistic Oracle V3 | `OptimisticOracleV3`, `Finder`, `Store`, `AddressWhitelist`, `IdentifierWhitelist`, `Registry`: UMA's compiled contracts from the npm package `@uma/contracts-node`. Nothing from UMA is recompiled |
| UMA's vote | `VotingV2` and the UMA voting token, from the same package. Voters stake the voting token, commit a hidden vote, then reveal it. Then any account calls `settleAssertion` |
| Money | WETH (wrapped ETH, an ERC-20 token): UMA's copy of `WETH9`. The accounts hold ETH and wrap it when they pay a deposit or a bond. They unwrap it after a withdrawal |
| Payouts | UMA's own code holds the bond and the deposit, pays `2 × B − f × B` to the winner and sends `f × B` to UMA's Store |
| Signatures | The device library signs with WebCrypto. The chain checks with its P-256 precompile (Hardhat, hardfork `osaka`) |
| Photo hash | SHA-256 of the file bytes |

[`contract/lib/deploy-uma-dvm.js`](../contract/lib/deploy-uma-dvm.js) deploys UMA's contracts.
[`contract/lib/vote.js`](../contract/lib/vote.js) runs a vote.

## What is not like a public network

- **The voters are our demo accounts.** Three accounts (Hardhat accounts 3, 4 and 5) hold and stake all the voting
  tokens. So they decide every vote. The person who runs the demo chooses how they vote.
- **Time is advanced by hand.** The local chain moves its clock forward to reach each vote phase and the end of the
  challenge period. A vote phase lasts `PHASE_LENGTH` seconds; on a real network UMA returns results
  ["within 48-72 hours"](https://docs.uma.xyz/developers/resolving-disputes).
- **The device key is a software key**, in the browser or in Node. No camera sensor and no secure hardware are involved.
- **The chain is one local Hardhat node**, chain id 31337. The ETH is Hardhat's test ETH and has no value.
  The deployer holds the roles that UMA's governance holds on a public network.

## Requirements

- Node.js 26 or later.
- An internet connection for the first `npm install` and the first compiler download.

## Run the contract tests

```bash
cd contract
npm install
npx hardhat test
```

The tests run Paprika with UMA's oracle and UMA's vote on an in-process chain. They print one `CASE` line per case.
The case table with measured values is [`contract/output/cases.md`](../contract/output/cases.md).

## Start the demo

One command starts everything (scripts in [`app/scripts/`](../app/scripts/), listed in [`app/package.json`](../app/package.json)):

```bash
cd app
npm install
npm start        # local chain, deployment of UMA's contracts, WETH9 and Paprika, web app
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

The deployment reads the parameters from environment variables: `BOND`, `FINAL_FEE`, `PHASE_LENGTH`, `PHOTO_WINDOW`,
`REVEAL_WINDOW`, `LIVENESS`, `STAKE` and `MAX_ROLLS`. [`app/README.md`](../app/README.md) lists them with their defaults.
`MAX_ROLLS` is the number of voting rounds after which UMA deletes an unresolved vote request. Its default is the
largest possible value, so a jump of the local clock never deletes a request.
`RPC_PORT` and `WEB_PORT` change the ports, so two instances can run side by side.

### Run the demo from another computer

The web app serves the page, the library, the deployment JSON and a JSON-RPC relay to the local chain (`/rpc`)
on one port. So another computer needs only that port.

The page must be opened on `localhost` (or over HTTPS). Browsers allow WebCrypto, which makes the device key and the
SHA-256, and the camera only there. On a plain network address the page shows an error and does not work.

From a computer on the same private network, for example a Mac, open an SSH tunnel, then open `http://localhost:5173`:

```bash
ssh -L 5173:127.0.0.1:5173 <this-machine>
```

The server listens on `127.0.0.1` by default, and the tunnel needs nothing more. `HOST` changes the address it listens
on. Do not expose it: anyone who reaches `/rpc` can act as any demo account. `npm start` and `npm run web` print a
warning when `HOST` is not a local address.

### The demo in a terminal

With the chain running and the contracts deployed:

```bash
cd app
npm run demo:cli     # same as: node cli.js demo
```

It runs the 13 steps below, checks each result and exits with code 1 on any mismatch.
On the default port it saves its output to [`app/output/cli-demo.txt`](../app/output/cli-demo.txt).

| Step | What it does |
|---|---|
| 0 | Wallets: the roles hold ETH; WETH is wrapped when a payment needs it |
| 1 | Device: register the key, free |
| 2 | Capture: sign and attest a photo, deposit `B` |
| 3 | Verify the photo |
| 4 | One pixel changed: no record |
| 5 | Accuse: commit, bond `B`; only a hash goes on the chain |
| 6 | Reveal: assertion at UMA, disputed at once |
| 7 | UMA vote "evidence does not prove it": commit phase, reveal phase, settle |
| 8 | Advance time past the challenge period, then refund |
| 9 | Activity log: every transaction with its block and hash |
| 10 | Optional: a second photo, UMA vote "evidence proves the fake" |
| 11 | Optional: revoke the key; no money moves |
| 12 | Unwrap: WETH back to ETH |

`node cli.js help` lists the single-step commands (`register`, `attest <file>`, `verify <file>`, `accuse-commit`,
`accuse-reveal`, `vote <true|false>`, `refund <file>`, `withdraw <role>`, `unwrap <role>`, `revoke`, `forfeit`,
`advance <seconds>`, `balances`).

## Checks before any money moves

The library (used by the web app and the command-line tool) checks the chain before it wraps ETH or sends a payment.

| Action | Refused before any transaction | What happens instead |
|---|---|---|
| Attest | An empty photo; a key that is not registered or is flagged; a file that this key already attested | A clear message. No ETH is wrapped |
| Commit an accusation | Empty evidence; a photo with no record; a refunded photo; a photo already proven fake; a challenge period that is over | A clear message. No bond is locked |
| Reveal while another accusation is open on the same photo | Not refused: the reveal is sent | The contract opens no accusation and credits the bond back |
| Advance time (web button "Demo: skip to end of challenge + reveal period", `node cli.js advance`) | While an accusation is open | Vote first. The web button is disabled with the reason. `node cli.js advance <seconds> --force` jumps anyway |

Advance time is refused during an open accusation because a long clock jump makes UMA roll the vote request through
many voting rounds. On a public network, too many rolls make UMA delete the request (see [limits.md](limits.md)).

## Roles in the demo

| Role | Account | Does |
|---|---|---|
| Operator | Hardhat account 0 | Deploys the contracts. Calls `settleAssertion` after a vote |
| Photographer | Hardhat account 1 | Registers the device, attests, refunds, revokes |
| Accuser | Hardhat account 2 | Commits and reveals accusations |
| Voters | Hardhat accounts 3, 4, 5 | Stake UMA voting tokens. Commit and reveal votes in `VotingV2` |

## Click path

The web app has three tabs, one per actor: Photographer, Verifier and Accuser.
The header shows the parameters read from the contract (`B`, `T_photo`, `T_reveal`, `f`) and the WETH balances.
"What just happened" explains the last action. The Timeline lists the transactions made since the page was loaded.
The labels below are the labels on the page.

| Step | Tab and click | What to show |
|---|---|---|
| 1 | Photographer → "Register the device key" | The device signs a proof of possession. Registration is free. No manufacturer or authority approves the key |
| 2 | Photographer → "Start camera" → "Take a selfie" (or "use a sample image") → "Sign & attest (locks `B`)" | The device reads a recent block hash first, then signs photo hash and block hash. ETH is wrapped into WETH and `B` is locked. The record shows blocks `a` and `r` |
| 3 | Verifier → "Last attested photo" | "Signed and staked · open to challenge". Read the sentence on the page: "a registered device signed this exact file between block `a` and block `r`, and a deposit was at stake" |
| 4 | Verifier → "Change one pixel and verify again" | No record: the photo hash differs |
| 5 | Accuser → enter the evidence → "Commit (lock bond B)" | Only a hash goes on the chain, with bond `B`. Nobody can tell which photo is accused |
| 6 | Accuser → "Reveal and send to UMA" | The contract asserts the accusation at UMA's OOv3 and disputes it at once with the deposit. Every accusation goes to a vote |
| 7 | Accuser → "Voters say NOT PROVEN" | The three voters commit, then reveal; then the assertion is settled. The page shows each phase. Accuser `−B`. Photographer `+B − f × B`. UMA fee `+f × B`. The challenge period is extended |
| 8 | Photographer → "Demo: skip to end of challenge + reveal period" → My photos → "Refund" | The local clock moves past `accusableUntil + T_reveal`. The refund succeeds. The record stays |
| 9 | Verifier → "Last attested photo" | "Signed · … · deposit returned": nobody proved it fake within the challenge period. This is not proof that it is real |
| 10 | Timeline | Each step is a transaction with a hash on the local chain |

Optional steps:

| Step | Tab and click | What to show |
|---|---|---|
| A | Photographer: attest another photo. Accuser: "Commit (lock bond B)" → "Reveal and send to UMA" → "Voters say FAKE (evidence proves it)" → Verifier | Accuser `+B − f × B`. Record "Proven fake". The key is flagged. Its other records show "Not judged · its key is flagged" |
| B | Photographer → "Revoke this device key" (on a key that is still Active; a flagged key cannot be revoked) | Key flagged (revoked). No money moves. A new attest from that key is refused |

Credits reach a wallet only with "Withdraw credit" (Photographer) or "Withdraw (Accuser)".

Say plainly during the demo: the voters are our demo accounts, time is advanced by hand on the local chain, and the
device key is a software key. The contracts, the signatures, the vote, the deposits and the payouts are real
transactions on a local chain.

## How it was tested

| Test | What it covers | Result | Command |
|---|---|---|---|
| Contract integration tests | Paprika with UMA's oracle, UMA's vote and WETH: every case in [`contract/output/cases.md`](../contract/output/cases.md) | 9 tests pass | `cd contract && npx hardhat test` |
| End-to-end browser test | The whole demo story in the web app, with header amounts and states compared with the chain at each step | 168 checks pass | `cd app && npm run e2e` |
| Edge-case browser test | A second accusation on an accused photo, simultaneous votes, a reveal at its deadline, downloads, dropped files, narrow windows, a revoked key after its challenge period, a second `npm start`, the `/rpc` relay, `npm run stop` on another port | 15 checks pass | `cd app && npm run e2e:edge` |
| Command-line demo | The 13 steps above, with checks | 13 steps pass | `cd app && npm run demo:cli` |
| Screens | One screenshot per state, in [`app/output/screens/`](../app/output/screens/) | All states as expected | `cd app && npm run screens` |

The browser tests use Playwright. A new machine needs `npx playwright install chromium` once, in `app/`.
Each browser test starts its own chain and web server on spare ports, and stops them at the end.

Two independent staging runs and one acceptance run from a clean clone of the repository also followed this guide.
They used the commands above and the click path, by hand and with scripts.
