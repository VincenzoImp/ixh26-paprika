# Paprika: first-time review by a cryptographer on the jury

Reviewer stance: academic cryptographer, never heard of the project. Phase 1 was written cold, before opening any doc, and is kept word for word. Phase 2 comes after reading the docs.

---

# PHASE 1: COLD VIEWING (verbatim notes)

## 1A. The demo app, screenshot by screenshot

**01-start-photographer**
1. Happened: nothing yet. Landing page on the "Photographer" tab, which has two numbered steps (register device, take and attest a photo) and an empty "My photos" table.
2. Eye first: the orange banner ("The Photographer owns a device...") and then the big dark "Register the device" button. The "Paprika in three lines" box on the right comes third. It is the most useful text on the page, but it sits under a heading ("What just happened") that does not fit it.
3. Not understood: "deposit **B**": B is a symbol with no value shown. "WETH": all three balances are 0 WETH, so how can the Photographer lock a deposit with 0? "UMA STORE": what is UMA (I know it vaguely as an optimistic oracle), and why does its "store" have a balance next to two people? "local chain · block 33". "use a new key": a link next to the main button, with no reason given. "Window [A, R]" column: A and R are undefined. "challenge period": how long?
4. Unnecessary: "Camera / Take photo / File... / Sample image" plus the placeholder gradient take up a lot of space before anything has happened. The footer is fine.
5. Missing: the value of B and the length of the challenge period, in plain words on the first screen. Also a sentence saying what the system claims about a photo. "Paprika in three lines" says what happens, not what a verifier can conclude.

**02-device-registered**
1. Happened: a P-256 key was generated (in the browser?) and registered on chain with a proof of possession bound to the Photographer's account. Device 0x820b…44c1 is "Active".
2. Eye first: the right panel "PHOTOGRAPHER Register a device" and the "Why" box about proof of possession.
3. Not understood: "Paprika stored the key": which contract, and is it stored on chain? Where does the key live (a browser key, a secure element, WebAuthn)? It is called a "device", but nothing in the UI looks like a device. "It cost only gas": so registering is free, which means anyone can register as many "devices" as they like. Then what does "registered device" mean as evidence?
4. Unnecessary: nothing.
5. Missing: where the private key lives ("this demo: browser key; real deployment: secure element"), stated next to the step.

**03-photo-attested**
1. Happened: a generated sample image was hashed. The device signed "PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ photoHash ‖ blockhash(34), and the record was stored in block 37. The Photographer wrapped ETH, approved, and locked B = 1 WETH "until 2026-11-21 02:38:11".
2. Eye first: the image, then the "Details" table (expanded), which is the first concrete crypto on the page. I liked it.
3. Not understood: "window [34, 37]" only makes sense after reading the "Why" box (a = anchor block, r = record block). The "Why" box says "the signature was made after block a". Right, but that bounds the *signature* time, not the *capture* time. The UI never says this, and someone hearing it once will read "photo taken between block 34 and 37". Times: the sample image is stamped 00:22:36Z (UTC), while "locked until 02:38:11" has no time zone. Is that 2 h 16 min or 16 min? I cannot tell how long the challenge period is. "allowed Paprika to take B" is an ERC-20 approve; that is fine, but it is noise.
4. Unnecessary: the three-transaction breakdown (wrap, approve, attest) appears twice, in Details and on the right, and a third time in the timeline. Wrap and approve teach nothing about the protocol.
5. Missing: a line saying "challenge period: 1 h (anyone can accuse until X)". The "Attested" line gives only the lock-until time, not the accuse-until time.

**04-verifier-attested**
1. Happened: switched to the Verifier tab. The page hashed the file, read the contract, and found the record. Status: "Attested · deposit locked · can still be accused. Anyone can accuse it until 2026-11-21 02:23:10."
2. Eye first: the big green check and "Attested". Green plus a check reads as "genuine/OK" even though the text says "can still be accused". The colour overstates the claim.
3. Not understood: "accuse until 02:23:10", but the previous screen said "B locked until 02:38:11". Two different deadlines 15 minutes apart, and nothing explains the second one. Photographer balance shows "0 WETH / −1 WETH", which looks like a debt. The file is named "paprika-photo-1.jpg" here but "sample-1795220556245.jpg" on the previous screen. Is it the same file? (I assume "Last attested photo" downloads it again under a new name.)
4. Unnecessary: nothing major. This screen is clean and the best one in the app.
5. Missing: who signed (device id) and a link to the record. Also how many accusations it has survived.

**05-verifier-one-pixel-changed**
1. Happened: one pixel (198, 278) was changed, the SHA-256 changed, and there is no record.
2. Eye first: the red X and "No record for this file".
3. Not understood: nothing. It is clear.
4. Unnecessary: nothing.
5. Missing: the honest flip side. This is exact-hash binding, so any recompression (WhatsApp, Twitter, resize) also shows "No record". As a verifier I want to know that "No record" does NOT mean "fake". The sub-line "No registered device signed this exact file" is correct, but the big red X invites the wrong reading.

**06-accuser-committed**
1. Happened: Accuser tab. The Accuser chose photo a0b4…938c, entered an evidence URL ("same image published earlier"), and committed a hash with bond B locked. A 4-step stepper is shown (Commit / Reveal / UMA vote / Outcome).
2. Eye first: the stepper, then the red banner.
3. Not understood: what goes into the commitment (photo, device, evidence, secret, accuser address; I only learn this on the next screen). "Nobody can tell which photo is accused": but with few photos in their challenge period, can the target be guessed, and does the photographer react anyway? What does "react" mean? Could they revoke, or front-run with their own accusation? The answer comes on screen 08 ("accusing its own fake"), but here it is unclear. The evidence is a free-text URL. What does "public evidence" have to prove, and to whom?
4. Unnecessary: wrap/approve rows again.
5. Missing: the question UMA will be asked, word for word. It appears only later, in step 3. Also: the accuser's balance shows −1, but the photographer's deposit is not marked "now at stake".

**07-accuser-revealed-sent-to-uma**
1. Happened: reveal. Paprika rechecked the commitment, asserted the accusation to UMA OOv3 with the accuser's bond, and immediately disputed it using the photo's deposit, so it always goes to a DVM vote.
2. Eye first: the right panel text, which is long (5 lines plus 4 lines of why).
3. Not understood: "asserted ... and disputed it with the photo's deposit". This is UMA jargon (assert/dispute), and the construction is clever but needs a picture. Who is the disputer economically? The Photographer, without having to act. That is the key idea, and it is buried. "Voters find the evidence proves the fake / Voters find it does not": these are demo buttons that decide the vote. The UI does say "demo accounts", but a juror may think the presenter just picks the outcome.
4. Unnecessary: the "Commit" section stays fully expanded above, with the same data, so the new content (UMA vote) is pushed below the fold.
5. Missing: a one-line diagram: accuser bond B + photographer deposit B → UMA vote → winner gets 2B − fB.

**08-uma-vote-not-proven**
1. Happened: three demo voters committed and revealed hidden votes; result "not proven". Accuser −1 WETH, Depositor +0.5 WETH, UMA Store +0.5 WETH. The deposit's lock is extended by the time spent under accusation.
2. Eye first: the Outcome table "Money moved / Rule / Expected". Good. Measured = expected is a nice self-check.
3. Not understood: "f" appears for the first time here, undefined on this screen (UMA's fee share; I learn f = 0.5 only on screen 19). A 50% cut to UMA's store is huge, and nothing says why. "Depositor" is a new name for the Photographer; I had to infer it. "Measured from before the commit to after the vote: wallet + credit in Paprika (+ the locked deposit, for the depositor)" is too dense to read live. The chain time is 01:24 here, while the earlier deadlines said 02:23 / 02:38. So the times are in the same zone after all, and the challenge period is ~1 h. Screen 03's UTC stamp was in a different zone.
4. Unnecessary: the seven on-chain vote transactions listed on the right; "3 vote commits / 3 vote reveals" is enough.
5. Missing: why the accuser gets only B − fB = 0.5 for being right. That is the incentive question, and the UI shows the number without justifying it.

**09-my-photos-credit-withdrawn**
1. Happened: back on Photographer. The Photographer withdrew its 0.5 WETH credit (pull payment). "My photos" shows the photo "ATTESTED · CAN BE ACCUSED", B locked until 02:40:57 (extended from 02:38:11). There is a demo control to advance time, and a "Revoke this device key" box.
2. Eye first: the "My photos" row with its blue state badge.
3. Not understood: the photo still says "can be accused" after a failed accusation. So it can be accused again, and each accusation extends the lock. Is that a griefing vector (cost B each time, but it freezes the deposit)? "Credit" versus "wallet" needs one sentence (the Why does give it, but only after the click).
4. Unnecessary: the Details table of step 2 stays open at the top, taking half the screen.
5. Missing: an accusation history on the photo row ("1 accusation, not proven").

**10-time-advanced-refund-possible**
1. Happened: demo clock jumped by T_photo + T_reveal + 1 s (1.3 h). The photo is now "UNCHALLENGED", refundable.
2. Eye first: the green "UNCHALLENGED" badge.
3. Not understood: "UNCHALLENGED" is **wrong** to my eye. This photo WAS challenged, and the challenge failed. The label should say something like "not proven fake". T_photo and T_reveal are used here undefined. 1.3 h = 1 h + 15 min + elapsed? I can only check that on screen 19.
4. Unnecessary: nothing.
5. Missing: nothing beyond the label.

**11-deposit-refunded**
1. Happened: refund called; B credited back (as credit, not to the wallet); credit waiting 1 WETH.
2. Eye first: "Credit waiting in Paprika: 1 WETH" and the enabled "Withdraw credit" button.
3. Not understood: "Anyone may call it": so a third party can trigger my refund. Fine, but why say it here?
4. Unnecessary: the refund → credit → withdraw two-step is correct engineering but is a third money concept (wallet, credit, locked) for a 90 s demo.
5. Missing: nothing.

**12-verifier-unchallenged**
1. Happened: Verifier shows "Unchallenged: nobody proved this photo fake within the challenge period; the deposit went back. The record stays." "What this record shows: a registered device signed this exact file between block 34 and block 37, and a deposit was at stake."
2. Eye first: green check, "Unchallenged".
3. Not understood: the title "Unchallenged" again contradicts the history (it was challenged). The subtitle is accurate. "What this record shows" is the most honest sentence in the app. It should be the headline, and it should add "nobody proved it fake within 1 h".
4. Unnecessary: nothing.
5. Missing: the explicit negative. This does NOT show the photo is a genuine capture of a real scene; it shows a key-holder bet B on it and nobody won a challenge. Also missing: "survived 1 accusation".

**13-uma-vote-fake-proven**
1. Happened: a different photo (I infer it from the timeline: new attestation at a different block) was accused and UMA voted "fake proven". Accuser +0.5, Depositor −1, UMA Store +0.5. The device is flagged.
2. Eye first: the "FAKE PROVEN" badge and the outcome table.
3. Not understood: **which photo?** Between screens 12 and 13 at least two new photos were attested off-screen (blocks 54–57 and 57–60). The audience never saw them being made, so the second accusation appears out of nowhere. The accuser wins only 0.5 WETH net for proving a fake. Is that enough to pay for monitoring?
4. Unnecessary: the seven vote transaction rows.
5. Missing: the photo thumbnail being judged, shown next to the outcome.

**14-verifier-proven-fake**
1. Happened: Verifier on the faked photo: "Proven fake. The depositor lost B. The record stays, marked." Below: "Other records of this device · still listed", one refunded, one still accusable.
2. Eye first: the red X, "Proven fake".
3. Not understood: why the first photo (a0b4…938c, device 0x820b) appears under "other records of this device", together with the new ones. So it is the same device. Then the device made a0b4 (genuine, refunded), 34b4 and f405 (fake). Fine, but nothing says so explicitly. "A flag stops new records. Earlier records keep their deposits and challenge periods." This is clear and good.
4. Unnecessary: nothing.
5. Missing: what the evidence was (the URL the voters saw).

**15-verifier-device-flagged**
1. Happened: Verifier on a different photo from the same (now flagged) device: "Device flagged · fake proven. Another photo of this device was proven fake; the device was flagged at block 74. This record keeps its own deposit and challenge period."
2. Eye first: the orange "!" and "Device flagged · fake proven".
3. Not understood: the headline reads as if THIS photo was proven fake. Only the subtitle corrects it.
4. Unnecessary: nothing.
5. Missing: a clear split: "This photo: not judged (can be accused until X). Its device: flagged because photo f405… was proven fake."

**16-key-revoked**
1. Happened: the Photographer had registered a *new* key (0xd214…631b, visible in the timeline as "registered the device key (free)"), attested a photo with it, then revoked the key with a self-signed revocation. Device flagged, no money moves.
2. Eye first: "My photos" with 4 rows and mixed badges.
3. Not understood: **the demo itself shows the bypass**. After the first device is flagged, the same Photographer registers a fresh key for free and keeps attesting. So "flagging a device" has no cost to a forger; the only deterrent is B per photo. The "My photos" table mixes photos from two different keys and has no device column. Revoking: the key "signs its own revocation". Then a thief who holds the key can revoke too (griefing the owner). Fine, but say it.
4. Unnecessary: the Details table again at the top.
5. Missing: a device column in "My photos"; a word on why a flag matters when keys are free.

**17-verifier-key-revoked**
1. Happened: Verifier on the photo from the revoked key: "Device flagged · key revoked. The key was revoked at block 80. This record is older and keeps its deposit."
2. Eye first: orange "!".
3. Not understood: should a verifier trust a record made by a key that was later revoked as "stolen or copied"? The thief could have made it before revocation. The UI says "keeps its deposit", which is about money, not about trust.
4. Unnecessary: nothing.
5. Missing: a sentence for the verifier: "Treat with care: the owner says this key was compromised at some point before block 80."

**18-rejected-attest-revoked-key**
1. Happened: trying to attest a new photo with the revoked key is refused: "Sign & attest failed: not active".
2. Eye first: the pink error banner at the very top.
3. Not understood: "Nothing changed on chain", yet the "On chain" box below lists "wrapped ETH into WETH" and "allowed Paprika to take B", two transactions that did go through. This is a contradiction. Also, the old green line "Attested: ecbb…cd16 · window [76, 79]" still shows under the new image, so it looks as if the new photo was attested.
4. Unnecessary: the stale "Attested" line and stale Details.
5. Missing: a pre-check. The app knows the device is flagged (it is shown in step 1), so the button should be disabled with the reason, rather than spending two transactions and then failing.

**19-parameters-and-contracts**
1. Happened: opened the collapsed "Protocol parameters and contracts" bar: B = 1 WETH (deposit = bond), T_photo = 1 hour challenge period, T_reveal = 15 minutes, f = UMA fee share 0.5, token WETH, contract addresses. "Set once at deployment; the contract has no owner and no way to change them."
2. Eye first: B, T_photo, T_reveal, f, in monospace.
3. Not understood: nothing. This is the legend I needed on screen 01.
4. Unnecessary: the contract addresses (fine to keep, but secondary).
5. Missing: nothing. It just needs to be visible from the start.

**20-timeline-raw-calls**
1. Happened: "raw calls" ticked: each timeline entry shows block · Contract.function (UMA VotingV2.commitVote, OOv3.settleAssertion, Paprika.register, WETH.approve...).
2. Eye first: the monospace call list.
3. Not understood: nothing. Good for a technical juror.
4. Unnecessary: for the demo, the timeline itself is a long scroll of WETH wraps and approvals; the raw view makes it longer.
5. Missing: nothing.

## 1A summary: my explanation without looking back

**What the product does.** A photographer holds a key (P-256, called a "device"; the demo does not show where it lives). The key is registered on chain for free, with a proof of possession. For each photo, the key signs SHA-256(photo) together with a recent block hash. The Photographer submits this to the Paprika contract and locks a deposit B (1 WETH). The record proves that the signature, not the capture, was made between the anchor block a and the record block r. Anyone can check a file with a single read call. During a challenge period (T_photo = 1 h), anyone can accuse the photo of not being a genuine capture. They commit a hash (anti-front-running), reveal, and lock an equal bond B. Paprika turns this into an UMA Optimistic Oracle assertion and immediately disputes it with the photo's deposit, so UMA's token-holder vote (DVM) always decides. The winner gets their B back plus the loser's B minus a fee f×B (f = 0.5) that goes to UMA's store. If the fake is proven, the photo is marked Fake forever and its device is flagged (no new records). A key owner can also revoke their own key. If nobody wins a challenge within the period (+ reveal period), the deposit is refunded. Records are never deleted.

**The three people.** Photographer (also called "Depositor"), who signs and stakes. Verifier: anyone with the file; no account, read-only. Accuser: anyone who stakes a bond and supplies evidence. A fourth actor is really present: UMA's voters and its store, which takes a cut.

**What money moves when.** Attest: Photographer locks B. Commit: Accuser locks B. Vote "not proven": Accuser loses B; Photographer gets B − fB as credit, and the lock is extended. Vote "fake proven": Photographer loses B; Accuser gets B back + B − fB. UMA store gets fB either way. End of period with no successful accusation: B refunded as credit. Payouts are credits that must be withdrawn. Register and revoke are free.

**What the system does NOT guarantee.** Here I am vague, and that is a UI failure. My own inferences: it does not prove the photo is a real capture (any key can sign anything; registration is free and needs no manufacturer). It does not prove the capture time, only the signing window. It does not survive recompression (exact hash). It does not detect fakes that nobody accuses or that UMA voters cannot judge from public evidence. Flagging a device costs a forger nothing because a new key is free. A fake that is worth more than B to the forger is still rational. None of this is stated in the app. The only honest hint is "What this record shows: a registered device signed this exact file between block a and r, and a deposit was at stake."

**Where my explanation is vague, so the UI failed:**
- What "device" means physically (browser key? secure element?). Never said.
- What evidence counts as "proving a fake", and what question UMA voters actually answer (the question text appears once, greyed out, on screen 06/07).
- Why f = 0.5, and whether the accuser's 0.5 B net reward is enough incentive.
- What a flag is worth when keys are free.
- The two deadlines (accuse-until vs lock-until) and T_photo/T_reveal. Resolved only on screen 19.
- What a "not proven" outcome means for the photo's status ("UNCHALLENGED" is misleading).
- Why the block-hash anchor matters at all. Only later did I connect it to the demo's evidence string "same image published earlier": the anchor lets an earlier public copy refute the record. The app never makes this link.

## 1B. The slides, cold

**Slide 1: PAPRIKA / "Signed photos, money at stake, no manufacturer."**
- Understood: the one-sentence claim. "Every attested photo is signed by a registered device and backed by a deposit that anyone can win by proving the photo fake." The red box "Not claimed: that the file came from a camera" is excellent. It disarms me before I object.
- Unclear: "registered device", for the same reason as in the app. Registered by whom? Since there is "no manufacturer", a "device" is just a key, and the word suggests hardware.
- Density: right.
- Challenge: "anyone can win by proving the photo fake". Proving to whom? The slide hides that "proving" means "convincing UMA token-holders".

**Slide 2: "Close to a solution, but centralised" (Apple reference image)**
- Understood: three weaknesses quoted from the brief (single point of failure, cross-platform lock-in, retroactive censorship), each paired with Paprika's answer. "Our test for each weakness: is it removed, or only moved somewhere else?" is a good framing.
- Unclear: the left column only quotes weaknesses. It never says what the Apple scheme *is* (a manufacturer CA signs device keys and the device signs captures). If I don't know the reference I miss what is being compared.
- Density: two text-heavy columns. "No manufacturer is needed. The price: an economic guarantee, not a proof of physical origin" is the strongest sentence on the slide, and it is placed last.
- Challenge: "accusations are decided by UMA's public vote" presented as the answer to "single point of failure". UMA's DVM is a token-weighted vote, which is a different concentration of trust, not its absence.

**Slide 3: "Register, attest, accuse"**
- Understood: the flow diagram. Register (free, PoP) → attest (sign photo hash + recent block hash, deposit B) → either no accusation within T_photo (refund) or accusation (commit-reveal, bond B, UMA decides). Verify box: anyone, hash and read.
- Unclear: T_photo and B have no values. "No fee, no treasury" contradicts slide 5, where UMA takes fB.
- Density: good. This is the slide I'd keep almost as is.
- Challenge: "no fee". There is a fee, paid to UMA.

**Slide 4: "Removed, or moved?"**
- Understood: the three weaknesses again, each marked removed or moved, plus "Where the trust goes" (to UMA's vote, the deposit, the chain). "Trust is moved, not eliminated." Good line.
- Unclear: nothing conceptually new compared with slide 2. Hearing it once, I would feel I had seen this slide already. The key-revocation footnote is orphaned here.
- Density: too dense for its information gain. Three coloured boxes of two lines each, plus a side panel, plus a footnote.
- Challenge: "Removed: no revocation list kept by anyone". There is an on-chain flag set, which is a revocation list, just a public and append-only one. Say that instead.

**Slide 5: "Who pays when someone is wrong"**
- Understood: σ = Sig_K(CAPTURE ‖ … ‖ K ‖ H ‖ blockhash(b0)), ECDSA P-256 via precompile 0x100. Not before b0, not after the record's block. Commit h(accuser ‖ photo ‖ device ‖ evidence ‖ salt), reveal within T_reveal (anti-front-running). UMA OOv3: Paprika asserts and immediately disputes with the deposit, so every accusation goes to a vote. Payoff table. f = UMA's fee. "Self-accusation always loses fB." Prior work: Kiayias–Tang CCS 2015; Ruffing–Kate–Schröder CCS 2015.
- Unclear: the "…" in the signed message (what is elided? chainId, contract; it matters for replay across chains/deployments). "Self-accusation always loses fB" is stated without saying why anyone would self-accuse. The payoff table without numbers (f = 0.5, so the accuser's net gain is only B/2).
- Density: too dense for one hearing. Four ideas (signature, commit-reveal, oracle trick, payoffs) plus prior work. The oracle trick (assert + immediate dispute with the photo's deposit) is the most original mechanism-design point in the talk, and it is one sentence in the middle.
- Challenge: the prior-work citation. Both cited works are about deposits forfeited *cryptographically* (key leakage / equivocation reveals the secret), with no oracle. Paprika forfeits by *human vote*. Citing them invites the comparison "why isn't your forfeiture cryptographic?" Also: who decides that evidence is "publicly verifiable"? The voters.

**Slide 6: "Sign a photo, then try to cheat" (live demo)**
- Understood: a 7-step click path.
- Unclear: the screenshot is unreadable at this size, and it does not match the app I saw (different top bar, more tabs). The click order (true accusation before false accusation, refund last) does not match the screenshots order (false accusation, refund, then true accusation). The footer says "vote simulated with UMA's test oracle", but the app footer says UMA's real voting contract with demo voter accounts. Which is it?
- Density: thin on content, which is fine for a demo slide.
- Challenge: "UMA's contracts real". On a local chain, with demo voters, "real" is overselling. Say "UMA's contract code, local chain, three demo voters".

**Slide 7: "What we do not claim"**
- Understood: an honest limits list. No proof of physical origin; only fakes with publicly checkable evidence are caught, and only within T_photo; punishment bounded by B; a flagged party registers a new key for free; a forger can accuse itself to cap its loss at fB; UMA vote takes 48–72 h and can err; records of one device are linkable; exact file only. "Good for: sale listings, recycled photos, small frauds. Not news, elections or legal evidence." AI disclosure.
- Unclear: "A forger can accuse itself to cap its loss at fB". I don't see the mechanism (does a pending self-accusation block honest accusers? Does losing it as accuser cost B while winning as attester recovers B − fB?). It is the single most attack-relevant line and it is a bullet.
- Density: seven bullets. Too many to absorb live, but I'd rather have them than not.
- Challenge: "Not news, elections or legal evidence" is honest but deflating at the very end. The talk ends on what it is not.

**After the 7 slides: can I state the protocol step by step?**
Mostly, yes:
1. Register: a P-256 key signs a message naming the owner's address (PoP); free.
2. Attest: the key signs (domain ‖ chain ‖ contract ‖ key ‖ H(photo) ‖ blockhash(b0)); the owner submits it with deposit B; the contract verifies via P-256 precompile; the record is in block r; window [b0, r].
3. Verify: anyone hashes the file and reads state.
4. Accuse (within T_photo): commit h(accuser ‖ photo ‖ device ‖ evidence ‖ salt) with bond B; reveal within T_reveal; Paprika asserts to UMA OOv3 and immediately disputes with the photo's deposit, so the vote is forced.
5. Outcome: fake proven means the accuser gets B + (B − fB), the photo is marked fake and the device flagged. Not proven means the attester keeps B and gains B − fB, and the period is extended.
6. No successful accusation by T_photo + T_reveal: refund.
7. Revoke: the key signs its own revocation and the device is flagged.

What I could NOT state: what the claim being judged actually is (what "genuine capture" means when the device is any key), and how the block-hash anchor relates to the evidence.

**The one thing I remember:** "Trust is moved, not eliminated." And the self-disarming red box "Not claimed: that the file came from a camera."

**First hard question I would ask:** "Registration is free and there is no manufacturer, so the device signature only says 'someone holding some key'. Strip the signature away. Isn't Paprika just 'stake B on a file hash and let UMA arbitrate'? What exactly does the P-256 signature and the block-hash anchor add over a plain staked hash commitment?"

---

# PHASE 2: CHECK AGAINST THE TRUTH, THEN PROPOSE

Sources read: `docs/protocol.md`, `docs/design-rationale.md`, `docs/limits.md`, `slides/speaker-notes.md`, `track/TRACK.md`, `slides/hard-questions.md`.

## 2.0 What I misunderstood or missed cold (the communication failures)

| # | What I believed or missed cold | The truth (source) | Where the material failed |
|---|---|---|---|
| 1 | f = 0.5 is a 50 % cut that Paprika chose, which looked arbitrary and greedy | f is UMA's `burnedBondPercentage`, set by UMA and read at each settlement. Paprika takes no fee (protocol.md, Parameters) | App: "UMA fee share 0.5" without "set by UMA". Slide 3: "no fee" contradicts fB on slide 5 |
| 2 | One file has one record | Several keys can attest the same hash. `attestersOf(H)` lists them, and the verifier must judge each key. Anyone can attest a well-known file ("Open lists", limits.md) | Missed entirely. Verifier screen shows one record only; no slide mentions it |
| 3 | Photographer = key owner = depositor | The depositor is whoever submits `attest` and is often a relayer. `owner` gives no right | App names one person "Photographer", then switches to "Depositor" in the Outcome table without saying they are the same here |
| 4 | Self-accusation: I could not reconstruct it | The forger accuses its own fake from a second account *with the real evidence*. Fake is proven and its net loss is fB, not B. The "no evidence, run out the clock" variant is neutralised by the extension | Slides 5 and 7 state the conclusion in one line, never the move |
| 5 | Missed | A forger holding an earlier commitment can reveal first. The honest accuser gets its bond back but no reward | Not in app, not on slides. This is the most important incentive gap |
| 6 | Missed | An unrevealed commitment can be forfeited by anyone; its bond is **burned** | Not in app or slides |
| 7 | Missed | A second reveal during an open accusation opens nothing and gets its bond back | Not in app or slides |
| 8 | I read the window only as a bound on signing | The record also shows the file existed no later than block r. The anchor exists so an old signature cannot look recent, and so "the image was public before block a" refutes the record | App "Why" box gives half of it; nobody links the anchor to the evidence example "same image published earlier" |
| 9 | I saw the UMA question but not the rule behind it | Under UMIP-170, voters say yes only if the claim is "true and publicly verifiable". So the burden of proof is on the accuser, by design (rationale §10) | App shows the question greyed out; the rule appears only as half a line on slide 5. It is a key design decision and it is invisible |
| 10 | Unclear whether the vote was real or simulated | The app and speaker notes agree: UMA's Optimistic Oracle V3 and VotingV2 contracts on a local chain, three demo voter accounts, clock advanced by hand. **Slide 6 says "vote simulated with UMA's test oracle", which is wrong** | Slide 6 contradicts app and notes |
| 11 | "Unchallenged" seemed wrong for a photo that was challenged | It is not a protocol state. The states are Attested / Accused / Refunded / Fake. After a rejected vote the record is Attested again | App invents a label that contradicts its own history |
| 12 | Two deadlines (accuse-until vs locked-until) unexplained | accusableUntil = r + T_photo; refund only after accusableUntil + T_reveal, so a last-second commitment can still be revealed (rationale §5) | App shows both times on different screens without naming them. The "Why" comes only at refund time |
| 13 | Where the private key lives | Docs: "a record does not prove that the key is held in secure hardware". The demo key's location is stated nowhere I read | Still unanswered. Say it in the app and on slide 4 |
| 14 | Flag looked worthless (new key free) | Correct, and the docs say so (limits.md). What the flag costs: the deposit of the proven record and the key's history | App demo shows the bypass (new key after flag) without a word |
| 15 | Slide 6 click order | Speaker notes: true accusation, then false, then refund. Screenshots: false, refund, true. The slide-6 screenshot shows an older UI | Three inconsistent orders. Fix to one |
| 16 | The track asks for "guarantees [of] authentic photo origin" for "any device" (TRACK slide 11) | Paprika deliberately does not guarantee physical origin. It replaces a manufacturer's guarantee with an economic one | The deck says this only as a side sentence ("The price: an economic guarantee"). It must be the thesis, stated up front, because a juror will otherwise score it as "did not meet the brief" |
| 17 | The brief also says cameras post-process every image (TRACK slide 2) | Exact-file matching is a stated limit | Not tied to the brief; the app's "No record" verdict reads like "fake" |
| 18 | Prior-work citation as "deposit-bound keys" | Both cited CCS 2015 papers forfeit a deposit by **cryptographic** proof (key leakage / equivocation). Paprika forfeits by **vote** | The citation invites a comparison that the slide does not make. Say the difference explicitly; it is a good point, not a weakness |

Things I got right cold, which shows the app does work: the commit-reveal purpose, PoP, the immediate dispute so the vote is forced, credits as pull payments, flags not erasing records, griefing cost N·B, revocation by the key itself.

---

## 2.1 Web app: prioritised changes

Nothing below removes a function. "Collapse" means the content stays one click away.

### DO FIRST (8)

**F1. Parameters always visible (top bar).**
- Problem: B, T_photo, T_reveal and f are undefined until screen 19, yet "B", "f×B", "T_photo + T_reveal" appear from screen 01 on.
- Change: replace the collapsed "PROTOCOL PARAMETERS AND CONTRACTS" bar with a permanent one-line legend. Keep the addresses collapsed under "contracts ▸".
  New text: **`B = 1 WETH` deposit = bond · `T_photo = 1 h` challenge period · `T_reveal = 15 min` reveal period · `f = 0.5` UMA's share of the loser's stake (set by UMA) · fixed at deployment, no owner · contracts ▸**
- Effect: every later symbol is already defined. Removes my top three confusions (B, f, the two deadlines).

**F2. Verifier verdicts: say what is shown, in neutral colours, and never more.**
- Problem: a green ✓ for "Attested · can still be accused" reads as "genuine". "Unchallenged" contradicts the history. "Device flagged · fake proven" reads as if THIS photo was judged.
- Change: make "What this record shows" the headline content, and use these exact verdicts:
  - Attested, open: icon ◷ (blue, not green ✓). Title **"Signed and staked · open to challenge"**. Sub: "Anyone can accuse it until 02:23 (chain time). Deposit B is refunded after 02:38 if nobody proves it fake."
  - Refunded / Attested after a rejected vote: title **"Not proven fake · deposit returned"** (or "· challenge period over"). Sub: "Nobody proved it fake within the challenge period. Accusations: 1, rejected by UMA's vote."
  - Fake: keep **"Proven fake"** (red ✕). Add "Evidence SHA-256: 0x… (link)".
  - Other record of a flagged device: title **"Not judged · its key is flagged"**. Sub: "Another photo of this key (f405…) was proven fake at block 74. This photo can still be accused until X."
  - Key revoked: title **"Not judged · its key was revoked at block 80"**. Sub: "The key holder declared the key compromised. This record is older than the revocation, so a thief may have made it."
  - Always shown, small, under every positive verdict: **"Not shown: that a camera took this photo."**
- Effect: the verifier, the most important screen for a juror, can no longer be read as "Paprika says genuine".

**F3. Rename the "UNCHALLENGED" badges in My photos.**
- Change: "UNCHALLENGED" becomes **"NOT PROVEN FAKE · REFUNDABLE"**, and "UNCHALLENGED · REFUNDED" becomes **"NOT PROVEN FAKE · REFUNDED"**. "ATTESTED · CAN BE ACCUSED" becomes **"OPEN TO CHALLENGE until 02:40"**. Add a small "1 accusation rejected" note on the row when relevant, and a **Key** column (0x820b…, 0xd214…).
- Effect: the history is consistent, and the mixing of two keys in one table (screen 16) becomes visible.

**F4. A protocol map that shows WHERE each part applies.**
- Problem: the Accuser tab has a good 4-step stepper, but the whole app has no map. The audience cannot see where they are in the protocol.
- Change: a thin, permanent strip under the header, with the current step highlighted after each action and the same names as slide 3:
  **① Register → ② Attest (lock B) → ③ Challenge period [Commit → Reveal → UMA vote → Outcome] → ④ Refund · ⑤ Verify (any time) · ⑥ Revoke (any time)**
  Tag each card with its step number ("② Attest", "③ Reveal"...). Keep the existing Accuser stepper as the zoom of ③.
- Effect: each click visibly lights one box of the same diagram the slides showed. This is the single best bridge between slide 3 and the demo.

**F5. Hide the token plumbing.**
- Problem: "wrapped ETH into WETH" and "allowed Paprika to take B" appear on screens 03, 06, 18 and in the timeline (about 6 of 20 timeline lines). They teach nothing about the protocol.
- Change: group them into one line, **"locked B (3 tx: wrap, approve, attest) ▸"**, expandable, in the right panel, Details and timeline. With "raw calls" ticked, show all three as today. Collapse the 7 vote transactions the same way: **"UMA vote: 3 hidden votes, 3 reveals, settle (7 tx) ▸"**.
- Effect: the timeline becomes a readable protocol trace of about 10 lines instead of 25.

**F6. Accuser: show the question, the rule and the evidence purpose at commit time.**
- Change:
  - Show the UMA question in step ① instead of greyed out in step ③: **"UMA will be asked: Is this photo not a genuine capture by key 0x820b…? Voters say YES only if the evidence is public and checkable."**
  - Rename the evidence label: **"PUBLIC EVIDENCE: only its SHA-256 goes on chain. Publish it where voters can read it. Example: the same image published before block a (34)."**
  - Reword the reveal sentence: **"Paprika opens the case at UMA with Bob's bond and, in the same transaction, contests it with Alice's deposit. Both stakes (2B) go to UMA, so every accusation is decided by a vote, never by silence."**
- Effect: shows the burden of proof and the one original mechanism (assert + immediate dispute) at the moment it happens.

**F7. Outcome table: name the people, define f, cut the dense sentence.**
- Change: column "DEPOSITOR" becomes **"PHOTOGRAPHER (depositor)"**; "UMA STORE" becomes **"UMA (fee)"**. Add under the Rule row: **"f = 0.5: share of the loser's stake that UMA keeps. Set by UMA, not by Paprika."** Replace "Measured from before the commit to after the vote: wallet + credit in Paprika (+ the locked deposit, for the depositor)." with **"Measured on chain = expected by the rule ✓"**, with the full sentence in an (i) tooltip. Rename the vote buttons **"Demo voters vote YES: the evidence proves a fake"** / **"Demo voters vote NO"**, with a caption: "Demo: you choose the 3 demo votes. Commit, reveal and settle then run on UMA's voting contract." Auto-scroll to the Outcome card after the vote.
- Effect: the money story reads in one glance, the 50 % no longer looks like Paprika's choice, and the audience is not surprised that the presenter "chooses" the verdict.

**F8. Fix the misleading rejected-attest state (screen 18).**
- Change: when the key is Flagged, disable "Sign & attest this photo" *before* any transaction, with the reason inline: **"This key is flagged (revoked at block 80). It can never attest again. Register another key to continue."** When a new image is loaded, clear the old "Attested: ecbb…" line and the old Details. If the error path is still reached, replace "Nothing changed on chain" with **"Attest refused: key not active. No deposit was taken."**
- Effect: removes a visible contradiction that a cryptographer will spot and use to doubt everything else.

### Next priority

9. **Balance chips (header).** "0 WETH / −1 WETH" reads as a debt. Show three numbers per role: **"wallet 0 · locked 1 · credit 0"**. Rename "UMA STORE" to **"UMA FEES"**.
10. **Photographer banner.** Replace with: **"The Photographer holds a signing key (here: a P-256 key generated in [the browser — state where]; any device that can sign P-256 works). Each attested photo locks B = 1 WETH. It comes back if nobody proves the photo fake within 1 h."**
11. **"use a new key"** becomes **"register another key (free)"**, with tooltip "A new key starts with no history, for example after a flag." After a flag, show next to it: **"A flagged party can register a new key for free; the flag costs it only the lost deposit and the key's history."** This is honest and pre-empts the obvious question.
12. **Attested line (step ②).** "Attested: a0b4…938c · window [34, 37] · B locked until 02:38:11" becomes **"Attested a0b4…938c · signed between blocks 34 and 37 · open to challenge until 02:23 · refundable after 02:38 (chain time)"**.
13. **"WINDOW [A, R]"** column header becomes **"SIGNED BETWEEN BLOCKS"**. In Details, "Anchor block a" becomes **"Anchor block a (signed after)"** and "Record window" becomes **"Record block r (on chain by)"**.
14. **Attest "Why" box.** Add the link to the evidence: **"Why: nobody can predict a block hash, so the signature was made after block a; the record is in block r, so the file existed by then. If the same image was public before block a, the record is refuted."**
15. **One-pixel result.** Keep the title. New sub-text: **"No registered key signed this exact file. A resized or recompressed copy also has no record: 'no record' does not mean 'fake'."** Show the old and new SHA-256 prefixes side by side; the image itself looks identical, so the hash is the only visible change.
16. **Verifier: signer and multiple attesters.** Add "Signed by key 0x820b…44c1 · deposit by 0x…". If `attestersOf` returns more than one key, list one verdict per key with: **"Several keys attested this file. Each is a separate claim; judge each key by its history."**
17. **Initial right panel.** The kicker "WHAT JUST HAPPENED" over "Paprika in three lines" becomes **"HOW IT WORKS"** until the first action.
18. **Demo clock.** "moved forward by T_photo + T_reveal + 1 s (1.3 hours)" becomes **"Demo: skipped the 1 h challenge period + 15 min reveal period. On a real network this is just waiting."** The button becomes **"Demo: skip to end of challenge + reveal period"**.
19. **Times.** Label every time "(chain time)" and use one time zone. The sample image stamps UTC ("…Z") while chain times are unlabeled local time.
20. **Revoke box.** Add: **"Anyone holding the key can revoke it, including a thief. The owner then registers a new key."**
21. **Settled line.** "Anyone (operator) settled the assertion" becomes **"Settled at UMA (anyone can call it; here the demo operator)"**.
22. **Refund "Why"**: "Anyone may call it" becomes **"Anyone may trigger the refund; the money always goes to the depositor."**
23. **Collapse Details by default** after attest (it pushes "My photos" below the fold). The presenter opens it once on purpose.
24. **Accuser after reveal**: collapse the Commit card to one summary line ("① committed: hash only, bond B locked ✓") so ③ UMA vote rises into view.

### Must stay exactly as it is (it works)
- The three role tabs, role colours and role chips in the right panel.
- The "What just happened" + "Why:" pattern. The Why lines are the best teaching in the app (PoP, unpredictable block hash, mempool copy, immediate dispute, credits, extension).
- "What this record shows: a registered device signed this exact file between block a and block r, and a deposit was at stake." Keep the wording; only promote it.
- "Change one pixel and verify again": the single most effective button.
- The Details table with the signed message written as `"PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ H ‖ blockhash(a)`.
- The Outcome table rows "Money moved (measured) / Rule / Expected". Measured = expected is persuasive to a technical jury.
- "Other records of this device · still listed" and "A flag stops new records. Earlier records keep their deposits and challenge periods."
- The raw-calls toggle (block · Contract.function).
- The dashed "DEMO CONTROL · LOCAL CHAIN ONLY" box, and the footer sentence about what is real and what is a demo shortcut.
- "Set once at deployment; the contract has no owner and no way to change them."

---

## 2.2 Demo script (90 s)

Principle: **one file, one story, one verdict that changes.** Use the running example: Alice attests a photo, Bob proves it is recycled, UMA decides. The same file is verified before and after, so the audience sees the verdict flip. Skip the false accusation, the refund and revocation live; they are on slide 5 and slide 7, and the app is available for questions.

Pre-state: fresh chain, Photographer tab open, parameters legend visible (F1). The Accuser's evidence field is prefilled.

| t | Click | Presenter says (one sentence) | Screen-change flag |
|---|---|---|---|
| 0–8 s | Photographer → **Register the device** | "Alice's device makes a P-256 key and registers it for free: the key signs Alice's address, and no manufacturer is asked." | Small change (button greys, "Active"). Point at the right panel. |
| 8–22 s | **Sample image** → **Sign & attest this photo** | "The key signs the photo's hash together with the latest block hash, and Alice locks one WETH: signed after block 34, on chain by block 37, open to challenge for one hour." | **Too much**: 3 tx, Details opens, page scrolls. Collapse Details by default (item 23) and group the tx (F5). Point only at the "Attested…" line. |
| 22–32 s | **Verifier** → **Last attested photo** | "Anyone with the file checks it with one read call, with no account: signed, staked, open to challenge, and nothing more." | Good. With F2, the icon is blue, not a green ✓. |
| 32–40 s | **Change one pixel and verify again** | "One pixel changed, so the hash changed: no record. The record binds this exact file, so a recompressed copy also has no record." | **Too little**: the image looks identical. Point at the verdict box. Ideally show old and new hash prefixes (item 15). |
| 40–55 s | **Accuser** → **Commit (lock bond B)** | "Bob found this exact image published last week, before block 34; he first commits only a hash with his own one-WETH bond, so nobody can copy his accusation or get in first." | Small change. Point at the right panel ("only a hash went on chain"). |
| 55–65 s | **Reveal and send to UMA** | "On reveal, Paprika opens the case at UMA with Bob's bond and contests it at once with Alice's deposit, so it always goes to a vote and never wins by silence." | New section appears below the fold. Collapse the Commit card (item 24) or scroll once. |
| 65–78 s | **Demo voters vote YES** → scroll to Outcome | "UMA's voters say yes only if the evidence is public and checkable; here it is: Bob gets his bond back plus Alice's deposit minus UMA's fee, and Alice's key is flagged." | **Too much**: 7 tx, three phase boxes, a table. Auto-scroll to Outcome (F7). Read only the "Money moved" row. |
| 78–90 s | **Verifier** (same file) | "Same file, new verdict: proven fake, and the record is never deleted. If nobody had accused it, Alice would get her deposit back after the hour." | Strong, clear change. End here. |

Skip live: wrap/approve details, raw calls, parameters panel (already visible), the false accusation, time advance and refund, revocation, withdraw credit. If a juror asks, run the false accusation (about 25 s) during Q&A. That path exists and is the second-best thing to show.

---

## 2.3 Slides: the deck as it should be

Style rules for all slides: Simple Technical English, one claim per sentence, symbols defined once, demo values given once (B = 1 WETH, T_photo = 1 h, T_reveal = 15 min, f = 0.5 set by UMA). Running example on every slide: **Alice** attests, **Bob** accuses, **UMA** decides.

**Words to avoid:** "proves origin", "authentic", "verified photo", "detects fakes", "trustless", "guarantees" (unless followed by "economic" and what exactly), "secure device", "tamper-proof", "censorship-proof", "decentralised" without saying what is decentralised, "no fee" (say "Paprika takes no fee"), "removes trust", "real UMA" (say "UMA's contracts on a local chain"), "simulated" (wrong), "deposit-bound keys" as a description of Paprika, "camera" except in a negation, "device" as if it implied hardware (say "device key" or "key"). Use instead: "signed claim", "staked", "challengeable", "not proven fake", "trust is moved".

### Slide 1: PAPRIKA, photo origin as a claim with money at stake
- **On slide:**
  - Left: **PAPRIKA**. "Signed photos. Money at stake. No manufacturer."
  - Right: "Apple proves a photo's origin by asking you to trust Apple. Paprika asks you to trust no manufacturer: origin becomes a **signed claim** with **money at stake** that **anyone can challenge**."
  - Red box: "**Not claimed:** that a camera took the photo."
- **Figure:** three icons left to right. Alice (key + photo + coin "B") → a public record → Bob (document + coin "B") → a ballot box "UMA".
- **Spoken:** "Apple proves a photo's origin by asking you to trust Apple. Paprika asks you to trust no manufacturer. Alice signs a claim about her photo and locks money behind it. Anyone, like Bob, can challenge the claim with public evidence, and UMA's public vote decides who loses the money. We do not claim the photo came from a camera; we say what we prove instead."

### Slide 2: The reference design trusts one company
- **On slide:**
  - Left, a small chain figure (below).
  - Right, the brief's three weaknesses (slide 10), one line each: **Single point of failure**: central revocation lists; one compromised CA invalidates millions of devices. **Cross-platform lock-in**: non-Apple devices cannot verify without Apple's servers. **Retroactive censorship**: old photos become unverifiable if servers shut down or keys change.
  - Bottom: "Physical origin needs trusted hardware; trusted hardware needs a manufacturer. **We drop the manufacturer, and we pay for it.** Our test for each weakness: is it removed, or only moved?"
- **Figure:** one row: Factory CAs → sensor key + Secure Enclave key → Apple timestamps [T₀, T₁] → Apple cloud verifies → Apple revocation lists. Every box after the first carries a small Apple tag.
- **Spoken:** "The brief's reference is Apple's design: the sensor and the secure enclave sign in hardware, Apple's CAs certify them, and Apple's servers timestamp, verify and revoke. The cryptography is sound; the trust sits in one company, and that gives the three weaknesses of the brief. A guarantee of physical origin needs trusted hardware, and trusted hardware needs a manufacturer. We remove the manufacturer, and we say plainly what that costs."

### Slide 3: The protocol: register, attest, challenge, verify
- **On slide (4 numbered boxes plus a verify bar):**
  1. **Register** (free). Alice's key signs her address: proof of possession.
  2. **Attest.** The key signs H(photo) and blockhash(a). Alice locks **B**.
  3. **Challenge** (until r + T_photo). Bob commits, then reveals, with bond **B**. UMA votes.
  4. **Outcome.** The loser loses B. The winner gets B − f·B of it. No challenge: Alice gets B back.
  - Verify bar: "**Anyone**: hash the file, read the contract. No account, no transaction, no server."
  - Footer: "One contract. No owner, no admin key. Paprika takes no fee. Parameters fixed at deployment."
- **Figure:** a horizontal time axis: block **a** (anchor) → block **r** (record, B locked) → **r + T_photo** (last commitment) → **+ T_reveal** (refund possible). Alice's actions above the axis; Bob's commit → reveal → UMA vote below, as a branch that returns to the axis (period extended) or ends at "Fake".
- **Spoken:** "Four steps. Alice registers her key for free by signing her own address, so nobody can register her key first. To attest, the key signs the photo hash with a recent block hash, and Alice locks a deposit B. For a challenge period T_photo, anyone can accuse the photo with an equal bond, and UMA's vote decides. If nobody wins a challenge, Alice gets B back, and the record stays forever. Anyone can verify with one read call."

### Slide 4: What the cryptography proves, and what it does not
- **On slide:**
  - σ = Sig_K("PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ H ‖ blockhash(a)). ECDSA P-256, checked on chain (precompile, EIP-7951), low-s.
  - **A record proves:** key K signed this exact file H; after block a (block hashes are unpredictable); the file existed by block r; the signature is bound to this chain and contract; B is at stake.
  - **A record does not prove:** that a camera took the photo; that the key is in secure hardware (the demo key is [state where]); when the scene was captured (an old file can be signed today); who Alice is.
  - **Accusation commitment:** c = keccak(Bob ‖ H ‖ keyId ‖ H(evidence) ‖ salt). It hides the target and binds Bob's address, so a copy cannot be revealed. Reveal comes at least one block later.
- **Figure:** a block line with the window [a, r] shaded; one arrow labelled "Bob's evidence: the same image was public *before a*", landing to the left of the window.
- **Spoken:** "This is all the cryptography claims. The key signed this exact file after block a, because nobody can predict a block hash, and before block r, where the record lies. That window is what makes Bob's evidence work: if the same image was public before block a, the record is refuted. Bob's accusation is a commitment that names his address, so a front-runner cannot copy it and the forger cannot see it coming. Nothing here proves a camera, and we do not say it does."

### Slide 5: Who pays when someone is wrong
- **On slide:**
  - "Paprika **asserts** Bob's accusation at UMA's Optimistic Oracle with Bob's bond, and **disputes** it in the same transaction with Alice's deposit. Every accusation goes to UMA's vote; none wins by silence."
  - UMA's question: "Is this photo not a genuine capture by key K? Evidence: SHA-256 …". Voters say yes only if the claim is **true and publicly verifiable** (UMIP-170). **The burden of proof is on Bob.**
  - Table:

    | | Bob (accuser) | Alice (attester) |
    |---|---|---|
    | Fake proven | +B − f·B | −B; record Fake; key flagged |
    | Not proven | −B | +B − f·B; challenge period extended |

    "f: UMA's share of the loser's stake, set by UMA (0.5 today)."
  - **Deterrence, honestly:** "A forger who expects to be caught accuses itself first: its loss is f·B. Expected punishment is between p·f·B and p·B. A fake worth more than that is not deterred."
  - Small: "Related: deposits lost by *cryptographic* proof (Kiayias–Tang; Ruffing–Kate–Schröder, CCS 2015). 'Fake' has no cryptographic proof, so here a vote decides."
- **Figure:** two coins (Bob's B, Alice's B) flowing into one "UMA OOv3" box, then a ballot, then two arrows: "Fake" → Bob, "Not proven" → Alice, each with "−f·B → UMA" peeled off.
- **Spoken:** "The one mechanism idea is this. In UMA's optimistic oracle, an undisputed claim is accepted as true, so a false accusation could win by silence against a photographer who was not watching. Paprika disputes every accusation at once with the photo's own deposit, so every case goes to a vote. Voters say yes only if the evidence is public and checkable, so the burden of proof is on the accuser. The reward is the forger's own deposit, so there is no shared pool to drain. And the honest limit: a forger can accuse itself first and lose only f times B, so B must be sized to what a fake is worth."

### Slide 6: Live demo: Alice attests, Bob accuses, UMA decides
- **On slide:** the click path, matching section 2.2: ① Register a key (free) · ② Attest, lock B · ③ Verify: signed, staked, open · ④ One pixel: no record · ⑤ Bob commits, then reveals · ⑥ UMA votes: fake proven · ⑦ Verify again: proven fake, record kept.
  Footer: "Local Ethereum chain. Paprika, WETH, and UMA's Optimistic Oracle V3 and voting contracts. Three demo voters; chain clock advanced by hand. Demo values: B = 1 WETH, T_photo = 1 h, T_reveal = 15 min."
- **Figure:** two readable crops of the **current** Verifier verdict on the same file, side by side: "Signed and staked · open to challenge" → "Proven fake". (Replace the current screenshot: it shows an older layout and is unreadable at slide size.)
- **Spoken:** "We will follow one file. Watch the verdict on the right change." (Then the demo script.)

### Slide 7: Removed, moved, and not claimed
- **On slide:**
  - Left, **Removed or moved** (3 rows): **Single point of failure**: no CA, no revocation list, no owner. *Moved* to UMA's vote, which can err or be bought; one vote touches one record and one key. **Lock-in**: any P-256 key registers; any node verifies. *Remains*: one public chain. **Retroactive censorship**: no record or key is ever deleted; flags carry their block.
  - Right, **Not claimed**: physical origin · fakes that leave no public evidence · fakes worth more than B · a flagged party returns with a free new key · exact file only: a recompressed copy has no record · records of one key are linkable · each vote takes 48–72 h on a real network.
  - Bottom: "**Good for:** fakes of low value that leave public traces: sale listings, recycled photos. **Not enough alone for** news or legal evidence. **Next:** unlinkable records (zero-knowledge proof of membership in the set of unflagged keys); keys in secure hardware as an option a verifier can require."
  - Footer: "AI disclosure: design, code, documentation and slides made with Claude Code (Anthropic) under the team's direction. Log: AI_DISCLOSURE.md."
- **Figure:** none beyond the two columns, or a small three-row table with a "removed / moved" tick column.
- **Spoken:** "Back to the test. The manufacturer, the CA, the revocation list and the owner are removed. Trust is moved, not eliminated: it goes to UMA's vote and to the deposit. What we do not claim: physical origin, fakes without public evidence, fakes worth more than B. A banned forger can come back with a new key; it loses only its deposit and its history. So Paprika fits low-value fakes that leave traces, such as sale listings and recycled photos. Origin becomes a claim someone pays for when it is false."

What I kept from the current deck: the "Not claimed" box (slide 1), the brief quotes and the removed/moved test (slides 2 and 4), the slide-3 flow figure, the slide-5 formula, commitment and payoff table, the limits list, and "Trust is moved, not eliminated". What I merged: current slides 2 and 4 now open (slide 2) and close (slide 7) the talk on the same test, so it no longer repeats. This frees slide 4 for the cryptography.

---

## 2.4 The 8 hardest questions I would ask, and whether `hard-questions.md` answers them

| # | Question | Answered by current material? |
|---|---|---|
| 1 | **Registration is free and the key can be anywhere. What does the P-256 signature add over "stake B on a hash and let UMA arbitrate"?** | **Partly.** HQ1 admits the key proves nothing physical but does not say what the signature buys. The answer is in design-rationale §2–3 and should be added to the hard questions: (a) the record is bound to a key, so a front-runner who copies `attest` can only change the depositor; (b) the key accumulates a history and can be flagged or revoked; (c) the signed block hash gives a not-before bound, which is what makes "published before block a" a refutation; (d) a verifier can choose to trust only keys it knows (for example hardware-backed ones), and Paprika does not prevent that. |
| 2 | **With self-accusation, a forger that expects to be caught loses only f·B = 0.5 WETH. What B would you deploy for sale listings, and how would you estimate p?** | **Partly.** limits.md has the p·f·B…p·B bound; hard-questions.md does not. Add it with one worked number: "a fake listing worth less than 0.5·p WETH is deterred; above that it is not". |
| 3 | **Why would anyone monitor and accuse? The honest accuser nets B − f·B, and a forger holding an earlier commitment can reveal first and take away even that.** | **No.** HQ5 covers commit-reveal only against outside copiers. The pre-emption limit (limits.md, "A forger can get its accusation in first") is not in the Q&A sheet. This is the question most likely to hurt; prepare an honest answer (the honest accuser loses nothing, and the forger still loses f·B and gets flagged, so pre-emption caps the forger's loss but does not save the fake). |
| 4 | **What exactly do voters judge? "Not a genuine capture by that device" is undefined when the device is any key. Who decides that an AI image with no public trace is fake?** | **Mostly.** HQ2 lists evidence types and admits that fakes without traces are not caught. Add the rule's name (UMIP-170, "true and publicly verifiable") and the design choice: the burden of proof is on the accuser because "is genuine" has no proof (rationale §10). |
| 5 | **The track asks for guarantees of authentic photo origin for any device. You explicitly give none. Why is this an answer to the track and not a different problem?** | **No.** Nothing in hard-questions.md addresses the brief directly. Answer: physical origin requires trusted hardware, which requires a manufacturer; that is the centralisation the brief criticises. Paprika keeps the parts that need no manufacturer (signature, time window, public non-erasable record) and adds an economic penalty. Hardware-backed keys can be layered on top as a verifier policy. |
| 6 | **UMA is a token-weighted vote. What does it cost to corrupt one vote, versus B? And 48–72 h per accusation: does every honest refund wait that long under griefing?** | **Partly.** HQ4 covers capture and bounded damage. It does not compare corruption cost with B, and it does not mention griefing delay (N false accusations cost the griefer N·B and pay the depositor, rationale §11). Add both in one sentence each. |
| 7 | **Cameras post-process and platforms recompress (the brief's slide 2). An exact SHA-256 match breaks on the first upload. Why not a perceptual hash or a C2PA-style edit chain?** | **No.** Exact-file matching is in limits.md and on slide 7, but there is no prepared answer. Suggested answer: exact hashing makes the claim crisp and the vote decidable; a perceptual hash makes "same image" a matter of judgement and allows collisions. Signed edits (derivative records pointing to a parent) are future work. |
| 8 | **Which chain? The anchor needs unpredictable block hashes within 256 blocks, and a P-256 precompile. On many L2s, the sequencer chooses or can predict the block hash. On L1, a proposer can bias it.** | **Partly.** HQ6 mentions slight proposer bias. It does not mention sequencer-controlled hashes on L2s, the 256-block window in seconds on the target chain, or which chains have EIP-7951 / RIP-7212. HQ8 says "a real-network deployment" without naming one. Prepare: target chain, its block time, and the precompile status. |

Two further questions that are well covered and should stay in the sheet: why commit-reveal (HQ5) and why equal bonds (HQ7). Privacy and linkability (HQ8, ZK membership) is a good "vision" answer; keep it.
