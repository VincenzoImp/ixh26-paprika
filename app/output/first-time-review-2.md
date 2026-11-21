# First-time review 2: cold reading by a cryptographer on the jury

# Phase 1: cold (written before opening any doc or source file)

## Screen by screen

**01 start, Photographer tab**
- What happened: the app has loaded on a "Photographer" tab with nothing done yet.
- Eye first: the big "PAPRIKA" title, then the three coloured balance pills top right, then the busy step bar.
- Not understood: `B`, `T_photo`, `T_reveal`, `f` in the blue strip; "UMA FEES (STORE)" (what store?); "P-256" (I know the curve, a normal juror won't); "register another key (free)" shown before there is any key; the pastel diagonal in the camera box looks like a photo already taken, not an empty camera; why the step bar has a dashed sub-box with 4 sub-steps.
- Unnecessary: "fixed at deployment, no owner · times are chain time (GMT+1)" at this point; the step bar and the parameter strip together (two horizontal bars before any content); the footer disclaimer competes with the content.
- Missing: the camera is below the fold. The first screen is about 5 layers of explanation (header, parameter strip, step bar, orange banner, "How it works") before the one thing a viewer remembers: a photo being signed.

**02 device key registered**
- What happened: a P-256 key was registered on chain; the "How it works" panel turned into "What just happened".
- Eye first: the right panel title "Register a device key", not the small green "Key 0x2a0e…a5e5 · Active" next to the button.
- Not understood: why the button is grey now (done? broken?).
- Unnecessary: the same tx line appears twice on the right ("On chain" in the panel and the Timeline row).
- Missing: a clear "done" state on the card itself (tick, "Key registered").

**03 camera live**
- What happened: the camera is on (it shows a green test pattern, a pac-man shape).
- Eye first: the big green image. Good: the camera is the centre here.
- Not understood: the small green "(" glyph at the top-left corner of the video; what "Mirror preview" is for.
- Unnecessary: the right panel still explains key registration (stale); I scrolled away from the step bar so I lost where I am.
- Missing: nothing big; the instruction line under the button is fine.

**04 still ready to attest**
- What happened: a still was taken; the label says it is exactly the bytes that will be attested.
- Eye first: the image, then "Sign & attest this photo".
- Not understood: the pac-man rotated between live and still (fine, it is a test feed, but on a projector it looks like a different picture).
- Unnecessary: "choose a file · use a sample image" and the mirror checkbox stay visible beside the primary action; four controls on one line.
- Missing: the cost: the button does not say it will lock 1 WETH (only the tiny "LOCKS B" chip in the title does).

**05 selfie attested**
- What happened: the photo hash was signed and recorded on chain; 1 WETH is locked; a "My photos" table appeared.
- Eye first: the orange line "This key already attested this exact file: nothing to do. Take another photo." It looks like an error right after the success.
- Not understood: why an error message shows at all; two different times (challenge until 02:52:26, refundable after 03:07:27) and why they differ; "signed between blocks 34 and 37"; the header shows Photographer "0 WETH" and a red "−1 WETH" (do they have 0 or −1?); "3 tx: wrap, approve, attest".
- Unnecessary: the long green one-liner under the button that repeats the table row; "Refund" button already shown disabled.
- Missing: a single big "Recorded. 1 WETH locked until 02:52" result next to the photo.

**06 Verifier: signed and staked**
- What happened: on the Verifier tab the same file was hashed and the contract says: signed and staked, open to challenge.
- Eye first: the verdict box "Signed and staked · open to challenge". Readable.
- Not understood: the file name is "paprika-screens-….jpg", not the "selfie-….jpg" just attested; is it the same file? The tiny "00 10" text in the thumbnail.
- Unnecessary: the verdict, "What this record shows" and the right panel say nearly the same thing three times.
- Missing: nothing. "Not shown: that a camera took this photo" is exactly the honesty I want to see.

**07 one pixel changed**
- What happened: one pixel was changed; the hash differs; the contract has no record.
- Eye first: red box with a big X "No record for this file".
- Not understood: nothing; the SHA-256 before/after line is good.
- Unnecessary: nothing much.
- Missing: the red X is the same icon and colour later used for "Proven fake" (screen 16). "No record" is not "fake", and the text itself says so, but the colour says otherwise.

**08 Accuser committed**
- What happened: the accuser chose the photo, typed an evidence URL, and committed a hash with a 1 WETH bond.
- Eye first: the purple "UMA will be asked" box, then the grey (done) Commit button.
- Not understood: "Is this photo not a genuine capture by key …?" (negated question; I had to read it twice); "UMIP-170"; "before block a" (what is block a?); the ↻ button next to the select.
- Unnecessary: the greyed-out UMA vote card below (fine as preview, but adds height); "Start a new accusation" right after committing.
- Missing: the Accuser intro banner scrolled away; I don't see the Accuser's balance going down.

**09 revealed, sent to UMA**
- What happened: the accusation was revealed; Paprika asserted to UMA and immediately disputed so a vote happens.
- Eye first: the two coloured vote buttons (red YES / green NO).
- Not understood: "Paprika asserted to UMA and disputed at once": who asserts what, and why does the contract dispute itself? "Both stakes (2B) go to UMA" sounds like the money is gone.
- Unnecessary: "Not offered (cannot be accused now): 1 under accusation" line.
- Missing: a plain "Now UMA's voters decide: fake or not?" heading.

**10 UMA vote: not proven fake**
- What happened: demo voters voted NO; the accuser lost 1 WETH, the photographer got +0.5, UMA got 0.5.
- Eye first: the "Money moved / Rule / Expected" table.
- Not understood: "B kept + (B − f×B)" took me a while; "NOT PROVEN FAKE" chip is small; why the voter phase boxes carry timestamps.
- Unnecessary: three rows (measured, rule, expected) when measured = expected; the three "Voters commit / reveal / settled" boxes.
- Missing: one sentence in big type: "Accusation rejected: Accuser −1, Photographer +0.5, UMA +0.5". The header balance pills are off-screen at this point, so the money motion is not felt.

**11 My photos after rejected accusation**
- What happened: the photographer withdrew the 0.5 credit; the photo is open to challenge again, with a later deadline.
- Eye first: the blue state chip.
- Not understood: the deadline moved from 02:52:26 to 02:55:56 (extension, I guess); "Credit waiting in Paprika" vs wallet balance.
- Unnecessary: the red "Revoke this device key" button sits on the same screen as normal actions; looks dangerous mid-demo.
- Missing: what the refund will be.

**12 time skipped**
- What happened: the demo clock jumped 1.3 h; the photo is now refundable.
- Eye first: green chip "NOT PROVEN FAKE · REFUNDABLE".
- Not understood: "challenge + reveal period" (why both).
- Unnecessary: the long green attest line above still saying "open to challenge until …" (stale).
- Missing: nothing.

**13 deposit refunded**
- What happened: the 1 WETH deposit was refunded as credit.
- Eye first: "Credit waiting in Paprika: 1 WETH".
- Not understood: why refund goes to credit and needs a second click.
- Unnecessary: the timeline is getting long.
- Missing: nothing.

**14 Verifier: not proven fake, deposit returned**
- What happened: verifying the selfie shows: nobody proved it fake, deposit returned.
- Eye first: the headline. But the icon is an empty white circle in a white box: no colour, weakest verdict visually although it is the best outcome.
- Not understood: "Not proven fake" is a double negative; from across a room it reads "fake".
- Unnecessary: same triple repetition as 06.
- Missing: a positive colour (green) for the best final state.

**15 UMA vote: fake proven**
- What happened: a second photo (a sample image) was attested, accused, and voters said YES: fake proven.
- Eye first: the outcome table again.
- Not understood: I never saw the second attest or the second accusation; where did this case come from? Why is the sample image "fake"?
- Unnecessary: same as 10.
- Missing: a cue that this is a second case.

**16 Verifier: proven fake**
- What happened: the accused file is proven fake; the key is flagged; the table lists the device's other records.
- Eye first: big red X "Proven fake". Readable from far.
- Not understood: "OTHER RECORDS OF THIS DEVICE · STILL LISTED" title.
- Unnecessary: the table is half-cut by the footer.
- Missing: nothing serious.

**17 Verifier: not judged, key flagged**
- What happened: another photo of the same key is shown as "not judged" because its key was flagged.
- Eye first: orange "!" box.
- Not understood: what "not judged" means for the reader: should I trust it or not?
- Unnecessary: —
- Missing: a one-line consequence ("Treat as unsigned.").

**18 attest blocked**
- What happened: trying to attest with the flagged key is refused.
- Eye first: the image; the refusal is a small orange line.
- Not understood: why the right panel still shows "Verifier · Verify a file" (stale).
- Unnecessary: —
- Missing: the refusal should be the loudest thing on the card, with a "Register a new key" button.

**19 key revoked**
- What happened: a new key was registered, a photo attested, then the key revoked itself; no money moved.
- Eye first: the four-row table.
- Not understood: how the new key appeared (no screenshot).
- Unnecessary: "Download" button on every row.
- Missing: —

**20 Verifier: not judged, key revoked**
- What happened: a photo from the revoked key is shown as not judged; a thief may have made it.
- Eye first: orange headline. Good.
- Not understood: why a record made *before* revocation is distrusted (makes sense after a moment: compromise time unknown).
- Unnecessary: —
- Missing: —

**21 parameters and contracts**
- What happened: the CONTRACTS strip opened: WETH, Paprika, UMA OOv3, UMA Store addresses.
- Eye first: addresses.
- Not understood: nothing; good for a technical jury.
- Unnecessary: for a 90 s demo, this is a click you don't need.
- Missing: —

**22 timeline raw calls**
- What happened: "raw calls" shows block numbers and contract function names per tx.
- Eye first: the expanded group in uppercase letter-spaced text, hard to read.
- Unnecessary: uppercase styling of the sub-rows.
- Missing: —

## Explaining it without looking back

**Product.** Paprika is a smart contract plus a web page that turns "this photo was signed by a registered device key" into a staked, challengeable on-chain claim. A device key (P-256) signs the photo's SHA-256 together with a recent block hash; the contract records it in a later block, so the photo existed between block a (the signed block hash) and block r (the record). Each record locks a deposit B = 1 WETH.

**Actors.** Photographer (holds the key, pays the deposit); Verifier (anyone with the file, read-only, no account); Accuser (anyone, posts an equal bond B to say the photo is not a genuine capture); UMA's voters (decide accusations through UMA's Optimistic Oracle / DVM); UMA itself keeps a fee.

**Money.**
- Register key: gas only.
- Attest: Photographer locks B.
- Accuse: commit (hash only, bond B locked), then reveal within T_reveal; on reveal Paprika asserts to UMA and immediately disputes, so both stakes (2B) go into a UMA vote.
- Vote says not fake: Accuser loses B; Photographer keeps B and gets B − f·B; UMA keeps f·B (f = 0.5). The challenge window is extended.
- Vote says fake: Photographer loses B; Accuser gets B back plus B − f·B; UMA keeps f·B; photo marked fake for good; key flagged, cannot attest again.
- No accusation: after T_photo + T_reveal anyone can trigger the refund; B is credited back.
- Payouts are credits, withdrawn separately (pull payment).
- Revoke: the key signs its own revocation; flagged; no money moves.

**What it does NOT guarantee.** That a camera took the photo (the key is a software key in the browser; any P-256 signer works); that the content is true; that a recompressed or resized copy is linked (exact bytes only; "no record" is not "fake"); that the photo was not public before (that is what accusers must prove); that UMA's voters are right (they are the oracle; truth = what the vote says, and they only say yes on public evidence). Records of a flagged or revoked key are "not judged", i.e. no longer vouched for.

## Grades (1-5)

| Criterion | Grade | Why |
|---|---|---|
| Immediacy | 2 | Five layers of chrome and text before the camera; the one-line pitch is not visible. |
| Clarity of each step | 3 | Each step is explained well in the right panel, but some steps show contradictory messages (orange error after success) and stale panels. |
| Visual hierarchy | 3 | Verifier verdicts are strong; Photographer and Accuser cards bury the result in small lines; balances leave the screen when scrolling. |
| Density | 2 | Too much: the same fact said 3 times (card, right panel, timeline); parameter strip and step bar always on. |
| Trust | 4 | Real tx hashes, measured = expected table, honest "Not shown" line, contract addresses. Loses a point for the "already attested" error and stale panels. |

---

# Phase 2: against the truth

Sources read: `docs/protocol.md`, `docs/demo.md`, `app/web/index.html`, `app/web/styles.css`.

## What I misread in Phase 1

1. **"Both stakes (2B) go to UMA" = money gone.** Wrong. OOv3 *holds* both stakes until the vote, then pays `2B − f×B` back to Paprika for the winner and only `f×B` to UMA's Store. The sentence on the Reveal card and in the explainer makes a juror think 2 WETH is spent.
2. **"Paprika disputes itself" looked like a bug.** It is the design: the contract asserts with the accuser's bond and disputes at once with the record's deposit, so every accusation goes to a token-holder vote and never wins by silence (`LIVENESS` has no effect). The UI names the mechanism ("asserted … and disputed at once") but not the purpose in the card itself.
3. **The orange "This key already attested this exact file" (screen 05, 11-13) is not an error of the attest.** It is the pre-check message (`capture-warning`) for the still that is still loaded after a successful attest. It is a leftover, but it reads as a failure next to the success line.
4. **Header "0 WETH / −1 WETH".** The accounts hold ETH and wrap it into WETH only when they pay. So the WETH balance stays 0 and the red `delta` shows the net change. I read it as a negative balance.
5. **File name on the Verifier (`paprika-screens-….jpg` vs `selfie-….jpg`).** It is the same bytes, loaded with "Last attested photo"; only the name differs. I suspected a different file.
6. **"Not judged" (screens 17, 20).** I read it as "no longer valid". In the contract the record keeps its state and can still be accused or refunded; the verifier only reports `recordedBeforeFlag` and the flag reason. "Not judged" is the app's wording for "the key is flagged, so the app does not vouch either way".
7. **"UMA fees (Store)".** UMA's `Store` is UMA's fee contract; it receives `f×B`. Not a shop.
8. **The second case (15-17).** Two sample photos were attested (7897… at blocks 54-57 and d93e… at 57-60); d93e… was proven fake, 7897… became "not judged" through the flag. I could not reconstruct this from the screens: no screenshot shows the second attest or the second accusation.
9. **Revocation (19).** It was done on a *new* key (0x3a3e…), registered after the first key was flagged, because a flagged key cannot be revoked. I only half-noticed the KEY column change.
10. **What it does not guarantee: I missed two items.** The key holder can sign a file that existed *before* block `a` (the record only bounds the file's existence from above, by block `r`), and the record does not say *who* the photographer is. I also did not know that an unrevealed commitment can be forfeited and its bond burned.
11. **Green "(" glyph on the live camera (03-05).** It is the frame counter of the browser's fake camera, partly hidden by the "Live camera" tag; not an app glyph. On a real camera it disappears, but the tag still covers the top-left of the image.
12. **Raw-calls sub-rows in capitals (22).** Not a design choice: `.timeline details .sub` inherits the header's `.sub` rule (`text-transform:uppercase; letter-spacing:.6px; font-weight:700`) in `styles.css`. A class-name collision.

What I got right without the docs: the actors, blocks `a` and `r`, commit-reveal against front-running, the money of both vote outcomes, refund after `T_photo + T_reveal`, credits as pull payments, flag on fake proven, revocation with no money, the "no record ≠ fake" point, and the honesty of "Not shown: that a camera took this photo".

## Prioritised changes (top 5 marked ★)

### ★1. Put the camera on the first screen of the Photographer tab
- **Element:** `.params` strip, `.pmap` step bar, `p.intro.act-ph`, card ① (`btn-register`), card ② (`.cambig`).
- **Problem:** at 1440×900 the first screen is header + parameter strip + step bar + orange intro + the register card; the camera card starts at y≈485 and its button row is below the fold (01, 02). The selfie camera is the centre of the tab only after scrolling.
- **Change:**
  - Move `B`, `T_photo`, `T_reveal`, `f` into the existing `details.contracts` (rename summary to "Parameters & contracts"). Keep `B = 1 WETH` visible as text inside the step bar: "② Attest (locks 1 WETH)", and "③ Challenge period (1 h)".
  - Reword the intro to one line: "**Photographer**: sign a photo with your device key and lock 1 WETH. You get it back if nobody proves it fake within 1 hour." (drop the P-256 parenthetical; it is already in the register card's note.)
  - Once a key is registered, collapse card ① to one line ("✓ Device key 0x2a0e…a5e5 · Active") with `Details` closed.
  - Cap `.cambig` at `max-height: 52vh` so the camera and its button row fit together.
- **Why:** a viewer remembers "take a selfie, sign it, money locked". The first thing on screen should be that, not five layers of explanation.

### ★2. One clean result after "Sign & attest", no contradictory line
- **Element:** `capture-warning` (orange `.hint`), `capture-result` (green `.status.ok`), `btn-attest`, the camera row.
- **Problem:** right after success the card shows an orange "This key already attested this exact file: nothing to do" plus a two-line green sentence with two timestamps (05). It reads as an error, and repeats the My photos row. It stays there through 11-13 with a stale deadline.
- **Change:**
  - Do not show `capture-warning` for the photo that was just attested. Replace `btn-attest` with "Take another photo" after success.
  - Replace the green line by a result block under the image (same style as `.verdict.open`): big line "✓ Recorded on chain · 1 WETH locked", small line "Signed between blocks 34 and 37 · open to challenge until 02:52 (chain time)". Drop the "refundable after" time here (it is in My photos and Details).
  - Put the cost on the button itself: "Sign & attest (locks 1 WETH)".
  - When the camera is live or a still is shown, hide "or choose a file · use a sample image" and "Mirror preview" behind one "Other source…" link.
- **Why:** primary action, then result, right below it. No red-flag colour after a success.

### ★3. Verifier verdict readable from the back of the room, one colour per meaning
- **Element:** `.verdict`, `.bigt`, `.seal`, `verify-detail`, classes `bad` / `open` / `neutral` / `flag`.
- **Problem:** the headline is 22 px and the detail 13 px. "No record" (07) and "Proven fake" (16) share the same red box and ✕, though the app itself says "no record does not mean fake". The best final state, "Not proven fake · deposit returned" (14), has the weakest look (white box, empty ○) and is a double negative that reads as "fake" from far away.
- **Change:**
  - `.bigt` 22 → 34 px, `.seal` 52 → 76 px (font 27 → 40 px), `verify-detail` 13 → 15 px. Give the verdict box the full width of the card, with the thumbnail below or to the right.
  - Colours and seals: Proven fake = rose + ✕ (keep). No record = white/grey + "∅", headline "No record for this exact file". Open to challenge = sky + clock (keep). Not judged = peach + "!" (keep).
  - Reword 14: headline "Signed · 1 accusation rejected · deposit returned"; detail "Nobody proved it fake within the challenge period. This is not proof that it is real." Keep it sky or neutral, not green: a fake that nobody challenged also ends Refunded (protocol, Cases), so green would overclaim.
- **Why:** the verdict is the money shot for a jury. It must be read in one second from 5 m, and red must mean "fake" only.

### ★4. UMA vote and money outcome in one sentence, with balances in view
- **Element:** `accuse-panel-settle` (`settle-outcome` chip, measured/rule/expected table, `settle-check`), `accuse-panel-vote` (`btn-vote-fake`, `btn-vote-not-fake`, `ol.phases`), `header` with `.balances`.
- **Problem:** the outcome is a 3-row × 3-column table with formulas (`B kept + (B − f×B)`); the verdict chip is 11 px. The header balances with their deltas are scrolled away when the vote ends (10, 15), so the money motion is not seen.
- **Change:**
  - Above the table add one line in 22 px: "Voters: NOT FAKE → Accuser −1 WETH · Photographer +0.5 WETH · UMA fee +0.5 WETH" (or "Voters: FAKE → Accuser +0.5 · Photographer −1 · UMA fee +0.5"), with the actor colours on each amount.
  - Keep the "Money moved (measured)" row; fold the "Rule" and "Expected" rows into `settle-check`: "✓ measured on chain = rule (show rule)" with a toggle.
  - Rename the vote buttons: "Voters say FAKE (evidence proves it)" / "Voters say NOT PROVEN". Shorten `ol.phases` to small inline text ("commit ✓ · reveal ✓ · settled ✓") instead of three boxes with timestamps.
  - Make `header` `position: sticky; top: 0` (and `aside` `top` ≈ 84px), so the three balance pills and their deltas stay visible while scrolling.
- **Why:** a juror needs "who lost, who won, how much" in three seconds, and to see the pills change at the same moment.

### ★5. Say what the reveal and the UMA question mean, without negation
- **Element:** `uma-question` note on the Commit card; the Reveal card text; the explainer text for Reveal; the timeline label "Paprika asserted to UMA and disputed at once".
- **Problem:** "Is this photo not a genuine capture by key K?" is a negated question; "Both stakes (2B) go to UMA" reads as money spent; "asserted … and disputed at once" is UMA jargon.
- **Change:**
  - `uma-question`: "**UMA's voters will decide:** is this photo a fake, i.e. not a genuine capture by key K? They say FAKE only on public, checkable evidence (UMIP-170). The accuser must prove it."
  - Reveal card: "Reveal sends the case to UMA's vote. UMA holds both stakes (1 WETH from each side) until the vote, then pays the winner. Paprika disputes its own claim at once, so every accusation is voted on, never won by silence."
  - Timeline label: "Accuser revealed · case sent to UMA vote (2 × 1 WETH held by UMA)".
- **Why:** these are the two sentences a cryptographer will challenge; they must be exactly right and readable in one pass.

### 6. Remove "register another key (free)" before any key exists
- **Element:** `btn-generate-key`.
- **Problem:** on screen 01 the user has no key yet and already sees "register another key".
- **Change:** hide it until the device is flagged; then show it next to `flag-note` as a real button "Register a new key (free)". Also show this button in the attest card when the refusal "This key is flagged… Register another key" appears (18).
- **Why:** fewer choices at the start; a clear way out when the key is flagged.

### 7. Make refusals and the right panel never stale
- **Element:** `explainer` ("What just happened"), `capture-warning`.
- **Problem:** in 18 the attest is refused (small orange line) while the right panel still shows "Verifier · Verify a file"; in 03-04 the panel still explains registration.
- **Change:** when an action is refused, write the refusal into the explainer ("Refused before any transaction: this key is flagged (fake proven at block 74). No money moved."). When a step only changes the screen (camera on, still taken), show a short "Next: press Sign & attest (locks 1 WETH)" in the explainer.
- **Why:** the right panel is the narrator; if it is stale, the viewer trusts it less.

### 8. Merge the Verifier's three repeated explanations into one
- **Element:** `verify-honest-sentence`, `verify-not-shown`, and the explainer text for "Verify a file".
- **Problem:** 06, 14, 16, 17, 20 say the same fact three times (verdict detail, "What this record shows", right panel).
- **Change:** one box under the verdict: "**Shows:** a registered key signed this exact file between block 34 and block 37, with 1 WETH at stake. **Does not show:** that a camera took it, or who took it." Right panel keeps only the "Why" (one read call, no account).
- **Why:** less to read; the honesty line becomes stronger, not weaker.

### 9. Shorten the My photos state chips
- **Element:** `deposits-table` State column chips.
- **Problem:** "OPEN TO CHALLENGE UNTIL 2026-11-21 02:52:26" wraps onto two lines and the Photo/Key hashes wrap mid-hash (05, 11, 18, 19).
- **Change:** chip "OPEN · until 02:52" (date only if not today); put the full time in a `title`. Give the Photo and Key columns `white-space: nowrap`. Drop the disabled "Refund" button on rows that are not refundable; show it only when it can be pressed.
- **Why:** a table that fits on one line per photo is scannable.

### 10. Hide the Revoke card until needed
- **Element:** `.card.minor` "⑥ Revoke this device key" (`btn-revoke`).
- **Problem:** a rose "Revoke this device key" button sits under every Photographer action (11-13), looking like a danger mid-demo.
- **Change:** turn it into a closed `<details>` with summary "Key lost or stolen? Revoke it (no money moves)".
- **Why:** removes a leftover from the main path; still one click away for optional step B.

### 11. Remove the duplicate step indicators
- **Element:** `.pmap` sub-steps (Commit, Reveal, UMA vote, Outcome) and the Accuser `.stepper` (`accuse-step-1..4`).
- **Problem:** two progress bars for the same four steps; the pmap also shows sub-steps on the Photographer and Verifier tabs, where they don't apply.
- **Change:** keep `.pmap` at the top level only ("① Register → ② Attest → ③ Challenge period (1 h) → ④ Refund · ⑤ Verify · ⑥ Revoke") and keep the Accuser `.stepper` for the four sub-steps.
- **Why:** one less bar on every screen.

### 12. Fix the raw-calls capitals (CSS collision)
- **Element:** `.timeline details .sub` in `styles.css`.
- **Problem:** inherits `.sub` (logo subtitle) → uppercase bold letter-spaced sub-rows (22), hard to read.
- **Change:** rename the class (e.g. `.txsub`) or add `text-transform:none; letter-spacing:0; font-weight:400`.
- **Why:** the raw view is for the technical jurors; it must look tidy.

## What must stay as it is

- The actor colours (Photographer peach, Verifier sky, Accuser rose, UMA lilac) used in tabs, pills, chips, table headers and timeline dots. They let a viewer follow money by colour.
- The right-hand "What just happened" + "Why" panel and its "On chain" tx line: the best explanatory element of the app.
- "Not shown: that a camera took this photo." and the footer's honesty line (demo voters, time advanced by hand, software key).
- "Change one pixel and verify again" with the SHA-256 before → after line (07): instant proof of the hash binding.
- The measured-on-chain money row and the "✓ measured = rule" check (as a toggle, see ★4).
- The large camera preview once live, and the "Still: exactly the bytes that will be attested" tag.
- The progressive Accuser flow (later cards greyed until reached) and the commit-reveal explanation.
- Contract addresses collapsed by default; the timeline with tx hashes and the raw-calls toggle.
- "Other records of this device · still listed" after a flag (16, 17): it shows that a flag never deletes records.
