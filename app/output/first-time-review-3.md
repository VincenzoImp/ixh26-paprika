# First-time review 3: cold reading of the Paprika web app

Reviewer stance: academic cryptographer on a hackathon jury, never heard of the project, watching a 90-second demo. Phase 1 was written from the 24 screenshots only, before opening any doc or source file.

---

## Phase 1: cold reading (screenshots only)

### 01 Verify home, no wallet
- **What happened:** landing page. "Verify a photo", a drop zone, an empty "Recent records" box.
- **Eye went first:** the yellow banner ("Local test network · test ETH has no value · UMA voters are simulated"), then the dark "Connect MetaMask" button. The drop zone comes third, even though it is the main action.
- **Did not understand:** what "Paprika" verifies against. A database? A blockchain? What a "record" is. What "#33" means in the green pill (block number? version?).
- **Unnecessary:** "Protocol view" checkbox on a landing page; the bottom-left "Local network" chip, which repeats the yellow banner and the green pill (three network indicators on one screen).
- **Missing:** one sentence on what Paprika is ("Photos signed by a registered device, backed by a deposit anyone can challenge"). The right half of the page is empty apart from "The verdict appears here."

### 02 Attest, before connecting
- **What happened:** Attest tab. A large grey camera box, a Summary card with an "Attest photo" button that is disabled.
- **Eye went first:** the "Take a photo, or choose a file" label in the middle of the grey box. It looks like a button but probably isn't one; the real button ("Start camera") sits small underneath.
- **Did not understand:** "Device key: none"; the subtitle "Returned after 1 h 15 min" (why 1 h 15 and not 1 h?). The "⇋" icon in the corner (flip camera?).
- **Unnecessary:** "use a sample image (local)" is a demo crutch shown in the main product flow.
- **Missing:** what a device key is and why I need one. The connect-wallet prompt isn't in the Summary card.

### 03 Account menu (Alice)
- **What happened:** Alice connected (10000 ETH). The menu shows "Prepare account" (wrap ETH and approve), "Claimable 0 WETH / Claim", "Device key of this browser: None yet", "Create & register (free)", "Import", "Disconnect".
- **Eye went first:** "10000 ETH", then the two outlined buttons. The menu covers a yellow callout ("This browser ha...") in the Summary card.
- **Did not understand:** why there are two set-up steps (prepare account, then device key) and in which order. Why a *browser* has a device key. Isn't the point that a *camera* signs? A key in browser storage is weak attestation.
- **Unnecessary:** "Claimable 0 WETH" with a disabled Claim button, before the user has done anything.
- **Missing:** a numbered "1. prepare, 2. register key" order. As it stands, set-up happens in a dropdown menu and also in the card underneath: two places for the same thing.

### 04 Camera live
- **What happened:** the account is prepared and the key is active (ETH went from 10000 to 9997; the block went from 33 to 36). A fake camera feed (green pie) is showing.
- **Eye went first:** the green feed. Then "Device key 0x757d…834c active".
- **Did not understand:** where 3 ETH went (gas? wrapping?). "50 7" text in the corner of the feed.
- **Unnecessary:** nothing new.
- **Missing:** confirmation that set-up worked (the earlier yellow callout has just disappeared).

### 05 Attest confirm dialog
- **What happened:** photo taken (selfie.jpg, 15 KB). A confirmation modal lists the photo hash, "You lock 1 WETH", "You get it back after 1 h 15 min (challenge + reveal period) unless UMA's voters find it fake", "If proven fake you lose 1 WETH; the accuser receives part of it", "1 signature".
- **Eye went first:** the modal title, then "You lock".
- **Did not understand:** "part of it". How much? Who gets the rest?
- **Good:** this is the clearest screen in the set. It explains the economics in five lines.
- **Missing:** the device-key signature. Does the key sign the hash here, silently? That is the cryptographic core, and it is invisible.

### 06 Attest done
- **What happened:** "✓ Recorded on chain · 1 WETH locked", "View record →". A toast says "Confirmed in block 37" with the tx hash.
- **Eye went first:** the green success box. Good.
- **Unnecessary:** the toast repeats the green box. The camera still shows the feed, and "Retake" is still present after success.
- **Missing:** nothing major.

### 07 Record, open to challenge
- **What happened:** record page for 0x109a…593c. A big blue verdict ("Signed and staked · open to challenge", "anyone can accuse it for 1 h"), a yellow dashed "⏩ Skip wait (local)" chip, an "Accuse" button, a 4-step timeline (Attested #37 / Challenge period ends 08:39 / Refundable from 08:54 / Refunded), Details (Signed between block #36 and #37) and History.
- **Eye went first:** the verdict headline (good), then the yellow Skip chip (bad: a demo control inside the verdict).
- **Did not understand:** the nav highlights "Verify" though this is a record page. "Signed between block #36 and #37" is interesting (a freshness bound?), but it isn't explained. Why the refund comes 15 min after the challenge period ends.
- **Unnecessary:** the "Skip wait (local)" chip inside the verdict box. The "Accuse" button is shown to Alice, the depositor, on her own photo.
- **Missing:** the photo itself (no thumbnail on the record page). The bottom-left Local network chip overlaps the "Download the attested file" button, so the text overlaps.

### 08 Verify, signed and staked
- **What happened:** the photo was re-uploaded on Verify and matched. Same verdict box. "What this record shows / Not shown" lines. "Open record →", "Tamper test: change one pixel". The full SHA-256.
- **Eye went first:** the verdict. Good.
- **Did not understand:** the file name is "paprika-screens-1795243125046.jpg", not selfie.jpg (the test harness leaks into the shot).
- **Good:** "Not shown: that a camera took this photo, or who took it." This is honest, and a cryptographer will appreciate it.
- **Unnecessary:** "Tamper test: change one pixel" is a demo affordance on a product page. "Verify my last photo" is also a demo helper.

### 09 Tamper, no record
- **What happened:** one pixel changed, so the hash changed and there is no record. "'no record' does not mean 'fake'".
- **Eye went first:** the ∅ verdict.
- **Did not understand:** why the size jumped from 15 KB to 80 KB (re-encoding, presumably PNG).
- **Unnecessary:** the SHA-256 is shown twice (the before→after line plus the full hash), and the Tamper link is repeated.
- **Good:** the message is correct and careful.

### 10 Bob, accuse form
- **What happened:** Bob is now connected, scrolled down the record. An "Accuse this photo" card with its own 4-step bar (Commit / Reveal / UMA vote / Settled), a lilac note ("UMA's voters say FAKE only on public, checkable evidence"), an evidence textarea, "…or attach a file", "use example (local)", the bond text, and "Commit accusation".
- **Eye went first:** the "Accuse" button at the top, which duplicates "Commit accusation" at the bottom.
- **Did not understand:** why there are two stacked step bars (record lifecycle, then accusation lifecycle) with the same visual style. Why commit-reveal is needed (front-running of the accusation? the evidence?).
- **Unnecessary:** the "Accuse" button when the form is already open; "use example (local)".
- **Missing:** the yellow banner disappeared because the page is scrolled. Fine.

### 11 Commit confirm dialog
- **What happened:** modal: Bond 1 WETH; "If the evidence proves it: bond back plus part of the deposit (UMA keeps a fee)"; "If it does not: you lose 1 WETH"; "Then reveal within 15 min (one more signature)".
- **Good:** clear.
- **Did not understand:** "part of the deposit" again. Give the number (0.5 WETH).

### 12 Committed, reveal countdown
- **What happened:** the top button changed to "Reveal & send to UMA vote". The accusation bar is at Reveal. "Reveal before in 15 min (07:54:23)". A commitment hash is shown.
- **Eye went first:** the "Reveal & send to UMA vote" button. Correct.
- **Did not understand:** "Reveal before in 15 min" is a typo. Details still says "Accusations: none" and History doesn't list the commit, so it looks as if nothing happened.
- **Unnecessary:** two unlabelled hashes after "Commitment".

### 13 Under accusation, vote pending
- **What happened:** yellow "Under accusation" verdict: "UMA holds both stakes until the vote". Two dashed demo chips: "Resolve vote (local): Fake proven" / "Not proven". An orange line: "An accusation is open; one at a time." The lifecycle bar is now Attested / Challenge period / Accused / Decided (it changed shape). Then the accusation bar (UMA vote) and an Accusations card, both saying "Waiting for UMA's vote · 48-72 h on mainnet".
- **Eye went first:** the "!" and "Under accusation". Then the dashed chips, which compete with the verdict.
- **Did not understand:** "one at a time" (a warning? to whom?). The lifecycle bar changes its steps between screens (Refundable/Refunded have been replaced by Accused/Decided). "Waiting for UMA's vote" appears twice.
- **Unnecessary:** the demo resolve chips inside the verdict box; the duplicated waiting text; the orange line.

### 14 Local network tools
- **What happened:** the "Local network" chip expanded into a panel: chain clock, "Skip 1 h 15 min" (disabled: "not while an accusation waits"), "UMA vote · simulated voters (3 local accounts)" with Fake proven / Not proven buttons, and "Test ETH comes from Hardhat's prefunded accounts".
- **Eye went first:** the panel, which covers the Accusations card.
- **Did not understand:** if the voters are 3 local accounts, is the UMA vote real UMA code or a mock? "Simulated" suggests a mock.
- **Unnecessary:** the same resolve buttons exist in the verdict (13) *and* here. Two homes for one control.

### 15 Outcome, not proven
- **What happened:** "Accusation rejected · Bob −1 WETH · depositor +0.5 WETH (claimable) · UMA fee 0.5 WETH". History: Attested, Accused (#41), UMA vote: not proven (#51). The lifecycle bar is back to 5 steps (Attested / Challenge period / Not proven fake / Refundable / Refunded). The accusation bar is all green, with "Decided: see the outcome below" and "Start a new accusation".
- **Eye went first:** the bold money line. Good, it is the most informative line in the app.
- **Did not understand:** the "Not proven fake" step sits *between* Challenge period and Refundable but is grey while the challenge period is still yellow, so the order is unclear. The lifecycle bar has had 4 or 5 steps depending on the screen.
- **Unnecessary:** the local tools panel covers Details.

### 16 Protocol view drawer
- **What happened:** the "Protocol view" toggle opens a right drawer: phase chips (Register, Attest (locks B), Challenge period, Refund, Verify, Revoke), "UMA vote (simulated voters)", a list of calls (UMA VotingV2.commitVote ×3, revealVote ×3, OOv3.settleAssertion), and a table "MEASURED / RULE / EXPECTED" for Accuser −1, Depositor +0.5, Store +0.5. Then "Measured on chain = expected by the rule ✓". Symbol legend: B, T_photo, T_reveal, f.
- **Eye went first:** the call list, which shows real contract names (VotingV2, OOv3). As a cryptographer this is what I want to see.
- **Did not understand:** "Store" (UMA's store? the fee sink?). "Simulated voters" vs "VotingV2.commitVote": if these are real UMA voting contract calls, the voters are not simulated, just local accounts.
- **Note:** the main page under the drawer shows "open to challenge · 59 min" again after the outcome. Good that it reopened, but the shot is taken mid-state.

### 17 Alice, claimable credit
- **What happened:** Alice is connected. A "0.5 WETH" pill sits in the account button and a "Claim 0.5 WETH" primary button is on the record page. The record is still open to challenge. The empty accusation form is shown to Alice on her own record.
- **Eye went first:** "Claim 0.5 WETH".
- **Did not understand:** why the money isn't just sent (pull-payment, presumably for safety). Fine, but say so once.
- **Unnecessary:** the accusation form shown to the depositor.

### 18 Refundable
- **What happened:** time skipped. "Signed · 1 accusation rejected · challenge period over"; "This is not proof that it is real. The deposit can be refunded." "Refund deposit" button.
- **Eye went first:** the headline. It is long, with three clauses.
- **Did not understand:** the icon is still a clock even though the period is over.
- **Unnecessary:** the full "Accuse this photo" form is still rendered (Commit highlighted) after the challenge period has ended, with a disabled "Commit accusation". It should vanish.

### 19 Refunded
- **What happened:** "deposit returned", and now "Claim 1 WETH". The refund goes to credit, then you claim.
- **Did not understand:** the two-step "Refund", then "Claim". Did I get my money back or not? The headline says "returned" but the money is not in my wallet.
- **Unnecessary:** the accusation form again.

### 20 Explorer home
- **What happened:** "Localhost explorer", Chain 31337, latest blocks and latest transactions with decoded method names and labelled senders ("Simulated UMA voter 1", "Local faucet / operator").
- **Good:** decoded calls make the demo verifiable.
- **Did not understand:** "Local faucet / operator" settled the UMA assertion. Is there a privileged operator?
- **Unnecessary:** "Localhost" in a product title.

### 21 Explorer tx, refund decoded
- **What happened:** the refund tx: from Alice to Paprika, decoded call `Paprika.refund(photoHash, keyId)`, events Credited and Refunded, "Open record →".
- **Good:** a credible, Etherscan-like page.
- **Missing:** nothing.

### 22 Proven fake (second photo)
- **What happened:** a new record 0x8a80…4ce8. Red "Proven fake": "UMA's voters found the evidence proves this photo is not a genuine capture by this key. The depositor lost 1 WETH. The record stays, marked." Bob sees "Claim 1.5 WETH".
- **Eye went first:** the red ✕ verdict. Correct.
- **Did not understand:** the lifecycle bar now has 4 steps again (Attested / Challenge period / Accused / Proven fake). The "Challenge period" step is green with "ends 09:57", so it never ended but is marked done.
- **Unnecessary:** "Start a new accusation" on a record that is already proven fake. "Decided: see the outcome below" duplicates the Accusations card.

### 23 My activity (Alice)
- **What happened:** tabs for My records (2), My accusations (0), Transactions. State pills: "proven fake" and "not proven fake · refunded". "Claimable 1 WETH / Claim" at the top right.
- **Good:** clean and simple.
- **Missing:** an amount column (what I locked and what I got back).

### 24 Wrong network
- **What happened:** MetaMask is on another chain. A red "Switch to Paprika local" button appears, but the green "● Paprika local · #67" pill is *still green* beside it.
- **Did not understand:** am I on the right network or not? The two indicators contradict each other.

### What I think the product is (cold)
Paprika is a **staked photo-attestation registry** on an EVM chain:
- **Actors:** a *depositor* (photographer) who holds a *device key* registered on chain; an *accuser* who can challenge; *verifiers* (anyone, no wallet); *UMA's voters* as the arbiter (optimistic oracle plus DVM vote).
- **Flow:** register a device key (free), then sign the photo's SHA-256 with that key and submit it with a 1 WETH deposit. A 1 h challenge period follows. Anyone can accuse with a 1 WETH bond using commit-reveal (15 min reveal), and the evidence goes to UMA's vote. When nothing is proven, the deposit is refundable after 1 h 15 min.
- **Money flows:** deposit B = 1 WETH. Accusation rejected: accuser loses B, depositor gets +0.5 B, UMA keeps 0.5 B. Accusation upheld: the depositor loses B, and the accuser gets the bond back plus 0.5 (claims 1.5), with UMA keeping 0.5. Nothing pays out directly; all payouts go to a claimable credit (pull payment).
- **What it does NOT guarantee:** that a camera took the photo, who took it, or that the scene is real. A software key in a browser can sign anything. "No record" doesn't mean fake, and "not challenged" doesn't mean real. Truth reduces to "someone was willing to lock 1 WETH and nobody proved it fake with *public* evidence within 1 h". Security is economic and depends on UMA voter honesty and on accusers being watching. It works only for exact bytes, so any re-encoding breaks the match.

### Grades (1-5)
| Criterion | Grade | Why |
|---|---|---|
| Immediacy | 3 | The verdict boxes are instantly readable; the landing page doesn't say what Paprika is. |
| Step clarity | 2 | Two step bars per record, a lifecycle bar that changes between 4 and 5 steps, "Accuse" + "Commit accusation", the Refund→Claim two-step, the form still shown after the period ends. |
| Visual hierarchy | 3 | Strong verdict headlines; yellow demo chips and the local panel steal attention and cover content. |
| Density | 3 | Record page is long and repeats itself ("Waiting for UMA's vote" ×2, "Decided: see below", SHA ×2). |
| Trust (real product?) | 3 | Confirm dialogs, the decoded explorer and "Not shown" honesty build trust; overlapping chips and the contradictory network pill erode it. |
| Demo or product? | 2.5 | Reads as a well-built demo: yellow banner + network chip + "(local)" links + Skip/Resolve chips on nearly every screen. |

---

## Phase 2: after reading `docs/protocol.md`, `app/output/product-audit.md` (§3, §3b, §6, §8) and `app/web/` source names

### What I misread
1. **"UMA voters are simulated."** I read this as a mock oracle. It isn't one. The vote goes through UMA's real contracts (`VotingV2.commitVote` ×3, `revealVote` ×3, `OOv3.settleAssertion`), and only the three voter accounts are local. The word "simulated" (banner `index.html:27`, `localtools.js:76`, `drawer.js:35`, explorer labels `format.js:42`, and audit §3 #9/#14) undersells the most credible part of the demo. A jury cryptographer will discount the whole dispute layer because of it.
2. **"Local faucet / operator" settled the assertion** (screen 20). I read a privileged operator into this. Protocol §7 says *any account* can call `settleAssertion`, and the contract has no owner or admin (§Actors). The label made me suspect an admin.
3. **The challenge period "reset" to 59 min after the rejected accusation** (16, 17). I thought it was a bug or a restart. In fact `accusableUntil` is extended by the time spent Accused (protocol §7). The UI never says so.
4. **"Accusations: none" right after Bob committed** (12). I thought the commit had failed. The commitment hides its target by design (§5), so the record can't know it. The accuser's own browser does know, and says nothing.
5. **Refund, then Claim** (18→19). I thought the refund hadn't paid out. All payouts are credits withdrawn with `withdrawCredit` (§9, pull payment). The verdict text "deposit returned" overstates it, because the money isn't in the wallet yet.
6. **"Store"** in the drawer table (16) is UMA's Store contract, the fee sink. It wasn't named.
7. **"Signed between block #36 and #37"** is the anchor/record block bound: the device signed a recent block hash. It's a freshness proof, the nicest cryptographic detail in the system, and the UI never says why it matters. I only half-guessed it.
8. **"1 h 15 min"** is `T_photo + T_reveal`: the refund waits until no commitment made in time can still be revealed. I took it for an arbitrary number.
9. **"#33" in the green pill** is the current block, not a version.
10. **"An accusation is open; one at a time."** I read it as an error. It is the reason the Accuse button is hidden: a second reveal returns its bond (§Cases).
11. **Proven fake → device flagged.** I didn't notice that the device key gets Flagged (protocol §7); screen 22 doesn't show it above the fold. This is a major consequence and it's invisible in the verdict.
12. **The accusation form shown to Alice** (17-19) isn't a role leak. The route stayed `/accuse` after switching the MetaMask account (`record.js:122`: `accuse || m ? accusePanel…`). It is a rendering rule bug, not a permissions issue.

### Where the build departs from the design target (§3b / §6 / §8)
- §6 says inline local chips belong "next to the countdown it skips" and "on the accusation 'Waiting for UMA vote'". The build puts both inside the verdict hero (`record.js:111-114`), so the verdict box (the "best element", §3 #33) now carries demo controls.
- §3b "Record: exactly one primary action": screen 10 shows "Accuse" and "Commit accusation" at once; screens 18-19 show "Refund deposit"/"Claim" *and* a disabled "Commit accusation".
- §3b "Start a new accusation: only after an outcome or failed reveal": it also appears on a Proven-fake record (22), where no accusation is possible.
- §8 lifecycle: Attested → Challenge period → Refundable → Refunded, with the Accused branch *below*. The build changes the main bar's steps between 4 and 5 depending on state (07, 13, 15, 22).
- §3b "Result box → success toast": both are shown (06). This is acceptable, but it's duplication.

### Prioritised changes (max 12; the first 5 are "do first")

| # | Element | Problem | Exact change | Why |
|---|---|---|---|---|
| 1 **DO FIRST** | "simulated" wording: banner, local tools row, drawer title, explorer sender labels, "Local faucet / operator" | Inaccurate. The voters use UMA's real VotingV2/OOv3; only the accounts are local. "operator" implies an admin that doesn't exist | Banner → **"Local test network · test ETH has no value · UMA's vote is cast by 3 local voter accounts"**. Tools row → **"UMA vote · UMA's voting contract, 3 local voter accounts"**. Drawer title → **"UMA vote (3 local voter accounts)"**. Explorer label → **"Local UMA voter 1"**. `format.js:40` → **"Local faucet"**. The settle row in History gets "(anyone can settle)" | The jury must see that only the voters, the clock and the key storage are stand-ins, not the oracle. Accuracy is trust |
| 2 **DO FIRST** | Accuse panel (`record.js:122`) | Shown after the challenge period is over (18), after refund (19), to the depositor via a stale `/accuse` route (17), and as "Start a new accusation" on a Proven-fake record (22). "Decided: see the outcome below" duplicates the Accusations card | Render the panel only if `!notAccusable(rec)` **or** I have a live/just-settled commitment. On settle, collapse the stepper to one line: **"Your accusation: rejected · see outcome"** (or "proven"). Show "Start a new accusation" only if `!notAccusable(rec)`. Drop the `/accuse` route when the connected account changes | Removes the biggest clutter and the "can I still accuse a refunded photo?" confusion. Matches the "one primary action" rule |
| 3 **DO FIRST** | Local chips inside the verdict hero ("⏩ Skip wait (local)", "⏩ Resolve vote (local): Fake proven / Not proven") + duplicate resolve buttons in the tools panel | Demo controls sit inside the product's main verdict, and the same control appears in two places at once (13+14) | **Move** "Skip wait (local)" next to the "Refundable from 08:54" lifecycle step. **Move** the resolve chips next to "Waiting for UMA's vote · 48-72 h on mainnet" in the accusation panel. **Remove** the Fake proven / Not proven buttons from the tools panel (keep only the clock there) | The verdict reads as pure product; "dashed = local" stays next to the wait it skips (audit §6) |
| 4 **DO FIRST** | Lifecycle bar (`verdict.js:89`) | Changes between 4 and 5 steps by state. "Not proven fake" appears as a step *after* Challenge period while the period is still running (15, 17). In Proven fake, "Challenge period" is done but says "ends 09:57" (22) | Always the same 4 steps: **Attested → Challenge period → Refundable → Refunded**. In the fake branch the last two steps become **Accused → Proven fake**. Show rejections and pauses as sub-labels of Challenge period: **"ends 08:41 · extended by 1 rejected accusation"**; while accused: **"paused · UMA vote"**; when fake: **"closed by accusation"** | One stable mental model per record; it also explains the extension (misreading 3) |
| 5 **DO FIRST** | Local tools panel and pill overlapping content | The expanded panel covers Details, Accusations and Outcome in 14-23; the collapsed pill covers "Download the attested file" (07) and Details (10, 13) | Collapse the panel again after each tools action; add `padding-bottom` to `main` equal to the pill height + 16 px; when expanded, dock it as a full-width bottom sheet that pushes content up instead of floating over it | Hidden content on 11 of 24 screens; overlapping text makes it look like a prototype |
| 6 | Refund → Claim (18, 19), verdict "deposit returned" | Two steps that aren't explained; the headline claims money was returned when it is only a credit | Verdict 19 → **"Not proven fake · deposit refunded to your claimable balance"**. Refund confirm/toast: **"1 WETH added to Claimable. Claim sends it to your wallet."** Hide "Claimable 0 WETH / Claim" in the account menu when it is 0 (03) | The pull-payment rule is safe, but the user should hear it once at the moment it matters |
| 7 | Confirm dialogs: "the accuser receives part of it" (`attest.js:60`), "bond back plus part of the deposit (UMA keeps a fee)" (`record.js:49`) | Vague exactly where money is at stake | Attest → **"you lose 1 WETH: 0.5 WETH to the accuser, 0.5 WETH to UMA as its fee"**. Commit → **"you get your 1 WETH bond back plus 0.5 WETH; UMA keeps 0.5 WETH"** (compute from `f`) | The outcome card already gives exact numbers; the dialog should promise the same |
| 8 | Accusation after commit (12) | "Reveal before in 15 min" (typo); two unlabelled hashes; "Accusations: none" and an empty History make the commit look lost | Text → **"Reveal within 15 min (by 07:54)"**. Commitment line → **"Commitment 0xd95d…e3ba · tx 0x13d5…f0f7"**. For the accuser only, Details "Accusations" → **"1 committed by you (hidden until you reveal)"** | Fixes a visible typo and misreading 4 |
| 9 | Network pill + "Switch to Paprika local" (24) | The green "● Paprika local · #67" stays green while a red switch button says the wallet is on the wrong chain | Merge into one element: when the wallet chain ≠ the app chain, the pill becomes rose **"Wrong network · Switch to Paprika local"** (click = switch); otherwise green **"Paprika local · block 67"** | Two contradictory status indicators destroy trust instantly |
| 10 | Verify home (01): subtitle, "The verdict appears here.", three network indicators | The landing page never says what Paprika is; half the screen is empty; the banner, pill and chip all say "local" | Subtitle → **"See whether a registered device signed this exact file, with money at stake that anyone can challenge. No wallet needed."** Remove "The verdict appears here."; put "Recent records" in that column at the drop zone's height | The first 5 seconds of the demo explain the product |
| 11 | Verdicts for refundable/refunded (18, 19) and Proven fake (22) | The clock seal stays after the period ends; three-clause headlines; the device flag is missing from the Fake verdict | Refundable/refunded seal → neutral **"○"** (not a clock); headline → **"Not proven fake · challenge period over"**. Fake detail → append **"Device key 0x757d…834c is now flagged: it can no longer attest."** In Details, show Device key **"Flagged (fake proven) at #N"** | The flag is the system's second sanction; the jury should see it |
| 12 | Remaining demo leaks and duplicates | The top "Accuse" button stays while the form is open (10); harness filename "paprika-screens-1795….jpg" (08); "Localhost explorer"; record pages highlight the "Verify" tab; "Store" unexplained in the drawer; success box + toast both shown (06) | Hide the "Accuse" button when the panel is open. In the capture script, name the file `selfie.jpg`. Title → **"Explorer · Paprika local (chain 31337)"**. No nav tab active on `#/record`. Drawer row → **"UMA Store (fee)"**. Keep the green box, shorten the toast to the tx link only | Each one is small; together they make the difference between "demo" and "product" |

Not changed, deliberately: the confirm dialogs (best screens), "What this record shows / Not shown", "'no record' does not mean 'fake'", the decoded tx page, and the drawer's measured = expected table (jury-only, already behind a toggle). "Tamper test: change one pixel" stays as a link, as the audit decided.
