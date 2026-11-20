# Track-fit panel, round 2, seat A: Paprika v2.3 (P), ORIGO (O), combination (C)

- **Panel seat:** A, independent. I did not open `docs/reviews/track-fit-panel.md`, `RISCONTRO.md` or `docs/COMPARISON.md`.
- **Window:** started 21:59 CET on 2026-11-20 (from `date`).
- **Writes:** only this file. Two test suites were re-run on **copies** in `/tmp/panelA/`. Nothing in `/home/tux/crypto` or in the experiment folders was modified.
- **Evidence tags:**
  - `[SLIDE n]`: read from the slide image.
  - `[CODE]`: read in a repository.
  - `[TEST]`: re-run by me now.
  - `[DOC]`: a statement in a candidate's own documents that I did not re-check.
  - `[MEMORY]`: an outside fact I did not verify now.

---

## 0. What I re-ran (so the reader knows what is checked and what is reported)

| Artefact | What I did | Result |
|---|---|---|
| C: `experiments/p04-combined-critical-path` | Copied it to `/tmp/panelA/p04` and ran `npx hardhat test` | **9 passing (11 s)**. 10 real UltraHonk proofs, 926–1,044 ms each. `attest` 4,204,077 gas, `proveKeyMisuse` 197,964 gas. Matches `output/2026-11-20-run.txt` (the only difference: the 1-revoked-key attest is 4,209,493 vs 4,209,589). `[TEST]` |
| P: `experiments/p03-paprika-v2-hardened` | Copied it to `/tmp/panelA/p03` and ran `FUZZ_STEPS=300 npx hardhat test` | **67 passing**: the v2, v2.1 and v2.2 suites plus the fuzz, with fewer fuzz steps than the reported 2,500. `[TEST]` |
| P: v2.3 | Read `contracts/PaprikaV2_3.sol` (318 lines, compiled artefact present) | **There is no v2.3 test file.** `provePriorExistence`, the low-`s` rule and key-in-message are specified and coded, but untested. `[CODE]` |
| O: e05 (on-chain ZK verifier) | Not re-run by me | It was reproduced by the independent ORIGO reviewer (`origo-e05-reproduction-raw.txt`). p04 regenerates a byte-identical verifier from the same circuit and verifies 10 fresh proofs, which I did re-run. So O's critical path is indirectly re-verified. |
| P: p07 (equivocation extraction) | Read `extract.mjs` header | **No README and no output on disk**, so there is no evidence to weigh. |
| P: p02 / p05 / p06, O: e03 / e04 | Checked that the raw outputs exist | Not re-run. Treated as `[DOC]` with raw logs present. |

---

## 1. Rubric from the brief

### 1.1 Transcription vs images

I opened all 15 slide images. For the sentences used below, `track/TRACK.md` matches the images word for word:

- slide 2: problem and solution;
- slide 3: "centralised";
- slide 10: the three cons;
- slide 11: the challenge;
- slide 12: what may be used;
- slide 13: the AI policy;
- slide 14: the criteria and the judges.

**No disagreement found.**

### 1.2 The challenge, slide 11 (verbatim, image)

Title: "UNIVERSAL PHOTO-ORIGIN VALIDATION PROTOCOL". Label: "ARCHITECTURAL SCOPE". Body: "**Design a secure protocol** that generalises to **any device** and guarantees **authentic photo origin** via **decentralised blockchains** technology".

The bold phrases are bold in the image. Keyword by keyword:

| Keyword | What it literally demands | What it does not demand |
|---|---|---|
| "Design a secure protocol" | A protocol, with actors, messages, a security claim and the assumptions behind it. "ARCHITECTURAL SCOPE" puts the design at the centre. | A product, or a finished implementation |
| "generalises to any device" | It is not tied to one vendor's hardware. Read with slide 10's "Non-Apple devices", it means cross-vendor. | That every device gets the *same* assurance |
| "guarantees authentic photo origin" | The verb is "guarantees" and the object is the photo's *origin*. Slide 2 makes this concrete: "CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN." | Detection of AI images |
| "via decentralised blockchains technology" | The blockchain must be the means, and it must be decentralised | A particular chain. XRPL is not named on the slides. |

### 1.3 The problem, slide 2 (verbatim)

- "Generative AI models produce photorealistic images, which are **indistinguishable from genuine camera captures.**"
- "AND **Modern cameras already post-process every image.**"
- Then "A POSSIBLE SOLUTION": "**CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN.**"

Slide 3 describes Apple Reference Image as "Something concrete and close to a solution — but **centralised:** no decentralisation, no distribution, so weak to a single point of failure."

### 1.4 The three "cons of a centralised system", slide 10 (verbatim body text)

1. **SINGLE POINT OF FAILURE**: "Apple maintains central revocation lists. A compromised CA invalidates millions of devices."
2. **CROSS-PLATFORM LOCK-IN**: "Non-Apple devices cannot natively verify claims without relying on Apple servers."
3. **RETROACTIVE CENSORSHIP**: "Historic photos become unverifiable if central servers shut down or alter public keys."

### 1.5 What may be used, slide 12 (verbatim)

- "**Anything you find on the Internet,** not subject to copyright limitation for non-profit use."
- "**Any cryptographic primitive/protocol**, such as":
  - "Standard public/symmetric keys";
  - "Functional/searchable encryption";
  - "(Fully) Homomorphic Encryption";
  - "Secure multiparty protocols";
  - "**Any other advanced cryptosystem…**".
- Reference: "Apple Reference Image documentation: security.apple.com/blog/apple-reference-image".

Slide 13 adds: "you **must explicitly declare** which tool was used, how, and where".

### 1.6 Evaluation, slide 14 (verbatim)

1. "**EFFECTIVENESS** — Solution quality, blockchain interaction and closeness to real-world deployment."
2. "**CRYPTO VISION** — Novelty and soundness of crypto ideas vs feasibility."
3. "**THE PITCH** — Clarity of presentation, defense and vision."

Mentors and judges:
- PhD Andrea Gangemi (SHUNYAXIFRA);
- Gabriele Radici (University of Trento);
- PhD Francesco Romeo (University of Cassino);
- Prof. Roberto La Scala (University of Bari).

These are cryptographers and academics: expect questions on soundness, not on UX.

### 1.7 Event page (`decifris-ixh26.txt`)

- **Track 1:** "Projects under this track must demonstrate a clear application of cryptographic techniques to solve the challenge. The challenge can involve, for example, encryption algorithms, zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies." (line 113)
- **General criteria:** "Innovation, Execution, Impact, Pitch" (line 53), detailed at lines 119–126:
  - "Execution: How well was it developed? Does it demonstrate technical complexity or impressive engineering?";
  - "Pitch: … Is the demo (if present) well-prepared and convincing?"
- **Format:** "five minutes, followed by two minutes for questions … A live demo is also accepted (and encouraged)." (line 72)
- **Prior work:** "New work only … Any work that was completed prior to the hackathon must be mentioned" (line 70).
- **XRPL:** the event has "a strong emphasis on projects that integrate the XRP Ledger" (line 3). Only Tracks 2 and 3 make XRPL a requirement.

### 1.8 What the brief does NOT ask (and the team's REQUIREMENTS.md, read critically)

- **No finished product.** "ARCHITECTURAL SCOPE" says the design is the core. The event's "Execution" criterion and slide 14's "closeness to real-world deployment" still reward a working demo.
- **No XRPL on the slides.** Neither candidate is penalised for EVM.
- **No privacy or unlinkability on the slides.** Privacy is one of Apple's three stated requirements (reference, line 27), and the event page lists "zero-knowledge proofs … privacy-enhancing technologies" as Track 1 examples. It is an expected strength, not a stated requirement.
- **No post-quantum requirement on the slides.** PQ appears only inside the Apple description (slide 8).
- **No AI-image detector.** The slide-2 premise says one is impossible.
- **No economics, tokens or staking.** These are allowed, but nowhere requested.
- **REQUIREMENTS.md R-09 / R-13 are interpretations.** These include "every function put on-chain must remove at least one of the three limits" and "real transactions on testnet, not mocks" (EVAL-01). The team labels them as its own rules, correctly. I do not score against them.
- **REQUIREMENTS.md R-12 over-reads the brief.** It reads "authentic photo origin" as a sensor capture "with known transformations". That is a reasonable stretch from slide 2, but the slides never require handling edits. I treat post-processing as a stated problem that any answer should at least address.

---

## 2. Requirement-by-requirement table

Legend: **M** met · **P** partially · **N** not met · **NA** not addressed.

| # | Requirement (source) | P (Paprika v2.3) | O (ORIGO + review improvements 1, 2, 4) | C (combination spike) |
|---|---|---|---|---|
| 1 | "Design a secure protocol" (S11) | **M.** `spec/PROTOCOL.md` has a claim, a not-claimed section, actors, state, 8 messages, incentive conditions and 11 limits. Caveat: the v2.3 additions are untested. | **P.** No `spec/PROTOCOL.md`. `docs/DECISIONS.md` plus the e05 circuit define the relation, and the review §1.1 writes it out formally. A spec is planned. | **P.** Only the p04 README: byte layouts, contract behaviour and two self-found design flaws. No standalone spec. |
| 2 | "generalises to any device" (S11) | **M in breadth, hollow in meaning.** Any P-256 key with a stake can register. Every device gets the same zero hardware assurance (red team F-01: "achieved by making the assurance of every device equally zero"). | **P.** Any P-256 key in secure hardware, enrolled by a manufacturer that 2 of 3 registrars admitted (D-01, D-05). P-256 is what secure elements sign with. | **P/M.** Any P-256 device under any bonded issuer. Anyone can become an issuer. |
| 3 | "guarantees authentic photo origin" / "CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN" (S11, S2) | **N at level 0**, the only level built. Spec §1: "Not claimed. That `H` is the digest of a camera capture … the guarantee is economic". Levels 1–2 are specified only. | **P.** The guarantee is cryptographic, from an admitted manufacturer's hardware key to the exact file. It relies on manufacturer honesty, which includes the ability to enrol phantom keys (O-09). It is key provenance, not sensor capture (O-10), and the device is simulated. | **P, weaker than O unless verifiers bring trust lists.** p04 flaw 1: an attestation means only "a key under a root published by bonded address X signed this". |
| 4 | "via decentralised blockchains technology" (S11) | **M.** The contract verifies every P-256 signature, holds stakes, decides two objective challenges, and drives an oracle. There is no admin. | **M.** The contract verifies the ZK proof on-chain (e05, 4.1 M gas). Registry, time bounds and revocation are on-chain. | **M.** One contract: ZK verification, issuer bonds, objective revocation. No owner. |
| 5 | Fakes "indistinguishable from genuine camera captures" (S2) | **P (weak).** Only economic deterrence, about 4–40 USD per forgery (spec §8). The vote path "is **not** a detector of well-made synthetic images" (§5). | **P.** A forger needs a key extracted from hardware or a corrupt manufacturer. No rate limit (O-13). | **P.** As O. Revocation fires only if the extracted key leaks further (p04 flaw 2, last sentence). |
| 6 | "Modern cameras already post-process every image" (S2) | **NA** beyond a stated limit (§9.7, exact digest) | **NA** beyond a stated limit (D-08; verifiable transformations named as the road ahead) | **NA** |
| 7 | "centralised: no decentralisation, no distribution" (S3) | **M.** No issuer, owner or committee. Subjective claims go to an external token vote (UMA). | **P.** The registrars are a 2-of-3 consortium (O-03). Verification is fully distributed. | **M on-chain.** No committee. Trust in issuers moves to verifier-chosen lists, which are not built. |
| 8 | Slide 10 SPOF | see §2.1 | see §2.1 | see §2.1 |
| 9 | Slide 10 lock-in | see §2.1 | see §2.1 | see §2.1 |
| 10 | Slide 10 retroactive censorship | see §2.1 | see §2.1 | see §2.1 |
| 11 | "Any cryptographic primitive/protocol … Any other advanced cryptosystem" (S12); event: "zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies" | **P.** ECDSA P-256, hash commitments and block-hash time bounds. The novelty is mechanism design, not cryptography. | **M.** A zk-SNARK of ECDSA P-256 plus Merkle membership plus a revocation tag, verified on-chain. This is the event page's own example. | **M.** Same proof as O, plus an objective key-misuse signature. |
| 12 | AI disclosure (S13) | **M.** `AI_DISCLOSURE.md`, deck slide | **M.** Same | Inherits whichever repo is submitted |
| 13 | "blockchain interaction" (S14) | **M.** 64 k gas attest. The P-256 precompile answers on 12 public networks including XRPL EVM `[DOC, p05]`. UMA lifecycle on a Sepolia fork `[DOC, p02]`. | **M (demo), P (deployment).** 4.1–4.2 M gas per photo, about 10 per L1 block (O-04). | **M (demo), P (deployment).** 4.2 M gas, plus 5.5 k per revoked key in the root. |
| 14 | "closeness to real-world deployment" (S14) | **P.** Cheap and deployable on public L2s today. The assurance is not useful for high-value fakes (p06), and vote latency is 2–3 days. | **P.** Real hardware already signs P-256. Cost per photo, governance and phone proving are unresolved (O-04, O-03, O-12). | **P.** As O, plus the issuer-trust and bounty-economics flaws. |
| 15 | Reference-derived (not on slides): time window `[T0, T1]` | **M.** Block hash plus inclusion block, implemented and tested in p03 | **M in design.** Not implemented in the O repo, but implemented for the same circuit in p04 (zero-hash and stale-anchor traps closed). | **M.** Implemented and tested |
| 16 | Reference-derived: unlinkability | **N.** Records are linkable to key and account (§9.6) | **P/M.** Unlinkable to parties who do not know the device's public key. The manufacturer can identify (corrected claim, improvement 4). The anonymity set is one batch (O-05). | **P/M.** As O. A revocation links that key's archive. The `attest` submitter is visible. |
| 17 | Reference-derived: post-quantum | **N** (stated) | **N** (stated) | **N** |
| 18 | Event: demo "encouraged" | Static mock (11 screenshots). The contract suite runs. | Static mock (4 screenshots). The proof plus verifier runs. | No UI. The contract plus proofs run. |

### 2.1 The three centralisation weaknesses, read literally

**SPOF: "Apple maintains central revocation lists. A compromised CA invalidates millions of devices."**

- **P.** **Removed, vacuously, for the CA:** there is no CA, because nothing certifies devices. **Moved for revocation:** objective proofs are decided by the contract with no one in charge, which is a genuine removal. Subjective claims go to UMA's token vote, a single logical decision point that can be bought (red team F-17, spec §9.3).
- **O.** **Moved and reduced, not removed.** The list is public, but a 2-of-3 quorum changes it. Each manufacturer is still a CA for its devices. A compromised manufacturer means deactivating its roots, which is "millions of devices" for a large vendor. With improvement 1 this is prospective and dated, not retroactive. Losing 2 of 3 registrar keys freezes the registry.
- **C.** **Removed on-chain for device revocation.** Only an objective misuse proof revokes, and nobody holds a list. **Moved off-chain for issuers.** `deactivateRoot` can be called only by the root's own issuer (`OpenRegistry.sol:81`, README), so a compromised or malicious issuer cannot be retired on-chain by anyone. Every verifier's curator list must drop it. The blast radius is one issuer, and the decision is plural.

**Lock-in: "Non-Apple devices cannot natively verify claims without relying on Apple servers."**

- **P.** **Removed.** Verification is SHA-256 plus a chain read. Registration is open to any key.
- **O.** **Removed for verification:** a public verifier contract, and the stored proof plus vk can be checked off-chain. **Partly moved for capture:** a device can join only through a manufacturer the registrars admit.
- **C.** **Removed** for verification and for onboarding. What remains is that the verifier must choose whom to trust. That is a choice, not a dependency on a server.

**Retroactive censorship: "Historic photos become unverifiable if central servers shut down or alter public keys."**

- **P.** **Removed for shutdown and key alteration**, on a public chain: the contract is immutable and records are never erased. **Partly reintroduced through key compromise.**
  - Under *both* verifier policies, a `KeyMisuse` flag distrusts **all** past records of the key (spec §6, and the mock screen `mock-verify-misuse.png`: "distrust" in both rows).
  - p03 attack 13 (accepted) shows that whoever steals a key can trigger this and collect α·S.
  - So a thief can make a victim's historic photos untrusted. The records stay readable; the verdict changes.
  - The deck's line "**Removed**, including by our own bans" (`deck-draft.tex:109`) overstates this.
- **O (improvement 1 applied).** **Removed** for shutdown and alteration on a public chain. Revocation is **moved** to a public, dated act by a quorum. Small residual: a "compromised since" date earlier than the revocation is still allowed, with a logged reason.
- **C.** **Removed, and the cleanest of the three.**
  - Revocation is per key and time-scoped.
  - "No retroactive 'compromised since' field (no one is entitled to set it)" (README note 2). It is tested: earlier records are still returned with "key proven misusable at N > b".
  - Residual: revealing `pk` links that key's archive. That is a privacy cost, not a loss of verifiability.

**All three:** the demo runs on a local single-node chain. During the demo the third weakness is literally present: when the process ends, the records vanish. P alone has shown its contract's precompile dependency answering on public networks (p05), so it is the cheapest to deploy publicly.

---

## 3. What each candidate guarantees to a verifier (one sentence each)

**P (level 0, as built).**

> The holder of P-256 key K, registered once by an account that locked stake S, signed this exact byte string's SHA-256 after block b0 and before block b1. The verifier can also read what has been proven or voted about K since, with blocks, and how much stake is still at risk.

Assumptions:
- EUF-CMA of ECDSA P-256, collision resistance of SHA-256, chain safety, block-hash unpredictability;
- for the vote path, an honest majority of UMA voters.

Compared with "guarantees authentic photo origin" and "cryptographic guarantees of physical origin": **it guarantees key origin and time, not physical origin.** The link to a camera is economic and bounded: forgeries worth roughly 4–40 USD are deterred (spec §8). The spec says this itself.

**O (with improvements 1, 2, 4).**

> Some P-256 key that is a leaf of batch root R did this. R was published by a manufacturer admitted by 2 of 3 registrars. The key signed `SHA-256("ORIGO-v1" ‖ chain ‖ contract ‖ digest ‖ n ‖ h)` for this exact file after block n and before the recording block. The key had not been revoked as of that block, and the verifier does not learn which key it was.

Assumptions:
- soundness of UltraHonk and of the generated verifier;
- ECDSA, SHA-256, chain safety;
- 2 of 3 registrars honest;
- **the manufacturer enrols only keys that live in its secure hardware and mints no phantom keys**;
- the key has not been extracted.

Compared with "physical origin": **closest of the three.** It is cryptographic from the hardware key to the file, but stops at the manufacturer's word. It covers "a registered key signed it", not "light hit this sensor" (keystore-level devices, O-10). This is about as far as Apple's own design goes on enrolment, without Apple's sensor-to-SEP binding or its PCC development step.

**C (as spiked).**

> Some P-256 key that is a leaf of root R did this. R was published by bonded address X, and a verifier must decide for itself whether to trust X. The key signed the same capture payload for this exact file after block n and before the recording block, with the key hidden. If anyone has published an objective misuse proof for that key, the verifier sees the block, and records before it keep their status.

Assumptions: as O, but "manufacturer admitted by registrars" is replaced by "X is on the verifier's own trust list". The objective misuse proof means extraction only when hardware refuses to sign anything except capture payloads.

Compared with "physical origin": **equal to O when verifiers bring a good trust list.** Without one, it is no better than P level 0, because anyone can be an issuer for 1 ETH (README flaw 1).

---

## 4. Scores (1–10, with uncertainty range)

**Weighting.**
- (i) "At its best" weighs the **idea**: the design as specified, with planned small fixes, judged against the brief's words.
- (ii) "By 08:00" weighs **maturity**: what already runs, what must still be written, and how likely a convincing demo and a defensible pitch are, starting at about 22:30 with one strong AI coding agent and a small human team.

The criterion definitions are slide 14 verbatim. For "The pitch" I judge how pitchable and how defensible each candidate is in 5+2 minutes before four cryptographers.

### (i) Design at its best

| | Effectiveness | Crypto vision | Pitch | Mean |
|---|---|---|---|---|
| **P** | 5 (4–6) | 4.5 (3.5–6) | 5 (4–6.5) | **4.8** |
| **O** | 6 (5–7) | 7 (6–8) | 7 (6–8) | **6.7** |
| **C** | 6 (4.5–7) | 6.5 (5–7.5) | 6 (4.5–7) | **6.2** |

Reasons:

- **P, Effectiveness.**
  - For: excellent blockchain interaction and deployability. It is cheap (64 k gas), has no admin, and its precompile is live on public chains.
  - Against: "solution quality" against the brief is capped by the not-claimed sentence. The core property is economic and only deters low-value fakes.
- **P, Crypto vision.**
  - For: the cryptography is sound but standard. The objective misuse proof and the prior-existence rule are neat. The novelty is incentive engineering, and its soundness depends on assumed `p`, `e` and `G` (p06 inputs "measured by nobody").
  - Against: complexity grew with each revision: commit-reveal, escrow and the priority rule. v2.3 is untested.
- **P, Pitch.**
  - Clear and very candid.
  - Against: the opening concession ("Not claimed: that H came from a camera", `deck-draft.tex:59`) answers the challenge sentence with a no. It also invites "then what did you build?". The priority rules are hard to explain in 5 minutes.
- **O, Effectiveness.**
  - For: it targets the asked property with a real hardware root, and it works on-chain.
  - Against: 4.1 M gas per photo is not a deployment path at camera scale. Governance is unspecified ("a governance question we do not solve", D-05).
- **O, Crypto vision.**
  - For: a zk proof of an unmodified device's ECDSA P-256 signature, with Merkle membership and a revocation tag, verified on-chain. It is novel enough for a hackathon, it is the event page's own example of Track 1 cryptography, it is measured (0.8 s, 9.5 kB), and an independent review found the circuit correctly constrained.
  - Against: the pattern is close to known anonymous-membership designs [MEMORY: Semaphore-style; zk-ECDSA work by PSE/0xPARC], so this is not a research novelty. The privacy model is weaker than first claimed (O-01, corrected).
- **O, Pitch.**
  - For: a direct mirror of Apple's flow, three cons mapped one by one, and a visible ZK moment ("second photo unlinkable").
  - Against: the defence is exposed on registrars and on the manufacturer's power to open and to forge.
- **C, Effectiveness.**
  - For: no committee, and the cleanest time-scoped revocation.
  - Against: two open design flaws, found by its own author. Issuers mean nothing without curators, and owners can drain an issuer through self-revocation. It also has no on-chain way to retire a bad issuer.
- **C, Crypto vision.**
  - For: an attractive synthesis, combining an objective cryptographic revocation trigger with ZK attestation.
  - Against: its soundness depends on a hardware property (restricted signing) that the demo cannot show.
- **C, Pitch.**
  - "No committee at all" is a strong line.
  - Against: "so anyone can be a camera maker for 1 ETH?" is the first question, and the answer ("verifiers choose curators") needs a layer that does not exist yet.

### (ii) What can realistically be shown by 08:00 on 21 Nov

| | Effectiveness | Crypto vision | Pitch | Mean |
|---|---|---|---|---|
| **P** | 5 (4–6) | 4.5 (3.5–5.5) | 5.5 (4.5–6.5) | **5.0** |
| **O** | 5.5 (4–6.5) | 6.5 (5.5–7.5) | 6.5 (5–7.5) | **6.2** |
| **C** | 5 (4–6) | 6 (5–7) | 5 (4–6.5) | **5.3** |

Reasons:

- **P is the most certain.**
  - The v2.2 contract plus 67 tests run (`[TEST]`), and a 9-hour plan exists with clear cuts.
  - Risks:
    - v2.3 has no tests;
    - the oracle is a mock (one account "votes");
    - the deck cites v2 numbers (S = 0.1) while the spec says S = 0.25.
  - Its demo will very likely be smooth, and that gains pitch points under the event's "Is the demo … well-prepared and convincing?". But a smooth demo of a level-0 guarantee does not raise Crypto vision, and it adds only a little to Effectiveness.
- **O is riskier, but less than its own review estimated.**
  - The review gives 11.5–15.5 h serial work against about 9.5 h available.
  - However, the main technical risk the review names (byte-exact `m` and hi/lo encoding across Node, Noir and Solidity, plus block-hash traps) has **already been retired by p04**. p04 uses the same circuit with a byte-identical verifier, a contract that computes `m`, and closed zero-hash and stale-anchor checks, and I re-ran it: 9 passing.
  - Porting it and swapping in a 2-of-3 approval registry is perhaps 2–3 h of agent work. The rest is CLI, UI, spec and deck.
  - The wider lower bound (4 on Effectiveness) reflects the chance of ending with a CLI-only demo.
- **C has running contracts but nothing else of its own.** There is no spec, no deck, no mock, no curator layer, and no fix for flaw 2. The team would have to present a hybrid whose own README begins with "Design flaws found (read first)". Pitch risk is highest.

---

## 5. The hardest questions (6 per candidate) and how well the material answers them

**P (Paprika v2.3)**

| # | Question a cryptographer judge would ask | Answered? |
|---|---|---|
| 1 | "Your spec says a record does not prove the file came from a camera. The challenge says 'guarantees authentic photo origin'. Where is the guarantee?" | **Weakly.** It is honest (levels 1–2 are specified, level 0 only is built), but the answer is a concession. |
| 2 | "Your own model deters forgeries worth 4–40 USD. A political deepfake is worth millions. What stops it?" | **Weakly.** Spec §8.4 and §9.2 say plainly that nothing does. |
| 3 | "Claims are decided by UMA token holders over 2–3 days. Isn't that a new single point of failure, and a purchasable one?" | **Weakly.** Stated (§9.3, red team F-17). The objective paths reduce reliance on it but do not remove it. |
| 4 | "A thief who steals an honest key takes α·S, and under both of your policies the victim's whole archive becomes untrusted. Isn't that slide 10's retroactive censorship?" | **Not well.** Accepted in p03 (attack 13), yet the deck says "Removed". This is a contradiction a judge can exploit. |
| 5 | "On a phone keystore the owner can sign anything, including your EXTRACTED message. What does a KeyMisuse flag tell me at level 0?" | **Weakly.** Spec §5: "or it never was hardware-bound". At level 0 it is a self-slash option, not evidence. |
| 6 | "Every record links to a key and a funding account. How does a journalist in a dangerous place use this?" | **Not answered.** It is a stated limit (§9.6); a private variant is only named. |

**O (ORIGO)**

| # | Question | Answered? |
|---|---|---|
| 1 | "Your tag is `H(pk‖m)`. Anyone who knows `pk`, starting with the manufacturer, can link and identify every photo. In what sense is it unlinkable?" | **Adequately after improvement 4** (claim corrected, manufacturer named as the opening authority). The real fix (device secret `s`) is not built. |
| 2 | "Who are the three registrars? Two of them admit a fake manufacturer, and your zero-knowledge proof makes its forgeries indistinguishable." | **Weakly.** D-05: "a governance question we do not solve". Curators (review improvement 3) are not applied. |
| 3 | "4.1 M gas per photo: about ten photos per Ethereum block. How is this 'close to real-world deployment'?" | **Weakly.** The deck has a "road ahead: batched attestations" line. There is no aggregation measurement. |
| 4 | "A manufacturer can enrol phantom keys and mint undetectable forgeries. How is that better than Apple's CA?" | **Weakly.** D-01 states the trust. The answer is "plural, public, revocable roots". |
| 5 | "Your proofs are unlinkable. When a forgery is found, how do you learn which key to revoke?" | **Not answered** in O's material. Only the manufacturer can trace by brute force (O-02). C's misuse proof is one answer, but it is not O's. |
| 6 | "Show me where the image digest and the block hash are bound. The circuit only sees `m`." | **Well, if improvement 2 is built.** p04 shows the exact contract logic and its negative tests. |

**C (combination)**

| # | Question | Answered? |
|---|---|---|
| 1 | "Anyone can become an issuer for 1 ETH and produce attestations identical to Sony's. What does an attestation mean?" | **Weakly.** README flaw 1 says verifiers must use curators. None are built or specified. |
| 2 | "On a keystore device, the owner can sign your misuse payload: four owners drain an honest issuer's bond." | **Not answered.** It is stated as unsolved without restricted signing in hardware. |
| 3 | "A forger who extracts a key simply keeps it private. Your objective revocation never fires. What catches it?" | **Not answered.** Stated. Rate-limiting nullifiers appear only as an idea in the O review. |
| 4 | "A malicious issuer can be stopped on-chain only by itself (`deactivateRoot` is issuer-only). Isn't that a CA nobody can revoke?" | **Not answered** explicitly. It is implied by "who is a manufacturer". |
| 5 | "Revocation publishes `pk`, so the victim of a key theft has their archive linked, past and future." | **Weakly.** Stated ("time-scoping fixes censorship … not linking"). |
| 6 | "Why a bond? It prices Sybil issuers but you say nothing can slash it for phantom keys. What risk does the bond actually carry?" | **Weakly.** Answered honestly: only bounties, which flaw 2 makes self-dealing. |

---

## 6. Fairness check

- **Document volume.** P has many more and more polished documents:
  - a formal spec with revision history;
  - five research reports and a claims ledger;
  - an economic model;
  - a 12-network probe;
  - 67 tests plus fuzzing;
  - 11 mock screens.

  O has decisions, three experiments, four mock screens and no spec. I tried not to let this drive the ranking. I scored P's *idea* against the brief's words, where its own spec concedes the central property, and credited the volume only in (ii) and in "blockchain interaction". If O had as much paper, its scores in (i) would not change. Its overnight lower bounds would rise.
- **Asymmetric reviewing.** P's red team reviewed the **original** proposal, and v2.3 has had **no independent review**. O was reviewed in its current form, and harshly. That makes P's open-findings list look shorter than it would after an equal review. Examples:
  - the stolen-key/KeyMisuse archive effect and its contradiction with the deck;
  - the v2.3 code being untested.

  I normalised by reading P's own "still does not solve" lists as if they were review findings.
- **Candour normalisation.** P is more candid in the spec ("Not claimed …") but overclaims in its deck on retroactive censorship. O's DECISIONS and deck overclaim unlinkability and SPOF removal; per the brief, I judged O with those claims corrected (improvement 4). C's README is the most candid of all: it leads with its own design flaws. I did not penalise C for candour; its flaws are real and would be found by judges anyway.
- **Unverified sub-agent claims.**
  - p04's "about 8 minutes of agent time": unverifiable and irrelevant.
  - p05 (12 public networks) and p02 (UMA on a Sepolia fork): raw logs exist, I did not re-run them.
  - p06: its inputs are explicitly assumptions.
  - e03 (38 XRPL Testnet transactions) and e04: logs exist, not re-run.
  - p07: **no output at all**.
  - e05: reproduced by the O reviewer, and indirectly by my p04 re-run.
  - p03 v2.2 and p04: **re-run by me**.
- **Location bias.** The O review, the C spike and this panel all sit in P's repository. The p04 spike, written there, de-risks O as much as C. I credited that to O in (ii), since it is the same team and the same circuit.

---

## 7. Verdict

**Ranking for this brief: O > C > P.**

| Pair | (i) Design at its best | (ii) By 08:00 | Size of the gap |
|---|---|---|---|
| O over C | +0.5 | +0.9 | Small. Within overlapping ranges for the design, clearer for the overnight demo. |
| O over P | +1.9 | +1.2 | Moderate to clear |
| C over P | +1.4 | +0.3 | Clear for the design; a near tie overnight |

**What would change the ranking.**

- **P ahead of O overnight** if ORIGO's build fails before a full capture → prove → attest → verify → revoke flow runs: a CLI-only or broken demo with an untested contract. P's demo is near-certain. Judges who weigh "Execution" and "closeness to real-world deployment" (cost per photo) heavily would then prefer P.
- **C ahead of O at its best** if C adds a verifier-side curator layer and closes flaw 2. Flaw 2 could be closed by funding the misuse bounty from a per-device owner stake (Paprika's `(1−α)` rule) rather than the issuer's bond, so that self-revocation always loses money. Then C removes the registrar consortium that is O's weakest answer on slide 10.
- **P up by about 1.5** if level 1 were *built*: admission only with a bonded issuer's signature over `keyId`. Its record would then answer "authentic photo origin" in the same terms as O, without privacy.

**The single most valuable change to each.**

- **P:** implement assurance level 1, so that a key is admitted only with an issuer's signature over `keyId` plus the issuer's bond. Lead the pitch with it. Level 0 cannot answer the challenge sentence. Also fix the deck's "Removed" claim on retroactive censorship.
- **O:** replace "2 of 3 registrars decide" with review improvement 3. Every manufacturer registers permissionlessly in an append-only log. Verifiers follow chosen curators, and the 2-of-3 multisig becomes one of them. Revocations stay dated and time-scoped. That is the brief's word "decentralised" and its SPOF sentence. It is also the move that turns O into the best form of C.
- **C:** a verifier-side curator list in the status view ("trusted according to curators X, Y"). Without it an attestation certifies nothing. Close behind it: pay the misuse bounty from a per-device owner stake to kill the self-revocation drain.
