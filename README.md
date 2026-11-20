# Paprika — bonded photo attestation with open challenge

Working repository for the **second candidate design** for Track 1 ("Advanced cryptography for
blockchain") of [IXH26 — Italian XRPL Hackathon](https://www.decifris.it/ixh26/), Bari,
20–21 November 2026. The first candidate, ORIGO, is in the sibling repository
`ixh26-photo-origin`. The team submits one project: [`docs/COMPARISON.md`](docs/COMPARISON.md)
compares the two and their combination.

> **The challenge.** *"Design a secure protocol that generalises to any device and guarantees
> authentic photo origin via decentralised blockchains technology."* The brief's starting point is
> Apple Reference Image: "concrete and close to a solution — but centralised".

**Status: original proposal reviewed and attacked, hardened design specified and tested,
implementation not started.** See [`docs/STATUS.md`](docs/STATUS.md).

## The idea in four steps

1. **Register.** A device key (P-256) proves possession and its owner locks a stake. Nobody's
   permission is needed.
2. **Record.** The device signs the photo digest together with a recent block hash; any account
   relays it; the contract verifies the signature and stores the record with its time window.
3. **Verify.** Anyone hashes the file and reads the chain: the record, the window, the stake at
   risk, and everything proven about the key since.
4. **Challenge.** Anyone who shows that the key signs outside the capture format takes part of the
   stake, decided by the contract at once. A device maker can endorse keys by locking a bond that
   pays a bounty when one of them is proven misusable. Records are flagged, never erased.

## What a record proves, and what it does not

It proves that the holder of a registered key signed this exact file inside a known block window,
with a public stake behind it. It does **not** prove that the file came from a camera: at
assurance level 0 the guarantee is economic. This and the other limits are in
[`spec/PROTOCOL.md`](spec/PROTOCOL.md) §9 and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Evidence so far

| Experiment | Result |
|---|---|
| [`p01`](experiments/p01-paprika-baseline-attacks/) the original proposal, implemented literally | Ban evasion, attestation of synthetic bytes, front-running, treasury drain by self-reporting, banning over unattested photos all succeed |
| [`p03`](experiments/p03-paprika-v2-hardened/) the hardened contract, revision by revision | The same attacks re-run at each revision, plus a randomised stateful test: most attacks are stopped or priced; the ones that remain are listed there |
| [`p08`](experiments/p08-redteam-v2_3/) independent review with exploits | Twelve running proofs of concept against revision v2.3; one objective rule was broken and withdrawn |
| [`p00`](experiments/p00-p256-precompile-local/), [`p05`](experiments/p05-chain-options/) P-256 on-chain | The precompile answers on the local chain and on 12 public networks, XRPL EVM included; cost per attestation per network |
| [`p02`](experiments/p02-uma-oov3-feasibility/) UMA Optimistic Oracle V3 | The full claim, dispute and settle cycle runs against UMA's deployed code on a local fork |
| [`p06`](experiments/p06-economic-model/) incentive model | Closed-form thresholds and simulation: where the stake deters and where it does not |
| [`p04`](experiments/p04-combined-critical-path/) combination with ORIGO | Zero-knowledge attestation under bonded issuers, with revocation only by proof of key misuse, runs on a local chain |

## Map

| Path | Content |
|---|---|
| [`proposal/`](proposal/) | The original proposal, as received |
| [`track/`](track/) | The brief: PDF, slide images, transcription, requirements, notes on the Apple reference |
| [`spec/PROTOCOL.md`](spec/PROTOCOL.md) | The protocol |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Each change from the original proposal, with options and evidence |
| [`docs/COMPARISON.md`](docs/COMPARISON.md) | Paprika, ORIGO and their combination against the brief |
| [`docs/PLAN.md`](docs/PLAN.md) · [`docs/STATUS.md`](docs/STATUS.md) | Plan to the deadline with the backlog, and current state |
| [`docs/reviews/`](docs/reviews/) | Independent reviews of both candidates |
| [`docs/research/`](docs/research/) | Claims ledger and literature reports |
| [`experiments/`](experiments/) | Reproducible spikes with raw output |
| [`impl/mock/`](impl/mock/) · [`slides/draft/`](slides/draft/) | Clickable demo mock with screenshots; first draft of the deck |
| [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md) · [`THIRD_PARTY.md`](THIRD_PARTY.md) | Declarations required by the rules |

Working rules are in [`AGENTS.md`](AGENTS.md). The demo chain is a local Ethereum EVM (Hardhat).
Only local chains and read-only calls to public networks have been used. No keys of funded wallets are in the repository.
