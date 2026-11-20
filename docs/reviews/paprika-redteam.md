# Paprika: red-team review

- **Artefact under review:** `proposal/PAPRIKA.md` (verbatim proposal, received 2026-11-20 ~21:10 CET). Nothing else was treated as specification.
- **Brief used:** `/home/tux/crypto/track/TRACK.md`, `REQUIREMENTS.md`, `reference/apple-reference-image.md`; slides 2, 10 and 11 checked as images.
- **Reviewer stance:** independent, adversarial, first principles. I did not read any competing design.
- **Evidence tags:** `[MEMORY]` is a fact about an external system recalled, not re-verified today. Nothing in this review depends on a live web source. UMA is discussed only at the level of the mechanism: bonded assertion, dispute, token-holder vote.
- **Date:** 2026-11-20, written 21:25 to 21:55 CET.

## 0. The protocol as I model it

The text defines three phases. Reduced to state and transitions:

```
State:  devices : pk -> {owner: address, banned: bool}
        attest  : H  -> {device: pk, block: uint}      (or a list; unspecified)
        treasury: balance

register(pk)        by any account A: require !banned[pk]; devices[pk] = {A, false}
attest(H)           "device" pays fee f to treasury; require !devices[D].banned; attest[H] = {D, now}
claim(A_photo, D)   by any account C: pays UMA fee; UMA decides "Is photo A fake?";
                    if YES: devices[D].banned = true; C receives "ETH as a reward"
```

Everything the text does **not** say is listed in section 2. Where a finding depends on one reading, the finding says so.

---

## 1. What an attestation actually proves

### 1.1 The precise claim

Take the most favourable reading (G-02(b) below): the contract checks a signature by the device key `sk_D` over `H` before recording `(H, D, b)` at block `b`. Then a verifier who sees "photo hash H is attested by device D" learns this:

> **Claim P-1 (provable).** Assume (i) the signature scheme is EUF-CMA, (ii) SHA-256 is second-preimage resistant, and (iii) the chain is safe, so no reorganisation passes finality. Then some party that held `sk_D` at a time no later than block `b` signed the exact byte string whose SHA-256 is `H`. That party is not necessarily the account that registered `D`, because nothing proves possession at registration (G-03). At block `b`, `D` was not marked banned.

> **Claim P-2 (economic, conditional).** Up to now, nobody has paid to raise a challenge against a photo of `D` that the oracle resolved as "fake".

That is everything. In particular:

- **Nothing binds `sk_D` to a camera, a sensor or any physical object.** Registration is "an Ethereum account registers it, with its own public key". The registrant generates that key, wherever and however they like. "Device" is a label the registrant chooses. The extra assumption needed to turn P-1 into a statement about physical origin, namely "*`sk_D` lives only inside a capture pipeline that signs only light it has captured*", is **not enforced and not even checkable** by anything in the protocol.
- **Nothing bounds capture time from below.** `b` is an upper bound on when the bytes existed. It says nothing about when, or whether, a capture happened (F-11).
- **Nothing describes content.** `H` is the hash of a byte string. One re-encode produces a different `H` (F-13).
- **P-2 carries almost no information** in the regime the brief cares about. Section 3 (F-03) argues that the probability that a competent forgery is ever successfully challenged is close to zero. So "not yet challenged" is the default state of every attestation, honest or forged.

**Bottom line.** Against an adversarial registrant, a Paprika attestation is equivalent to **a signed, publicly timestamped statement "the holder of key D asserts H"**. That is proof of existence plus a pseudonymous signature, the same thing as OpenTimestamps plus a self-declared public key. It is a useful primitive. It is not "authentic photo origin".

### 1.2 Comparison with the brief

| The brief asks for | Paprika provides | Gap |
|---|---|---|
| "Cryptographic guarantees of physical origin" (S2) | A cryptographic guarantee of **key** origin. Physical origin is replaced by a social and economic process (the oracle vote). | Total. The only cryptography in the protocol (a hash, and possibly a signature) binds bytes to a key, never to light. |
| Defence against images "indistinguishable from genuine camera captures" (S2) | A human vote on whether an image is fake. | The brief's own premise says that vote cannot be decided (F-03). The protocol rests its security on the one thing the problem statement declares impossible. |
| "Authentic photo origin" for "any device" (S11) | Any device can register. | "Any device" is achieved by making the assurance of every device equally zero. A device with a perfect hardware root of trust gets the same level of assurance as `openssl genpkey` on a laptop. |
| Apple baseline: time window `[T0, T1]`, unlinkability, revocation | Upper bound only, full linkability, revocation by vote | Weaker than the centralised baseline on time (F-11) and privacy (F-10). Revocation is decentralised but unsound (F-03, F-05). |

---

## 2. Specification gaps

Each gap changes security. For each: the possible readings, and the least-bad one.

| ID | Open decision | Possible readings | Least bad |
|---|---|---|---|
| G-01 | **What "device" and "its own public key" mean.** "An Ethereum account needs to register it, with its own public key". "Its" could refer to the account or to the device. | (a) A separate device key `pk_D`, registered by account `A`. (b) The device *is* the Ethereum account, with no separate key. (c) A device identifier such as a serial number or IMEI plus a key. | (a), with a declared hardware root if any. (c) is worthless without hardware attestation, because identifiers are self-reported. |
| G-02 | **Who authenticates an attestation.** The diagram shows "Device sends SHA(Photo) to contract". | (a) `msg.sender` must be the owner account of `D`. (b) The contract verifies `Sig_skD(H ‖ ...)`. (c) No authentication: anyone can attest `H` for any `D`. | (b), with the signed message domain-separated: `(H, D, chainId, contract, nonce)`. (c) is catastrophic (F-07). (a) allows provenance theft by front-running (F-08). |
| G-03 | **Proof of possession at registration.** | (a) None. (b) The registrant signs `(A, chainId, contract)` with `sk_D`. | (b). Without it, an attacker can squat a victim's key (F-08c). |
| G-04 | **What a ban targets, and what "the registration fails if the device is banned" checks.** | (a) A banned `pk`. (b) A banned owner account. (c) A banned hardware identifier. | Ban `pk` *and* slash a stake. (a) and (b) are evaded for the price of a new key or account (F-02). (c) only works with hardware attestation. |
| G-05 | **What a ban does to earlier attestations.** The text is silent. | (a) Nothing: past attestations stay valid. (b) All past attestations of `D` become invalid. (c) Only the adjudicated photo is invalidated. (d) Past attestations stay recorded but are annotated "device banned at block `b_ban`". The verifier applies its own policy. | (d), plus a per-photo verdict on the adjudicated photo. (a) leaves every other fake of a caught forger standing. (b) creates retroactive censorship and a griefing amplifier (F-06). |
| G-06 | **Where the reward comes from.** "ETH Account gets ETH as a reward". | (a) The fee treasury. (b) A stake slashed from the banned device. (c) UMA's dispute bonds. (d) Minted or sponsored. | (b). (a) creates a self-dealing loop (F-04). (c) is not a protocol reward: it only exists if someone disputes, and it pays whoever wins the dispute. |
| G-07 | **Who owns the treasury, and whether the contract is upgradeable.** | (a) A team EOA or multisig. (b) Locked in the contract and spendable only on rewards. (c) Fees burned. | (c), or (b) with no admin key. Any admin key is a new single point of failure (F-14). |
| G-08 | **The question put to the oracle.** "Is photo A fake?" "Fake" is never defined. | It could mean AI-generated, edited at all, cropped, a re-photographed screen, staged, not taken by `D`, or not taken at the claimed time. | A closed, objectively decidable predicate over attached evidence (§5.2). As written the question is undecidable (F-03). |
| G-09 | **What evidence voters see.** The chain holds only `H`. | (a) The claimant uploads the photo, plus "evidence" of their choosing. (b) Nothing. | (a), with the evidence bundle committed on-chain (content ID plus hash), so that the evidence, and not only the claim, is adjudicated. If the photo was never published, no third party can challenge it at all. |
| G-10 | **The oracle's default outcome.** UMA's optimistic oracle treats an assertion as true unless someone disputes it within the liveness window `[MEMORY]`. | (a) The claim "A is fake" is an optimistic assertion: if undisputed, the device is banned. (b) Every claim goes straight to a token-holder vote. | (b), or (a) with a long liveness and a dispute bond the defending device can afford. Under (a), an unmonitored honest device is banned by default (F-05). |
| G-11 | **Diagram inconsistency:** "photo A of device B is fake" leads to "Device **A** gets banned". | A is a photo, so this is a typo for B. | Ban B. Worth fixing before judges read it. |
| G-12 | **Fee:** amount, payer, and when it is charged. | Per photo, per batch, or per period. | Per batch with a Merkle root (F-12). |
| G-13 | **Duplicate `H`.** | First attester wins; all attesters are listed; or rejected. | List every attester with its block number. Verifiers see the earliest. This does not solve provenance theft (F-16). |
| G-14 | **Owner-initiated revocation** after loss or compromise of the key. | Absent; or self-revoke from block `b`. | Self-revoke, prospective from block `b`. Without it, a stolen key turns into a ban of the victim (F-15). |
| G-15 | **Statute of limitations** for claims. | Unbounded; or a window `W` after attestation. | A bounded window. Otherwise every honest device carries a growing liability forever. |
| G-16 | **What is hashed.** "SHA(Photo)". | RAW, the JPEG as captured, or the file as published. | The file as captured, plus a later edit or derivation chain. This still fails on platform re-encodes (F-13). |
| G-17 | **Which chain.** Ethereum is named. The event is the XRP Ledger hackathon. | Ethereum L1, an L2, or XRPL. | A mechanism-level choice. It matters for cost (F-12) and for the oracle, which is an Ethereum-ecosystem component `[MEMORY]` (F-18). |

---

## 3. Attacks

Severity scale: **Critical** means the core security goal fails at negligible cost to the attacker. **High** means a serious failure that needs a specific reading of the spec or a moderate cost. **Medium** means a real but bounded failure. **Low** means hygiene.

### F-01: Attesting a synthetic image is trivial. **Critical** (any reading)

- **Goal.** Get an AI-generated or manipulated image recorded as "attested".
- **Capabilities.** A laptop, gas, the fee `f`.
- **Sequence.**
  1. Generate a keypair in software.
  2. `register(pk)`.
  3. Generate the image `X`.
  4. Sign and submit `SHA(X)`.
  5. The contract checks "not banned" and records it.
- **Cost vs damage.** Gas plus `f`, i.e. cents to a few dollars, against a publicly "attested" deepfake whose value to the attacker is unbounded.
- **Why it works.** Nothing in registration or attestation touches a sensor. The only check is "not banned", and a fresh key is never banned. This is the central failure. Everything else in the protocol is a *posterior* filter (the ban), and F-02, F-03 and F-09 show that filter does not work either.

### F-02: Sybil identities and ban evasion are free. **Critical** (readings G-04(a)/(b), and (c) without hardware attestation)

- **Goal.** Keep attesting after being banned, or never accumulate history.
- **Sequence.** After the ban, run `keygen` again, optionally from a new account, then `register(pk')`. "Registration fails if the device is banned" checks an identifier the attacker chooses.
- **Cost.** One registration transaction. **The ban destroys no value**, because the device posted no stake. The expected loss to a caught forger is ≈ 0.
- **Consequence.** The deterrence argument in the "Conclusions" ("relies on the economic incentives") has no economic content on the punishment side. A rational forger also uses **one key per forgery**, so a ban never even catches a second photo.

### F-03: The adjudication question is undecidable exactly where it matters. **Critical** (any reading)

- **The question.** "Is photo A fake?"
- **Who can answer it, with what information.** The voters (UMA token holders `[MEMORY]`) see the image, if the claimant supplies it, plus whatever evidence the claimant attaches. They do not see the scene, the sensor, the device, or the capture process. The brief's premise (slide 2) is that generative models produce images "**indistinguishable from genuine camera captures**". If that premise holds, no voter can classify a competent forgery from the pixels. If it does not hold, a forensic classifier is enough and the protocol is unnecessary. Either way the vote adds no cryptographic guarantee.
- **Equilibrium of the vote.** A token vote with commit-reveal and slashing for incoherent votes is a Schelling game `[MEMORY]`: each voter maximises the chance of voting with the majority. Without decisive evidence, the focal point is the conventional default. In practice that is "No" or "cannot be determined", for which UMA yes/no queries have a conventional value `[MEMORY]`. So:
  - **Competent forgery, honest device (true answer "fake").** The vote converges on "No". The fake stands. Detection probability `p ≈ 0`.
  - **Crude forgery** (visible artefacts, or a known stock image). The vote says "Yes". Only incompetent forgers are caught.
  - **Self-reported forgery.** The forger can attach a *reproducibility proof* (model, prompt, seed) that regenerates `A` bit-for-bit, or show the source. The vote says "Yes" with certainty. This is the only case of high detection probability, and the forger alone controls it (see F-04).
  - **Genuine photo, honest device, malicious claimant.** The vote is unpredictable and depends on how "fake" it looks and on who is voting (F-05, F-17).
- **Two more holes in the question.** It does not cover "real photo, but not taken by D" (provenance theft, F-16), because no voter can tell which device took a real photo. It does not decide the analog hole (a genuine capture of a screen showing an AI image): is that "fake"?
- **Consequence.** The ban mechanism gives `p ≈ 0` against exactly the adversary the brief describes. Deterrence needs `p · L ≥ G`. F-02 gives `L ≈ 0`, F-03 gives `p ≈ 0`, and F-09 gives a `G` that can be very large.

### F-04: Incentive loop, with the attacker on both sides. **Critical** if the reward comes from the treasury (G-06(a)), **High** otherwise

- **Goal.** Extract value from the treasury. A variant: use a fake for a while at zero net cost.
- **Sequence (drain).**
  1. Register `D_i`.
  2. Attest a synthetic `A_i`, paying `f`.
  3. From another account, claim "A_i of D_i is fake", paying the UMA cost `c_o`.
  4. Attach the reproducibility proof.
  5. The vote says Yes. Collect `R`.
  6. Repeat with `D_{i+1}`.
- **Profit per cycle:** `R − f − c_o − gas`. If `R > f + c_o`, the treasury drains linearly. That treasury is funded by honest users' fees. If `R ≤ f + c_o`, honest claimants, who also bear research cost and the risk of losing their bond, are under-rewarded. The challenge market is then empty except for self-dealers.
- **Sequence (free fake).**
  1. Attest a deepfake `A`.
  2. Let it circulate as "attested" during the news cycle.
  3. Self-report before anyone else does, collecting `R`.
  4. The fake has then cost `f + c_o − R`, which is ≤ 0 if `R` is large enough. The attacker also chooses the timing of the "debunking".
- **Treasury-owner variant.** If the treasury is an EOA (G-07), the owner is on both sides by construction.
- **Root cause.** The reward is not funded by the party being punished.

### F-05: False accusations and griefing of honest devices. **High**; **Critical** under the optimistic-default reading G-10(a)

- **Goal.** Get an honest device banned, for example a journalist's camera.
- **Capabilities.** A copy of a published photo, which gives its `H`, plus the oracle fee and bond.
- **Sequence under G-10(a).**
  1. Assert "photo A of D is fake".
  2. If `D`'s owner does not notice and post a counter-bond within the liveness window, the assertion resolves true. `D` is banned and the attacker is paid.
  - The cost is gas plus a bond that is returned. It is profitable, not merely free.
- **Sequence under G-10(b) (always a vote).**
  1. Choose a genuine photo that *looks* manipulated: night shot, heavy computational photography (slide 2: "modern cameras already post-process every image"), or an unusual scene.
  2. Accuse it, with a forensic-looking "evidence" report.
  - Voters cannot verify the claim either way (F-03). The outcome is a coin toss biased by presentation.
  - Expected attacker cost: `(1 − q) · B_claim`, where `q` is the probability of success.
  - Damage: under G-05(b), the victim's **entire archive** is invalidated, which is retroactive censorship (F-06). Under any reading, the victim's credibility is publicly destroyed.
- **Asymmetry.** The victim cannot prove a photo is genuine. The protocol contains no evidence of physical capture.
- **State-actor version.** Ban the device of the photographer who documented an event. The cost is a few bonds, or bribing a vote (F-17).

### F-06: Ban semantics are either too weak or a censorship tool. **High** (spec gap G-05)

- **Reading (a), ban is prospective only.** A forger caught on one photo keeps every other forged attestation valid. With one key per forgery (F-02) this barely matters, which shows the ban is not doing anything.
- **Reading (b), ban invalidates history.** A single adjudicated photo, possibly false-positive (F-05) or self-inflicted by a compromised key (F-15), unverifies years of an honest archive. That is the "retroactive censorship" of slide 10, now triggered by a token vote instead of a server shutdown.
- **Least bad.** Reading (d): a per-photo verdict on the adjudicated photo. The device is marked with `b_ban`. Earlier attestations stay recorded as "attested by D at `b`; D banned at `b_ban` for photo `A`". The verifier's policy decides how much weight they get.

### F-07: Attestation authentication unspecified; anyone attests for anyone. **Critical** under G-02(c), otherwise closed

Under reading (c), an attacker submits `(H_fake, D_victim)`. Then they either get the victim banned (F-05 with real evidence: the fake really is fake, and it is "of device D"), or launder a fake through a reputable device. The fix is reading (b), with domain separation. It is trivial, but the text does not say it, and the diagram ("Device sends SHA(Photo)") suggests no signature.

### F-08: Front-running and the mempool. **High** (subcases a, b), **Medium** (c)

- **(a) Provenance theft of an attestation** (reading G-02(a), or a signature that does not bind `D`).
  1. A watcher sees `attest(H)` from `D_victim` in the public mempool.
  2. They submit `attest(H)` from their own registered `D_att` with a higher priority fee.
  3. `D_att` becomes the first (or only, under G-13 "reject duplicates") attester of the victim's photo.
  - Cost: gas. Damage: "who took this photo" is now wrong on-chain, permanently, and the voters cannot tell (F-03).
  - Fix: sign `(H, D, chainId, contract)` so only `D` can attest `H` as `D`, and list every attester rather than first-wins. Or use commit-reveal, or a private mempool.
- **(b) Bounty sniping.** An honest researcher spends effort building a case that photo `A` is fake and submits the claim. A watcher copies the claim with a higher fee. If the reward goes to the first valid claim, the copier takes it. This removes the incentive to do research, which is exactly the labour the design relies on. Fix: commit-reveal claims, where the commitment is `h(claimant ‖ photoId ‖ evidenceHash ‖ salt)`.
- **(c) Registration squatting** (G-03(a), no proof of possession). The attacker watches `register(pk_victim)` and front-runs it from their own account. If the key-to-owner mapping is first-come, the victim's device is bound to the attacker's account. The victim cannot attest (under G-02(a)), or the attacker controls the "device" record. Fix: proof of possession binding `A`.
- **(d) A forger front-running its own ban.** The forger sees a pending claim (or a UMA request) against `D`. Under reading G-05(a), they rush extra attestations through before the ban lands, or self-report to collect the reward (F-04). The cost is gas.
- **Not an issue.** Revealing `H` in the mempool leaks nothing about photo content. Photos are high-entropy, so `H` is a hiding commitment in practice.

### F-09: Bounded punishment against unbounded gain. **High** (unfixable within the family)

Even after repair (stake `S`, reward from slashing), the punishment is capped at `S`. The value of one viral political deepfake, or of a single fraudulent insurance claim or court exhibit, is not capped. A rational forger with gain `G > p · S` attests anyway. And `p` stays small for competent forgeries (F-03). Economic security works when the attacker's gain is bounded and comparable to the bond, as in oracle price feeds with bounded TVL. Provenance of arbitrary photos has no such bound. Raising `S` until `p · S` exceeds any plausible `G` prices honest users out, which contradicts "any device".

### F-10: Privacy and linkability. **High** (relative to the Apple baseline, which lists unlinkability as one of its three requirements)

- **Linkage chain.** Each on-chain record is `(H, D, b)`. `D` is linked to account `A`. `A` is funded from somewhere, typically an exchange with KYC.
- **Sequence.**
  1. Anyone holding one photo computes `H`.
  2. They look up `D`.
  3. They enumerate **every** photo hash and timestamp from `D`.
  4. They trace `A`'s funding.
- Holders of a second photo can test "same device?" in one lookup.
- Fee payment patterns leak a usage timeline. Whistleblowers and conflict photographers are deanonymised by their own attestations.
- Apple's design gives an outside observer no link between two reference images. Paprika is **strictly worse than the centralised baseline** on a property Apple advertises.
- **There is a structural tension.** A *device-level* ban needs photos to be linkable to a device, at least by the adjudicator. Unlinkability needs them unlinkable. Section 5 treats this.

### F-11: Time only has an upper bound. **Medium**

`b` proves that `H` existed no later than block `b`. It does not prove capture after any time `T0`. A device can attest an old photo as new, or a photo from another event.
- **Possible repair:** have the capture embed a recent block hash, giving the lower bound "after block `b0`".
- **Limit of the repair:** it only helps if the capture pipeline is trusted to embed the block hash *before* the capture. A software key holder can embed any recent block hash into any file. So the lower bound is meaningful only with a hardware root (F-01).
- **Brief-relevant consequence:** the Apple `[T0, T1]` window is not reproduced.

### F-12: Cost and availability, at one transaction per photo. **High** (for "any device" and real-world deployment)

- **Throughput.** Global photo volume is on the order of 10^12 per year, i.e. thousands per second `[MEMORY]`. Ethereum L1 settles on the order of 10–20 transactions per second, and the fee is a non-trivial fraction of a dollar or more under load `[MEMORY]`.
- **Device requirements.** The device must be online, hold ETH, and pay gas at capture time, or defer submission and lose time precision.
- **Censorship.** Inclusion is subject to builder and validator censorship, which is weak but real.
- **Repair.** Batch: each device, or an aggregator, posts one Merkle root per period. Offline devices commit later, with honest time semantics.
- **Cost of the repair.** It introduces aggregators. They must be permissionless and replaceable, otherwise they become the new point of failure and censorship.

### F-13: Exact-bytes hashing versus real image flows. **Medium**

`SHA(Photo)` breaks on any re-encode, EXIF strip or resize. Every major platform does this on upload `[MEMORY]`, so a verifier who receives the image through a social network finds no attestation. Slide 2 also notes that modern cameras post-process every image: which bytes are "the photo"?
- **Perceptual hashes are not a repair.** They are adversarially weak; practical collision and evasion attacks have been shown on deployed perceptual hashes `[MEMORY]`.
- **What works.** A signed derivation chain (original → edits), carried with the file in the style of C2PA, with the original hash anchored on-chain. This is out of scope for the ban mechanism but must be stated.

### F-14: Governance, upgrade and treasury keys. **High** if any admin exists (unspecified, G-07)

Somebody deploys the contract, chooses the oracle ("UMA but it could be something else"), sets `f` and `R`, and holds the treasury. If any of these can be changed later (proxy upgrade, `setOracle`, `withdraw`), that key can:
- ban arbitrary devices (point the oracle at itself);
- un-ban forgers;
- drain fees;
- rewrite the meaning of past attestations (upgrade storage-reading logic).

That is a **single point of failure and of retroactive censorship**, located in the contract instead of at Apple. The minimal repair is an immutable contract with no owner, the oracle address fixed at deployment, and fees burned or bound to rewards by code. The cost: bugs cannot be patched, and migration means deploying a new contract that verifiers must choose to trust, which is a social-layer decision.

### F-15: Compromise of an honest device key. **Medium-High**

- **Sequence.**
  1. Malware on the phone extracts the software key. In the permissionless reading there is no hardware binding, so the key is extractable.
  2. The attacker attests fakes as `D`.
  3. Someone, possibly the attacker, accuses.
  4. `D` is banned, and under G-05(b) the victim's history goes with it.
- **No defence in the protocol.** It has no self-revocation (G-14) and no way to distinguish "the device lied" from "the key was stolen".
- **Repair.** Owner self-revoke, prospective from a block. Bans are prospective from the first adjudicated photo, with no retroactive invalidation.

### F-16: Provenance theft of genuine photos. **Medium-High**

- **Sequence.**
  1. Take a genuine photo that someone else published and never attested, say a press photo.
  2. Attest it from your own `D`.
- **Why it sticks.** "Is photo A fake?" resolves No, because it is real, so the attacker now holds the on-chain "origin" of someone else's work. If the real photographer attests later, they appear *second* (G-13).
- **Coverage.** Neither the oracle question nor the vote covers "not taken by D", and voters cannot decide it anyway.
- **Impact.** Copyright and attribution disputes, and laundering: a real photo from event X, attested by `D` in a context that misrepresents it.

### F-17: The oracle as the new trust root (capture and bribery). **High**

- **What it controls.** Every ban, and so every revocation, is decided by the oracle's final arbiter, a token-weighted vote `[MEMORY]`.
- **Ways to subvert it.**
  - **Buying votes.** The attack cost is buying or bribing enough voting weight. Vote bribery against Schelling-point oracles is a known class, including p + ε constructions `[MEMORY]`.
  - **The forger as voter.** The forger, or a state actor, can simply be a large token holder.
  - **Value mismatch.** The economic security of the oracle is sized for the markets it serves, not for the political value of banning a particular journalist.
- **Contrast with Apple.** In Apple's design a revocation is at least an accountable act by one identifiable company. In Paprika it is an act by an anonymous and purchasable majority.
- **Liveness.** If the oracle stops operating or changes its interface, the ban mechanism stops. Existing records survive.

### F-18: Platform fit. **Low** (practical, not security)

- **Mismatch.** The proposal names Ethereum and UMA. The event is the Italian XRPL Hackathon.
- **Constraint (`[MEMORY]`).** XRPL mainnet has no general-purpose smart contracts. Programmability exists on Xahau (Hooks) and on the XRPL EVM sidechain. UMA is an Ethereum-ecosystem oracle.
- **Effect.** The demo either runs off-XRPL or needs a different dispute layer. This does not break security but affects EVAL-01 ("blockchain interaction").

### F-19: Specification hygiene. **Low**

- The diagram bans "Device A", but A is the photo (G-11).
- The fee arrow comes from "Device" (does the device hold ETH?).
- The goals list "Single point of failure / Cross-platform lock-in / retroactive censorship" as *requirements to follow*: these are flaws to remove.
- The conclusion "completely decentralized" is asserted, not argued.
- Academic judges will read these as signals of rigour.

### Summary table

| ID | Finding | Severity | Reading needed |
|---|---|---|---|
| F-01 | Synthetic image attestation is trivial | Critical | any |
| F-02 | Free Sybil identities and ban evasion; ban costs nothing | Critical | any without stake and hardware ID |
| F-03 | "Is A fake?" is undecidable for competent fakes; vote equilibrium is "No" | Critical | any |
| F-04 | Self-accusation drains the treasury, and fakes become free | Critical / High | reward from treasury / otherwise |
| F-05 | False accusations; honest devices banned | High / Critical | vote / optimistic default |
| F-06 | Ban semantics: no effect or retroactive censorship | High | G-05 |
| F-07 | Unauthenticated attestation | Critical / closed | G-02(c) / (b) |
| F-08 | Front-running: provenance theft, bounty sniping, key squatting | High / Medium | G-02(a), G-03(a) |
| F-09 | Punishment bounded, gain unbounded | High (unfixable) | any |
| F-10 | Full linkability of device, photos and funding | High | any |
| F-11 | No lower bound on capture time | Medium | any |
| F-12 | One L1 transaction per photo | High | any |
| F-13 | Exact-bytes hash breaks on re-encode | Medium | any |
| F-14 | Admin, upgrade and treasury keys | High | if any admin |
| F-15 | Key theft leads to victim banned | Medium-High | any |
| F-16 | Provenance theft of genuine photos | Medium-High | any |
| F-17 | Oracle as purchasable trust root | High | any |
| F-18 | Ethereum/UMA vs XRPL event | Low | — |
| F-19 | Spec hygiene | Low | — |

---

## 4. The three weaknesses from the brief

### 4.1 Single point of failure: removed for keys, moved for revocation, and partly reintroduced

- **Removed.** There is no CA, so no "compromised CA invalidates millions of devices". This is true, but only because nothing certifies devices at all. The single point of failure is removed by removing the security function that the root was providing.
- **Moved.** Revocation moves from Apple's revocation lists to the oracle's token-holder vote (F-17). That is a single *logical* decision point. It is not a single machine, but it can be captured by buying votes, and it has a liveness dependency on one oracle protocol.
- **Possibly reintroduced.** Any admin, upgrade, oracle-setter or treasury key (F-14) is a single point of failure in the literal sense of slide 10, able to ban or un-ban arbitrarily.
- **Not affected.** The chain itself is not a single point of failure (honest-majority consensus, an assumption the judges will accept).

### 4.2 Cross-platform lock-in: genuinely removed, at a price

- **Verification.** Anyone can read the chain and recompute SHA-256 with no vendor server. This is a real improvement over slide 10's "cannot natively verify without relying on Apple servers".
- **Registration.** Open to any manufacturer, and any hobbyist.
- **Residual dependence.** There is a softer dependence on one chain plus one oracle ecosystem, and on an RPC endpoint or full node to read state. This is not vendor lock-in.
- **The price.** The removal is achieved by making assurance device-independent and zero (F-01). Lock-in is removed. "Authentic origin" goes with it.

### 4.3 Retroactive censorship: removed for shutdowns, reintroduced through bans

- **Removed for shutdowns.** Records are append-only on a public chain, so a shutdown of the team, Apple or anyone else does not make historic attestations unverifiable. Device keys are stored immutably, so "alter public keys" is also closed, provided the contract is not upgradeable.
- **Reintroduced through bans.** Under G-05(b), one oracle verdict, possibly false (F-05) or bought (F-17), retroactively un-verifies an entire archive. That is slide 10's failure, with "central servers alter keys" replaced by "a token vote bans a device".
- **Possibly reintroduced through admin keys.** An upgradeable contract (F-14) can change the meaning of past records.
- **Least-bad reading.** G-05(d), prospective bans with per-photo verdicts, closes this.

---

## 5. Repairs

### 5.1 Minimal repair for each critical or high finding

| Finding | Smallest change | What it costs |
|---|---|---|
| F-01 synthetic attestation | **Cannot be fixed without a hardware root of trust.** The minimum is to require, at registration, a hardware key-attestation chain (sensor- or TEE-generated non-exportable key, chained to a manufacturer root), and to sign captures inside that boundary. Devices without one register at an explicit **assurance level 0** ("self-asserted key"). | It reintroduces manufacturer roots. They can be *many* and listed on-chain, but they are trust roots. "Permissionless" then holds only at level 0. |
| F-02 Sybil and ban evasion | Registration **stake `S`**, locked for a period `W` (the claim window) after the device's last attestation and slashed on ban. Optionally a hardware-uniqueness binding (one attested hardware key per registration). | Capital lock-up excludes low-income users. It makes Sybil identities costly, not impossible. Without hardware it does not stop "one key per forgery"; it prices it at `S` per forgery. |
| F-03 undecidable question | Replace "Is A fake?" with a **closed predicate over attached, committed evidence** that a voter can check without forensic judgement (§5.2). Fakes that leave no objective evidence are explicitly *out of scope* of the ban mechanism. | Detection becomes narrow but sound. The protocol must stop claiming to catch indistinguishable AI images. |
| F-04 reward loop | Pay the reward **only from the slashed stake**: `R = α·S` with `α < 1`. Burn `(1−α)·S`. Never pay rewards from a fee treasury. Better still, have no treasury: burn fees, or pay them to the transaction includer. | The self-reporter loses `(1−α)S + f + c_o > 0` per cycle. Honest claimants need `α·S > c_research + c_o + (1 − q)·B_c`, which forces `S` up, and that is the exclusion cost again. |
| F-05 griefing | The claimant posts a bond `B_c` that is forfeited to the device if the claim fails. Use a **vote-always, or optimistic with long liveness** design where the *default outcome is "not banned"*: the accusation must win affirmatively. Use only objective predicates (§5.2). | Slower resolution (days). Less "free" for claimants. |
| F-06 ban semantics | **Prospective ban plus a per-photo verdict.** Past records stay, annotated with `b_ban` and the adjudicated photo. | Verifiers must apply a policy to "attested before a later ban". Simple to state. |
| F-07 authentication | `Sig_skD(H ‖ D ‖ chainId ‖ contract ‖ ctr)`, verified on-chain or verifiably off-chain for batches. | None worth mentioning. |
| F-08 front-running | Signature bound to `D` (as F-07). Proof of possession at registration, binding the account `A`. Record all attesters, never first-wins. Commit-reveal for claims. | One extra round for claims. |
| F-10 linkability | Each attestation carries a zero-knowledge proof "I am *some* registered, unbanned, staked device" plus a per-attestation **verifiable encryption of `D` under a threshold key** held by the adjudication layer. It is decrypted only on a successful verdict, so a ban can find the device. Alternative without escrow: per-*epoch* rate-limiting nullifiers (RLN-style), where equivocation reveals the secret and slashing becomes automatic. This catches double-signing, not forgery. | A new trust assumption (the threshold opener), proving cost on the device, and a much more complex contract. Without the escrow, device-level bans and unlinkability **are mutually exclusive**. |
| F-12 cost | **Batching:** one Merkle root per device (or per aggregator) per period. The device keeps its inclusion path. Aggregators are permissionless, with a direct self-submission path as a censorship escape. | Coarser time (period length). Aggregators see hashes. Liveness depends on at least one honest aggregator, or on self-submission. |
| F-14 governance | Immutable contract, no owner, oracle fixed at deployment, no withdrawable treasury. | No bug fixes. Migration is social. |
| F-15 key theft | Owner self-revoke, prospective. Hardware-bound keys where available. | Self-revoke is also a "get out of jail" move for a forger who sees a claim coming. Bind it: the stake stays locked for `W` and is slashable for photos attested before the revoke. |
| F-17 oracle capture | Keep the question objective (§5.2), so that a bought vote is *publicly* and checkably wrong. Cap what a single verdict can do (prospective, one device). | Does not remove the oracle's economic-security bound; it only limits the damage and makes corruption visible. |

### 5.2 The exact dispute question in the hardened variant

The only questions a decentralised vote can answer soundly are those whose answer follows from public evidence by a procedure every voter can run. Replace "Is photo A fake?" with:

> "Does evidence bundle `E` (content hash `h_E`, committed in claim `c`) establish **at least one** of the following about attestation `(H, D, b)`?
> **(P1) Equivocation.** `E` contains two valid signatures by `sk_D` on capture records with the same monotonic counter `ctr` and different `H`.
> **(P2) Prior existence.** `E` contains a third-party commitment, with an on-chain or independently timestamped anchor before the capture's lower-bound block `b0`, to an image whose bytes are byte-identical to the preimage of `H`, or of which that preimage is a specified, reproducible deterministic transform.
> **(P3) Synthetic reproduction.** `E` contains a model identifier, weights hash, prompt and seed. Running the published generator reproduces the preimage of `H` exactly, or reproduces the intermediate RAW that the capture record commits to.
> Answer YES only if a stated check passes. Otherwise answer NO."

- **P1** is purely cryptographic. It could be checked by the contract itself, with no oracle needed.
- **P2 and P3** are mechanically checkable.
- **Coverage.** None catches a competent, non-reproducible forgery. That is the honest scope.

### 5.3 "Hardened Paprika", one page

**Actors.**
- Device `D`: holds `sk_D`, at an assurance level `L ∈ {0: self-asserted, 1: TEE-attested, 2: sensor-signed}`.
- Owner account `A`.
- Aggregator `G`: optional and permissionless.
- Claimant `C`.
- Adjudicator `O`: the oracle, fixed at deployment.
- Verifier `V`.
- Optional threshold opener `T`: only in the private variant.

**State (immutable contract, no owner).**
- `dev[pk] = {owner, level, stake, bannedAt, revokedAt, lastAttestBlock}`
- `roots[(G or D, epoch)] = {merkleRoot, block}`
- `claims[id] = {commit, C, bond, status}`
- `verdicts[H] = {claimId, predicate, block}`
- Level-1/2 manufacturer roots are an append-only on-chain list. Each root is independently addable by a staked proposer and removable by the same objective-evidence process. That is a trust assumption, stated as such.

**Messages and what is signed.**
1. **Register.**
   - `A` sends `register(pk, level, attChain, pop, S)`.
   - `pop = Sig_skD("REG" ‖ A ‖ chainId ‖ contract)`.
   - `attChain` is empty for `L0`, otherwise a hardware attestation verifiable against a listed root.
   - Requires `msg.value ≥ S_L` and `pk` never registered.
2. **Capture record**, made on the device, inside the hardware boundary for `L ≥ 1`: `rec = (H, ctr, b0 = recent block hash, meta)` and `σ = Sig_skD("CAP" ‖ rec ‖ chainId ‖ contract)`.
3. **Commit.**
   - `D` or any `G` posts `root = Merkle({(pk, rec, σ)})` for an epoch.
   - `V` verifies a photo with: file → `H` → `(pk, rec, σ)` → inclusion path → root at block `b`.
   - Time window: `[b0, b]` (the lower bound is meaningful only for `L ≥ 1`).
4. **Claim.**
   - Phase 1: `C` sends `commit = h(C ‖ H ‖ h_E ‖ salt)` with bond `B_c`.
   - Phase 2: `C` reveals within `Δ`.
   - The claim is valid only within `W` of the attestation's block.
   - P1 is checked on-chain directly. P2 and P3 go to `O`, with the §5.2 question and `E` stored at a content address.
5. **Verdict.**
   - **YES:**
     - `verdicts[H]` is set.
     - `dev[pk].bannedAt = b_now`.
     - `C` receives `α·stake + B_c`.
     - `(1−α)·stake` is burned.
   - **NO:**
     - `B_c` is split between `D`'s owner (compensation for griefing) and burning.
6. **Self-revoke.** `A` sends `revoke(pk)`, which sets `revokedAt` and bars new attestations. The stake stays locked until `lastAttestBlock + W`.

**What a ban does.**
- It is prospective. New roots that contain `pk`'s records after `bannedAt` are invalid.
- The adjudicated photo carries a negative verdict.
- Earlier records remain, annotated with `bannedAt`. Verifier policy decides their weight.
- **Never** retroactive deletion.

**Fees.** Gas plus an optional fee to the aggregator. **No protocol treasury.**

**Inequalities that must hold.**
- `α < 1`. A self-reporter then loses `(1−α)S_L + f + c_o > 0`, which closes the F-04 loop.
- `α·S_L ≥ c_research + c_o + (1−q)·B_c`, for the minimum `q` at which we want honest claimants to act.
- `B_c ≥ E[grief damage]`, and `B_c ·(1 − q_false) > 0` makes frivolous claims cost-positive.
- `W ≥` oracle liveness + dispute + vote time.
- The stake lock is at least `W`.
- `S_L` decreasing in `L`. Higher-assurance devices need less economic security, which is what makes stake bearable for real cameras.
- **Deterrence:** `p_L · S_L ≥ G` *for the attacker's gain `G`*. This holds only for low-value forgeries, or for high `L`, where `p` comes from hardware (forging requires breaking the hardware, which is costly in itself) rather than from the vote.

**Private variant.** Replace `pk` in each record with a zero-knowledge proof of membership in `{registered, unbanned}` plus `Enc_T(pk)`. On a YES verdict, `T` decrypts `pk` to ban the device. This adds a threshold trust assumption, kept small by threshold `t-of-n` and the fact that `T` opens only after an on-chain verdict.

### 5.4 What no repair within this design family can fix

1. **Physical origin from a key that its holder generated.** With permissionless, software-key registration, an attestation is "the key holder asserts `H`". No incentive layer converts that into "light hit a sensor". Fixing it requires a hardware root, which is a manufacturer-rooted PKI, at least as one tier.
2. **Adjudicating indistinguishable fakes.** If the brief's premise holds (slide 2), no voter, token-weighted or otherwise, can tell a competent fake from a genuine photo using the photo alone. The ban mechanism catches only evidence-bearing cases (§5.2).
3. **Unbounded attacker gain against bounded stake** (F-09). Economic deterrence fails for high-value single forgeries.
4. **Device-level accountability together with unlinkability, without a tracing authority.** You can have bans, privacy, or bans with privacy plus an opener (a new trust assumption). Not all three without one.
5. **A capture-time lower bound without a trusted capture pipeline** (F-11).
6. **The analog hole.** A genuine capture of a screen is physically authentic. No design in this family addresses it, and neither does Apple's, beyond a hidden-weights classifier.

---

## 6. What is genuinely good

Stated plainly, because a fair review should say what works:

1. **Openness and no accreditation committee.** Anyone can register, verify and challenge without permission from a vendor or consortium. That is real, and it directly addresses cross-platform lock-in (§4.2). A manufacturer-rooted PKI always needs someone to decide which manufacturers count, and that is a political chokepoint. Paprika has none.
2. **Public, append-only, verifier-independent history.** It survives the shutdown of any company, and verification needs nothing but chain data and SHA-256 (§4.3). This is the correct use of a blockchain for this problem.
3. **Decentralised revocation as a *layer*.** The challenge-and-ban idea is a credible replacement for Apple's private revocation service, **if** it sits on top of hardware-rooted device keys. In that setting:
   - `p` is not ≈ 0, because forging means extracting a key from hardware. Evidence of compromise (equivocation, P1; reproductions, P3) is objective.
   - Stake makes each compromised device cost something.
   - A public, auditable revocation decision is more accountable than Apple's private one.
   Put precisely, the advantage is real under these assumptions: (i) device keys are hardware-bound (`L ≥ 1`); (ii) the dispute predicate is objective (§5.2); (iii) the oracle's cost of corruption exceeds the value of a single ban; (iv) stake is sized as in §5.3.
4. **Deterrence for low-value, high-volume abuse.** For spam-level fakes, such as marketplace listings or low-stakes social proof, where `G` is small, fee plus stake plus a non-trivial `p` is a sensible economic filter. This is a narrower claim than "authentic photo origin", but a defensible one.
5. **Simplicity.** The proposal is three operations and is easy to implement and demonstrate on a testnet. After the hardening in §5 it is still a few hundred lines of contract.

**Net assessment.** As written, Paprika is a decentralised **timestamped-claim registry with a token-vote revocation layer**. It removes cross-platform lock-in, removes shutdown-type retroactive censorship, and moves the single point of failure to the oracle and any admin key. It provides **no cryptographic guarantee of physical origin**, which is what the brief asks for, and its ban mechanism is unsound against the adversary in the brief (F-01, F-02, F-03, F-04). Its best future is as the **open revocation and accountability layer of a multi-root, hardware-attested design**, with explicit assurance levels and an objective dispute predicate. In that role, its openness and deterrence are genuine advantages over Apple's model.
