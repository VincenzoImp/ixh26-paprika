# Plan to the deadline — Paprika

**Internal deadline: 08:00 CET, 21 November 2026** — everything deliverable and pushed.
Official submission closes at 12:00 CET; pitches run 12:30–13:30 (5 minutes plus 2 of questions).

This plan is ready to start; it has **not** started. The team submits one project, and
[`COMPARISON.md`](COMPARISON.md) records how this candidate compares with the sibling one (ORIGO)
and with their combination. Times below are relative to the moment the team says "go" (`T`),
because that moment is not fixed. The work needs about 9 hours of one coding agent, with the
humans reviewing in parallel: the latest useful start is about 22:45.

## What we ship

| # | Deliverable | Where | State |
|---|---|---|---|
| 1 | Demo: register, capture, attest, verify, tamper, prove key misuse, false claim rejected — real transactions | `impl/` | Not started; every contract path is proven in `experiments/p03` |
| 2 | Protocol specification | `spec/PROTOCOL.md` | Draft, revision v2.5 |
| 3 | Pitch deck (PDF, 7 slides), speaker notes, demo script | `slides/` | First draft |
| 4 | Defence sheet (hard questions and answers) and team briefing | `docs/` | Not started; raw material in `docs/reviews/` |
| 5 | Submission README, AI disclosure, third-party register | root | Working versions |

## Scope

**In.** Assurance levels 0 and 1 with simulated device keys and a simulated issuer. One contract,
no owner. Registration with stake and proof of possession, optionally endorsed by a bonded issuer.
Capture records signed with P-256, relayed by any account, with block-hash time bounds. Proof of
key misuse with the issuer's bounty. A verifier-side list of trusted issuers. Optional, after
everything else: claims with commit and reveal resolved by an optimistic-oracle mock. A local web page
with four screens (device, capture, verify, challenge). A command-line verification of a stored
photo. The demo runs on a local Ethereum EVM chain, as agreed with the team; no public network is
used.

**Out, and stated as limits.** Hardware attestation (levels 1–2). A real token-holder vote.
Privacy of records. Batching. Detection of synthetic images. Post-quantum signatures. A mobile app.

## Milestones and backlog

Estimates are for one coding agent. "Exit" is the check that closes the item.

| ID | Milestone | Item | Est. | Exit |
|---|---|---|---|---|
| A1 | M1 Contracts (T+0 → T+1:15) | Move `PaprikaCore.sol` from `experiments/p03` to `impl/contracts` (and `PaprikaV2_5.sol` with the oracle mock only if the claim path stays in scope); freeze parameters from `experiments/p06` | 0:20 | Compiles; parameters match the spec |
| A2 | M1 | Port the attack suite and the randomised stateful test as the regression suite | 0:25 | All green, including every negative case |
| A3 | M1 | Deployment script: one command starts a chain, deploys, prints addresses | 0:30 | Works from a clean clone |
| B1 | M2 Core and CLI (→ T+2:45) | Device library: key generation, proof of possession, capture signature over digest and block hash | 0:30 | Unit tests against the contract |
| B2 | M2 | Chain client: register, relay, read records, compute verifier policies (strict, time-scoped) | 0:30 | Round trip from the command line |
| B3 | M2 | Challenger and issuer tools: misuse proof with bounty; issuer registration and endorsement; trusted-issuer list in the verifier | 0:30 | Runs from the command line |
| C1 | M3 Demo page (→ T+4:45) | Four screens wired to the local chain, following `impl/mock/ui-mock.html` | 1:30 | The demo story runs end to end |
| C2 | M3 | Browser-held device key (WebCrypto, non-extractable P-256) and capture from the laptop camera | 0:30 | A photo taken in the page is attested and verified |
| D1 | M4 Specification and review (→ T+6:15) | Bring `spec/PROTOCOL.md` in line with the code, step by step | 0:30 | Spec-to-code table complete |
| D2 | M4 | Independent review of contract and spec by fresh reviewers; fixes | 1:00 | Findings handled or stated as limits |
| E1 | M5 Pitch material (→ T+8:00) | Deck from draft to final, with measured numbers and screenshots; timed script | 0:45 | Read aloud in under 5 minutes |
| E2 | M5 | Demo script and recorded fallback run | 0:30 | Recording plays without the chain |
| E3 | M5 | Defence sheet and team briefing, written for people who did not build it | 0:30 | Covers the questions in `docs/reviews/` |
| F1 | M6 Final pass (→ T+9:00) | Clean-clone run, claim audit of deck and README, disclosure, third-party register | 1:00 | Everything pushed |
| X2 | Optional | Disputes through UMA's real contracts on a local fork (from `experiments/p02`) | 0:45 | Fork prepared in advance; scripted run under two minutes |

## Cut order if time runs short

1. X2.
2. Camera capture and the browser-held key (use bundled sample images and a file-based key).
3. The challenge screen's claim panel in the page (keep it on the command line).
4. Polish of the page beyond clear, readable output.

**Never cut:** real transactions; negative cases that are rejected; the proof of key misuse;
honesty about what a level-0 record proves and about what is simulated; the AI disclosure; a
recorded fallback; the briefing and defence sheet.

## Demo story (about 90 seconds)

1. Register a device key: the stake is locked, the key proves possession.
2. Take or load a photo: the device signs the digest with a fresh block hash; a relayer submits it;
   the record appears with its time window.
3. Verify: the record, the window, the stake at risk.
4. Change one pixel: no record.
5. Prove key misuse on a level-1 key: the stake is split between challenger and burn and the
   issuer pays its bounty; the earlier record is still shown, now with the flag's block and reason.
6. Try to revoke an honest device without its key: impossible. Switch the verifier's list of
   trusted issuers: the same record reads as level 1 or as level 0. Nothing was erased.

## Risks

| Risk | Countermeasure |
|---|---|
| A judge shows that a level-0 record proves no physical origin | We say it first, on slides 1 and 7; the claim is the one in the spec, §1 |
| "A vote cannot tell fakes" | We agree: the demo has no vote; the claim path is specified with its limits and the evidence is in `docs/research/` |
| The mechanism deters only low-value fakes | Stated with numbers from `experiments/p06` |
| The page or chain fails in the room | Recorded run; command-line demo |
| Scope creep overnight | The "out" list; cut order applied at each checkpoint |
