# Track-fit panel review: Paprika (P) vs ORIGO (O)

IXH26 (Italian XRPL Hackathon), Track 1. Review written 2026-11-20, 21:25–21:55 CET.

**Method.** I read all 15 slide images (the ground truth), the transcription `track/TRACK.md`, the cached event page
`references/cache/decifris-ixh26.txt`, the cached Apple blog `references/cache/apple-reference-image.txt`, and the team's
interpretive `track/REQUIREMENTS.md`. For P I read `/home/tux/crypto2/proposal/PAPRIKA.md`, which is the whole
specification. For O I read `README.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/STATUS.md`, `experiments/README.md`,
the e03/e04/e05 READMEs, `slides/draft/deck-draft.tex`, `experiments/e05-evm-onchain-verifier/circuit/src/main.nr`, and
`git log`. Each proposal is judged as written. Where I rely on outside knowledge that I did not check tonight, it is
marked `[MEMORY]`.

**Transcription vs images.** I compared `TRACK.md` with every slide image and found no disagreement in wording. The
transcriber's observations at the end of `TRACK.md` are accurate. One correction to the framing of the brief I was given:
slide 14's box is headed "MENTORS AND JUDGES", and one of the four (Andrea Gangemi) is listed under a company,
"SHUNYAXIFRA", not a university. So the panel is three university academics plus one industry PhD. The judges are also
the mentors (slide 15: "For any doubt, ask the IXH mentors!").

**On `REQUIREMENTS.md`.** It is a faithful and careful reading. I agree with nearly all of it, with two qualifications:
- R-09 says the three slide-10 limits are "what our protocol must overcome". That is an interpretation, but a strong
  one: slide 3 sets up Apple as "close to a solution — but centralised", and slide 11 asks for "decentralised
  blockchains". I adopt it.
- R-13 says the blockchain must have a "substantial role" and not be "a mere hash registry". The slides do not say
  this. It is the team's own design rule. I do not use it as a rubric item, although Effectiveness ("blockchain
  interaction") rewards it indirectly.

---

## 1. Rubric extracted from the brief

### 1.1 The challenge sentence (slide 11)

Kicker: "02 · THE HACKATHON CHALLENGE". Title: "UNIVERSAL PHOTO-ORIGIN VALIDATION PROTOCOL". Label:
"ARCHITECTURAL SCOPE". The full sentence (bold as on the slide):

> "**Design a secure protocol** that generalises to **any device** and guarantees **authentic photo origin** via
> **decentralised blockchains** technology"

| Key | Verbatim | What it asks, read literally |
|---|---|---|
| K1 | "Design a secure protocol" | A protocol: actors, messages, and a security claim that can be defended. "ARCHITECTURAL SCOPE" puts the weight on design. |
| K2 | "generalises to any device" | Not tied to one vendor's hardware. The word "generalises" implies that a concrete instance (Apple) gets generalised. |
| K3 | "guarantees authentic photo origin" | A *guarantee* of *origin*. Slide 2 says what that means: "CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN." |
| K4 | "via decentralised blockchains technology" | The guarantee must be obtained *through* decentralised blockchain technology. Note the plural "blockchains"; no chain is named. |
| K5 | "UNIVERSAL" (title) | Reinforces K2: anyone can verify, any vendor can take part. |

### 1.2 The problem (slide 2)

Kicker "THE PROBLEM", title "THE SYNTHETIC REALITY DILEMMA":
- "Generative AI models produce photorealistic images, which are **indistinguishable from genuine camera captures.**"
- "AND" "**Modern cameras already post-process every image.**"
- "A POSSIBLE SOLUTION": "**CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN.**"

Two consequences follow, and they matter below:
- (a) Origin has to be proven cryptographically **at capture**. It cannot be judged afterwards from the content,
  because fakes are "indistinguishable".
- (b) Post-processing is part of the problem statement.

### 1.3 The framing (slides 1, 3–9)

- Slide 1: "CRYPTOGRAPHY + BLOCKCHAIN TECHNOLOGY + DIGITAL PROVENANCE".
- Slide 3: "A NON-BLOCKCHAIN EXAMPLE … Something concrete and close to a solution — but **centralised:** no
  decentralisation, no distribution, so weak to a single point of failure."
- Slides 4–9 list the functions Apple centralises. Any decentralised redesign has to say who takes over each one:
  - three factory CAs ("CA 1", "CA 2", "CA 3", slide 5);
  - "Centralized RFC 3161 timestamping and key revocation servers" (slide 4);
  - lower and upper timestamp bounds T₀ and T₁ (slides 6–7);
  - PCC verification of "digests, signatures, CA chains and same-device SEP-sensor binding" (slide 8);
  - a "CONFIDENCE SCORE" (slide 8);
  - a "Hybrid PQ Signature … (ML-DSA-87 + RSA-3072)" (slide 8);
  - "Revocation Alert: verification relies on Apple's central Certificate Revocation Lists — if a sensor or CA key is
    revoked or the central server is unreachable, attestation fails." (slide 8).

### 1.4 The three "cons of a centralised system" (slide 10, exact body text)

| ID | Card title | Exact body text |
|---|---|---|
| C1 | SINGLE POINT OF FAILURE | "Apple maintains central revocation lists. A compromised CA invalidates millions of devices." |
| C2 | CROSS-PLATFORM LOCK-IN | "Non-Apple devices cannot natively verify claims without relying on Apple servers." |
| C3 | RETROACTIVE CENSORSHIP | "Historic photos become unverifiable if central servers shut down or alter public keys." |

Read literally, C1 has two sub-claims:
- C1a: revocation lists are maintained centrally.
- C1b: compromise of one CA has a blast radius of millions of devices.

C3 also has two triggers:
- C3a: the servers shut down.
- C3b: someone alters public keys.

### 1.5 Allowed tools (slide 12)

- "**Anything you find on the Internet,** not subject to copyright limitation for non-profit use."
- "**Any cryptographic primitive/protocol**, such as": "Standard public/symmetric keys", "Functional/searchable
  encryption", "(Fully) Homomorphic Encryption", "Secure multiparty protocols", "**Any other advanced cryptosystem…**".
- "REFERENCE: Apple Reference Image documentation: security.apple.com/blog/apple-reference-image".

Slide 13 (AI policy): "you **must explicitly declare** which tool was used, how, and where". This applies to solution
design and code generation, documentation, and pitch preparation.

### 1.6 Evaluation (slide 14, exact wording)

1. "EFFECTIVENESS — Solution quality, blockchain interaction and closeness to real-world deployment."
2. "CRYPTO VISION — Novelty and soundness of crypto ideas vs feasibility."
3. "THE PITCH — Clarity of presentation, defense and vision."

Mentors and judges, as on the slide:
- "PhD Andrea Gangemi — SHUNYAXIFRA"
- "Gabriele Radici — UNIVERSITY of TRENTO"
- "PhD Francesco Romeo — UNIVERSITY of CASSINO"
- "Prof. Roberto La Scala — UNIVERSITY of BARI"

### 1.7 The event page

- About: "a national hackathon focused on cryptography and blockchain, with a strong emphasis on projects that integrate
  the XRP Ledger (XRPL)."
- Track 1 description: "Advanced cryptography for blockchain. Projects under this track must demonstrate a clear
  application of cryptographic techniques to solve the challenge. The challenge can involve, for example, encryption
  algorithms, zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies."
- General criteria:
  - "Innovation: How original is the idea? Does it bring new insights or solutions?"
  - "Execution: How well was it developed? Does it demonstrate technical complexity or impressive engineering?"
  - "Impact: How impactful is the project? Does it add value to a particular community, scenario or industry?"
  - "Pitch: Is the project clearly communicated? Is the demo (if present) well-prepared and convincing?"
- Format: "Project pitches will be of five minutes, followed by two minutes for questions … A live demo is also accepted
  (and encouraged)." "all submitted code must be in a version-controlled repository".

The Track 1 "**must** demonstrate a clear application of cryptographic techniques" is effectively a gate. I add it to
the rubric as E1.

### 1.8 What the brief does NOT ask

- **No specific blockchain.** XRPL is never named in the slides. The event page "emphasis" on XRPL is general;
  Tracks 2 and 3 say "must involve/using the XRP Ledger", and Track 1 does not.
- **No AI-image detection or content forensics.** The brief asks for origin, not for judging whether a picture is
  "fake". Slide 2 argues that such judgement is unreliable.
- **No explicit requirement** for post-quantum security, privacy or unlinkability, or edit handling. These are Apple's
  properties (slide 8; blog), so they are fair comparison points. The Track 1 text lists "privacy-enhancing
  technologies" as an example.
- **No requirement for real hardware or a working product.** "ARCHITECTURAL SCOPE". A demo is "encouraged", not
  required.
- **No token economics, fees, or incentive design.** These are allowed but not asked for.

---

## 2. Requirement-by-requirement table

Legend: **M** met · **P** partially met · **N** not met · **NA** not addressed.

| # | Rubric item | Paprika (P) | ORIGO (O) |
|---|---|---|---|
| K1 | "Design a secure protocol" | **N.** There are three phases in prose and diagrams. There is no threat model, no security claim, and no message format. The device key registered in phase 1 is never used to sign anything: phase 2 only "Sends SHA(Photo)". The diagrams contradict each other: "Claims photo A of device B is fake" leads to "Device A gets banned". | **P.** The protocol is defined (DECISIONS D-01…D-07, deck slides 3–5), and the main statement is written as a circuit (`main.nr`). Limits are stated (D-08…D-10). No `spec/PROTOCOL.md` exists yet, and there is no formal security argument. |
| K2 | "generalises to any device" | **P, formally only.** Any ETH account can register any public key, so the protocol is device-agnostic. It is equally agnostic to emulators and laptops, so the generality is empty. | **P.** It covers "Any device holding a P-256 key in secure hardware, enrolled by its manufacturer" (D-01). Devices without secure hardware are excluded. There is one assurance level, and multiple levels are out of scope (PLAN). It is open to multiple manufacturers. |
| K3 | "guarantees authentic photo origin" / slide 2 "physical origin" | **N.** Nothing binds the hash to a capture. Any registered key holder can submit the hash of any image, including an AI image or someone else's photo. Fraud is detected afterwards by asking "Is photo A fake?", which is the content judgement slide 2 says is impossible ("indistinguishable"). | **P.** The photo is bound to a signature by a registered hardware key, plus a block hash for the not-before bound and a block for the not-after bound. This is a real cryptographic guarantee, but only of *key* origin. D-01 admits that a keystore key "can … sign arbitrary pixels" on a rooted phone. Sensor-level signing is not modelled. |
| K4 | "via decentralised blockchains technology" | **M.** All three phases are smart-contract calls, and revocation goes through a decentralised oracle (UMA). The design is native to public Ethereum. | **M in design, P as demonstrated.** Contracts verify the zero-knowledge proof, the registry, the time bound and revocation (D-02/03). The demo runs on "a local single-node chain", which "gives none of the guarantees of a public one" (D-02, their words). |
| S2b | "Modern cameras already post-process every image" | **NA.** | **N, by choice.** "Out of scope … we attest the captured file" (D-08). Only the "road ahead" mentions it. |
| C1a | "Apple maintains central revocation lists." | **M.** Revocation is decided by a permissionless claim and a decentralised oracle vote. No one maintains a list centrally. Oracle security is assumed, not argued. | **P.** The revocation list is public, on-chain and historicised. But it is *maintained* by "m of n registrars (2 of 3 in the prototype)" (D-05), which is a committee, and its membership is "a governance question we do not solve". No process is defined for who triggers a revocation or on what evidence. |
| C1b | "A compromised CA invalidates millions of devices." | **M literally, by removing the CA.** There is no CA, so no CA compromise and no mass invalidation: bans are per device. The price is that nothing vouches that a key belongs to a camera, which is why K3 fails. | **P.** The CA role moves to each manufacturer, which publishes device-batch Merkle roots, and is pluralised. A compromised manufacturer still means its roots get deactivated, possibly for millions of devices. Damage is contained at batch granularity (1024 devices per root) and by history ("revoked before the photo" vs "revoked after", D-06). It is reduced, not removed. |
| C2 | "Non-Apple devices cannot natively verify claims without relying on Apple servers." | **M, for a weak claim.** Anyone can read the contract. But what they verify is "a non-banned registered key holder submitted this hash", which says nothing about physical origin. | **M in design.** "Anyone hashes the image and reads the chain. No vendor server." Proof verification happens in a public contract. Onboarding is open to multiple manufacturers. In the demo the chain is local, so third parties cannot verify. |
| C3a | "Historic photos become unverifiable if central servers shut down" | **M.** Records live on Ethereum. | **M in design, N in demo.** Records and revocations "live in chain history". A local Hardhat chain does shut down. |
| C3b | "… or alter public keys" | **P / unspecified.** Device keys are on-chain and cannot be silently altered. What a ban does to *past* attestations is not specified. If past attestations stay valid, a fraudulent device's history stays "attested". If they become invalid, an oracle vote can retroactively void a photographer's history: censorship by vote. | **P.** Keys and roots are historicised, so they cannot be altered silently. Device revocation deliberately "revokes past and future photos" (D-06), so a 2-of-3 quorum can make historic photos read as revoked. The act is visible and timestamped, which beats Apple, but it is still a retroactive power held by a committee. The classical-only crypto (D-09) weakens "in perpetuity" relative to Apple's post-quantum signature. |
| S1/E1 | "CRYPTOGRAPHY" ingredient; Track 1 "must demonstrate a clear application of cryptographic techniques" | **N, or at best marginal.** The only cryptography is "SHA(Photo)", plus the transaction signatures implicit in Ethereum. Nothing in the text uses a signature, zero-knowledge proof or privacy technique. This risks being judged out of track. | **M.** It uses a zero-knowledge proof of an ECDSA P-256 signature with Merkle membership and a revocation tag, verified on-chain, and digital signatures. These are exactly the examples the track page names. |
| S12 | Allowed tools | **M** (nothing disallowed). | **M.** Third-party tools (Noir, Barretenberg, Hardhat) are recorded in a register, `THIRD_PARTY.md` (README map). |
| S13 | AI disclosure | **NA** in the text. | **M.** `AI_DISCLOSURE.md` exists, and the deck's last slide carries a disclosure. |
| Apple parity, privacy (blog: "an outside observer cannot determine whether any pair of reference images were taken by the same device") | **N.** Every photo is linked to the device key and the ETH account that paid the fee. | **M, with stated limits.** The proof hides the device key. Linkability remains for the manufacturer and after revocation (e04 limits). The anonymity set is one batch (≤1024). |
| Apple parity, time window [T₀, T₁] | **P.** Block inclusion gives a not-after bound. There is no not-before bound, so an old photo can be "attested" today. | **M, with limits.** The block hash inside the signed message gives not-before, and the attestation block gives not-after. `blockhash` only reaches 256 blocks back, so offline capture is not handled; Apple handles it. |
| Apple parity, verification/PCC role | **N.** Nothing is verified at attestation beyond "not banned". | **M.** The contract verifies the proof, root, block hash, tag and uniqueness (deck slide 5, six checks). |
| Apple parity, fraud detection (confidence score) | **P.** A human or economic dispute ("claims … is fake") replaces it, which is subjective (see K3). | **NA.** There is no mechanism to find a misbehaving device, and unlinkability makes finding one harder. |
| Event: XRPL emphasis | **NA** (Ethereum). | **NA in the current design.** XRPL was dropped at 17:40 (D-02). e03 holds 38 validated XRPL Testnet transactions as a tested alternative, and e01 shows that the XRPL EVM sidechain answers read-only P-256 precompile calls. |
| Event: Execution / "live demo … encouraged" | No code. | Critical paths are spiked (e04, e05). Contracts, library, UI and spec are not started (STATUS 17:45; `git log` last commit 18:02; no `contracts/`). |

**Summary of the literal C1–C3 reading.**
- **Paprika** removes C1a, C1b and C3a outright. It does so by removing the trust anchor altogether, which is why it
  fails K3 and E1. Its C2 is formally met, but the claim being verified has no value.
- **ORIGO** removes C2 and C3a in design. It reduces C1a, from one company to an m-of-n on-chain committee, and C1b,
  from a single CA to plural manufacturers with batch granularity and history. It leaves a visible, committee-held
  retroactive power for C3b.
- Neither proposal removes the slide-10 problems *and* keeps a guarantee of physical origin. ORIGO keeps the guarantee,
  but only at the level of the device key.

---

## 3. Scores (1–10)

### (i) The idea as designed

| Criterion (slide 14 wording) | P | O | Reasoning |
|---|---|---|---|
| Effectiveness: "Solution quality, blockchain interaction and closeness to real-world deployment" | **3** | **7** | **P.** The blockchain interaction is genuine and central. Solution quality is low: there is no origin guarantee and no binding of photo to device. It is deployable as code, but it would attest AI images on day one, and paying a fee per photo on Ethereum is costly `[MEMORY]`. **O.** The protocol is coherent, and the chain does the verifying. Deployment is held back by about 4.1 M gas per attestation (bare verifier; e05) and by trust in the manufacturer, and real phones' keystores are not sensor-bound. |
| Crypto vision: "Novelty and soundness of crypto ideas vs feasibility" | **2** | **8** | **P.** The only cryptographic idea is a hash. The novelty, decentralised adjudication of revocation, is mechanism design rather than cryptography, and it is unsound for this problem (it judges content). **O.** Zero-knowledge proof of a P-256 signature with Merkle membership and an on-chain-recomputable revocation tag; block hash inside the signed digest as not-before. Sound for its statement, measured, feasible. Novelty is moderate: zero-knowledge ECDSA membership proofs and blockchain timestamping are known `[MEMORY]` (D-04 says so itself). |
| The pitch, judged here as pitchability and defensibility: "Clarity of presentation, defense and vision" | **4** | **7** | **P.** The three-phase story is easy to tell, but it does not survive question one from cryptographers ("what stops me registering a laptop key?"). "Completely decentralized" is an overclaim. **O.** Each weakness maps cleanly to a contract function (deck slide 5), and the limits are stated first. Open holes a panel will find: who decides revocation, who proves (privacy), the keystore signing oracle, and the local chain. |
| **Total /30** | **9** | **22** | |

### (ii) What can realistically be demonstrated by 08:00 CET (from about 21:30; one strong AI agent plus a small team)

| Criterion | P | O | Reasoning |
|---|---|---|---|
| Effectiveness | **3** | **6** | **P.** Three small contracts and a script are buildable in 2–4 h, even on a public testnet. Real UMA integration on a testnet is uncertain `[MEMORY: UMA Optimistic Oracle v3 testnet availability]`, so the oracle would likely be mocked, which removes the "decentralised" claim from the demo. **O.** The verifier is proven (e05). Registry and Attestation contracts, a capture/prove client and a simple page are about 6–9 h of work. ORIGO's own plan had contracts done by 20:30 and the core by 22:00, but nothing is started (about 3 h behind, waiting for team approval). The demo runs on a local chain. Expect a CLI end-to-end flow with high probability and the full UI with moderate probability. |
| Crypto vision | **2** | **7** | **O.** A live on-chain zero-knowledge verification with negative cases is strong evidence. One point is lost because proving runs on a server and the device is simulated. |
| The pitch | **4** | **7** | **P.** A working but trivial demo does not fix the defence. **O.** A good draft deck already exists, and the defence sheet is planned. The risk is presenters who did not build it (PLAN risk table). |
| **Total /30** | **9** | **20** | |

**Uncertainty.** About ±1 on each O score; ±1 on P's Effectiveness and Crypto vision; ±2 on both proposals' pitch
scores, which depend on the presenters. The largest swing factor for O is schedule: if the contracts slip past about
03:00, the demo degrades to a CLI plus a recorded run, and Effectiveness drops by about 1. For P, the one thing that
would raise its scores is adding device signatures in hardware (see §6). Without that, no amount of polish moves
Crypto vision above 3.

---

## 4. Judges' questions (2-minute Q&A, cryptographers)

### Paprika

| # | Question | Answer in the text |
|---|---|---|
| 1 | "I register a software key from my laptop and submit the hash of a Midjourney image. What stops me?" | **None.** Registration is open to any ETH account, and nothing ties the key to camera hardware. |
| 2 | "The device public key is registered but never used. What signature does the contract check on an attestation, and over what message?" | **None.** Phase 2 sends "SHA(Photo)" only. |
| 3 | "Slide 2 says fakes are indistinguishable from real captures. On what evidence do UMA voters decide 'Is photo A fake?'" | **None.** This is circular with respect to the brief. |
| 4 | "After a ban, are the device's earlier photos still 'attested'? If yes, fakes persist. If no, a token vote can retroactively void a journalist's archive. Isn't that slide 10's 'retroactive censorship'?" | **None.** Unspecified. |
| 5 | "What is a 'device'? A banned device re-registers under a fresh key: what makes the ban stick?" | **None.** |
| 6 | "Economic security: what does it cost to corrupt the oracle vote compared with the value of one convincing political fake? Who funds the reward? Can I grief honest photographers with false claims?" | **Weak.** "relies on the economic incentives" and fees exist, but no numbers, no bond for the accused, and no reward source are given. |
| 7 | "Every photo is linked to an ETH account and a device key. Apple explicitly protects photographers in dangerous conditions. Why is this not a regression?" | **None.** |
| 8 | "Track 1 must 'demonstrate a clear application of cryptographic techniques'. Where is the cryptography?" | **Weak.** A hash and Ethereum signatures. Further gaps: no not-before time, and anyone can claim someone else's photo by submitting its hash first. |

### ORIGO

| # | Question | Answer in the text |
|---|---|---|
| 1 | "A phone keystore signs whatever digest the OS hands it. A rooted phone signs an AI image with a genuine registered key. What does your proof guarantee about photons?" | **Weak but honest.** D-01 states it. Sensor-level signing is the answer, but it is not modelled, and there is a single assurance level. |
| 2 | "The manufacturer builds the Merkle tree and could insert software keys. You replaced Apple's three CAs with N manufacturer roots. How does that remove 'a compromised CA invalidates millions of devices'?" | **Weak to partial.** Plurality, batch granularity and history-aware revocation reduce the blast radius. D-01/D-05 admit that a manufacturer must be trusted. |
| 3 | "Who decides to revoke a device, on what evidence? And since photos are unlinkable, how does anyone even learn the public key of a misbehaving device?" | **None.** Revocation is executed by 2 of 3 registrars, but no detection or evidence path exists. Apple has its confidence score; ORIGO has no counterpart. |
| 4 | "Who runs the prover? If proving is outsourced to a server, that server sees the key and the signature, and unlinkability is gone. What is the phone proving time?" | **Weak.** Measured only on a 32-core server (e04/e05 limits). Phone-side proving is "road ahead". |
| 5 | "Two of three registrars can publish a key and turn a device's whole history red. Who are they, and isn't that the retroactive censorship of slide 10?" | **Weak.** It is auditable and timestamped on-chain, which beats Apple, but governance is "a question we do not solve" (D-05). |
| 6 | "Your anonymity set is one Merkle batch of 1024, and the root reveals manufacturer and batch. The manufacturer can link everything. How much privacy is that?" | **Partial.** Stated in the e04 limits and on the deck's limits slide. Batch size is a parameter. |
| 7 | "You call it decentralised, but it runs on a single-node local Hardhat chain at 4.1 M gas per photo, at an XRPL hackathon. Why should we believe the deployment story?" | **Partial.** Limits are stated (D-02). Batched attestation is "road ahead". The XRPL evidence (e03) and the XRPL EVM P-256 precompile check (e01) exist but are not used. |
| 8 | "Long-term: verification happened once, on-chain, with classical crypto (BN254/UltraHonk, ECDSA). The SRS origin is unchecked (e05 limits). Apple is post-quantum. What does 'verifiable in perpetuity' mean for you?" | **Weak.** Stated as a limit (D-09). One honest point in its favour: the record is chain-timestamped at verification time, so later breaks do not forge *old* records, as long as the chain's history stays intact. |

Also likely from this panel: the 256-block `blockhash` window rules out offline capture (Apple handles offline), and
post-processing (slide 2) is out of scope (D-08).

---

## 5. What each has that the other lacks; substitutes or complements

**Paprika has, and ORIGO lacks:**
- **A defined, permissionless path to revocation.** Anyone may challenge, with an economic incentive (a fee to claim,
  a reward if upheld) and decentralised adjudication. ORIGO only says *who executes* a revocation (2 of 3 registrars),
  not *how a fraud is detected and proven*. Paprika's approach is closer to the literal C1a ("Apple maintains central
  revocation lists").
- **Fees against spam, and a treasury.** These form an economic model for running the system. ORIGO has no economics.
- **Extreme simplicity.** It can be built tonight, even on a public network.

**ORIGO has, and Paprika lacks:**
- The trust anchor for physical origin (hardware keys enrolled by manufacturers).
- Device signatures over the photo plus a fresh block hash (time bounds on both sides).
- Unlinkability by a zero-knowledge proof.
- On-chain verification of a meaningful statement.
- A cryptographic, objectively checkable revocation mechanism (the tag recomputed from a published key).
- Measured feasibility.
- Stated limits.

**Substitutes or complements?** At the level of the core trust anchor they are **substitutes**:
- Paprika's "anyone registers, crowd bans" replaces the attestation anchor.
- ORIGO's "manufacturers enrol, quorum revokes" keeps one.

They are **complements** at the revocation layer. ORIGO's open hole (Q3: who revokes, on what evidence) is exactly
the layer Paprika designed, and ORIGO's tag mechanism fixes Paprika's worst flaw: subjective "is it fake?" votes.

**Combination.** Keep ORIGO whole (hardware-key zero-knowledge attestation, block-hash time window, on-chain verifier,
manufacturer registry). Replace "2 of 3 registrars revoke" with Paprika's open, incentivised challenge. The challenge
should be **objective** rather than a vote:

- **Device-level bounty.** A challenger who has extracted or abused a device key reveals the public key `pk` and
  submits an ORIGO proof over `m = H("REVOKE" ‖ challenger address)`.
- **What the contract checks.** It already recomputes `tag = SHA-256(0x02 ‖ pk ‖ m)`. So it can check both:
  - that `pk` belongs to a registered batch;
  - that `pk` signed a message no honest capture pipeline would sign.
- **What happens then.** `pk` is revoked, and the bounty is paid from a manufacturer bond or attestation fees. No new
  circuit is needed.
- **Manufacturer-level fallback.** Subjective claims, such as "manufacturer M enrols emulator keys", can go to an
  optimistic oracle with bonds (Paprika's UMA idea), at batch or manufacturer level only.

This turns C1a from "a committee maintains the list" into "anyone with evidence can revoke, and is paid to". It also
narrows C3b, because revocation needs cryptographic evidence, not a committee's say-so.

**Caveats and cost.**
- A keystore-only device signs anything, so owners could farm bounties on their own devices. The reward must be
  bounded (below device cost, or paid only for sensor-level assurance), and this must be stated.
- One contract function plus tests: about 2–3 h. That is affordable only if ORIGO's core is on schedule, which it
  currently is not.
- Real UMA integration should stay a slide and spec item, not demo scope tonight.

---

## 6. Verdict

**ORIGO answers the brief clearly better as written, by a wide margin: about 22 vs 9 out of 30 on the idea, about
20 vs 9 on tonight's demonstrable state.**

The gap is in the idea, not the paperwork. Paprika fails the central keyword "guarantees authentic photo origin", and
its crypto content is too thin for the Track 1 gate ("must demonstrate a clear application of cryptographic
techniques"). Its one strength, a decentralised and incentivised revocation process, is real. It is also the part of
ORIGO that is weakest.

ORIGO's distance from a full answer:
- In design: an on-chain committee still maintains revocation, and manufacturers remain plural CAs.
- In demonstration: a local single-node chain, with implementation about 3 h behind its own plan.

Maturity notes on ORIGO's documents:
- `docs/DECISIONS.md` is internally inconsistent after the 17:40 revision. D-12 still says "`xrpl` 5.3.0 for the
  ledger … No web framework, no Solidity", while D-02 and the deck use Solidity and Hardhat.
- D-04, D-05 and D-06 keep XRP Ledger wording, under a blanket note.
- The deck paraphrases the slide-10 cards ("Old photos die if servers or keys change") rather than quoting them.
  Verbatim quotes would be safer with this panel.

**Single change that most improves each:**
- **Paprika.** Make the device's hardware key sign `(SHA-256(photo) ‖ recent block hash)` and have the contract verify
  that signature. Gate registration on a manufacturer or platform hardware-attestation chain instead of "any ETH
  account". This alone gives a physical-origin anchor, a time window and actual cryptography. The dispute layer then
  has something objective to adjudicate. (Changing the oracle question from "is the photo fake?" to "is this key
  compromised?" follows naturally.)
- **ORIGO.** Define the revocation-evidence path: who may trigger a revocation and with what proof. The cheapest
  strong version is the objective key-compromise bounty described in §5. It closes the hardest open question (Q3)
  and turns C1a from "partially met" toward "met".
  - **Runner-up, for tomorrow's Effectiveness score only.** Also deploy the same contracts on a public EVM testnet,
    ideally the XRPL EVM sidechain given the event's emphasis and e01, keeping the local chain and a recording as
    fallbacks. The decentralisation claims would then be shown rather than asserted.
