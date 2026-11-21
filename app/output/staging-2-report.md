# Paprika: staging test 2 (QA, before the live demo)

## Summary

| Item | Value |
|---|---|
| When | 2026-11-21, from 01:53 CET |
| Ports used | Web exploration on 8945/5573 (`RPC_PORT=8945 WEB_PORT=5573 npm start`, then a step-by-step restart with `BOND=2 PHOTO_WINDOW=600 REVEAL_WINDOW=300`). CLI, docs and server checks on 9145/5773, 9245/5873 and 9345/5973. `npm run e2e` on its own 8645/5273. New edge test on 9445/5973. The team's 8545/5173 was not stopped. Nothing of ours is left running (`ss -ltnp` checked). The per-port deployment and state files we created were deleted. |
| Contract tests | `npx hardhat test`: **9 passing**, 0 failing |
| Web e2e | `npm run e2e`: **167 passed, 0 failed** |
| New edge e2e | `node e2e/edge.e2e.mjs`: **1 passed, 14 failed**. There is one check per reproducible finding, so it fails now and passes once they are fixed. |
| CLI demo | `node cli.js demo`: 13/13 PASS, exit 0. Same with defaults, run twice on one chain, and with `BOND=2 PHOTO_WINDOW=600 REVEAL_WINDOW=300` |
| Exploration scripts | `app/e2e/explore/`: `harness.mjs` and `s1` to `s7` (web, with chain comparisons), plus `cli-*.mjs` (CLI, refund edges, parameters) |
| Findings | **0 blocker, 6 major, 16 minor, 6 cosmetic** (28). One is a partial regression (m8). |

One incident to report. One read-only CLI command, `PAPRIKA_DEPLOYMENT=…/deployment-9145.json node cli.js status`, connected to 8545, the team's instance (see M-13). It deleted `app/.state/device.json` because that file's deployment id did not match. That file came from an earlier 8545 chain: its `cli-state.json` is from 01:25, and the current chain started at 01:52. So the running demo lost nothing.

## Findings

Screenshots are in `app/output/staging-2/` unless another path is given. The edge-test id is in brackets.

| id | sev | area | exact steps | expected | actual | screenshot / evidence | suggested fix |
|---|---|---|---|---|---|---|---|
| M-1 [S-1] | major | `server.js` /rpc | `curl -X POST http://127.0.0.1:<WEB>/rpc -H 'content-type: application/json' -d 'null'` (or the batch `[null,{…}]`) | 400/403. The server says it forwards only the allowed methods | The body is forwarded. Hardhat crashes (`TypeError: Cannot read properties of null (reading 'jsonrpc')`). `npm start` then prints "chain exited with code 1" and stops the web server too. The whole demo and its in-memory chain are lost; the page shows "cannot reach the local chain". | `rpc-crash-evidence.txt` | In `proxyRpc`, `list.find((c) => !c …)` returns the falsy element, so `if (bad)` is false. Use `list.some(…)` or `findIndex(...) !== -1`; answer 400 to unparsable JSON. |
| M-2 [S-2] | major | `server.js` /rpc allow-list | POST `[0,{"jsonrpc":"2.0","id":2,"method":"hardhat_setBalance","params":["<accuser>","0x1"]}]` | 403 (only `eth_*`, `evm_increaseTime`, … are allowed) | HTTP 200 and `result: true`. The accuser's ETH balance becomes 1 wei. Invalid JSON and 50 MB bodies are also forwarded; there is no body size limit. | `rpc-crash-evidence.txt` | Same fix as M-1, plus a body size cap. |
| M-3 [W-A] | major | Web Accuser, mixed CLI + web | Attest X and Y. Web Accuser: Commit on Y. CLI or library: commit and reveal an accusation on X. Web: click "Reveal and send to UMA" (on Y). Then "Demo voters vote YES". | The page keeps its own accusation (Y), and the vote decides Y | Right after the reveal of Y, the page replaces its accusation with X: "Accusation rebuilt from the chain (revealed earlier, vote pending)", and Reveal → photo is empty. The YES vote decides **X**: X becomes Fake and its key is flagged, while Y stays Accused. This comes from `reconcileAccusation()`, which takes the first open accusation on chain whenever `S.acc.assertionId` differs. | `s2-01-interleaved-after-reveal.png`, `s2-02-interleaved-after-vote.png` | In `reconcileAccusation`, do not replace a local accusation that is open on chain. Show every open accusation and let the user choose which one to vote on. |
| M-4 [W-C] | major | Web Accuser, "Start a new accusation" | Commit (B locked), then click "Start a new accusation" before Reveal | Disabled while a live commitment exists, or a confirmation that says the bond will be lost | The button is enabled, next to the commit status. One click drops the salt from the page and from localStorage with no warning. Reveal is gone, and the bond B stays in Paprika for good: the web has no forfeit (m-4) and no recovery. | `s2-05-new-accusation-dropped-commit.png` | Disable it while the commitment is live and revealable (`!a.dead`), or ask for confirmation stating "B will be lost". |
| M-5 [W-B] | major | Web Accuser, reveal on an accused photo | Web: Commit on Z. CLI/library: commit and reveal an accusation on Z. Web: Reveal. | protocol.md §5: "No accusation opens… credit B back to the accuser". The page should say the bond was credited back. | The bond is credited correctly on chain (+B). But the page says "Paprika … opened the case at UMA … Both stakes (2B) are now at UMA", reveal-status says "sent to UMA and disputed", and the timeline says "Accuser revealed · Paprika asserted to UMA and disputed at once". The `noAssertion` state is overwritten by the rebuild from the chain (same cause as M-3). The header shows no delta for the +B credit. | `s2-03-bond-back.png` | Keep `noAssertion` after reconcile. Label the reveal from the `BondReturned` event ("bond credited back, no accusation opened"). |
| M-6 [S-3] | major | `npm start` run twice (README Quick start) | With an instance running, run `RPC_PORT=X WEB_PORT=Y npm start` again (on the defaults: plain `npm start` a second time) | It refuses, or reuses the running deployment | It prints "A node already answers…: using it", then **redeploys** UMA and Paprika on the live chain (new Paprika address). It rewrites the deployment JSON that the running server serves, so open pages reset their key and accusation. Then it crashes with `EADDRINUSE`. On the demo machine, one stray `npm start` would wipe the live demo state. | `cli-second-npm-start.txt` | Refuse when the web port is busy or a Paprika deployment already answers. Or skip the deploy when the served deployment matches the chain. |
| m-1 [W-E] | minor | Web Accuser, reveal deadline | Commit. Let the chain reach exactly `commit time + T_reveal`, for example with `evm_setNextBlockTimestamp` + `evm_mine` (the page clock). | Reveal disabled (protocol §5: `now ≤ commit time + T_reveal`; the next block is later) | Reveal is enabled while the page already says "The reveal period ended…". A click gives "Reveal failed: too late". After that, Reveal stays enabled and the status still says "bond B locked". | `s4-01-reveal-at-deadline.png`, `s4-02-reveal-too-late.png` | `a.dead = chain.timestamp + 1 > committedAt + T_reveal`, the same "+1" rule as `refundable`. |
| m-2 [W-D] | minor | Web Verifier, revoked key | Attest; "Demo: skip to end…"; Revoke; Verifier → "Last attested photo" | No accusation is offered after `accusableUntil` | "Not judged · its key was revoked … It can still be accused until 03:34:09", a time already in the past. The flagged-fake-proven verdict checks `challengeOver`; this one does not. | `s1-12-verify-revoked-over.png` | Use the same `challengeOver(rec)` branch as the FakeProven verdict. |
| m-3 [W-I] | minor | Web, two windows | Two browser windows on the Accuser tab of the same open accusation. Click "vote YES" in one and "vote NO" in the other at the same time. | One vote wins. The other window says plainly "this accusation was already decided" | Window 2: "UMA vote failed: could not coalesce error" (an ethers internal). Its Outcome panel stays empty until a reload. | `s2-06-ctx2-simultaneous.png` | Re-read the assertion before and after `umaVote`; map the failure to "already settled". |
| m-4 | minor | Forfeit missing (web, CLI, library) | Commit; do not reveal within `T_reveal` | protocol.md §5: anyone can call `forfeitCommit` after `T_reveal` | No function, CLI command or button calls it. The web says "this bond can only be forfeited now" with no way to do it. The CLI keeps a dead commitment listed as "pending" for good (`status` after `advance 901`, then the reveal gives "too late"). | `s4-02-reveal-too-late.png` | Add `forfeitCommit` to the library, the CLI and the web, or reword the text. Drop dead commitments from the CLI list. |
| m-5 [S-4] | minor | `npm run stop` | Instance on 9445; run `RPC_PORT=944 npm run stop` | Only an instance on port 944 is stopped | The 9445 node is killed: `pkill -f "...--port 944"` matches by substring. `RPC_PORT=854` would kill the team's 8545. pkill also kills its own shell, so "Stopped a leftover Hardhat node." is never printed. | edge test | Anchor the pattern (`--port 944$`) or kill the PID that listens on the port. |
| m-6 | minor | `npm start` lifecycle | Kill only the web server of an `npm start` instance (or let it crash) | The chain survives; restart only the web | "web stopped; stopping the rest." The chain and all demo state are gone. | `s6-04-web-down.png` (step-by-step mode) | Keep the chain alive when only the web exits, or document this in docs/demo.md. |
| m-7 | minor | Web Verifier, two keys on one file | Key K1 (CLI) and key K2 (web) both attest file F. The vote proves K1's record fake. Verify F. | The headline does not hide a "Proven fake" record of the same file | The headline shows the page key's record: "Signed and staked · open to challenge". Proven fake appears only in the small per-key line. In a fresh browser the headline shows the newest record. So the verdict depends on the browser. | `s7-02-after-fake-cli-key.png` | When records disagree, make the headline "Several keys · one proven fake" (worst state first). |
| m-8 | minor | Web Verifier, drop | Drop two files at once on the drop zone | Both verified, or a note "only the first file was verified" | Only the first is verified, with no word about the second. | `s3-02-drop-two-files.png` | Verify each file, or show a notice. |
| m-9 [W-F] | minor | Web My photos → Download | Attest a GIF, PDF, HEIC or `.bin` file, then Download | The name keeps the type (`.gif`, `.pdf`, …) | Every non-PNG file is named `paprika-xxxx.jpg`; the bytes are exact. A GIF or PDF saved as `.jpg` confuses the viewer and the jury. | `s3-notes.json` | Take the extension from the original name or the MIME type. |
| m-10 (regression of m8, partial) | minor | Web fatal screen | Instance on 8945/5573; stop the chain only; open the page | The hint uses this instance's ports | The page retries by itself now (fixed). The hint still says `cd app` / `npm start` with no `RPC_PORT`/`WEB_PORT`, which would start the default instance. | `s6b-chain-down-fatal.png` | Put the real ports in the hint. |
| m-11 | minor | Web, "Demo: skip to end of challenge + reveal period" | Fresh page, nothing registered: click it | Disabled, with a reason, while there is no Attested record to wait for | It is enabled. It moves the chain clock by T_photo + T_reveal + 1 s (1.3 h). | `s1-notes.json` | Enable it only when an Attested record is not yet refundable. |
| m-12 | minor | Web, "register another key (free)" | With an Active key, click it | It registers a new key, or warns that the current key will be dropped | It only creates a key; the user must also click "Register the device key". The current Active key is dropped from the browser with no warning, so the page can no longer revoke it. | `s1-notes.json` | Rename it to "new key", warn when the current key is Active, and keep old keys. |
| m-13 | minor | CLI `PAPRIKA_DEPLOYMENT` | `PAPRIKA_DEPLOYMENT=app/web/deployment-9145.json node cli.js status` | app/README: "The deployment JSON carries `rpcUrl`, and `connect` uses it by default" | The CLI connects to 8545 (its default `RPC_URL`), another instance with the same addresses. A read-only `status` deletes the saved device file when the deployment id differs. | (incident above) | Use the JSON's `rpcUrl` unless `RPC_PORT`/`RPC_URL` is set. Never delete state in `status`. |
| m-14 | minor | CLI `vote` | Two accusations open; `node cli.js vote false` | app/README: "`vote` picks the open accusation (or asks you to choose)" | It silently votes on the last revealed one. | (fork log) | List both and require an id. |
| m-15 | minor | CLI `status` / refunds | `status` with a pending commitment; `refund` on a fake or refunded file | Chain times and the reveal deadline; a specific refusal | `status` shows the computer's clock ("committed …00:56Z" while the chain is at 02:20) and no deadline. `refund` always says "no attested record of this photo to refund"; the library's "already refunded" or "proven fake" is lost (related to earlier m3). | (fork log) | Show chain time and the deadline. Pass the library's messages through. |
| m-16 | minor | Repository hygiene (AGENTS.md rule 8) | `ls app/web app/.state contract/deployments` | Only `deployment.json` | `app/web/deployment-8546/8547/8645/8745/8747.json`, `contract/deployments/local-*.json` and many `.state/*-<port>` files pile up from test runs. `npm run e2e` leaves `deployment-8645.json` behind. | — | Delete per-port files on stop, or git-ignore them. |
| c-1 [W-H] | cosmetic | Web footer at 800 px | Width 800 | The demo disclosure is readable | It is cut with "…" ("the UMA voters are demo a…"). It also never says "the device key is a software key", which docs/demo.md asks to say plainly. | `s5-800-accuser.png` | Let it wrap; add the software-key sentence. |
| c-2 | cosmetic | Web capture line | Load a 1-byte file | "1 byte" | "one.bin · 1 bytes" | `s3-notes.json` | Plural rule. |
| c-3 | cosmetic | Web durations with other parameters | `PHOTO_WINDOW=600 REVEAL_WINDOW=300` | "15 minutes 1 second" or "≈15 minutes" | Tooltip and timeline: "skipped 901 seconds" | `s6-03-bond2-settle.png` | Improve `fmtDuration` for mixed units. |
| c-4 | cosmetic | CLI input errors | `unwrap accuser -1`; `unwrap accuser abc`; deploy with `BOND=abc` or `PHOTO_WINDOW=0` | Plain messages | "no WETH to unwrap" (1.5 held); a raw ethers "invalid FixedNumber string value"; stack traces, the second saying only `'bad params'` | (fork log) | Validate the arguments. |
| c-5 | cosmetic | CLI texts | `register` on port 9145; `cli.js` header; demo step 8; `node cli.js demo` on any port | The right file names and titles | "saved in app/.state/device.json" (the file is `device-<port>.json`). The header refers to `impl/mock/DEMO.md`. Step 8 is titled "Advance time by one challenge period" but jumps T_photo + T_reveal + the extension. Any port overwrites `app/output/cli-demo.txt`; the committed copy was from test port 8747. | `cli-demo-9145.txt` | Fix the texts. Write `cli-demo.txt` only on the default port. |
| c-6 | cosmetic | Web chain down | Stop the chain with the page open | Action buttons disabled while the dot is red | They stay enabled. A click gives a clear "cannot reach the local chain" banner, so nothing is lost. | `s6-01-chain-stopped.png` | Disable actions while `chain-dot` is `off`. |

## Earlier findings (`staging-report.md`) re-checked

| Earlier id | Now |
|---|---|
| B1 advance during an accusation | Fixed: the button is disabled with a reason, and the CLI refuses without `--force` |
| B2, B3 reload after commit / reveal | Fixed: real reloads after commit, after reveal and in the middle of a vote all recover. A second browser rebuilds a revealed accusation. **New:** that rebuild causes M-3 and M-5 |
| B4 selector offers refunded / fake / accused photos | Fixed: only accusable photos, with "Not offered: …" counts |
| B5 CLI overwrites a commitment | Fixed: several pending commitments, reveal by # or file |
| B6 deployment per port | Fixed: `/deployment.json` matches the chain; `BOND=2` is shown and used everywhere |
| M1, M2 LAN / HOST | Fixed: the fatal screen has an SSH hint with the real port; /rpc has an allow-list. **But** the allow-list can be bypassed (M-2) and crashed (M-1) |
| M3 wrap before a refused attest | Fixed: the button is disabled for an already attested file; the library checks first |
| M4 chain restart detection | Fixed: the fingerprint changes, the page reloads and shows a notice |
| M5, M6 empty evidence / empty file | Fixed (web and CLI) |
| m8 fatal screen | **Partial regression**: it retries by itself now, but the hint still ignores the ports (m-10) |
| m2 cli-demo.txt | Now written, but by any port (c-5) |
| m3 CLI messages | Partly fixed; refund messages still vague (m-15) |
| m7, m9, m11, m12, m13 | Fixed: time zone label, poll refreshes credits, clean exit, footer padding, "challenge period over · refundable" wording |

## What works (tested; no need to re-test)

- **Full web story at 1440 px, compared with the chain after every action.** Register, sample image, attest, verify, change one pixel, commit, reveal, vote NO, advance, refund, withdraw, second photo, vote YES (device flagged FakeProven), new key, revoke.
  - Header balances, credits and Store match `balances()` and `credits()` exactly.
  - Deltas are right: attest −B, commit −B, Store +f×B.
  - The Outcome table matches the rule for B = 1 and B = 2 ("✓").
  - WETH `totalSupply` equals the sum of all holders (roles, voters, Store, Paprika, OOv3, `0x…dEaD`) after every step, in every scenario.
- **Button states.** Logged per state in `s1-buttons.json`: Register is disabled after registration; Attest is disabled for an already attested file and for a flagged key, with the reason; Refund is disabled until it can succeed; Vote is disabled after the vote; Revoke is disabled for a flagged key, with the reason; Withdraw is disabled with zero credit. While an action runs, every button on every tab is disabled, including after a tab switch.
- **Refund timing.** At `refundableAt − 1` the button is disabled and the library and contract refuse ("too early … in N s"). When the next block reaches `refundableAt`, the refund succeeds.
- **Reloads.** A reload in the middle of a vote recovers: voting again completes the vote.
- **Flagged and revoked combinations.** Revoke is allowed during an open accusation; a later YES vote leaves the reason KeyRevoked. Records of a flagged key stay listed in "Other records"; a revoked key's records can be refunded.
- **Inputs.**
  - An empty file is refused. A 1-byte file, a PDF, a GIF, a HEIC and a binary file attest (with a warning for non-images). 10 MB and 30 MB attest in about 0.5 s and verify in about 0.2 s.
  - A unicode or space name works; a copy of the same bytes under another name is correctly refused.
  - The XSS evidence is not executed (stored and shown as text). 200 kB evidence works. Blank evidence is refused.
- **Camera.** Live preview, mirror (preview only, with a note), still, retake, attest the selfie, Download, verify the download (attested), re-encoded copy (no record).
- **Mixed CLI + web.** A CLI-attested photo verifies in the web, is listed in My photos (without Download), and can be accused from the web. CLI `verify` then shows Fake and the flag. Two devices on one file show two attester lines.
- **Restarts.**
  - Chain restarted with a new deployment and `BOND=2 PHOTO_WINDOW=600 REVEAL_WINDOW=300` while the page is open: automatic reload, notice, B = 2 WETH / 10 minutes / 5 minutes everywhere, no stale default value in the page text, delta −2 WETH, payouts scale.
  - Web server restarted (step by step): the page reconnects.
- **CLI and docs.**
  - The CLI demo passes; CLI single steps work as documented (fork list); the README CLI list matches `help`; the parameter defaults match `deploy.js`.
  - /rpc returns 403 for `hardhat_*`, `evm_snapshot`/`evm_revert`, `debug_*`, `personal_sign` and mixed batches.
  - Path traversal gives 404/400.
- **Layout and console.** No horizontal overflow at 1440, 1280, 1024, 800 and 125 % zoom (the contracts panel too). No console errors or failed requests in normal flows; only the expected warnings for refused actions, and 502 while the chain is down.

## Test results

| Test | Result |
|---|---|
| `cd contract && npx hardhat test` | 9 passing (CASE lines printed) |
| `cd app && npm run e2e` | 167 passed, 0 failed |
| `cd app && node e2e/edge.e2e.mjs` (new) | 1 passed, 14 failed. They map to M-1, M-2, M-3, M-4, M-5 (2 checks), M-6, m-1, m-2, m-3, m-5, m-8, m-9 and c-1. The 1 pass is the chain-side bond return. |

To run it with npm, add this line to `app/package.json` "scripts": `"e2e:edge": "node e2e/edge.e2e.mjs"`. The existing checks of `demo.e2e.mjs` were not changed.

## Not tested

- `npm install` from a fresh shell (network), and the doc commands on the default ports 8545/5173 (the team's instance runs there; M-6 shows the risk).
- Real camera hardware. Chromium's fake device gives the same frame after each restart, so the retake test cannot prove that two stills differ.
- Real 125 % browser zoom: it was emulated with device scale 1.25 at 1152 CSS px.
- Safari and Firefox; HTTPS; access from another machine over an SSH tunnel.
- UMA's request deletion after `MAX_ROLLS` with a low `MAX_ROLLS`.
