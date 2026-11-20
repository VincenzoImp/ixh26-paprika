# Requirements, rules and criteria — IXH26 Track 1

This file is the **interpretive layer** on top of [`TRACK.md`](TRACK.md) (faithful transcription).
Each entry has a stable ID, a **source** and a type:

- `FACT` — written in the source, quoted verbatim (in English).
- `INTERPRETATION` — our reading, debatable; to be treated as a hypothesis.
- `UNKNOWN` — the source does not say it; it must not be assumed.

Sources: `S<n>` = slide n of the track; `WEB` = official page <https://www.decifris.it/ixh26/>
(read on 2026-11-20, copy in `references/cache/decifris-ixh26.txt`); `APPLE` =
[`reference/apple-reference-image.md`](reference/apple-reference-image.md).

## 1. The challenge

| ID | Type | Content | Source |
|---|---|---|---|
| R-01 | FACT | Title: "UNIVERSAL PHOTO-ORIGIN VALIDATION PROTOCOL". | S11 |
| R-02 | FACT | "**Design a secure protocol** that generalises to **any device** and guarantees **authentic photo origin** via **decentralised blockchains** technology". | S11 |
| R-03 | FACT | Task label: "ARCHITECTURAL SCOPE". | S11 |
| R-04 | FACT | Ingredients of the track: "CRYPTOGRAPHY + BLOCKCHAIN TECHNOLOGY + DIGITAL PROVENANCE". | S1 |
| R-05 | FACT | Problem: images generated "indistinguishable from genuine camera captures" **and** "Modern cameras already post-process every image". | S2 |
| R-06 | FACT | Indicated direction: "CRYPTOGRAPHIC GUARANTEES OF PHYSICAL ORIGIN." (presented as "A POSSIBLE SOLUTION"). | S2 |
| R-07 | FACT | Apple Reference Image is the starting example: "concrete and close to a solution — but centralised". | S3 |
| R-08 | FACT | The slide "CONS OF A CENTRALISED SYSTEM" lists three limits of the Apple example: "SINGLE POINT OF FAILURE", "CROSS-PLATFORM LOCK-IN", "RETROACTIVE CENSORSHIP". | S10 |
| R-09 | INTERPRETATION | Those three limits are what our protocol must overcome: the track does not write it in these terms, but presents Apple as "close to a solution — but centralised" (S3) and asks for "decentralised blockchains technology" (S11). | S3, S10, S11 |

Reading of the four keywords of R-02 (all `INTERPRETATION`):

| ID | Keyword | Reading | What remains open |
|---|---|---|---|
| R-10 | "secure protocol" | A defined **protocol** is needed: actors, messages, trust assumptions, threat model, argued security properties. "ARCHITECTURAL SCOPE" (R-03) suggests that the core is the design, not a finished product. | How formal the security argument must be. |
| R-11 | "any device" | Not only iPhone 18 Pro: different manufacturers, hardware with different roots of trust (signing sensor, only TEE/secure element, no hardware root). Probable need for **declared assurance levels**, not a single guarantee. | Whether "any device" includes devices without trusted hardware and what honest guarantee can be given to them. |
| R-12 | "authentic photo origin" | Guarantee on the **physical origin** (R-06): the photo derives from a capture by a real sensor, in a time interval, with known transformations (R-05 requires dealing with post-processing). | Whether handling of subsequent modifications (editing) is also required. |
| R-13 | "via decentralised blockchains technology" | The blockchain must have a **substantial role** in removing the three limits of R-08, not be a mere hash registry. From this we derive a working rule of our own (not the track's): every function put on-chain must remove at least one of the three limits. | Which chain; what goes on-chain and what does not. |

Mapping flaw → property our protocol must demonstrate (`INTERPRETATION`):

| Flaw (S10) | Text | Property required of our design |
|---|---|---|
| Single point of failure | "Apple maintains central revocation lists. A compromised CA invalidates millions of devices." | No single key/entity whose compromise or unavailability invalidates the system; revocation and roots governed in a distributed way; damage containment. |
| Cross-platform lock-in | "Non-Apple devices cannot natively verify claims without relying on Apple servers." | Verification executable by anyone, on any platform, with public data; onboarding open to multiple manufacturers. |
| Retroactive censorship | "Historic photos become unverifiable if central servers shut down or alter public keys." | Long-term verifiability: the state needed for verification (keys, revocations, time) is historicised, immutable and reconstructible without the issuer. |

## 2. What can be used

| ID | Type | Content | Source |
|---|---|---|---|
| RULE-01 | FACT | "Anything you find on the Internet, not subject to copyright limitation for non-profit use." | S12 |
| RULE-02 | FACT | "Any cryptographic primitive/protocol, such as": "Standard public/symmetric keys", "Functional/searchable encryption", "(Fully) Homomorphic Encryption", "Secure multiparty protocols", "Any other advanced cryptosystem…". | S12 |
| RULE-03 | FACT | Official reference: `security.apple.com/blog/apple-reference-image`. | S12 |
| RULE-04 | FACT | "Non-team-created software or intellectual property can be utilised if you have a licence (e.g. software libraries or design assets), but they must be mentioned in your submission." | WEB |
| RULE-05 | FACT | "New work only: coding, development, and design should be done during the hackathon. Any work that was completed prior to the hackathon must be mentioned in your submission." | WEB |
| RULE-06 | INTERPRETATION | Every dependency and every third-party material must be recorded with its licence in `THIRD_PARTY.md`; no code with incompatible licences or of unknown provenance. | RULE-01, RULE-04 |
| RULE-07 | INTERPRETATION | The list in RULE-02 (FHE, MPC, functional encryption…) signals that the judges appreciate advanced cryptography, but it is a "such as": use it **only** if it solves a real problem of the protocol (cf. EVAL-02 "vs feasibility"). | S12, S14 |

## 3. AI policy (mandatory)

| ID | Type | Content | Source |
|---|---|---|---|
| AI-01 | FACT | "You are free to use any AI software (LLMs, code assistants, visual generators), but you **must explicitly declare** which tool was used, how, and where". | S13 |
| AI-02 | FACT | Card "SOLUTION DESIGN & CODE GENERATION": "Specify approaches, algorithms or smart contracts generated via AI." | S13 |
| AI-03 | FACT | Card "DOCUMENTATION": "Declare assistance in writing specifications or slides." | S13 |
| AI-04 | FACT | Card "PITCH PREPARATION": "Detail AI involvement in slide creation or speech drafting." | S13 |
| AI-05 | INTERPRETATION | A precise log (tool, how, where) is needed, kept up to date during the work, and a summary in the submission and in the slides: [`../AI_DISCLOSURE.md`](../AI_DISCLOSURE.md). | AI-01…04 |

## 4. Evaluation

Track criteria (S14):

| ID | Criterion | Text (FACT) | What satisfies it (INTERPRETATION) |
|---|---|---|---|
| EVAL-01 | EFFECTIVENESS | "Solution quality, blockchain interaction and closeness to real-world deployment." | Complete and coherent protocol; **real interaction with a blockchain** (real transactions on testnet, not mocks); credible path to deployment (costs, existing hardware, adoption). |
| EVAL-02 | CRYPTO VISION | "Novelty and soundness of crypto ideas vs feasibility." | At least one non-trivial cryptographic idea, **correct** and **feasible**; the "vs" indicates that novelty without feasibility (or vice versa) is penalised. |
| EVAL-03 | THE PITCH | "Clarity of presentation, defense and vision." | Clear 5-minute pitch; being able to **defend** the choices before cryptographers (hostile questions); vision beyond the prototype. |

General criteria of the event (WEB, `FACT`; how they combine with the three of the track is not known — `UNKNOWN`): "Innovation: How original is the idea? Does it bring
new insights or solutions?" · "Execution: How well was it developed? Does it demonstrate technical
complexity or impressive engineering?" · "Impact: … Does it add value to a particular community,
scenario or industry?" · "Pitch: Is the project clearly communicated? Is the demo (if present)
well-prepared and convincing?"

`INTERPRETATION`: "Impact" has no dedicated deliverable; it is served by the deployment path
in the spec and a slide saying who the protocol serves and why.

Judges and mentors (S14, `FACT`, spelling as on the slide): "PhD Andrea Gangemi" — "SHUNYAXIFRA"; "Gabriele Radici" —
"UNIVERSITY of TRENTO"; "PhD Francesco Romeo" — "UNIVERSITY of CASSINO"; "Prof. Roberto La Scala" —
"UNIVERSITY of BARI".
`INTERPRETATION`: audience of academic cryptographers → the soundness of arguments matters more than
aesthetics; cryptographic errors or inflated claims cost dearly.

## 5. Event context and submission

| ID | Type | Content | Source |
|---|---|---|---|
| EVT-01 | FACT | IXH26 = Italian XRPL Hackathon; "a national hackathon focused on cryptography and blockchain, with a strong emphasis on projects that integrate the XRP Ledger (XRPL)". | WEB |
| EVT-02 | FACT | Track 1: "Advanced cryptography for blockchain — Projects under this track must demonstrate a clear application of cryptographic techniques to solve the challenge." Only Tracks 2 and 3 explicitly say "must involve/using the XRP Ledger". | WEB |
| EVT-03 | UNKNOWN | Whether for Track 1 the use of XRPL is required, expected or merely welcome. **To ask the mentors** (S15: "For any doubt, ask the IXH mentors!"). | — |
| EVT-04 | INTERPRETATION | XRPL is to be evaluated as a serious candidate and neutrally: the event is organised by Ripple UBRI and XRPL Commons and there is an XRPL workshop; but the choice must be decided with evidence (ADR), not out of complaisance. | EVT-01, EVT-02 |
| EVT-05 | FACT | "Coding starts at 12:00 on November 20th and submissions close at **12:00 on November 21st, 2026 (CET, UTC+1)**." | WEB |
| EVT-06 | FACT | "Project pitches will be of five minutes, followed by two minutes for questions. You can include a PowerPoint/PDF presentation. A live demo is also accepted (and encouraged)." | WEB |
| EVT-07 | FACT | "all submitted code must be in a version-controlled repository (e.g., GitHub) and made accessible to judges at the time of submission." | WEB |
| EVT-08 | FACT | Pitches from 12:30 to 13:30 on 21 November. Teams of 3 to 8 people. | WEB |
| EVT-09 | UNKNOWN | Submission method (form? email?), language of the pitch, whether the repo must be public or it is enough to invite the judges. **To ask the mentors.** | — |
| EVT-11 | FACT | Track 1: "The challenge can involve, for example, encryption algorithms, zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies." | WEB |
| EVT-12 | FACT | "Each team will select its own track during the event and submit only one project." | WEB |
| EVT-13 | FACT | Disqualification for those who: "Fail to comply with intellectual property or copyright rules." | WEB |
| EVT-10 | INTERPRETATION | A paper is not required. Mandatory deliverables: repo + pitch. Slides and demo are optional but in practice decisive for EVAL-01 and EVAL-03. A short technical write-up in the repo supports EVAL-02 and the "defense". | EVT-06, EVT-07 |

## 6. Deliverables and priorities (project decision, revisable)

1. **Protocol** specified (`spec/`) with threat model and security arguments — the core (R-03).
2. **Demonstrable prototype** (`impl/`) with real transactions on testnet and end-to-end demo (EVAL-01).
3. **Slides and 5-minute pitch** + preparation for the questions (EVAL-03).
4. **Technical write-up** (`paper/`), short paper format: useful but subordinate to the first three.
5. **Disclosure** of AI and third parties, always up to date (AI-05, RULE-06).

## 7. Non-requirements (not to be invented)

- The track does **not** ask for an AI-image detector or forensic analysis of the content.
- The track does **not** impose a specific blockchain (see EVT-03).
- The track does **not** explicitly require post-quantum, privacy/unlinkability or handling of
  editing: they are properties of the Apple reference (`APPLE` §2) that it is worth **comparing
  explicitly**, declaring which we keep, exceed or leave out and why.
- `UNKNOWN`: the track does not say whether real hardware is needed or whether a simulated device is
  acceptable (question Q6 for the mentors). Working assumption: simulated, declaring it everywhere.
- The official text of Track 1 cites "privacy-enhancing technologies" among the examples
  (EVT-11): privacy is not a requirement, but it is an expected terrain for this track.
