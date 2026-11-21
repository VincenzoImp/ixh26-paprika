# Paprika: testnet-readiness audit

Date: 2026-11-21. Scope: `contract/` (Paprika.sol, deploy, vote, tests, config), `app/` (lib, server, cli, scripts,
web) at the working-tree state of today, including the in-progress move to user-held wallets (MetaMask or an
in-page key), the local faucet and server-run UMA voters, which is taken as the intended direction.
Standard applied: "ready to go to a public testnet; the local chain is a convenience, not an excuse".
No product file was changed. Facts checked on the web are marked [SOURCE] with the URL; facts from memory are
marked [MEMORY] and should be re-checked before they are said in front of the jury.

## Executive summary

1. The contract is close to network-independent: it uses `block.chainid`, the P-256 precompile at `0x100`, `blockhash`
   and UMA's OOv3 interface only. It would run unchanged on Sepolia or any chain with EIP-7951/RIP-7212.
2. Everything around it is Hardhat-only: one network in `hardhat.config.js` (the public test mnemonic), a deploy script
   that always deploys its own UMA stack, a server that relays only to `127.0.0.1:RPC_PORT`, a library with chain id
   `31337` as default, `evm_*` time travel inside the vote and the "skip time" button, and `eth_getLogs` from block 0.
3. There is no network configuration (RPC URL, chain id, explorer, addresses) separate from code, no `sepolia` deploy
   path, no explorer verification and no explorer links: the same app cannot point at Sepolia by configuration alone.
4. UMA's docs mark Sepolia "DVM Support: No". On chain, the OOv3 there is wired to a VotingV2 (not to a mock) that
   nobody operates: 98 requests, 73 deleted after 144 rolls, 4 resolved, 1 vote ever. A Paprika accusation sent to
   UMA's official Sepolia OOv3 would never be settled and 2 x `B` would stay locked for good. The credible testnet
   option is UMA's own contracts deployed by us (as locally) with short phases and our voters, stated openly.
5. The accusation as sent to UMA is not judgeable by a real voter: the claim carries only the evidence hash, no URL, no
   chain id, no contract address. Evidence is not published anywhere; it lives in the accuser's `localStorage`.
6. A redeploy wipes every `paprika-*` key in the browser, including in-page wallet private keys and unrevealed commit
   salts: harmless on a throw-away chain, a loss of funds (and a burned bond) on a testnet.
7. The server's `/demo/*` endpoints (faucet, vote, clock) are unauthenticated and CSRF-able; on a public host the vote
   endpoint means "whoever reaches the server decides every accusation". They must be off or gated outside localhost.
8. The demo windows (`PHOTO_WINDOW` 1 h, `REVEAL_WINDOW` 15 min) are only coherent with a hand-moved clock. On a real
   chain the clock cannot be moved: the "refund" and "vote" steps need either short windows plus short DVM phases on
   our own UMA instance, or pre-seeded records. On mainnet-like UMA (48-96 h votes) `T_photo` should be days.
9. Recommended explorer: a built-in minimal explorer view (tx/address/block pages decoded with the deployment ABIs)
   behind one `explorer` URL template, which becomes `https://sepolia.etherscan.io` on Sepolia; Blockscout in Docker
   as an optional extra.
10. Recommended wallet model: one connected wallet per browser that can do every action, three views as navigation
   (Capture, Verify, Accuse); the demo uses two browser profiles. Verification needs no wallet at all.

## Findings by priority

P0 = must fix to call it testnet-ready or credible in front of the jury. P1 = should. P2 = nice.
Effort: S < half a day, M = 1-2 days, L = more.

| # | P | Dimension | Finding | Concrete fix | Effort |
|---|---|---|---|---|---|
| 1 | P0 | 1 Network | No network configuration. `hardhat.config.js` has only `hardhat` and `localhost`; the server relays only to `127.0.0.1:${RPC_PORT}` (`server.js` `forward()`), the page always uses `location.origin + "/rpc"`, `connect()` defaults `chainId` to 31337, `start.js`/`deploy.js`/`cli.js` hard-code `deployments/local*.json` and port 8545 semantics | One `networks/<name>.json` (or `.env` per network) with `chainId`, `rpcUrl` (server side, may hold an API key), `publicRpcUrl`, `explorer` (base URL + `tx`/`address`/`block` templates), `deploymentFile`, `uma.mode` (`own` / `official`), `blockTime`, `pollingMs`, `logsFromBlock`, `maxLogRange`. `hardhat.config.js` gains `sepolia` (and e.g. `baseSepolia`) with `url` and `accounts: [process.env.DEPLOYER_KEY]`. Server forwards to `config.rpcUrl` (https), page reads `config` from `/deployment.json`. Remove every 31337/8545 default from library code | M |
| 2 | P0 | 2 UMA | The deploy script always deploys a private UMA stack and gives the deployer every governance role; there is no option and no documented decision for Sepolia. UMA's official Sepolia OOv3 sends disputes to an unattended VotingV2 (GAT 5M test UMA, 1 vote ever, requests deleted after 144 rolls of 20 min): an accusation there is never settled and both stakes stay locked forever (see UMA section) | `scripts/deploy.js --network sepolia --uma own` as the default: `deploy-uma-dvm.js` on Sepolia with `PHASE_LENGTH` 60-300 s, our voters (keys only on the server), deployer = governance, and the page says "UMA's contracts, our instance, our voters". Keep `--uma official` only for a read-only integration check (OOv3 `0xFd9e…4944`, WETH `0x7b79…E7f9`, min bond 0.002 WETH) and refuse to open accusations against it. Say it in docs/demo.md and on the slide | M |
| 3 | P0 | 2/9 UMA, Ops | The vote runner (`paprika.js` `runVote`, `contract/lib/vote.js`) and the "skip time" button use `evm_setNextBlockTimestamp`/`evm_mine`/`evm_increaseTime`. On a real chain they fail, so no accusation can be decided and no refund can be shown | Vote runner with two strategies chosen from config: `timeTravel` (local) and `wait` (real chain: poll `getVotePhase()`/round end, commit in commit phase, reveal in reveal phase, settle after the round; resumable from chain state after a server restart). Hide "skip time" unless `chain.timeTravel`. For the testnet demo, deploy with short windows (e.g. `PHOTO_WINDOW` 600 s, `REVEAL_WINDOW` 180 s, `PHASE_LENGTH` 120 s) and pre-seed one record attested before the talk so a refund can be shown live | M |
| 4 | P0 | 6 Data | Evidence is never published: the page stores the evidence text in `localStorage`, the chain stores `sha256(evidence)`, and the UMA claim (`Paprika.sol` L202-204) has the photo hash, key id and evidence hash only: no evidence URL, no chain id, no Paprika address, no resolution rule. A real UMA voter cannot find the record or the evidence, and under ASSERT_TRUTH (UMIP-170) an unverifiable assertion resolves false: every honest accusation would lose | Add `string evidenceURI` to `revealClaim` (inside the commitment), put it in the claim and in `AccusationOpened`. Claim text: chain id, Paprika address, `verify(photoHash,keyId)` call, the photo's `recordedBlock` and its timestamp, the evidence URI and its SHA-256, and the rule voters apply ("TRUE if the evidence shows this exact file, or a file it was derived from, was publicly available before block `anchorBlock`, or otherwise not captured by this key; FALSE if the evidence is missing, unreachable or does not show that"). Publish evidence on IPFS (pin via web3.storage/Pinata or a local Kubo node in the demo) or any https URL; the page checks the hash of the fetched content before committing. Keep the claim well under OOv3's ancillary limit (see UMA section) | M (contract change + redeploy) |
| 5 | P0 | 7 Security | `/demo/faucet`, `/demo/vote`, `/demo/advance`, `/vote-lock` have no authentication and no Origin/Host check: any web page open in the presenter's browser can POST to `http://127.0.0.1:5173/demo/advance` (a "simple" request, `readJson` ignores the content type) and move the chain clock, or decide a vote. On a public host `/demo/vote` lets anyone decide every accusation | `DEMO_CONTROLS=on` only when `chainId == 31337` and HOST is loopback; otherwise the routes are not mounted. Require `Content-Type: application/json` and `Origin == own origin`, and check `Host` against an allowlist (DNS rebinding). On a testnet: faucet behind a per-IP + per-address rate limit and a small cap (or link to public Sepolia faucets), vote endpoint behind an operator token, and `/demo/advance` removed | S |
| 6 | P0 | 5/7 Wallet | `clearLocalState()` (`web/app.js` L187) removes every `paprika-*` key when the deployment fingerprint changes, including `paprika-wallet:<fp>:<role>` (in-page private keys), the device key and the open accusation (salt). On a testnet a redeploy, or a second deployment on the same origin, silently destroys funded keys and makes a live commitment unrevealable (its bond is burned by `forfeitCommit`) | Never delete wallet keys; scope app state by `chainId:paprikaAddress` and clear only that scope. Before creating an in-page key, show "this is a hot key in this browser; export it"; offer export/import of the key and of pending commitments (JSON download). Derive the salt from a wallet signature (`salt = keccak256(personal_sign("Paprika commit", photoHash, keyId, nonce))`) so a commitment can be revealed from any browser | S |
| 7 | P0 | 3 Ops | No explorer verification and no verification config; a third party cannot read `attestersOf`/`verify` on Etherscan or check the source | Add `@nomicfoundation/hardhat-verify` with `etherscan.apiKey` (Etherscan API v2, one key for all chains) and `sourcify`; run `hardhat verify` at the end of the deploy script for Paprika (and for our UMA instance, whose sources come from `@uma/contracts-node`: verify via the UMA repo at the matching tag, or deploy UMA from source to make that possible) | S |
| 8 | P0 | 4 Observability | No explorer link anywhere (grep `href`/`explorer` in `web/app.js`: none): transactions, addresses and contracts appear as shortened hex only | `explorer.tx(hash)`, `explorer.address(a)`, `explorer.block(n)` from config; every hash/address in the page and CLI becomes a link. Locally, the same template points at a built-in minimal explorer view (see target architecture) | S (links) + M (local view) |
| 9 | P0 | 4 Observability | `listRecords`/`listAccusations`/vote lookup call `queryFilter(..., 0, "latest")`; the page re-runs them and then one `verify` + one `getBlock` per record on every refresh. Public RPCs cap `eth_getLogs` ranges (commonly 1k-10k blocks or 10k results) and rate-limit: on Sepolia the "My photos"/"Accusations" views would fail or stall | Store `deployBlock` in the deployment file; query `[deployBlock, latest]` in chunks of `maxLogRange` with retry; cache the cursor; filter `Attested` by `depositor` (indexed) for "My photos" instead of reading all records; use Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`, deployed on Sepolia and most L2s [MEMORY]) for the `verify` fan-out. For growth, an indexer (Ponder/Envio/The Graph subgraph) behind the same API | M |
| 10 | P1 | 1/8 Network | The product depends on the P-256 precompile at `0x100`. It is live on Sepolia, Hoodi, mainnet and the main L2 testnets (verified below), so `hardfork: "osaka"` is not a local-only trick. But nothing checks it: on a chain without it every signature fails as "bad sig" | Deploy script and app check at start-up: `eth_call` to `0x100` with a known vector must return `1`, else refuse with "this chain has no P-256 precompile". Cite EIP-7951 + Fusaka activation in docs/demo.md instead of "Hardhat, hardfork osaka" | S |
| 10b | P1 | 2/8 UMA, Contract | `ASSERT_TRUTH` is retired on mainnet (UMIP-192; `isIdentifierSupported(ASSERT_TRUTH)` = false on mainnet, ASSERT_TRUTH2 = true). Paprika reads `oo.defaultIdentifier()` once in the constructor and the docs cite UMIP-170: against mainnet-like UMA, every `revealClaim` would revert and every commit bond would be burned | Pass `identifier` as a constructor argument, check `IdentifierWhitelist.isIdentifierSupported` via the Finder at deploy; use `ASSERT_TRUTH2` (UMIP-191) in `deploy-uma-dvm.js` and in the docs | S |
| 11 | P1 | 2/8 UMA, Contract | Window defaults are demo values. On real UMA a vote takes 48-96 h; `PHOTO_WINDOW` = 1 h means the public has one hour to find evidence before the deposit is safe; the tests use 7 days. `REVEAL_WINDOW` 15 min is fine on L1 (75 blocks) | Per-network defaults in config: local demo 3600/900; our-UMA testnet demo 600/180 with `PHASE_LENGTH` 120; "mainnet-like" 7 days / 1 h with UMA phases 86,400 s. Show `T_photo` against the expected vote time in the parameter panel | S |
| 12 | P1 | 8 Contract | If UMA raises the WETH final fee (minimum bond becomes > `BOND`), de-whitelists the currency or the identifier, `assertTruth` reverts inside `revealClaim`: every commitment then expires and is burned by `forfeitCommit`, and no photo can be accused any more (all deposits become risk-free) | In `revealClaim`, check `oo.getMinimumBond(currency) <= BOND` before asserting (or `try/catch` the assertion) and credit the bond back with a `BondReturned`-style event when UMA refuses; expose `accusationsPossible()` view; document that the deployment is then dead and must be redeployed | S |
| 13 | P1 | 1/8 Network | `blockhash` anchor: the 256-block limit is 51 min on L1 but 8.5 min on Base/OP (2 s blocks). On Arbitrum `block.number` is an L1 block number and `blockhash` is documented as not cryptographically secure [MEMORY]: the anchor would not even match the app's `getBlock("latest").number`. On rollups the sequencer knows block hashes before users do (lower bound weakened) | Document supported chains (L1 Sepolia, OP-stack); refuse Arbitrum in config. In `attestPhoto`, take the anchor AFTER `ensureFunds` (wrap/approve can take minutes with a wallet) and use `latest - 2` to avoid an anchor reorged out on L1; on "anchor" revert, re-sign with a fresh block automatically | S |
| 14 | P1 | 9 Code | `send()` does `tx.wait()` with no timeout, no confirmation count, no handling of `TRANSACTION_REPLACED` (MetaMask speed-up/cancel) and no pending state in the UI; the provider polls every 100 ms and the vote status every 150 ms (10+ req/s per tab against a public RPC) | `wait(confirmations from config, timeout)`, handle replaced/cancelled transactions, show "pending - view on explorer" with the link; `pollingInterval` from config (≈ block time / 3), vote status every 2-5 s or Server-Sent Events | S |
| 15 | P1 | 5 Wallet | Three role tabs with a wallet each ("photographer", "accuser" hard-coded as `USER_ROLES` in the library) model identities, not a dApp. Real users have one account that can attest, verify and accuse | One connected account (EIP-6963 wallet discovery, or the in-page key as "burner wallet") shown in the header; views Capture / Verify / Accuse / My activity, all using that account; library API `attestPhoto(ctx, signer, ...)` instead of a role string. Demo: two browser profiles (Photographer, Accuser), each with its own MetaMask account; Verify works with no wallet | M |
| 16 | P1 | 5 Wallet | Device key is a software P-256 key generated `extractable: true` and stored as a private JWK in `localStorage` (device.js L130-138). It is bound to the wallet only by the registration PoP (`owner` is "information only"). New browser = new key; lost key = cannot be revoked; anything that reads `localStorage` (an XSS, an extension) gets it | Store a non-extractable `CryptoKey` in IndexedDB (WebCrypto keys are structured-cloneable), with an explicit export for backup. Target: a WebAuthn passkey (P-256, hardware-backed, the real "secure element" story) verified on chain with the WebAuthn envelope (authenticatorData + clientDataJSON with `challenge` = message hash), as done by Coinbase Smart Wallet / Daimo P-256 verifiers. Optionally let the registering address revoke too (recovery when the key is lost) | M (IndexedDB) / L (passkey) |
| 17 | P1 | 3 Ops | No `deployments/<network>.json` convention beyond `local[-port].json`; deployment files are git-ignored, so the addresses of a public deployment are not in the repository; no `deployBlock`, no commit hash, no constructor args in the file; the 4,185-line ABI bundle is copied into `app/web/` | `contract/deployments/<chainId>-<name>.json` committed for public networks: addresses, `deployBlock`, tx hashes, constructor args, compiler settings, git commit, UMA mode. ABIs imported from `artifacts` at build time, not inside the address file. Deploy script idempotent: if the file exists and code is at the address with the same args, skip (today it refuses only on localhost, `deploy.js` `liveDeployment`) | S |
| 18 | P1 | 7 Security | `/rpc` relay: open CORS `*`, 1 MB bodies, batches of 100, no rate limit, `eth_getLogs` with unbounded ranges. Fine on localhost; on a public host it is a free proxy to the operator's RPC key | Rate limit per IP, cap batch size (10) and `eth_getLogs` block range, add `Cache-Control`; or drop the relay on testnets: reads go to a public RPC from config and writes go through the user's wallet (MetaMask has its own RPC) | S |
| 19 | P1 | 7 Security | Operator and voter keys are derived from the public Hardhat mnemonic in `lib/demo-keys.js`; nothing else is supported | Keys from env/secret file (`OPERATOR_KEY`, `VOTER_KEYS`) on any non-local network; refuse to start if a well-known Hardhat key is configured on a chain other than 31337 (funds sent to those addresses on public chains are swept by bots within seconds) | S |
| 20 | P1 | 3 Ops | Gas on a real network: `revealClaim` 704k gas and one vote = 3 commits (≤232k) + 3 reveals (≤194k) + settle (≤186k); `attest` 167k; deploy Paprika 2.47M, plus the UMA stack if `own` (Finder, Store, whitelists, Registry, VotingToken, VotingV2 22.6 kB runtime, OOv3 17.8 kB runtime: roughly 15-20M gas in total [estimate]). Costs at today's prices are in the table below | Put the cost table in docs; set `BOND` and the faucet amount in Sepolia ETH terms (Sepolia ETH is scarce: public faucets give ~0.05-0.1/day [MEMORY]); `BOND` = UMA minimum bond for WETH on the target network | S |
| 21 | P1 | 9 Code | No unit tests for `app/lib` (only e2e through the browser), no CI, no Solidity static analysis, no fork test against UMA's real Sepolia deployment | `node --test` for `paprika.js` against an in-process Hardhat; GitHub Actions running contract tests + e2e; Slither run with findings triaged; a `hardhat test --network sepoliaFork` (forking Sepolia at a pinned block) using UMA's official OOv3 (`assertTruth` + `disputeAssertion` against the real Sepolia Finder/Store/WETH `0x7b79…`; settlement cannot be tested there because nobody votes), to prove the integration with UMA's deployed contracts | M |
| 22 | P2 | 8 Contract | `attestersOf(photoHash)` returns an unbounded array; anyone with free keys can append entries at `B` each (refundable). The page then calls `verify` per key | `attesterCount(hash)` + `attestersOf(hash, offset, limit)`; UI paginates. Optional cap per photo | S |
| 23 | P2 | 8 Contract | An `attest` transaction can be copied from the mempool by another sender, who becomes the depositor (the signature is not bound to `msg.sender`, by design for relayers). The original sender's transaction reverts "exists": a griefing of gas, not a theft. Same for a copied `refund` (harmless) | Document; optionally let the device sign the intended depositor (or `address(0)` for "any relayer") | S |
| 24 | P2 | 5/9 UX | Each first action needs 3 wallet prompts and 3 blocks (wrap, unlimited approve, attest), ~36 s on L1; approve is `MaxUint256` | Batch with EIP-5792 `wallet_sendCalls` where supported; approve exactly `B` (or a small multiple) and say so; show progress per step with links | S |
| 25 | P2 | 4 Observability | No standalone verification path outside this app | `scripts/verify-photo.mjs <file> --network sepolia` (50 lines, ethers + deployment file only), and a docs section "verify with Etherscan only": compute `sha256sum`, open the verified contract, Read `attestersOf(0x…)`, then `verify(0x…, keyId)` | S |
| 26 | P2 | 7 Security | No Content-Security-Policy; evidence text and file names come from the user. Rendering uses `textContent` (only one static `innerHTML`, L1595), so no XSS was found today | Add `Content-Security-Policy: default-src 'self'; connect-src 'self' <rpc> <ipfs gateway>; img-src 'self' blob: data:` and `X-Content-Type-Options: nosniff`; keep `textContent` as a lint rule. Once evidence URIs are shown as links, allow only `https:` and `ipfs:` schemes | S |
| 27 | P2 | 9 Code | Demo hacks visible to a reviewer: `HARDHAT_OPERATOR` constant in the library, `chain-label` text "local chain" hard-coded, `wallet_addEthereumChain` "Paprika local", footer "Everything runs on a local Ethereum chain", `fingerprint` via block-1 hash (fine, but named for restarts) | Read network name/label from config; keep the hard-coded strings only in the local config | S |
| 28 | P2 | 3 Ops | Immutability is stated (no owner, no upgrade) but there is no versioning/migration story: a redeploy leaves old records on the old address and the app shows only the new one | `deployments/<network>.json` keeps a list of past Paprika addresses; the Verify view queries all of them (records are read-only forever) | S |

### Gas and money on a real network

Gas from `contract/output/cases.md`. Prices read on 2026-11-21 06:11 UTC with `eth_gasPrice` [SOURCE]:
Sepolia 15 wei (base fee 13 wei), mainnet 0.2849 gwei; ETH = 1,557 USD (CoinGecko/Coinbase). Sepolia gas is
nearly free today, but it spikes; the last column is a budget for the deployer and the faucet.

| Step | gas | mainnet ETH @0.285 gwei | USD @1557 | Sepolia ETH @15 wei | Sepolia ETH @10 gwei (spike budget) |
|---|---|---|---|---|---|
| register | 101,872 | 0.000029 | 0.05 | 1.5e-12 | 0.0010 |
| attest | 167,013 | 0.000048 | 0.07 | 2.5e-12 | 0.0017 |
| commitClaim | 86,787 | 0.000025 | 0.04 | 1.3e-12 | 0.0009 |
| revealClaim | 703,897 | 0.000201 | 0.31 | 1.1e-11 | 0.0070 |
| one vote, own VotingV2 (3 commits + 3 reveals + settle) | 1,463,035 | 0.000417 | 0.65 | 2.2e-11 | 0.0146 |
| refund | 55,940 | 0.000016 | 0.02 | 8.4e-13 | 0.0006 |
| withdrawCredit | 35,437 | 0.000010 | 0.02 | 5.3e-13 | 0.0004 |
| deploy Paprika | 2,465,066 | 0.000702 | 1.09 | 3.7e-11 | 0.0247 |
| deploy own UMA stack (estimate) | 18,000,000 | 0.005128 | 7.98 | 2.7e-10 | 0.1800 |

The stake matters more than gas. UMA's minimum bond for WETH is 0.11 WETH on mainnet (about 171 USD) and
0.002 WETH on Sepolia (official deployment) [SOURCE, on-chain]. With our own UMA instance the final fee is ours to
set: `FINAL_FEE` = 0.001 and `BOND` = 0.002-0.01 WETH keep the faucet within what public Sepolia faucets give.
Today's `BOND` = 1 WETH and faucet of 5 ETH per call are not realistic on Sepolia.

## Target architecture (one page)

```
config/networks/
  local.json      { chainId: 31337, rpcUrl: "http://127.0.0.1:8545", explorer: "/explorer", timeTravel: true,
                    demoControls: true, uma: "own", phaseLength: 60, photoWindow: 3600, revealWindow: 900 }
  sepolia.json    { chainId: 11155111, rpcUrl: "$SEPOLIA_RPC_URL", publicRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
                    explorer: "https://sepolia.etherscan.io", timeTravel: false, demoControls: "token",
                    uma: "own", identifier: "ASSERT_TRUTH2", phaseLength: 120, photoWindow: 1200, revealWindow: 300,
                    bond: "0.005", confirmations: 1, pollingMs: 4000, maxLogRange: 5000 }
contract/
  hardhat.config.js    networks generated from config/networks/*.json; accounts from env (DEPLOYER_KEY); hardhat-verify
  scripts/deploy.js    --network <n> [--uma own|official] → checks P-256 precompile + UMA min bond → deploys (skips
                       what is already deployed with the same args) → verifies on the explorer →
                       writes deployments/<chainId>-<n>.json { addresses, deployBlock, txs, args, commit, umaMode }
app/
  lib/paprika.js       connect({ network, deployment, provider|signer }): no defaults to 31337; one account, not roles;
                       chunked log reads from deployBlock; explorer links; wait with confirmations/timeouts
  lib/evidence.js      publish evidence (IPFS pin or https URL), hash check
  server.js            static files + /deployment.json (+ network config). /rpc relay only if network.relay (rate-limited,
                       method + range allowlist). /demo/* mounted only if demoControls (loopback + Origin check on
                       local; operator token on testnet). Keys from env, never the Hardhat mnemonic off 31337.
  voter/ (server)      UMA voter runner for "own" UMA: strategy timeTravel (local) or wait-for-phase (testnet),
                       resumable from chain state. "official" UMA on Sepolia is read-only for the app (nobody votes
                       there): accusations disabled, with the reason shown
  web/                 header: network badge + one connected account (EIP-6963 / burner); views Capture, Verify (no
                       wallet), Accuse, My activity; every hash/address is an explorer link
explorer
  local:   built-in /explorer view in the page: tx (receipt + decoded logs with the deployment ABIs + call decoding),
           address (code? contract name from deployment; balance; Paprika events by indexed topic), block; zero
           dependencies, same link template as Etherscan. Optional: Blockscout via its docker-compose pointed at
           the Hardhat RPC, for a "real" explorer during the talk.
  sepolia: Etherscan (verified sources), links from config; standalone scripts/verify-photo.mjs for third parties
```

Why a built-in explorer view for the local chain: Otterscan needs the `ots_*` JSON-RPC namespace (Erigon, Anvil),
which Hardhat does not provide [MEMORY]; Blockscout works against a Hardhat node but needs Postgres + indexer +
frontend containers and takes minutes to index. A 200-line view that decodes Paprika/OOv3/VotingV2/WETH events is
the simplest credible option, and it shares the link format with Etherscan so the UI code is the same on both.

## UMA on Sepolia: the facts

All on-chain values: `eth_call` to a public Sepolia RPC (publicnode) at block ~12,180,051, 2026-11-21 [SOURCE].
Addresses: [UMA `networks/11155111.json`](https://raw.githubusercontent.com/UMAprotocol/protocol/master/packages/core/networks/11155111.json) [SOURCE].

| Item | Value |
|---|---|
| OptimisticOracleV3 | `0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944` |
| Finder | `0xf4C48eDAd256326086AEfbd1A53e1896815F8f13` |
| Store | `0x39e7FFA77A4ac4D34021C6BbE4C8778d47F684F2` |
| AddressWhitelist (collateral) | `0xE8DE4bcE27f6214dcE18D8a7629f233C66A97B84` |
| IdentifierWhitelist | `0xfcb6f77112951e1995d37542b519Fe0a85a1AA77` |
| Registry | `0x827C4fABBe65ee852D7Cd6Ddf042cFC9eb500ef8` |
| VotingV2 | `0xd6Fc66498aE366892BDa974Fd4eF903Ca7202F76` |
| VotingToken (test UMA) | `0xc00F1d7E535D83404587437738974A8762bE266a` |
| MockOracleAncillary | `0x5FE28AEa36420414692b1C907F7d0114d304eb0C` (deployed, NOT registered in the Finder) |
| Finder `"Oracle"` / OOv3 `cachedOracle()` | VotingV2 `0xd6Fc…2F76`: disputes go to VotingV2, not to the mock |
| VotingV2 parameters | phaseLength 600 s (round 20 min), maxRolls 144, GAT 5,000,000 UMA, SPAT 50%, cumulative stake 7.1M, owner GovernorV2 |
| VotingV2 activity (Tenderly gateway, full-range logs) | 98 RequestAdded (latest 2026-11-17), 73 RequestDeleted, 4 RequestResolved (all 2025-09-09), 1 VoteCommitted ever |
| Whitelisted WETH | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`. The common Sepolia WETH `0xfFf9…6B14` is NOT whitelisted |
| Default currency | USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals) |
| Final fee / minimum bond, WETH | 0.001 WETH / 0.002 WETH |
| Minimum bond, USDC | 400 USDC (OOv3 cache stale vs Store final fee 0) |
| defaultLiveness / burnedBondPercentage | 7,200 s / 50% |
| Identifiers | `defaultIdentifier()` = ASSERT_TRUTH; ASSERT_TRUTH, ASSERT_TRUTH2, YES_OR_NO_QUERY supported |

What UMA's documentation says:

- [Network addresses](https://docs.uma.xyz/resources/network-addresses) [SOURCE]: Ethereum Sepolia is marked "DVM
  Support: No" (also Amoy, Base Sepolia, Blast Sepolia); the DVM is on Ethereum mainnet.
- [Sandboxed oracle environment](https://docs.uma.xyz/developers/optimistic-oracle-v3/sandboxed-oracle-environment)
  [SOURCE]: for testing, you deploy your own sandbox (OOv3 + mock oracle) where "anyone can push desired test price
  through this mock oracle contract"; only the first price pushed counts. This is a sandbox you deploy, not the
  official Sepolia OOv3.
- [Resolving disputes](https://docs.uma.xyz/developers/resolving-disputes) [SOURCE]: on mainnet a dispute is
  resolved "within 48-72 hours, depending on when the dispute was raised in the voting cycle"; the testnet
  instructions (push a price to the mock oracle) still describe Görli.
- [Voting walkthrough](https://docs.uma.xyz/using-uma/voting-walkthrough) [SOURCE]: 24 h commit + 24 h reveal per
  round. A dispute is voted in the next round, so 48-96 h end to end (the local measurement with 86,400 s phases gave
  3-4 days, `cases.md`). Mainnet VotingV2: phaseLength 86,400, maxRolls 4 [SOURCE, on-chain].
- Mainnet OOv3 `0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE`: liveness 7,200 s, burn 50%, min bond 500 USDC or
  0.11 WETH [SOURCE, on-chain].
- [UMIP-170](https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md) (ASSERT_TRUTH) [SOURCE]: voters
  return 1 only if the claim is "true and publicly verifiable"; 0 if false "or cannot be resolved"; "If the claim
  cannot be unambiguously resolved, voters should return the 0 value"; claimants must make claims that "can be
  evaluated to reach a deterministic outcome". Voters see the claim plus `assertionId`, `ooAsserter` (and
  `childChainId` off mainnet).
- [UMIP-191](https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-191.md) adds ASSERT_TRUTH2 as a one-for-one
  replacement; [UMIP-192](https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-192.md) retires ASSERT_TRUTH
  (mainnet `isIdentifierSupported(ASSERT_TRUTH)` = false) [SOURCE].
- Claim size: OOv3 passes only `assertionId` + asserter to the oracle as ancillary data; I found no explicit claim
  length limit in OOv3 (the 8,192-byte `OO_ANCILLARY_DATA_LIMIT` is OptimisticOracleV2) [SOURCE code, limit value
  MEMORY]. Paprika's claim (~260 bytes today, ~600 with chain id, address, URI and rule) is far below any limit.

Consequences for Paprika:

1. "No mock" stays true on a testnet only with our own UMA instance. The official Sepolia OOv3 has no mock in the
   path, but nobody votes, so accusations never settle (and are deleted after 144 rolls, ~48 h, leaving both
   stakes locked: the "vote can fail to resolve" limit in `docs/limits.md` becomes the normal case).
2. With our own instance on Sepolia, the real clock runs: `PHASE_LENGTH` 120 s gives a vote in 4-8 minutes,
   so `REVEAL_WINDOW` >= 180 s and `PHOTO_WINDOW` around 10-30 min make a live demo possible without `evm_*`.
3. Against mainnet-like UMA (48-96 h votes), the documented defaults (`PHOTO_WINDOW` 1 h) are not coherent as a
   deterrent: the time under accusation is added back, but the public has one hour to find evidence. Use days.
4. Use ASSERT_TRUTH2 and make the identifier a constructor argument.

## P-256 precompile (EIP-7951 / RIP-7212) on public testnets

- EIP-7951 (secp256r1 precompile at `0x100`, 6,900 gas on L1) is part of Fusaka
  ([EIP-7607](https://eips.ethereum.org/EIPS/eip-7607)) [SOURCE]: Holešky 2025-10-01, Sepolia 2025-10-14,
  Hoodi 2025-10-28, mainnet 2025-12-03 (epoch 411392). Holešky has been shut down (Sepolia for dapps, Hoodi for
  staking) [SOURCE, blog.ethereum.org announcement; live RPCs no longer answer].
- Live check with a valid P-256 vector (generated with Node `crypto`, not the official vector file): `eth_call` to
  `0x100` returned `0x…01` (and `0x` for a tampered vector) on Sepolia, Hoodi, mainnet, Base Sepolia, OP Sepolia,
  Arbitrum Sepolia, zkSync Era Sepolia, Linea Sepolia and Polygon Amoy [SOURCE]. Scroll Sepolia: no reachable RPC,
  not verified.
- RIP-7212 sources: OP Fjord spec, Base precompile docs, Arbitrum ArbOS 30 AIP, zkSync precompile docs [SOURCE, search
  snippets]. Gas differs per chain (3,450 under RIP-7212, 6,900 under EIP-7951, 12,000 on zkSync).
- Hardhat 2.29.2 (EDR) with `hardfork: "osaka"` returns `0x…01` for the same vector locally; Osaka support since
  Hardhat 2.27.1, default since 2.28.0 [SOURCE]. The config's `gas: 16_000_000` respects EIP-7825's 2^24 cap.
- Consequence: the P-256 dependency is no longer a testnet blocker. The chain choice is decided by UMA and by
  `blockhash` semantics (finding 13: avoid Arbitrum), not by the precompile.

## Notes on what is already good

- The contract has no owner, no admin and no ETH handling; signatures are domain-separated by label, `chainid` and
  contract address; low-s is enforced; payouts are pull-based credits; the UMA callback ignores unknown assertions
  rather than reverting (no blocking of UMA settlement).
- The deploy uses UMA's compiled artifacts unmodified; runtime sizes (VotingV2 22,612 B, OOv3 17,837 B, Paprika
  11,103 B) are below the EIP-170 limit, so the same stack deploys on a public chain.
- Users already sign client-side (`eth_sendRawTransaction` only through `/rpc`; signing methods refused with 403).
- The demo is honest about its shortcuts in `docs/demo.md` ("What is not like a public network").
