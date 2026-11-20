# Track-fit panel, round 2, seat B (effectiveness and deployment)

- **Judge's seat.** The criterion I care most about is slide 14's first one, *"EFFECTIVENESS — Solution quality, blockchain interaction and closeness to real-world deployment."* I also scored the other two criteria as a cryptographer.
- **Independence.** I did not open `track-fit-panel*.md`, `RISCONTRO.md` or `docs/COMPARISON.md`. Paprika's README and PLAN link to `COMPARISON.md`; I did not follow the link.
- **Written:** 2026-11-20, starting 21:59 CET (`date`).
- **Evidence tags.** `[MEMORY]` marks an outside fact I did not verify now. Every number without a tag comes from the artefact cited next to it.

**How I read the candidates**

- **P (Paprika v2.3).**
  - Source of truth: `spec/PROTOCOL.md` v2.3.
  - Running code stops at **v2.2**. `experiments/p03-paprika-v2-hardened/contracts/` has `PaprikaV2.sol`, `PaprikaV2_1.sol` and `PaprikaV2_2.sol`, and no v2.3 contract or output exists yet. The v2.3 additions are the low-s rule, keyId in every signed message, and proof of prior existence.
  - So v2.3 is judged as spec, on top of v2.2 code with 67 passing tests, a fuzz run and 0 invariant violations.
- **O (ORIGO).**
  - Judged with review §6 items 1, 2 and 4 applied: time-scoped revocation, contract hygiene, and corrected privacy claims.
  - Governance stays as designed: 2-of-3 registrars.
  - Its contracts are not written. The circuit and on-chain verifier run (e04, e05), and the review reproduced e05.
- **C (combination).** Judged as `experiments/p04-combined-critical-path` plus the two parents: 9 tests, 10 real UltraHonk proofs, one owner-less contract.

---

## 1. Rubric from the brief

I opened all 15 slide images. On the slides this rubric relies on (2, 3, 10, 11, 14), the transcription `track/TRACK.md` matches the images word for word. I found no disagreement.

### 1.1 The challenge (slide 11, image)

> "02 · THE HACKATHON CHALLENGE — UNIVERSAL PHOTO-ORIGIN VALIDATION PROTOCOL"
> ARCHITECTURAL SCOPE: "**Design a secure protocol** that generalises to **any device** and guarantees **authentic photo origin** via **decentralised blockchains** technology"

The bold words below are bold in the image.

| Keyword | What it requires, read literally |
|---|---|
| **Design a secure protocol** | A protocol: messages, actors and security properties under an adversary. A product or detector does not qualify. "Secure" is the first adjective. |
| **generalises to any device** | Not tied to one vendor. This is the inverse of slide 10's "cross-platform lock-in". |
| **guarantees authentic photo origin** | "Guarantees" is strong. Slide 2 says what kind of guarantee: "CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN." |
| **via decentralised blockchains technology** | The blockchain is the means of removing centralisation. It is not decoration. |

### 1.2 The problem (slide 2)

> "THE SYNTHETIC REALITY DILEMMA" — "Generative AI models produce photorealistic images, which are **indistinguishable from genuine camera captures.**" — "AND **Modern cameras already post-process every image.**" → "A POSSIBLE SOLUTION: **CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN.**"

Two consequences for judging:

- A solution that relies on telling fakes apart by inspection contradicts the brief's own premise.
- "Physical origin" is the target, and "cryptographic" is the kind of guarantee wanted.

### 1.3 The reference and its framing (slides 3–9)

- Slide 3: "Something concrete and close to a solution — but **centralised:** no decentralisation, no distribution, so weak to a single point of failure."
- Slides 4–9 present the Apple baseline:
  - hardware-bound sensor key and SEP key, certified by CA 1, CA 2 and CA 3;
  - a lower-bound timestamp T0 and an RFC 3161 upper bound T1;
  - attestation in PCC;
  - a hybrid PQ signature, "ML-DSA-87 + RSA-3072" (slide 8);
  - "Revocation Alert: verification relies on Apple's central Certificate Revocation Lists — if a sensor or CA key is revoked or the central server is unreachable, attestation fails." (slide 8)

### 1.4 The three "cons of a centralised system" (slide 10, exact body text)

1. **SINGLE POINT OF FAILURE** — "Apple maintains central revocation lists. A compromised CA invalidates millions of devices."
2. **CROSS-PLATFORM LOCK-IN** — "Non-Apple devices cannot natively verify claims without relying on Apple servers."
3. **RETROACTIVE CENSORSHIP** — "Historic photos become unverifiable if central servers shut down or alter public keys."

### 1.5 Evaluation (slide 14, verbatim)

1. "**EFFECTIVENESS** — Solution quality, blockchain interaction and closeness to real-world deployment."
2. "**CRYPTO VISION** — Novelty and soundness of crypto ideas vs feasibility."
3. "**THE PITCH** — Clarity of presentation, defense and vision."

The judges are PhD Andrea Gangemi (Shunyaxifra), Gabriele Radici (University of Trento), PhD Francesco Romeo (University of Cassino) and Prof. Roberto La Scala (University of Bari). This is a mostly academic, cryptography-minded panel.

### 1.6 Other slides

- **Slide 1:** "CRYPTOGRAPHY + BLOCKCHAIN TECHNOLOGY + DIGITAL PROVENANCE".
- **Slide 12:**
  - "Anything you find on the Internet, not subject to copyright limitation for non-profit use."
  - "Any cryptographic primitive/protocol, such as": standard public/symmetric keys, functional/searchable encryption, (fully) homomorphic encryption, secure multiparty protocols, "Any other advanced cryptosystem…".
- **Slide 13:** AI use is allowed but "you must explicitly declare which tool was used, how, and where".

### 1.7 Event page (`decifris-ixh26.txt`)

- **Track 1:** "Advanced cryptography for blockchain. Projects under this track must demonstrate a clear application of cryptographic techniques to solve the challenge. The challenge can involve, for example, encryption algorithms, zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies."
- **General judging criteria:**
  - "Innovation: How original is the idea? Does it bring new insights or solutions?"
  - "Execution: How well was it developed? Does it demonstrate technical complexity or impressive engineering?"
  - "Impact: How impactful is the project? Does it add value to a particular community, scenario or industry?"
  - "Pitch: Is the project clearly communicated? Is the demo (if present) well-prepared and convincing?"

### 1.8 What the brief does NOT ask

- **The XRP Ledger.** The brief does not require it for Track 1. "Must involve the XRP Ledger" is Track 2's wording. The event is XRPL-branded, so XRPL use is a soft plus, not a requirement.
- **Detecting synthetic images.** Slide 2 rules it out as a strategy.
- **Tokens, stakes or economic incentives.**
- **A public mainnet, or a demo at all.** "Demo (if present)" appears only in the event page's general criteria.
- **Post-quantum security.** Apple's PQ signature is described, not required.
- **Handling edits or post-processing.** These are named in the problem but not in the challenge sentence.
- **Privacy/unlinkability.** Not named on the slides. Apple's design has it per its own documentation (the cached reference, as summarised in ORIGO D-07 and Paprika P-09).

---

## 2. Requirement-by-requirement table

Legend: **M** met · **P** partially · **N** not met · **—** not addressed.

| Requirement (source) | P — Paprika v2.3 | O — ORIGO (+fixes 1, 2, 4) | C — combination |
|---|---|---|---|
| **Secure protocol** (s11) | **P.** Strongest *adversarial testing* of the three: 4 contract revisions, attack suites, fuzz with 0 violations (p03, v2.2 run). But the security goal is **economic**: deterrence `p(1−α)S > G`, which deters forgeries worth "roughly 4 to 40 USD" (spec §8, at 3,000 USD/ETH; at p05's sampled 1,591 USD/ETH, about 2–21 USD). The v2.3 deltas are not in code. | **P.** The circuit is "small, correct as written", with no under-constrained witness (review §0, e05 reproduced). The contract that enforces time and de-duplication is unwritten. Privacy claims are corrected per fix 4. The manufacturer can mint undetectable forgeries (O-09, stated). | **P.** The contract runs: 9 tests and every negative case rejected (p04 table). Two design flaws are found and unsolved: self-issued issuers (flaw 1) and owner self-revocation draining the issuer bond (flaw 2). |
| **Generalises to any device** (s11) | **M (hollow).** Any key can register with a stake and proof of possession (spec §4 msg 1). The red team's point stands: "'Any device' is achieved by making the assurance of every device equally zero" (redteam §1.2). | **P.** Any device with a P-256 key in secure hardware (D-01), *if its manufacturer is admitted by 2 of 3 registrars* (D-05). Keystore-level phones give weaker assurance than sensor signing (D-01). | **P+.** Same device class as O, but anyone can become an issuer with a 1 ETH bond, so no gatekeeper. |
| **Authentic photo origin / "cryptographic guarantees of physical origin"** (s11, s2) | **N** at level 0, by its own statement: "Not claimed. That `H` is the digest of a camera capture" (spec §1); "A level-0 record does not prove physical origin" (P-01). Level 1 is "Specified; a private variant is tested in p04", which is C, not P. | **P.** Hardware-rooted *key* provenance via the manufacturer, as in Apple's design. It is not *capture* provenance at keystore level (O-10). It covers the exact file only, and a re-photographed screen passes (D-08, D-10). Device hardware is simulated. | **P−.** Same cryptography as O. But per p04 flaw 1, "without that layer [verifier-chosen trust lists] the registry certifies nothing about photo origin", and that layer is not built. |
| **Via decentralised blockchains** (s11) | **M/P.** No owner, no admin, no upgrade, no treasury (spec §2). The subjective path depends on UMA's token vote, which is "not deployed on the XRPL EVM sidechain" (P-06, p05 §2). | **P.** On-chain proof verification and registry. Admission and revocation authority is a 2-of-3 quorum, which the review calls "a consortium, not decentralisation" (O-03). Its own D-05 says "a governance question we do not solve". | **M/P.** No owner or committee (p04). Trust is pushed to verifier-side curator lists that do not exist yet. |
| **Time bounds** (s6–7, T0/T1 analogue) | **M.** Block-hash not-before, recorded block not-after, at most 256 blocks; checked by the contract (spec §4). | **M** with fix 2 (n < block.number, blockhash(n) == h ≠ 0). Not yet in code for O itself. | **M**, tested: zero hash, future anchor and stale anchor are all rejected (p04). |
| **Revocation without a central list** (s8, s10) | **M.** Objective misuse proof plus prior-existence proof; flags are prospective, dated and reasoned (§5–6). A thief can flag a victim's key and take half its stake (p03 flaw 4, accepted). | **P.** Public on-chain list, decided by the quorum and fed by the manufacturer (tracing needs the manufacturer as "opener", O-02). | **M.** Per-key, objective, time-scoped, front-run-proof (p04 tests). Fires only if the key leaks further (flaw 2, last sentence). |
| **Privacy/unlinkability** (Apple reference; not on slides) | **N.** "Every record of a key is public and linked to the owner's account" (P-09). | **P.** Unlinkable to parties who do not know the device public key. The manufacturer can identify. The anonymity set is one batch (fix 4 wording). | **P.** As O. Revocation publishes the public key and links every past record of that key (p04 "still does not solve"). |
| **Post-processing** (s2) | — (limit §9.7) | — (D-08) | — |
| **Clear application of cryptographic techniques** (event page) | **P.** Signatures, hashing, commit-reveal, and an extraction argument (p07). The cryptography is light. | **M.** A zero-knowledge proof of an ECDSA P-256 signature under Merkle membership, verified in Solidity. Exactly what the event page lists. | **M.** As O, plus a signature-based objective slashing rule. |

### 2.1 The three centralisation weaknesses, read literally

**1. SPOF: "Apple maintains central revocation lists. A compromised CA invalidates millions of devices."**

| Candidate | Verdict | Why |
|---|---|---|
| P | **Removed at level 0; partly moved** | There is no CA and no central list. Revocation is by objective proof, which anyone can submit, or by oracle vote. At level 0 there is no CA whose compromise could invalidate devices. The subjective path's SPOF moves to UMA's token-holder vote. The SPOF is removed partly by removing the thing that gave physical assurance. |
| O | **Moved and reduced** | The list is on-chain, but changed by a 2-of-3 quorum. Each manufacturer is still a CA for its devices, so a compromised manufacturer means deactivating all its roots. Time-scoping (fix 1) protects past photos, but "invalidates millions of devices" still holds *prospectively* for a large vendor. Losing 2 of 3 registrar keys freezes the registry (O-03). |
| C | **Moved to verifiers** | No central list or quorum. Device revocation is objective. But only the issuer can call `deactivateRoot`. A *compromised issuer key* can keep minting forgeries until verifiers drop it from their own lists. "Invalidates millions" becomes "each verifier decides". That is the honest end state, but the lists are not built. |

**2. LOCK-IN: "Non-Apple devices cannot natively verify claims without relying on Apple servers."**

| Candidate | Verdict | Why |
|---|---|---|
| P | **Removed** | Verification is a hash plus a public contract read (`verify(H, keyId)`). It needs no proof system, so it is the lightest client of the three. |
| O | **Removed for verification** | The verifier is an open contract and open data, read from any node (review §3). Capture-side admission depends on registrar discretion. |
| C | **Removed** | Same as O, with permissionless admission. |

**3. RETROACTIVE CENSORSHIP: "Historic photos become unverifiable if central servers shut down or alter public keys."**

| Candidate | Verdict | Why |
|---|---|---|
| P | **Removed** | Records are never deleted. Flags carry their block and reason. Verifiers choose a strict or time-scoped policy (§6). Residual: a key thief can flag `KeyMisuse` and make strict verifiers distrust the victim's whole archive (p03 flaw 4). The protocol's own recommended policy for `KeyMisuse` is "distrust all records". |
| O | **Removed against shutdown or key alteration (on a public chain); moved by fix 1** | Without fix 1 it would be *reintroduced*: "Revoke (2 of 3): photo turns red" for past photos (O-02). With fix 1, it is a dated, public act that only affects photos after the revocation. Revocation still deanonymises past photos. |
| C | **Removed** | Time-scoping is built and tested ("Earlier records after revocation: pass"). The same linking side effect as O applies. |

All three "remove" weaknesses 1–3 only on a **public** chain. Each demo plan runs on a local single-node chain, where shutdown is literal: the chain disappears with the process (O-15, P-10).

---

## 3. Deployment reality check

### 3.1 Cost and throughput (p05 §3, one gas-price sample at 20:38 UTC; ETH 1,591 USD, XRP 0.887 USD)

| Network | P attest (86k gas) | O/C attest (≈4.1–4.2 M gas) | P attests/s | O/C attests/s | 256-block window |
|---|---|---|---|---|---|
| XRPL EVM mainnet | ≈0.00006 USD | ≈0.003 USD | 244/block ÷ 5.74 s ≈ **42/s** (≈3.7 M/day) | 5/block ÷ 5.74 s ≈ **0.9/s** (≈75 k/day) | 24.5 min |
| Ethereum L1 | ≈0.23 USD | ≈10.7 USD | ≈57/s | ≈1.2/s | 51.7 min |
| Base | ≈0.0009 USD | ≈0.04 USD | ≈2,300/s | ≈45/s | **≈51 s** |
| Optimism | ≈0.0003 USD | ≈0.008 USD | ≈230/s | ≈4.5/s | 8.5 min |

Notes on the table:

- p05's ZK figure assumes about 1.1 kB of calldata. The real proof is 9.5 kB (p04), so rollup costs for O and C are understated.
- P's v2.1+ attest is 64k gas (p03), slightly cheaper than the 86k used here.
- Locked capital, not in the table:
  - P: **0.25 ETH stake per device** (≈400 USD at the sampled price), locked 30 days after unbonding.
  - C: **1 ETH bond per issuer**.
  - O: nothing per device. Registrars and manufacturers pay only gas.

### 3.2 What the user's device must do

| | P | O | C |
|---|---|---|---|
| Keys | Any P-256 key, even software | P-256 key in secure hardware, enrolled by the manufacturer into a batch Merkle tree | As O, enrolled by any bonded issuer |
| Proving | None: one ECDSA signature | A ZK proof: 0.8 s on 32 cores, 4.7 s on one server core; phone time and memory unmeasured (O-12). Delegating the proof leaks `pk` and destroys unlinkability (O-01) | As O |
| Connectivity | A fresh block hash, and submission within 256 blocks (≈25 min on XRPL EVM) | Same, plus a relayer to hide the submitter (p04: "the submitter of `attest` is visible on-chain") | As O |
| Funds | Owner locks the stake; relayer pays gas | Relayer pays gas | Relayer pays gas |

### 3.3 Who must exist for the system to mean anything

- **P.** Challengers who actually find evidence (`p` is "measured by nobody", p06). UMA voters for claims, which exist on Ethereum, not on XRPL EVM. Watchers are no longer needed after v2.1 (claims are auto-contested). **No manufacturer is needed: that is both its strength and why it proves no physical origin.**
- **O.** Manufacturers willing to enrol keys and publish roots. Three real registrars ("who are the three?" is open). A relayer network.
- **C.** Manufacturers willing to bond 1 ETH. **Curators that verifiers trust:** without them, an attestation means only "a key under a root published by bonded address X signed this" (p04 flaw 1).

### 3.4 Day one, zero adoption

- **P works on day one.** Anyone can stake and attest. But every record means only "someone with 400 USD at risk signed these bytes". With no challengers, the deterrent is about zero (redteam F-03).
- **O does nothing on day one** until a manufacturer is admitted and enrols devices. That is the same cold start as any hardware root, Apple's included. Only a vendor or a pilot (a newsroom camera fleet) bootstraps it.
- **C works syntactically on day one,** because anyone can be an issuer, and means nothing semantically until curator lists exist.

### 3.5 Fit with an XRPL-centred event

- **P.** The objective paths run on the XRPL EVM sidechain unchanged (precompile `[TEST]` p05). The vote path cannot, because there is no UMA there. P is honest that XRPL EVM is a permissioned PoA chain with an Axelar bridge (p05 §5). No XRPL L1 use.
- **O.** Has the only **real XRPL transactions** of the three: 38 validated XRPL Testnet transactions in e03, covering anchoring, 2-of-3 multisig, credentials and memos. It then chose EVM, because "the ledger cannot check a proof" (D-02/03).
- **C.** EVM only. It can run on XRPL EVM at about 0.003 USD per photo, 5 per block.
- None runs on XRPL L1 natively. That is unavoidable today, because XRPL L1 has no P-256 and no programmable slashing (p05 §5, `[SOURCE]` there).

### 3.6 Most likely failure in the field

- **P:** irrelevance, not compromise.
  - Forgers stake, attest synthetic bytes, nobody can produce evidence, and the stake is unbonded after 30 days. The record stays forever with "passed the challenge window unchallenged".
  - That status reads as a badge of authenticity while it certifies nothing about light. Spec §6 exposes the status; it does not prevent the misreading.
  - The 400 USD per device stake keeps ordinary users out.
- **O:** governance and scale, not cryptography.
  - The registrar question is never answered credibly, or a large vendor's enrolment key leaks.
  - Throughput: 75 k photos/day worldwide on XRPL EVM forces an off-chain verifier plus batching redesign.
  - Phones prove through a server and lose privacy.
- **C:** economic abuse of its two new mechanisms.
  - Device owners self-sign the misuse payload and drain honest issuers (4 owners × 0.25 ETH = one 1 ETH bond).
  - Sybil issuers flood the registry until verifiers build curator lists, at which point C collapses into "O with plural registrars".

---

## 4. Scores (1–10)

### 4.1 (i) Each design at its best

| | Effectiveness | Crypto vision | Pitch | Mean |
|---|---|---|---|---|
| **P** | **5** (4–6.5) | **5** (4–6) | **5** (4–6.5) | 5.0 |
| **O** | **6** (5–7) | **7** (6–8) | **7** (6–8) | 6.7 |
| **C** | **6** (5–7.5) | **7** (5.5–8) | **6** (5–7) | 6.3 |

Reasons:

**P**
- **Effectiveness.** P has the best "blockchain interaction" and "closeness to deployment" of the three as *machinery*: cheap, owner-less, already answers on 12 networks. Its "solution quality" against the brief's core goal (physical origin) is the weakest, and its deterrence bound is about 2–21 USD per forgery at today's price.
- **Crypto vision.** P is the best-tested design. Its ideas are known (collateralised keys, accountable assertions, objective/intersubjective; the spec cites them honestly). The cryptography is thin for a cryptography track. The prior-existence rule and p07's equivocation extraction are nice touches.
- **Pitch.** Clear and very defensible, but the first answer to "does it prove physical origin?" is "no", and slide 2 makes that the question.

**O**
- **Effectiveness.** O answers the brief's goal at the same trust level as Apple, with the blockchain doing substantive work (on-chain proof verification). It is held back by the 2-of-3 committee, by 48× P's gas, and by unmeasured phone proving.
- **Crypto vision.** O's ZK-ECDSA-membership is feasible, measured and sound as a circuit. The tag-on-public-key design is weak (O-01), and corrected wording only partly cures it.
- **Pitch.** O's four steps mirror the Apple slides, which makes "Apple, minus the servers" easy to tell.

**C**
- **Effectiveness.** C has the most principled decentralisation, but its admission layer is meaningless until curator lists exist.
- **Crypto vision.** C pairs anonymous attestation with objective, contract-checked slashing. That is the most novel of the three, and its soundness is dented by flaw 2.
- **Pitch.** Two mechanisms plus two acknowledged flaws make a harder five-minute story.

### 4.2 (ii) Demonstrable by 08:00 CET 21 Nov, starting ≈22:30, one strong AI agent plus a small team

Inputs that drive this:

- **P.** Contracts exist and pass 67 tests (v2.2). A 9-hour plan exists. The cheapest live public-testnet path exists (XRPL EVM faucet, 90 XRP/claim, p05 §6).
- **O.**
  - Its review estimates 11.5–15.5 h serial and fits only with cuts (§4).
  - But **p04 demonstrates that an agent wrote an owner-less registry plus attest contract around O's verifier, with 9 passing proof-backed tests, in about 8 minutes**. The 2-of-3 registrar layer is simple.
  - So I judge O's contract risk much lower than its review assumed. The remaining risks are glue and UI.
- **C.** Already runs end to end. It needs a CLI/UI, a verifier-side curator list (simple, off-chain) and a spec.

| | Effectiveness | Crypto vision | Pitch | Mean |
|---|---|---|---|---|
| **P** | **5** (4.5–6) | **4.5** (4–5.5) | **5.5** (4.5–6.5) | 5.2 |
| **O** | **5.5** (4.5–6.5) | **6.5** (5.5–7.5) | **6.5** (5.5–7.5) | 6.2 |
| **C** | **5.5** (4.5–6.5) | **6.5** (5–7.5) | **5.5** (4.5–6.5) | 5.8 |

P's demo-scenario edge is execution certainty: real transactions, possibly on public XRPL EVM testnet, and a polished challenge flow. It does not lift the ceiling set by level 0. O's and C's demos would almost surely be local-chain only. A public XRPL EVM deploy of 4.2 M gas contracts is feasible (21 M gas blocks), but it is a stretch goal for both.

---

## 5. The hardest questions (and how well each candidate's material answers them)

### P — Paprika

1. **"I stake 0.25 ETH on a laptop key and attest a Midjourney image. Your contract says 'recorded, unchallenged'. Where is the authentic photo origin?"** — *Weakly.* The answer is candid (spec §1, §9.1; P-01) but substantively "nowhere at level 0". Level 1 exists only as C.
2. **"A well-made fake leaves no evidence. Who ever wins a challenge, and what is `p`?"** — *Weakly.* p06 sweeps `p` without estimating it. P-06 admits the vote "does not detect well-made synthetic images".
3. **"Your vote path is UMA, which is not on XRPL EVM and is decided by token holders in 2–3 days. Why is that decentralised photo truth?"** — *Well (honestly).* P-06 offers dropping it ("the smallest sound protocol").
4. **"Billions of phones, 400 USD locked each. 'Any device'?"** — *Weakly.* P-02: "A stake excludes people who cannot lock capital". No answer beyond assurance levels.
5. **"Every photo is linked to the owner's address, so you are less private than Apple. And a thief flags my key and takes half my stake?"** — *Weakly.* Both are stated limits (P-09; p03 flaw 4 "accepted"). There are pointers to RLN/ZK membership but no mechanism.

### O — ORIGO

1. **"Who are your three registrars, and how is 2-of-3 not the SPOF of slide 10?"** — *Weakly.* D-05: "a governance question we do not solve". The review's curator option is not adopted under the terms I was given.
2. **"4.2 M gas per photo: how many photos per day can the world attest?"** — *Weakly.* The deck has "road ahead: batching". Review fix 5 (the throughput line) is not in the applied set. The answer is 75 k/day on XRPL EVM.
3. **"`tag = H(pk‖m)`. Doesn't the manufacturer identify every photo, and doesn't revocation publish `pk` and link the past?"** — *Adequately in words* after fix 4. Technically weak: the device-secret fix `H(s‖m)` is not applied.
4. **"Can a phone produce this proof, and with how much memory?"** — *Not at all.* Unmeasured (O-12). Server proving breaks privacy (O-01).
5. **"Rooted phone, screen re-capture, WhatsApp re-encode?"** — *Well, as limits* (D-01, D-08, D-10, O-10). The answers are honest, and judges expect them.

### C — combination

1. **"Anyone can become an issuer for 1 ETH and mint devices. What does your attestation mean?"** — *Weakly.* p04 flaw 1 states it plainly. The fix (verifier-chosen curators) is described but not built.
2. **"I own a phone, sign your MISUSE payload myself, collect 0.25 ETH. Four of us drain the issuer?"** — *Not answered.* "Unsolved without restricted signing in hardware" (p04).
3. **"A forger who extracted a key just never publishes a misuse signature. What does the bond deter?"** — *Weakly.* Acknowledged: revocation "only fires when the key leaks further".
4. **"Revocation by misuse proof publishes `pk`, so the victim's whole archive is linked?"** — *Weakly.* Acknowledged. "Time-scoping fixes censorship… not linking."
5. **"Cost, throughput and phone proving?"** — *Weakly*, as for O.

---

## 6. Fairness check

**Volume asymmetry.**

- P's repository has more material:
  - 8 experiments;
  - an economic model with 24 tables;
  - a fuzz test;
  - five research reports.
- P's review (`paprika-redteam.md`) attacks the **original** proposal, not v2.3. That makes P look both more battered (by the review) and more hardened (by the answers).
- O's review targets O's current design, and I was asked to credit O with three planned fixes.

**How I normalised volume.**

- I scored each candidate on the **strongest claim its artefacts support**, not on the number of artefacts.
- P's extensive testing earned credit only under "secure protocol" and demo certainty. It did not count toward "authentic photo origin", which no amount of testing can supply at level 0.
- I credited P's v2.3 spec-only deltas the same way I credited O's three unbuilt review fixes: as small, planned, spec-level changes.
- I discounted O's review feasibility estimate using p04's demonstrated speed. That applies the same "strong agent" assumption to both.

**Candour asymmetry.**

- Both repositories are unusually candid.
- P's candour is more *damaging*: it says outright "does not prove physical origin".
- O's equivalent limits ("manufacturer is root of trust", "key provenance, not capture provenance") are milder in degree, not in honesty.
- I applied O-10's cap to O and C explicitly, and I did not penalise P for saying "no" where O would say "only via the manufacturer". The gap in my scores reflects the difference in guarantee: economic versus hardware-rooted. It does not reflect the tone.

**Document hygiene, which I did not let drive scores.**

- P's README links `docs/STATUS.md`, which does not exist, and says v2.3 tests exist in p03 when they do not yet.
- O's STATUS is from 17:45, and its D-05 still describes XRPL credentials after the EVM switch (O-14).

---

## 7. Verdict

**Ranking for this brief: O ≥ C > P.**

- O leads C narrowly (≈0.4 points at best, ≈0.4 in the overnight scenario). Within my uncertainty they overlap.
- Both lead P clearly (≈1.3–1.7 points at best, ≈0.6–1.0 overnight).
- P's gap is structural: the brief asks for "cryptographic guarantees of physical origin", and P's core level supplies an economic guarantee about a key. P's own spec says so.

**What would change the ranking**

- **C overtakes O** if:
  - the judges read "decentralised" literally and press the "who are the three registrars" question; or
  - C ships a verifier-side curator list *and* caps the misuse bounty below the owner's loss.

  Either way, C's admission becomes "plural and explicit" with no committee.
- **P closes the gap overnight** if:
  - O's or C's glue or UI slips past ≈04:00 and they show only a CLI or recording; and
  - P shows a polished, live, public XRPL EVM testnet flow with explorer links.

  "Execution" and "demo (if present)" then weigh heavily. P would still not lead on crypto vision.
- **P becomes competitive at best** only if level 1 becomes its core: hardware-attested admission. At that point it *is* C.

**The single most valuable change to each**

- **P.** Make admission hardware-rooted (level 1: bonded issuer or platform key attestation) the headline, keep level 0 as the fallback, and drop the UMA path. The result is objective-only, runs whole on XRPL EVM, and stops being "proof of existence with a deposit". For tonight, if level 1 cannot be built: drop UMA and deploy live on XRPL EVM testnet.
- **O.** Replace the 2-of-3 registry with a permissionless registry plus verifier-chosen, time-scoped curators (review §6 item 3, about 1–1.5 h). It is the one change that removes, rather than moves, slide 10's SPOF. Pair it with the honest throughput line.
- **C.** Make the misuse bounty economically safe:
  - bounded below what an owner loses by self-revoking, or payable only for sensor-level/restricted-signing assurance;
  - plus ship the curator list, so an attestation means something on day one.
