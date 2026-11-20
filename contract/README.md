# Il contratto di Paprika

Qui c'è il contratto finale e tutto ciò che serve per provarlo. Il codice e i test sono in
inglese; questa pagina spiega che cosa c'è e come si usa.

| File | Che cos'è |
|---|---|
| [`contracts/Paprika.sol`](contracts/Paprika.sol) | Il contratto: registrazione, attestazione, verifica, i due modi di contestare, ritiro del deposito. Nessun proprietario, nessun amministratore |
| [`contracts/MockArbiter.sol`](contracts/MockArbiter.sol) | L'arbitro simulato usato nei test e nella demo: decide chi lo chiama, per poter mostrare entrambi gli esiti. Ha la stessa interfaccia dell'oracolo di UMA |
| [`test/paprika.test.js`](test/paprika.test.js) | I casi d'uso e gli attacchi, uno per test |
| [`test/paprika.fuzz.js`](test/paprika.fuzz.js) | Un test casuale: migliaia di azioni a caso, controllando a ogni passo che i conti tornino |
| [`output/cases.md`](output/cases.md) | La tabella di tutti i casi con i numeri misurati (in inglese) |
| [`output/2026-11-20-run.txt`](output/2026-11-20-run.txt) | L'output grezzo dell'ultima esecuzione |

## Come si esegue

```
npm install
npx hardhat test
```

Servono Node.js e una connessione per scaricare il compilatore la prima volta. L'esecuzione
completa dura circa 6 minuti, quasi tutti per il test casuale.

## Che cosa dimostrano i test

- **Il percorso normale funziona:** registrazione, attestazione, verifica, contestazione nei due
  esiti, ritiro.
- **Gli attacchi alla prima versione non riescono più**, oppure hanno un costo: rientrare dopo
  una segnalazione, copiare la richiesta di un altro, accusarsi da soli per incassare, far
  segnalare un dispositivo per una foto mai attestata, cancellare i record passati.
- **I conti tornano sempre:** dopo ogni test, e dopo ognuna delle 25 000 azioni casuali, il denaro
  nel contratto è uguale alla somma di depositi, cauzioni e crediti; nessun record cambia o
  sparisce; un dispositivo segnalato non attesta più.

## Che cosa i test non dimostrano

- Che l'arbitro decida bene: nei test l'esito lo scegliamo noi.
- Che il contratto funzioni così com'è con UMA vero: UMA vuole le cauzioni in un token, qui sono
  in ETH. Collegarlo richiede un adattamento.
- Che una firma venga da una fotocamera: nei test le chiavi sono create dal programma.

## Due dettagli tecnici

- Le firme dei dispositivi usano la curva P-256, quella dei telefoni. Il contratto le controlla
  con una funzione che la blockchain mette a disposizione; in locale va attivata impostando
  Hardhat su `hardfork: "osaka"` (già fatto in `hardhat.config.js`).
- Il contratto non si può aggiornare né amministrare: per cambiarlo se ne pubblica uno nuovo.
