# Paprika

Un protocollo per attestare l'origine delle foto su una blockchain, **senza produttori di
dispositivi e senza autorità centrali**. Proposta per la Track 1 di
[IXH26 — Italian XRPL Hackathon](https://www.decifris.it/ixh26/), Bari, 20–21 novembre 2026.

> **La traccia.** *"Design a secure protocol that generalises to any device and guarantees
> authentic photo origin via decentralised blockchains technology."*

## L'idea in tre righe

1. Chi vuole attestare foto **registra il dispositivo**, gratis.
2. Ogni foto viene **firmata dal dispositivo** e registrata sulla blockchain con un **deposito**,
   che torna indietro se nessuno la contesta entro un certo tempo.
3. Chiunque può **accusare** una foto mettendo una cauzione uguale. Decide **UMA**. Se il falso è
   dimostrato, chi accusa prende il deposito e il dispositivo è segnalato; altrimenti chi accusa
   perde la cauzione.

Nessuno amministra il contratto, nessuno decide chi può partecipare, nessun record viene mai
cancellato. Depositi, cauzioni e tempi non sono fissati nel codice: si scelgono quando il
contratto viene pubblicato.

## Che cosa garantisce, e che cosa no

Un record dimostra che un dispositivo registrato ha firmato **questo esatto file**, in **questo
intervallo di tempo**, e che chi l'ha attestato ha messo **dei soldi in gioco**.

Non dimostra che il file viene da una fotocamera vera. È il prezzo di non dipendere dai
produttori, ed è spiegato per intero in [`docs/3-limiti-e-dipendenze.md`](docs/3-limiti-e-dipendenze.md).

## Da dove cominciare

| Voglio… | Leggo |
|---|---|
| Capire come funziona, con gli schemi e tutti i casi | [`docs/1-come-funziona.md`](docs/1-come-funziona.md) |
| Sapere che cosa è cambiato rispetto alla prima versione, e perché | [`docs/2-cosa-e-cambiato.md`](docs/2-cosa-e-cambiato.md) |
| Sapere che cosa non fa, da chi dipende, e il confronto con ORIGO sui produttori | [`docs/3-limiti-e-dipendenze.md`](docs/3-limiti-e-dipendenze.md) |
| Rileggere la prima versione | [`proposal/PAPRIKA.md`](proposal/PAPRIKA.md) |

## Che cosa c'è nel repository

| Cartella | Contenuto |
|---|---|
| [`docs/`](docs/) | I tre documenti qui sopra, più gli [approfondimenti](docs/approfondimenti/) con le fonti |
| [`proposal/`](proposal/) | La prima versione di Paprika, così com'è arrivata |
| [`contract/`](contract/) | Il contratto (`Paprika.sol`), i suoi test e l'output dell'esecuzione |
| [`prove/`](prove/) | La prima versione scritta alla lettera e attaccata: la prova di che cosa non andava |
| [`impl/mock/`](impl/mock/) | Il mock della demo, con gli screenshot |
| [`slides/`](slides/) | La bozza del deck |
| [`track/`](track/) | La traccia: PDF, slide, trascrizione |

## Stato

- **Fatto:** protocollo definito; documenti; mock dell'app e bozza delle slide.
- **In corso:** contratto nella forma definitiva e prova con i contratti veri di UMA in locale.
- **Da fare per la demo:** vedi le [issue](https://github.com/VincenzoImp/ixh26-paprika/issues),
  in ordine di dipendenza.
- **Dove gira:** tutto su una blockchain Ethereum locale. Simulati: la chiave del dispositivo
  (creata dal programma) e il voto di UMA (l'esito lo inseriamo noi).

## Eseguire i test del contratto

```
cd contract
npm install
npx hardhat test
```

## Note

- Tutte le versioni intermedie del lavoro restano nella cronologia git, sotto l'etichetta
  `iterazioni-complete`.
- L'uso di strumenti di intelligenza artificiale è dichiarato in
  [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md); il materiale di terzi in
  [`THIRD_PARTY.md`](THIRD_PARTY.md).
- L'altra proposta del team per la stessa traccia, ORIGO, è nel repository `ixh26-photo-origin`.
