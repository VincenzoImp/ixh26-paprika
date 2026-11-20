# Paprika

A protocol to attest (that is, to certify in public) where photos come from, on a blockchain, **with no device makers and no
central authorities**. A proposal for Track 1 of
[IXH26 — Italian XRPL Hackathon](https://www.decifris.it/ixh26/), Bari, 20–21 November 2026.

> **The track.** *"Design a secure protocol that generalises to any device and guarantees
> authentic photo origin via decentralised blockchains technology."*

## The idea in three lines

1. Whoever wants to attest photos **registers the device**, for free.
2. Each photo is **signed by the device** and recorded on the blockchain with a **deposit**.
   The deposit comes back if nobody challenges the photo within a set time.
3. Anyone can **accuse** a photo by putting up an equal bond. **UMA** decides. If the fake is
   proven, the accuser takes the deposit and the device is flagged; otherwise the accuser
   loses the bond.

Nobody runs the contract, nobody decides who can take part, no record is ever deleted.
Deposits, bonds and times are not fixed in the code: they are chosen when the contract is
published.

## What it guarantees, and what it does not

A record proves that a registered device signed **this exact file**, in **this time window**,
and that whoever attested it put **money at stake**.

It does not prove that the file comes from a real camera. This is the price of not depending
on device makers, and it is explained in full in [`docs/3-limits-and-dependencies.md`](docs/3-limits-and-dependencies.md).

## Where to start

| I want to… | I read |
|---|---|
| Understand how it works, with the diagrams and all the cases | [`docs/1-how-it-works.md`](docs/1-how-it-works.md) |
| Know what changed compared to the first version, and why | [`docs/2-what-changed.md`](docs/2-what-changed.md) |
| Know what it does not do, who it depends on, and the comparison with ORIGO on device makers | [`docs/3-limits-and-dependencies.md`](docs/3-limits-and-dependencies.md) |
| Read the first version again | [`proposal/PAPRIKA.md`](proposal/PAPRIKA.md) |

## What is in the repository

| Folder | Content |
|---|---|
| [`docs/`](docs/) | The three documents above, plus the [background](docs/background/) material with the sources |
| [`proposal/`](proposal/) | The first version of Paprika, as it reached us |
| [`contract/`](contract/) | The contract (`Paprika.sol`), its tests and the output of the run |
| [`evidence/`](evidence/) | The first version written word for word and attacked: the proof of what was wrong |
| [`impl/mock/`](impl/mock/) | The mock of the demo, with the screenshots |
| [`slides/`](slides/) | The draft of the deck |
| [`track/`](track/) | The track: PDF, slides, transcript |

## Status

- **Done:** protocol defined; documents; mock of the app and draft of the slides.
- **In progress:** contract in its final form, and a test with the real UMA contracts on a
  local machine.
- **To do for the demo:** see the [issues](https://github.com/VincenzoImp/ixh26-paprika/issues),
  in order of dependency.
- **Where it runs:** everything on a local Ethereum blockchain. Simulated: the device key
  (created by the program) and the UMA vote (we enter the result ourselves).

## Running the contract tests

```
cd contract
npm install
npx hardhat test
```

## Notes

- All the intermediate versions of the work stay in the git history, under the tag
  `iterazioni-complete`.
- The use of artificial intelligence tools is declared in
  [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md); third-party material in
  [`THIRD_PARTY.md`](THIRD_PARTY.md).
- The team's other proposal for the same track, ORIGO, is in the `ixh26-photo-origin` repository.
