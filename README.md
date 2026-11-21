# Paprika

Paprika is a protocol that records the origin of photos on Ethereum, with no manufacturer and no central authority.
A registered device key signs the SHA-256 of each photo together with a recent block hash.
The account that records the photo locks a refundable deposit on it.
Anyone can accuse a record by locking an equal bond, and UMA's Optimistic Oracle V3 decides by a public vote.
The loser's stake goes to the winner, minus UMA's fee; if nobody accuses the record in time, the deposit goes back.

It answers Track 1 of IXH26 (Bari, 20-21 November 2026): *"Design a secure protocol that generalises to any device
and guarantees authentic photo origin via decentralised blockchains technology."*

## What a record proves

A record proves that a registered key signed this exact file between two known blocks, and that a deposit is at stake.
It does not prove that a camera captured the scene: a key can also sign a generated image ([limits](docs/limits.md)).

## Quick start

Requirements: Node.js 26 or later.

```bash
# contract tests, against UMA's contracts on an in-process chain
cd contract && npm install && npx hardhat test && cd ..

# the demo: local chain, UMA's contracts, Paprika and the web app on http://127.0.0.1:5173/
cd app && npm install && npm start

# the same demo in a terminal, with checks (in a second terminal, while npm start runs)
cd app && npm run demo:cli
```

The demo, step by step, and how the local chain differs from a public network: [docs/demo.md](docs/demo.md).

## Repository map

| Path | Content |
|---|---|
| [`docs/`](docs/) | Protocol, design rationale, limits, demo |
| [`contract/`](contract/) | [`Paprika.sol`](contract/contracts/Paprika.sol), its tests, the local deployment of UMA's contracts, the [case table](contract/output/cases.md) |
| [`app/`](app/) | Device library, chain client, command-line tool and web app for the demo |
| [`slides/`](slides/) | Pitch deck, speaker notes, answers to expected questions |
| [`track/`](track/) | The brief of the track, as given to the teams |
| [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md) | Declaration of the use of AI tools |
| [`THIRD_PARTY.md`](THIRD_PARTY.md) | Third-party software and material, with licences |

## Where to read what

| Question | Document |
|---|---|
| How does the protocol work? Messages, steps, states, cases | [docs/protocol.md](docs/protocol.md) |
| Why does each rule exist? Which attack does it stop? | [docs/design-rationale.md](docs/design-rationale.md) |
| What does Paprika trust, and what can it not do? | [docs/limits.md](docs/limits.md) |
| How do I run and present the demo? | [docs/demo.md](docs/demo.md) |
| What exactly does the contract do? | [contract/contracts/Paprika.sol](contract/contracts/Paprika.sol) |

## Team

Team **Sexy Plushies**: Francesco Lucibello, Vincenzo Imperati, Lorenzo Camilli.
