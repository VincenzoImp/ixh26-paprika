# Dichiarazione sull'uso dell'intelligenza artificiale

Le regole della Track 1 (slide 13) permettono qualunque strumento di AI, a patto di dichiarare
**quale strumento è stato usato, come e dove**. Questa è la dichiarazione per questo repository.

## In sintesi

| Ambito | Strumento | Come | Dove | Ruolo delle persone |
|---|---|---|---|---|
| Idea del protocollo | Nessuno | La prima versione di Paprika è del team | `proposal/PAPRIKA.md` | Ideazione |
| Revisione e modifiche al protocollo | Claude Code (modello Claude Fable 5.2) con sotto-agenti Claude (modello Claude Opus) | Ha scritto la prima versione come contratto e l'ha attaccata; ha proposto ogni modifica della versione finale; ha fatto rivedere il risultato da sotto-agenti che non conoscevano le conclusioni | `docs/`, `prove/` | Direzione e vincoli del team: nessuna dipendenza dai produttori, demo su blockchain locale, documenti in italiano semplice. Approvazione finale del team: da completare |
| Codice | Claude Code con sotto-agenti Claude Opus | Ha scritto il contratto, i test e il modello economico, e li ha eseguiti | `contract/`, `prove/` | Nessuna revisione riga per riga finora |
| Documentazione | Claude Code (Claude Fable 5.2) | Ha scritto i documenti e la pagina iniziale | `README.md`, `docs/` | Richiesta e indicazioni del team; rilettura: da completare |
| Ricerca | Sotto-agenti Claude Opus | Ricerca sul web con fonti indicate; un campione ricontrollato da Claude Code | `docs/approfondimenti/` | Nessuna |
| Preparazione del pitch | Sotto-agenti Claude Opus | Bozza del deck con note, mock della demo | `slides/`, `impl/mock/` | Non ancora rivisti |

## Registro

| Data e ora (CET) | Strumento | Che cosa ha fatto | Intervento umano |
|---|---|---|---|
| 20 novembre 2026, 21:18–22:10 | Claude Code (Claude Fable 5.2) e sotto-agenti Claude Opus | Revisione critica della prima versione; contratto scritto alla lettera e attaccato; ricerca su arbitri decentralizzati, incentivi, rilevazione dei falsi; prima versione rinforzata | Richiesta di Vincenzo Imperati: validare la proposta, trovarne le falle, proporre miglioramenti |
| 20 novembre 2026, 22:10–23:05 | Gli stessi | Più revisioni del contratto, ciascuna attaccata e corretta; modello economico; revisione indipendente con attacchi eseguibili; giurie simulate; mock e bozza del deck | Indicazione di Vincenzo Imperati: la demo gira su una blockchain Ethereum locale |
| 20 novembre 2026, 23:05–23:59 | Gli stessi | Versione finale senza produttori; repository ripulito dalle versioni intermedie; documenti riscritti in italiano semplice | Indicazione del team: Paprika non deve dipendere dai produttori; una sola versione finale, spiegata in modo comprensibile e confrontabile con la prima |

Le versioni intermedie e i rapporti completi dei sotto-agenti sono nella cronologia git, sotto
l'etichetta `iterazioni-complete`.
