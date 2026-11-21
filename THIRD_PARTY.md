# Third-party software and material

IXH26 rule: *"Non-team-created software or intellectual property can be utilised if you have a licence (e.g. software
libraries or design assets), but they must be mentioned in your submission."*

## Software

| Component | Version | Licence | Source | Where it is used |
|---|---|---|---|---|
| Hardhat | 2.29.2 | MIT | https://github.com/NomicFoundation/hardhat | `contract/`: compiler driver, local chain, test runner |
| `@nomicfoundation/hardhat-ethers` | 3.1.3 | MIT | https://github.com/NomicFoundation/hardhat | `contract/`: ethers inside Hardhat |
| ethers | 6.17.0 | MIT | https://github.com/ethers-io/ethers.js | `contract/` tests and scripts; `app/` chain client and web app |
| solc (Solidity compiler) | 0.8.28 | GPL-3.0 | https://github.com/ethereum/solidity | Compiles `Paprika.sol`. Hardhat downloads it |
| `@uma/contracts-node` | 0.4.28 | AGPL-3.0-or-later | https://github.com/UMAprotocol/protocol | `contract/lib/deploy-uma-dvm.js`, `contract/lib/vote.js`: UMA's compiled contracts (OptimisticOracleV3, Finder, Store, AddressWhitelist, IdentifierWhitelist, Registry, VotingV2, VotingToken, FixedSlashSlashingLibrary, and UMA's copy of WETH9 as the bond currency), deployed unchanged on the local chain. UMA compiled them with solc 0.8.16. No UMA source is copied into this repository |
| Playwright | 1.65.1 | Apache-2.0 | https://github.com/microsoft/playwright | `app/e2e/`: browser tests and screenshots (dev dependency; drives Chromium) |
| Node.js | 26 or later | MIT | https://nodejs.org | Runtime for the tests, the scripts and the app |

The interfaces `IOptimisticOracleV3` and `IOptimisticOracleV3CallbackRecipient` in `Paprika.sol` repeat the function
signatures of UMA's Optimistic Oracle V3, so that the contract can call it.

Versions are those installed from the lock files. Licences are those declared in each package.

## Material

| Material | Owner | Where it is used |
|---|---|---|
| IXH26 Track 1 slides (the brief) | De Componendis Cifris | Cited as the brief, with the event page https://www.decifris.it/ixh26/. Not copied into this repository |

## What is original

The Paprika protocol, the `Paprika.sol` contract, the chain library, the command-line tool, the web app, the tests,
the documents and the slides were written by the team during the hackathon. UMA's contracts and WETH are used
unchanged, as building blocks, exactly as a real deployment would use them.

## Work done before the hackathon

None. All work in this repository was created during the hackathon.
