# Acceptance test: clean clone, before the live demo

Date 2026-11-21. Clone of `VincenzoImp/ixh26-paprika` at `8784fa0` in `/tmp/claude-1000/paprika-acceptance`.
Node v26.4.0, npm 12.0.2, Playwright 1.65.1 (Chromium, fake camera). Ports used: 9245 / 5873 (and the test suites'
own spare ports). The team's demo instance on 8545 / 5173 was not touched; it was still running at the end.
Nothing of mine is left running.

## Summary

A newcomer can start the product from `README.md` alone: `npm install` + `npx hardhat test` in `contract/`, then
`npm install` + `npm start` in `app/` (with `RPC_PORT`/`WEB_PORT`, since 8545/5173 were busy) worked first time.
The step-by-step mode (`npm run chain` / `deploy` / `web` / `stop -- <port>`) and `npm run demo:cli` work as
written. All four automated suites pass. The demo story runs fast: no action takes more than 0.9 s and every click
gets feedback within 0.12 s.

Of the earlier findings, every one I re-checked is fixed, with two partial regressions: simultaneous votes from two
tabs (m-3), and the CLI help text (c-5).

**Findings: 0 blocker, 0 major, 7 minor, 6 cosmetic.** None stops the demo. The ones a presenter can hit are #1
(the button labels in `docs/demo.md` differ from the page), #4 (after an empty file the previous file is still
loaded, so the next click attests it) and #7 (a reload empties the timeline that step 9 shows).

## Findings

| # | Sev | Area | Exact steps | Expected | Actual | One-line fix |
|---|---|---|---|---|---|---|
| 1 | minor | `docs/demo.md` click path vs page | Follow the "Click path" table word for word | Button names as on screen | Step 1 "Register the device" is "Register the device key". Step 2 "Camera" → "Take photo" (or "Sample image") → "Sign & attest this photo" is "Start camera" → "Take a selfie" ("use a sample image") → "Sign & attest (locks 1 WETH)". Step 7 "Voters find it does not" is "Voters say NOT PROVEN". Step A "Voters find the evidence proves the fake" is "Voters say FAKE (evidence proves it)". Step 8 "Advance time past the challenge period" is "Demo: skip to end of challenge + reveal period". The step 3 sentence on the page says "a registered **device** signed … and a deposit **was** at stake" | Copy the real labels into the table |
| 2 | minor, **partial regression of m-3** | Web, two tabs, vote | Commit and reveal an accusation in tab 1. Open tab 2 on the Accuser tab. Click "Voters say NOT PROVEN" in tab 1 and "Voters say FAKE" in tab 2 at the same time | One vote wins. The other tab says plainly that the accusation is already decided | **Both** fail, with raw UMA reverts: tab 1 "UMA vote failed: Revealed data != commit hash", tab 2 "UMA vote failed: Cannot commit in reveal phase". No outcome; the accusation stays `pending` on the chain. One more click completes it (0.9 s). The edge test W-I only checks that the text has no "coalesce" (`probe-accuse-tab1.png`, `probe-recover-after-double-vote.png`) | Serialize votes per assertion (check the round's commit/reveal state first) and map these reverts to "a vote is already running on this accusation, wait and reload" |
| 3 | minor | Web fatal screen "cannot reach the local chain" | Step-by-step mode on 9245/5873 (`npm run chain`, `deploy`, `web`). Stop only the chain. Open the page | A command that brings the instance back | The hint says `cd app` / `RPC_PORT=9245 WEB_PORT=5873 npm start`. The page can only show while the web server runs, so that command always refuses ("The web port 5873 is already in use"). With `npm start`, a chain exit stops the web server too, so the page never shows there (`probe-chain-down-fatal.png`). Auto-recovery after `npm run chain` + `npm run deploy` works (1 s) | Hint: `RPC_PORT=9245 npm run chain`, then `RPC_PORT=9245 npm run deploy` |
| 4 | minor | Web Photographer, odd file | Register. "choose a file" → a 1-byte file. Then "choose a file" → a 0-byte file. Click "Sign & attest" | The empty file is refused and nothing stays ready to attest | The banner says "Load file failed: This file is empty". The 1-byte file stays loaded and "Sign & attest" stays enabled. The click attests the 1-byte file and locks 1 WETH (`2d71…4881` in My photos) | On a refused load, clear the capture and disable "Sign & attest" |
| 5 | minor | `npm start` when the instance already runs | Instance running on 9245/5873. Run `RPC_PORT=9245 WEB_PORT=5874 npm start` | It refuses and names the running page | It refuses (good), but prints "Paprika is already running at **http://127.0.0.1:5874/**", a port where nothing listens. The page is on 5873 | Print the web URL from the instance's PID/state file, or "chain 9245 already has Paprika" without a URL |
| 6 | minor | Docs, automated tests | Look for how to run the web tests in `README.md`, `app/README.md`, `docs/demo.md` | The suites and their prerequisite are listed | `npm run e2e`, `npm run e2e:edge` and `npm run screens` appear only in `app/package.json`. No document mentions them, or `npx playwright install chromium`, which a fresh machine needs | Add a "Tests" section to `app/README.md` |
| 7 | minor | Web timeline after a reload | Run demo steps 1–8. Reload the page (F5). Look at the timeline | The timeline still lists the transactions (demo step 9 shows it) | "Transactions of this session appear here." The timeline is empty. The device, My photos and accusations come back, but the timeline does not. A reload mid-demo loses step 9 | Rebuild the timeline from the chain events (the library already has the activity log), or say "since this page was loaded" |
| 8 | cosmetic, **partial regression of c-5** | CLI help | `node cli.js help` | The same path as `register` prints | Help: "create a device key (app/.state/device.json)". `register` (fixed) prints `.state/cli/<id>/device.json` | Update the help line |
| 9 | cosmetic | `npm run screens` | Run it in a clean clone, then `git status` | Clean tree | 21 tracked PNGs in `app/output/screens/` are rewritten (the tree is dirty right before a demo) | Write to a git-ignored folder unless `OUT` is given |
| 10 | cosmetic | Step-by-step stop | `npm run chain`, `deploy`, `web` on 9245; then `npm run stop -- 9245` | No per-port files remain | Stop removes them, then `app/.state/pids-9245.json` reappears (written by the exiting `npm run web`). Git-ignored | Do not write the PID file on exit |
| 11 | cosmetic | Outcome headline, 1440x900 | Vote NOT PROVEN | One line | "UMA fee +0.5 WETH" breaks inside its chip onto a second line (`09-7-vote-not-proven.png`) | `white-space: nowrap` on the chips |
| 12 | cosmetic | Photographer preview, non-image file | "choose a file" → `.txt` | A file icon or a note | The big preview shows a broken-image icon with the alt text "Preview" | Show a placeholder for non-images |
| 13 | cosmetic (documented risk) | `/rpc` allow-list | `POST /rpc {"method":"evm_setNextBlockTimestamp","params":[99999999999]}`; also `eth_sendTransaction` from the photographer | Only what the page needs, with sane values | Both are accepted (200). The first puts the next block in the year 5138 and spoils that chain. `null`, batches, `hardhat_*`, `evm_revert`, bad JSON and a 30 MB body are refused (M-1/M-2 fixed). Default host 127.0.0.1, and docs/demo.md warns not to expose it | Reject timestamps far from `now + T_photo + T_reveal + vote` |

Not tested: a second clone running `WEB_PORT=<free> npm start` while another clone's chain answers on 8545 without
that clone's deployment file. From `scripts/start.js` it would print "A node without a Paprika deployment answers…:
deploying on it" and add a second Paprika on the team's chain. I did not run it because it would touch the demo
instance.

## Earlier findings re-checked

| Earlier id | Now |
|---|---|
| B1 advance time during an accusation | Fixed (web disabled with reason; CLI refuses without `--force`) |
| B2/B3 reload after commit / reveal | Fixed (reload after commit: Reveal enabled; after reveal: vote enabled; fresh browser finds the open accusation) |
| B4 selector offers non-accusable photos | Fixed (only open records offered) |
| B5 CLI commitments | Fixed (`accuse-commit` without `--evidence` refused; reveal names the commitment) |
| M-1/M-2 `/rpc` crash and bypass | Fixed (403/400; see #13 for what is still allowed) |
| M-3 mixed CLI + web reveal | Fixed: the page kept its own photo Y, the vote decided Y; the CLI's X stayed pending and `cli.js vote false` decided it |
| M-4 "Start a new accusation" after commit | Fixed (disabled: "Reveal first: dropping a live commitment would lose its bond B") |
| M-4 (staging 1) chain restart with the page open | Fixed (notice "The chain was restarted or Paprika was redeployed…", state cleared) |
| M-6 `npm start` twice | Fixed (refuses, "Nothing was changed"; see #5 for the URL). `npm run deploy` refuses too |
| m-2 revoked verdict after the window | Fixed ("Its challenge period is over") |
| m-3 simultaneous votes | **Partial regression**: see #2 |
| m-4 forfeit | Present (`node cli.js forfeit`: "no expired commitment to forfeit") |
| m-5 `npm run stop` prefix | Fixed (edge test S-4 passes) |
| m-6 web dies, chain survives | Fixed: killing the web server restarts it (1/3), chain untouched |
| m-9 download type | Fixed (1-byte `.bin` downloads as `paprika-….bin`; edge W-F passes for GIF) |
| m-10 fatal hint ports | Fixed (real ports shown), but the command itself is wrong: see #3 |
| m-11 advance time on a fresh page | Fixed (disabled: "Nothing to wait for…") |
| m-12 new key | Fixed (tooltip: "The current key stays saved in this browser") |
| m-16 per-port files | Fixed for `npm start`; see #10 for step-by-step |
| c-2 "1 bytes" | Fixed ("1 byte") |
| c-5 CLI texts | Partial: see #8 |
| c-6 buttons while the chain is down | Fixed (dot red within 4 s; Sample, Advance and Reveal disabled) |

## Demo rehearsal (docs/demo.md, 1440x900, fake camera, camera path)

Time measured from the click: "feedback" is when the busy indicator appears, "done" is when the result shows.

| Step | Click | Feedback | Done | Result on screen (checked against the chain) |
|---|---|---|---|---|
| load | open page | – | 1.0 s | header 0/0/0 WETH = chain |
| 1 | Register the device key | 36 ms | 0.24 s | Key Active |
| 2a | Start camera | 35 ms | 0.22 s | live preview |
| 2b | Take a selfie | 42 ms | 0.20 s | still |
| 2c | Sign & attest | 36 ms | 0.47 s | "✓ Recorded on chain · 1 WETH locked", blocks 34–37; photographer −1 WETH |
| 3 | Verifier → Last attested photo | 35 ms | 0.22 s | "Signed and staked · open to challenge" |
| 4 | Change one pixel and verify again | 35 ms | 0.22 s | no record |
| 5 | Accuser → evidence → Commit | 35 ms | 0.55 s | bond locked, header = chain |
| 6 | Reveal and send to UMA | 35 ms | 0.27 s | sent to UMA |
| 7 | Voters say NOT PROVEN | 35 ms | **0.88 s** (slowest) | "Accuser −1 WETH · Photographer +0.5 WETH · UMA fee +0.5 WETH", "Measured on chain = expected by the rule ✓"; Store 0.5, credit 0.5 = chain |
| 8a | Demo: skip to end of challenge + reveal period | 36 ms | 0.24 s | refundable |
| 8b | Refund | 35 ms | 0.27 s | credit 1.5 WETH = chain |
| 9 | What just happened / timeline | – | – | 7 timeline rows with tx hashes |
| A | sample → attest → commit → reveal → Voters say FAKE → Withdraw (Accuser) | ≤118 ms | ≤0.88 s each | "Accuser +0.5 WETH · Photographer −1 WETH · UMA fee +0.5 WETH"; accuser 1.5 WETH after withdraw = chain |
| B | Revoke | – | – | after A the key is flagged; Revoke is disabled with "a flagged key cannot be revoked". Revoke tested on a fresh Active key: works, no money moves |

Machine time for steps 1–9: 6.6 s (A included: 10.3 s). About 14 clicks plus typing the evidence: roughly 45–60 s of
human clicking, which fits in 90 s. No screen went more than 2 s without feedback. The UMA vote is the slowest step,
at under 1 s. No console errors or warnings during the rehearsal. Screenshots are `01-…png` to `20-end-main.png`.

## Test results (in the clean clone)

| Suite | Result | Time |
|---|---|---|
| `contract/`: `npx hardhat test` | **9 passing**, 0 failing (9 CASE lines, invariant ok after each) | 6 s incl. install |
| `app/`: `npm run e2e` | **168 passed, 0 failed** | 22 s |
| `app/`: `npm run e2e:edge` | **15 passed, 0 failed** | 28 s |
| `app/`: `npm run screens` | **"All states as expected"** (22 screens) | 19 s |
| `app/`: `npm run demo:cli` (RPC_PORT=9245) | **13/13 steps PASS**, exit 0; `output/cli-demo.txt` not overwritten on a non-default port | 4.5 s |

## What works

- README quick start, word for word (with spare ports): clone → install → tests → `npm start` → page. The
  step-by-step commands from `docs/demo.md` / `app/README.md` all work, and `npm run stop -- <port>` removes the
  per-port files.
- CLI by hand: register, attest (non-image warning; empty, missing and duplicate files refused), verify,
  accuse-commit (evidence required), accuse-reveal, advance refused while open, refund too early (exact time),
  vote, refund, double refund refused, commit on a refunded photo refused, withdraw, unwrap, revoke, bad arguments.
  All give plain messages.
- Every header number matched `balances()` / `credits()` after every action of the rehearsal.
- Reloads after commit and after reveal; a second browser finds the open accusation; mixed CLI + web keeps the
  page's own accusation.
- Chain down: red dot, actions disabled. Chain restart + deploy: page notice and clean reset. Fatal page recovers
  by itself.
- Web server crash: restarted, chain kept. Second `npm start` / `npm run deploy` refuse.
- Revoked key: verdict "Not judged", window-aware text; attest refused with reason. Window sizes 1440/1280/1024:
  the layout wraps, tabs switch, nothing overlaps.
- Docs vs behaviour: the protocol amounts (−B; +B − f×B; +f×B; 2B − f×B), the refund time
  (`accusableUntil + T_reveal + 1 s`), the challenge-period extension by the time under accusation, "umaVote takes
  well under a second" (0.8–0.9 s), "no money moves on revoke" all hold. I found no false behavioural statement in
  `protocol.md`, `design-rationale.md` or `limits.md` (they describe the contract, which the tests exercise). The
  false statements are the labels in `demo.md` (#1), the fatal hint (#3) and the CLI help (#8).

Screenshots: `app/output/acceptance/` (rehearsal `01`–`20`, probes `probe-*`, `timings.json`).
