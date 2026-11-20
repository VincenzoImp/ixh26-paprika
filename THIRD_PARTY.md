# Software e materiali di terzi

Regola ufficiale di IXH26: *"Non-team-created software or intellectual property can be utilised if
you have a licence (e.g. software libraries or design assets), but they must be mentioned in your
submission."*

| Componente | Versione | Licenza | Origine | Dove è usato |
|---|---|---|---|---|
| Slide della Track 1 di IXH26 | 20 novembre 2026 | © De Componendis Cifris | consegnate ai team | `track/` (solo come riferimento di lavoro) |
| Hardhat | 2.29.2 | MIT | https://github.com/NomicFoundation/hardhat | `contract/`, `prove/originale-attaccato/` |
| ethers | 6.17.x | MIT | https://github.com/ethers-io/ethers.js | test in `contract/` e `prove/originale-attaccato/` |
| solc | 0.8.28 | GPL-3.0 | https://github.com/ethereum/solidity | compilatore, scaricato da Hardhat |

L'interfaccia dell'arbitro simulato ricalca quella dell'Optimistic Oracle V3 di UMA
(https://github.com/UMAprotocol/protocol, AGPL-3.0); nessun codice di UMA è incluso.

Le licenze sono quelle dichiarate dai progetti: vanno ricontrollate prima della consegna.

## Lavoro precedente all'hackathon

Nessuno. Tutto è stato creato il 20 novembre 2026, dopo l'inizio dell'hackathon (12:00 CET).

## Lavoro condiviso con l'altro repository del team

La cartella `track/` è una copia di quella del repository `ixh26-photo-origin` (ORIGO).
