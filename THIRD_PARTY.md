# Third-party software and material

Official IXH26 rule: *"Non-team-created software or intellectual property can be utilised if
you have a licence (e.g. software libraries or design assets), but they must be mentioned in your
submission."*

| Component | Version | Licence | Source | Where it is used |
|---|---|---|---|---|
| IXH26 Track 1 slides | 20 November 2026 | © De Componendis Cifris | given to the teams | `track/` (only as a working reference) |
| Hardhat | 2.29.2 | MIT | https://github.com/NomicFoundation/hardhat | `contract/`, `evidence/original-under-attack/` |
| ethers | 6.17.x | MIT | https://github.com/ethers-io/ethers.js | tests in `contract/` and `evidence/original-under-attack/` |
| solc | 0.8.28 | GPL-3.0 | https://github.com/ethereum/solidity | compiler, downloaded by Hardhat |

The interface of the simulated arbiter copies that of UMA's Optimistic Oracle V3
(https://github.com/UMAprotocol/protocol, AGPL-3.0); no UMA code is included.

The licences are the ones declared by the projects: they must be checked again before submission.

## Work done before the hackathon

None. Everything was created on 20 November 2026, after the start of the hackathon (12:00 CET).

## Work shared with the team's other repository

The `track/` folder is a copy of the one in the `ixh26-photo-origin` repository (ORIGO).
