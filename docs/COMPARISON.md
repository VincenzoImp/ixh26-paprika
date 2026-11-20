# Paprika, ORIGO and their combination against the brief

**Status: assessment of 2026-11-20, for the team's choice.** The team submits one project. The
same assessment, with more context, is in Italian in [`../RISCONTRO.md`](../RISCONTRO.md).

## The three candidates, each in its best current form

| | What it is | Where |
|---|---|---|
| **P** — Paprika v2 | Keys registered with a slashable stake; P-256 signature verified by the contract; an objective proof of key misuse; committed claims decided by an optimistic oracle; issuers with a bond for assurance level 1 | This repository |
| **O** — ORIGO | Zero-knowledge proof that a manufacturer-enrolled P-256 key signed the image digest, verified on-chain; registry changed by 2 of 3 registrars. Judged with the small fixes of its review applied (time-scoped revocation, contract hygiene, corrected privacy claims) | Sibling repository; review in `reviews/origo-independent-review.md` |
| **C** — the combination | ORIGO's attestation under issuers admitted by a bond instead of a committee; device revocation only by a proof of key misuse, paid from the issuer's bond | `experiments/p04-combined-critical-path/` |

## What each guarantees to a verifier

| | Guarantee | Rests on |
|---|---|---|
| P | The holder of a staked, registered key signed this exact file between two blocks; everything proven or decided about the key since is readable | At level 0 the stake only: economic, not physical origin. At level 1 the issuer, and the verifier's reason to trust it |
| O | A hidden key under the batch root of a manufacturer admitted by 2 of 3 registrars signed this file between two blocks and was not revoked then | The manufacturer's honesty and hardware; the registrars' quorum |
| C | As O, with the root belonging to a bonded address that the verifier decides whether to trust | Equal to O with a good list of trusted issuers; no better than P without one |

## Against the brief

| Requirement | P | O | C |
|---|---|---|---|
| "Design a secure protocol" (slide 11) | Met: specification with claim, messages, incentive conditions, limits | Partly: decision records and circuit; specification to be written | Partly: the spike's README |
| "generalises to any device" | Met in breadth; at level 0 every device gets the same weak guarantee | Partly: any key in secure hardware enrolled by an admitted manufacturer | Partly to met: any device under any bonded issuer |
| "guarantees authentic photo origin"; "cryptographic guarantees of physical origin" (slide 2) | Not at level 0. At level 1 as C, without privacy | Partly: cryptographic from the manufacturer's hardware key to the file | Partly: as O given a trust list |
| "via decentralised blockchains technology" | Met: the contract is the whole system, no administrator | Met: the contract verifies the proof | Met |
| Advanced cryptography (slide 12; event page: "zero-knowledge proofs, digital signatures, or other privacy-enhancing technologies") | Partly: signatures, commitments, block-hash time bounds; the novelty is in the mechanism | Met: zero-knowledge proof of a P-256 signature with Merkle membership and a revocation tag | Met: the same proof plus the objective misuse proof |
| Cost per photo (`experiments/p05`) | 64–86k gas: about 0.00006 USD on XRPL EVM, 0.23 USD on Ethereum | About 4.1M gas: 0.003 USD on XRPL EVM, 10.7 USD on Ethereum | As O |

### The three weaknesses on slide 10

| Weakness | P | O | C |
|---|---|---|---|
| Single point of failure | No certificate authority; at level 0 because nothing certifies devices. Objective proofs are decided by the contract. Claims by vote depend on an external oracle | Moved and reduced: each manufacturer plus a 2-of-3 quorum | Removed on-chain for device revocation; trust in issuers moves to lists chosen by verifiers |
| Cross-platform lock-in | Removed | Removed for verification; admission is at the registrars' discretion | Removed for verification and admission |
| Retroactive censorship | Records are never erased. Residual: whoever steals a key can make its whole archive distrusted | Removed once revocation is time-scoped; revocation remains a quorum's act | Cleanest: per key, time-scoped, and impossible without a signature by that key |

## Simulated judging panels

Two independent seats, 1–10 on the three criteria of slide 14 (Effectiveness / Crypto vision /
Pitch), mean in brackets. These are model-played judges with an uncertainty of about one point per
entry: they order the candidates, they do not measure them. Full reports:
`reviews/track-fit-panel-round2-seat-a.md`, `reviews/track-fit-panel-round2-seat-b.md`.

| | Seat A, design at its best | Seat B, design at its best | Seat A, by 08:00 | Seat B, by 08:00 |
|---|---|---|---|---|
| P (v2.3, level 0 only) | 5 / 4.5 / 5 (4.8) | 5 / 5 / 5 (5.0) | (5.0) | (5.2) |
| O | 6 / 7 / 7 (6.7) | 6 / 7 / 7 (6.7) | (6.2) | (6.2) |
| C | 6 / 6.5 / 6 (6.2) | 6 / 7 / 6 (6.3) | (5.3) | (5.8) |

The first round, on the original proposal, gave 9 of 30 to Paprika and 22 to ORIGO
(`reviews/track-fit-panel.md`).

Both seats give the same reasons. P's gap is structural: the brief asks for cryptographic
guarantees of physical origin and P's specification states that level 0 gives none. C passes O
once it has a verifier-side list of trusted issuers and the self-revocation drain is closed. P
gains if level 1 is built (revision v2.4 does that; the panels scored v2.3).

## Recommendation

**Submit ORIGO's attestation core with Paprika's open admission and proof-based revocation.**

1. It is the only option that answers both "cryptographic guarantees of physical origin", which
   Paprika alone does not, and "decentralised" without a committee, which ORIGO alone does not.
2. It removes ORIGO's hardest question (who the three registrars are) and the finding that
   revocation by quorum is a form of censorship.
3. It replaces the multi-signature logic instead of adding to it, and its contract already runs
   (`experiments/p04`).
4. Its two declared flaws have known fixes: a list of trusted issuers chosen by the verifier, and
   an owner stake with an issuer bounty smaller than the burned part of that stake
   (`spec/PROTOCOL.md` §8, item 5).

What stays of Paprika in that project: bonded open admission, revocation by proof, the owner's
stake, "flag, never erase", the incentive model with its numbers, and, time permitting, level 0 as
a public low-cost mode.

**Not recommended:** Paprika alone. In its best form it still has to say on its first slide that
a level-0 record does not prove physical origin, and its most characteristic path, a claim decided
by vote, kept opening gaps through five tested revisions while the proof of key misuse held from
the first.

**Cautious alternative:** ORIGO with its review's fixes only.

## What would change this

- Mentors stating that privacy and zero-knowledge proofs carry no weight in Track 1, and that cost
  per photo and openness do: Paprika v2 with level 1 would then be the leaner answer.
- ORIGO's proving path failing on the presentation machine: Paprika's direct signature is the
  fallback that still verifies on-chain.
- No time for anything but one demo by 03:00: Paprika's is the surest to finish.
