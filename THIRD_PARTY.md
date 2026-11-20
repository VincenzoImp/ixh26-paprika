# Third-party software and materials

Official IXH26 rule: *"Non-team-created software or intellectual property can be utilised if you
have a licence (e.g. software libraries or design assets), but they must be mentioned in your
submission."* Track rule (slide 12): *"Anything you find on the Internet, not subject to
copyright limitation for non-profit use."*

Every dependency, library, tool, image, font or code fragment not produced by the team is listed
here when it is introduced, with version, licence and use.

| Component | Version | Licence | Origin (URL) | Where it is used | Notes |
|---|---|---|---|---|---|
| Slides of the IXH26 Track 1 | 2026-11-20 | © De Componendis Cifris (organisation's material) | handed out to the teams on site | `track/original/`, `track/slides/` | Working reference only; not to be redistributed outside the hackathon |
| Post "Apple Reference Image" | 2026-09-15 | © Apple | https://security.apple.com/blog/apple-reference-image | cited in `track/reference/` | Notes and short quotations only |
| Hardhat | 2.29.2 | MIT | https://github.com/NomicFoundation/hardhat | `experiments/p0*` | Local EVM chain, compiler driver, test runner |
| ethers | 6.17.x | MIT | https://github.com/ethers-io/ethers.js | `experiments/p0*` | Contract calls in tests |
| solc | 0.8.28 | GPL-3.0 | https://github.com/ethereum/solidity | downloaded by Hardhat | Compiler |
| Noir (`nargo`) | 1.0.0 | MIT / Apache-2.0 | https://github.com/noir-lang/noir | `experiments/p04-*` | Circuit of the combined design, copied from the sibling repository |
| Barretenberg (`bb`) | 6.0.0 | Apache-2.0 | https://github.com/AztecProtocol/aztec-packages | `experiments/p04-*` | Prover and generated Solidity verifier |
| `noir-lang/sha256` | 0.3.0 | MIT / Apache-2.0 | https://github.com/noir-lang/sha256 | `experiments/p04-*` | SHA-256 inside the circuit |
| UMA contracts (`@uma/contracts-node` or `@uma/core`) | as recorded in `experiments/p02-*/package.json` | AGPL-3.0 | https://github.com/UMAprotocol/protocol | `experiments/p02-*` | Optimistic Oracle V3, local use only |

Licences above are as declared by each project; re-check each one against its repository before
submission (the versions and licences of the UMA packages in particular).

## Work shared with the sibling repository

`track/` is a copy of the same directory in `ixh26-photo-origin` (the ORIGO candidate), produced
by the same team during the hackathon. `experiments/p04-*` reuses the circuit and proving script
of that repository's experiment `e05`.

## Pre-existing work

Rule: *"Any work that was completed prior to the hackathon must be mentioned in your submission."*

- None. Everything here was created on 2026-11-20 after the start of the hackathon (12:00 CET).
