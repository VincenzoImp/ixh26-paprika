# Staging 3: rebuilt web app (HEAD 5e4bee6)

Date: 2026-11-21. Tester: QA (did not see earlier work). Product code was not changed.

Environment: Chromium (Playwright) with a fake camera (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`).
MetaMask is replaced by the scripted stand-in `e2e/fake-metamask.mjs`. Alice (#1) and Bob (#2) switch accounts in one page.

Ports used:

| Run | Chain | Web |
|---|---|---|
| e2e | 8645 | 5273 |
| edge | 9445 | 5973 |
| screens | 8745 | 5373 |
| staging3 | 9045 | 5745 |
| clean clone | 8945 | 5573 |

Every instance was stopped after its run. The team instance on 8545/5173 was not touched.

Screenshots are in `output/staging-3/`, logs in `output/staging-3/logs/`. The new suite is `e2e/staging3.e2e.mjs`
(`cd app && node e2e/staging3.e2e.mjs`). Each FAIL in that suite is an open finding below.

## 1. Findings (most severe first)

No blockers. The scripted demo story works end to end: the e2e suite gives 82/82.

| # | Sev. | Steps | Expected | Actual | One-line fix |
|---|---|---|---|---|---|
| M1 | major | Bob commits an accusation on a record. Before revealing, open Local network → "⏩ Skip 1 h 15 m", or "Skip wait" on another record. (staging3: "lost B1") | The time skip is disabled while a commitment is unrevealed: skipping makes the reveal impossible and the bond can only be burned. The old suite checked this (B1). | The skip is enabled. `skipBlocker()` (`web/js/localtools.js:16`) looks only at open accusations and accused records. Server `/demo/advance` refuses only open accusations. One click on stage destroys Bob's accusation. Screenshot `skip-enabled-during-commit.png` | Add "this browser holds a live commitment (`S.mine`)" to `skipBlocker()`. Also block it server-side when a `Committed` commitment is younger than the reveal window. |
| M2 | major | Bob clicks Commit → Confirm. While the MetaMask confirmation is open, switch MetaMask to Alice, then confirm. (staging3: "mid-tx switch") | The commitment's salt stays with Bob, who signed the transaction, and Bob is offered Reveal. | The tx is signed by Bob, but `setMine` keys the secret with the account current after the tx (`web/js/pages/record.js:33,63`). It lands under Alice. Bob is never offered Reveal and his bond is stuck. Alice is offered "Reveal & send to UMA vote" for Bob's commitment, which fails (plain message). `midtx-switch-bob.png` | Capture `S.account.address` when commit starts and key `S.mine` with it. Same for reveal, refund and claim. |
| M3 | major | Bob clicks Commit → Confirm. Reload the page while the MetaMask confirmation is open (MetaMask keeps it), then confirm. (staging3: "reload mid-commit") | The salt is saved before the signature request, so Reveal (or Forfeit) is offered after the reload. | The salt is saved only after the tx returns (`record.js:63`). After the reload the commitment is on chain, but the page has no salt: no Reveal, no Forfeit, and Bob's bond is lost. `reload-midcommit.png` | Generate the salt in the page and persist `{salt, evidenceHash, commitment, pending:true}` before calling MetaMask. Clear it only on rejection. |
| M4 | major | Bob has unclaimed credit (bond back, or winnings after "fake proven"). Open any record that can still be accused. (staging3: "unclaimed credit") | The record offers "Accuse". | The record's main action is "Claim 1.5 WETH" (`record.js:110`, the credit branch comes before Accuse). "Accuse" disappears from every record until Bob claims. On stage, Bob cannot accuse a second photo. `credit-hides-accuse.png` | Show Claim only in the account menu, the activity page or a secondary button. Keep Accuse as the record's main action. |
| M5 | major | Follow `docs/demo.md` "Click path" on stage. | It matches the app. | It describes the old UI: Photographer, Verifier and Accuser tabs, "What just happened", Timeline, "Voters say NOT PROVEN". None of these exist now. README, app/README and docs/demo.md also say "168 checks" for `npm run e2e`; it has 82. | Rewrite the click path for Verify / Attest / record / activity / Explorer, and update the counts. |
| m1 | minor | Open the local tools bar ("⚙ Local network"), go to Attest at 1440×900. | The bar does not cover page controls. | The bar (fixed, bottom-left, 541×144 px) covers "Start camera". Playwright cannot click it. `localbar-open-attest.png` | Add bottom padding to `main` equal to the bar height, or dock the bar to the right or top. |
| m2 | minor | Record page with "Download the attested file", window 1440×860–900 or 1280×860–900, not scrolled. | The pill never covers a button. | The "⚙ Local network" pill sits on "Download the attested file". `overlap-download-1440x860.png` | Same as m1: `main{padding-bottom:72px}`. |
| m3 | minor | Open `#/record/not-a-hash`. | "Not a photo hash" message. | Uncaught `pageerror: photo hash must be 0x + 64 hex characters`. The page stays on "Reading the chain…" forever, and the nav highlights "Verify". `deeplink-malformed.png` | Validate the route parameter and show the no-record card with a reason. |
| m4 | minor | Refund a record while the account has credit. | The record says why it cannot be accused ("The deposit was refunded…"). | The "Claim" action replaces the reason (same cause as M4). | Same as M4. |
| m5 | minor | Any action that gets a toast. | Rejected and old toasts expire. | Toasts never expire. After 3–4 actions they stack over the History card and the right column. Screenshot `record-1280.png` | Auto-dismiss ok and rejected toasts after about 8 s; keep failed ones. |
| m6 | minor | Wording vs docs | The banner and tools describe UMA's real `VotingV2` with three demo voter accounts run by the server (README l.27, limits.md l.62, demo.md l.151). | The banner says "UMA voters are simulated". The local tools bar says "UMA vote · simulated voters (3 local accounts)". The drawer says "UMA vote (simulated voters)". The explorer names the operator "Local faucet / operator", but there is no faucet: README says Alice and Bob hold genesis ETH. | "UMA's real vote (VotingV2) · 3 demo voter accounts run by this server". Call the operator "Operator (deployer, settles votes)". |
| m7 | minor | app/README MetaMask step 3: "Hardhat prints them [the keys] when the node starts". | The newcomer sees the keys. | `npm start` runs the node in the background, so the keys go only to `.state/chain*.log`. `web/METAMASK.md`, which lists them, is linked from no document. | Link METAMASK.md from README and app/README. |
| m8 | minor | docs/demo.md: "anyone who reaches `/rpc` can act as any demo account". | Matches the server. | Stale: `/rpc` refuses `eth_sendTransaction`, `eth_accounts` and `evm_*`. The remaining exposure is the local tools and evidence publishing. | Update the sentence. |
| c1 | cosmetic | Record page during an open vote. | "Waiting for UMA's vote" appears once. | It appears twice: in the accuse panel (`vote-waiting`) and in the Accusations card (`accusation-open`). `record-waiting-vote.png` | Keep the stepper text short ("UMA vote in progress") and the detail in the Accusations card only. |
| c2 | cosmetic | Local tools bar close button. | It has a testid like every control (TESTIDS.md). | `.t-close` has no testid. | `testid: "local-tools-close"`. |
| c3 | cosmetic | `/rpc` 403 answers. | The JSON-RPC error echoes the request `id`. | `"id":null`. | Echo the id. |
| t1 | test tooling | `fake-metamask.mjs` signed with the *selected* account and ignored `from`. | Real MetaMask signs a pending request with its `from`. | It could not reproduce M2. The new-suite check "signing: all n user transactions signed by MetaMask" was a tautology. | **Done** (test code only): the stand-in now signs with `from`, refuses an unknown `from` (4100), can keep a confirmation open (`mm.hold()` → `release()`), and applies a reject while held. |

## 2. Coverage: old suite (demo-stable-0715) vs new

The old suite had 200 checks: 182 in the demo file and 18 in edge. The new suite has 100: 82 in the demo file and 18 in edge.

**Not applicable any more:** browser wallet and faucet, two actors per page, footer and explainer layout, the old timeline.

These old checks are no longer made. The last column says whether the behaviour still holds; I re-tested each in `staging3.e2e.mjs` unless noted.

| Lost check (old label) | Still holds? |
|---|---|
| B1 "advance time disabled after commit" + reason | **No: M1** |
| Camera path: live preview, take, attest, stream (11 checks) | Yes: preview shown, selfie attested on chain, stream stopped |
| Header/menu balances = chain (35 checks) | Yes: menu ETH and WETH equal the chain; activity credit equals the chain |
| M4 chain restart detected, local state kept | Yes: pill shows down, the page recovers by itself after redeploy, every stored key and secret survives (new scope) |
| "vote not proven: challenge period extended" | Yes (chain) |
| "vote fake: Store +fB" | Yes (chain) |
| B4 refunded and fake records not offered for accusation | Yes for "no Accuse". The reason is hidden when the account has credit (m4). |
| Accuser withdraws winnings | Yes: Bob's claim from My activity pays exactly his credit |
| F2 "Not shown: that a camera took this photo" | Yes |
| Console errors and failed requests | Console: **no**, a pageerror on a malformed link (m3). Requests ≥ 400: none apart from evidence 404 |
| Per-action "no error" checks (32) | Partly: the new driver ignores the toast status. The staging3 checks rejection toasts (connect, attest, commit, reveal, refund, revoke) and Cancel in the prepare and commit dialogs |
| Refund disabled before the period / time ≥ refundableAt | Yes (refund works after Skip wait). Not re-checked separately |
| A-2 both windows show the same outcome; W-I plain message for the second vote | Not re-tested |
| `device-status` on the page; register is free | Not re-tested (the chain status is checked) |

These checks are weaker than before:

- The confirmation dialogs match words, not the amount B.
- Re-attest passes if the button is merely hidden.
- "Reveal after reload" checks visibility, not enabled.
- The `verify: one pixel changed` wait is short. My first run hit the same false negative; with a 2.5 s wait it passes.

These checks are vacuous:

- "signing … by MetaMask", now meaningful with the fixed stand-in.
- `local:false` (it is all-negative).
- The "concurrency" regex (it passes with no toast).
- Edge "body over 1 MB" (`.catch → 413`).

## 3. What works

- Contract tests: 9/9.
- Full demo story in one page with account switching: connect, connect rejected, prepare (Cancel and confirm), register.
- Attest with the fake camera and with a file (PNG).
- Verify by file and tamper test.
- Bob prepares and accuses with text, with a binary file, and with unpublished evidence (shown as "not published").
- Commit, reload, reveal; votes both ways from the inline chips and from the local tools bar.
- Outcome in words. Credit and claim match the chain to the wei.
- Fake proven flags the device and the page offers a new key.
- Skip wait, refund, revoke.
- Wrong chain: actions disabled, switch prompt, switch back.
- Rejecting each confirmation sends nothing and leaves the action offered.
- XSS: HTML and script in the evidence text show literally and never execute. `/evidence` answers with `CSP: sandbox` and `nosniff`.
- Explorer:
  - Every one of the transactions signed in the run opens decoded.
  - Garbage searches (`<img onerror>`, `0x`, huge numbers, unknown 32-byte hash) give plain answers.
  - An unknown tx says not found.
- Second window shows the same state.
- No horizontal scroll at 1440, 1280, 1024 and 800 px and at 125 % zoom. The header fits.
- Chain restart while the page is open: down state shown, then the page recovers by itself and keeps its stored secrets.
- Clean clone from README:
  - `node -v` 26.4. Hardhat 9 passing, `npm start` in about 4 s, `demo:cli` 13/13.
  - The endpoints answer and `/rpc` refuses `eth_accounts`, `evm_*` and `eth_sendTransaction`.
  - No broken links.

## 4. Test results

| Suite | Result |
|---|---|
| `contract: npx hardhat test` | 9 passing |
| `npm run e2e` | 82 passed, 0 failed |
| `npm run e2e:edge` | 18 passed, 0 failed |
| `npm run screens` | All states as expected (24 screenshots) |
| `npm run e2e` / `e2e:edge` again, with the updated stand-in | 82/0 and 18/0 |
| `node e2e/staging3.e2e.mjs` (new, 86 checks, about 2 min) | 73 passed, 13 failed. Every FAIL is a finding: M1, M2 (2 checks), M3, M4, m1, m2, m3 (2 checks), m4, m6 (2 checks), c1 |
| Clean clone (README quick start, ports 8945/5573) | pass; `demo:cli` 13/13 |
