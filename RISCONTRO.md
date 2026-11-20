# Riscontro: Paprika, ORIGO e la loro combinazione

*Documento per il team, in italiano. Scritto il 20 novembre 2026. Tutto il resto del repository è
in inglese, come nel repository di ORIGO.*

## In breve

**C'è speranza per l'idea Paprika?** Sì per una sua parte, no per l'idea così com'era scritta.

- **Com'era scritta non regge.** Una chiave registrata gratis attesta qualunque byte, il ban si
  elude con una chiave nuova, chi attesta può auto-denunciarsi e svuotare il tesoro, e la domanda
  "la foto è falsa?" è proprio quella che la traccia dichiara indecidibile. Tutto riprodotto con
  test eseguibili (§2).
- **Rinforzata, una parte regge davvero.** Dopo cinque revisioni, ciascuna attaccata, e una
  revisione indipendente con exploit eseguibili, restano solidi: i record firmati dal dispositivo
  con finestra temporale e deposito; la **prova di uso improprio della chiave**, decisa dal
  contratto senza alcun voto; gli emittenti con cauzione al posto di un comitato; il principio che
  i record si annotano e non si cancellano (§3).
- **Ciò che non regge è il cuore dell'idea originale:** l'accusa decisa da un voto. Ogni
  correzione ha aperto un varco nuovo, e anche una seconda prova oggettiva che avevo aggiunto è
  stata rotta e ritirata.
- **Da solo, Paprika resta dietro a ORIGO rispetto alla traccia.** Due giurie simulate
  indipendenti danno circa 5 su 10 a Paprika, 6,7 a ORIGO e 6,2–6,3 alla combinazione. Il motivo è
  strutturale: la traccia chiede garanzie crittografiche di origine fisica, e Paprika al livello
  base dà una garanzia economica che scoraggia solo falsi da pochi dollari a poche decine (§5).
- **Le due proposte sono complementari.** Ciò che di Paprika regge è ciò che manca a ORIGO:
  ammissione aperta e revoca senza comitato. La combinazione gira già in uno spike con prove ZK
  reali (§6).

**Raccomandazione:** presentare il nucleo di ORIGO (attestazione a conoscenza zero) con lo strato
di ammissione e revoca di Paprika, su una EVM locale. Ripiego prudente: ORIGO con le sole
correzioni della sua revisione. Non consiglio Paprika da solo (§7).

**Che cosa ti chiedo di decidere:** quale dei tre si costruisce e in quale repository (§7). Con il
via entro le 23:00 circa il piano arriva alle 08:00 senza margine: i tagli vanno applicati presto
(§8).

**Stato del repository `crypto2`:** ha le stesse parti di quello di ORIGO (specifica, decisioni,
nove esperimenti con output grezzo, tre revisioni indipendenti e tre rapporti di giuria, cinque
rapporti di letteratura, mock con screenshot, bozza del deck, piano con milestone). È solo locale e senza
commit: non ho creato repository remoti né fatto commit, in attesa di una tua indicazione.

---

## 1. Come è stato fatto questo lavoro

L'obiettivo era dare a Paprika lo stesso trattamento che ORIGO ha avuto nell'altro repository, e
poi confrontarli alla pari. In pratica:

| Passo | Cosa | Dove |
|---|---|---|
| Revisione avversaria della proposta originale | 19 rilievi con sequenza d'attacco, 17 lacune di specifica | `docs/reviews/paprika-redteam.md` |
| Proposta implementata alla lettera e attaccata | 24 test, ogni attacco con numeri | `experiments/p01-paprika-baseline-attacks/` |
| Stato dell'arte | Cinque rapporti con fonti marcate: UMA e alternative, identità dei dispositivi, mechanism design, crittografia, rilevazione dei falsi | `docs/research/` |
| Design rinforzato, in più revisioni | Ogni revisione implementata, riattaccata e corretta sui difetti trovati | `spec/PROTOCOL.md`, `experiments/p03-paprika-v2-hardened/` |
| Revisione indipendente del contratto rinforzato | 8 rilievi, 12 exploit eseguibili | `docs/reviews/paprika-v2_3-redteam.md`, `experiments/p08-redteam-v2_3/` |
| Percorsi critici | P-256 on-chain, UMA reale su fork locale, 12 reti pubbliche in sola lettura, modello economico | `experiments/p00`, `p02`, `p05`, `p06` |
| Revisione indipendente di ORIGO | 15 rilievi, prova riprodotta su questa macchina | `docs/reviews/origo-independent-review.md` |
| Giuria simulata | Rubrica ricavata dalle slide, punteggi e domande difficili; un primo giro sulla proposta originale e un secondo, con due seggi indipendenti, sulle versioni migliori | `docs/reviews/track-fit-panel.md`, `docs/reviews/track-fit-panel-round2-seat-a.md`, `…-seat-b.md` |
| Combinazione delle due idee | Spike con prove ZK reali | `experiments/p04-combined-critical-path/` |
| Materiale di presentazione | Mock cliccabile con screenshot, bozza del deck a 7 slide | `impl/mock/`, `slides/draft/` |

**Cosa ho verificato io e cosa no.** Il lavoro è stato svolto da subagenti (modello Opus) che ho
diretto. Ho ricontrollato di persona: gli output grezzi degli esperimenti (numero di test superati
e righe dei risultati), le citazioni decisive aprendo le fonti (regola UMIP-170 di UMA, tempi e
finestra di UMA, documentazione Google su Pixel e sulle chiavi Android, esistenza dei due lavori
accademici principali) e uno screenshot del mock. Il resto dei rapporti di ricerca è lavoro dei
subagenti, con le fonti indicate ma non riaperte da me: vale come pista, non come fatto, finché non
viene ricontrollato. Il registro `docs/research/claims-ledger.md` dice, affermazione per
affermazione, a quale delle due categorie appartiene.

---

## 2. Paprika com'è scritto

### 2.1 Che cosa dimostra davvero un'attestazione

Nella lettura più favorevole: *chi possiede una certa chiave ha inviato un certo hash prima di un
certo blocco, e in quel momento la chiave non era bannata*. Niente lega la chiave a un sensore. La
traccia chiede "cryptographic guarantees of physical origin" (slide 2): la proposta originale non
ne dà.

### 2.2 Le falle, con il test che le riproduce

Tutte riprodotte sul contratto scritto alla lettera (`experiments/p01-…`, 24 test superati).

| # | Falla | Che cosa succede | Gravità |
|---|---|---|---|
| 1 | Nessun legame con una fotocamera | Una chiave software registrata attesta byte casuali etichettati "immagine AI"; la verifica risponde vero | Critica |
| 2 | Ban gratuito da eludere | Dopo il ban basta una chiave nuova: circa 49 mila gas, nessun deposito | Critica |
| 3 | Domanda indecidibile | "La foto è falsa?" è il caso che la slide 2 definisce indistinguibile. Le regole di UMA dicono di rispondere 0 quando l'affermazione non è verificabile pubblicamente | Critica |
| 4 | Ricompensa pagata dal tesoro | Chi controlla dispositivo e accusatore attesta, si auto-denuncia e incassa: +0,785 ETH su 1 ETH di tesoro (tariffa 0,001, costo oracolo 0,01, ricompensa 0,05) | Critica |
| 5 | La chiave registrata non firma nulla | Un osservatore copia la transazione in attesa e risulta lui l'origine; quella onesta fallisce | Alta |
| 6 | Accusa non legata a un record | Un dispositivo viene bannato per una foto che non ha mai attestato | Alta |
| 7 | Effetto del ban non definito | Se il ban invalida il passato, un solo verdetto sbagliato cancella 100 foto oneste su 100; se non lo invalida, la foto giudicata falsa resta valida | Alta |
| 8 | Accuse false a costo quasi nullo per la vittima | Con un oracolo ottimistico un'accusa che nessuno contesta passa come vera | Alta |
| 9 | Registrazione della chiave altrui | Chiunque registra la chiave pubblica di un altro e la fa bannare per sempre | Alta |
| 10 | Privacy | Ogni foto è pubblicamente collegata al dispositivo e al conto che lo finanzia | Alta |
| 11 | Solo limite superiore sul tempo | Il record dice "esisteva prima del blocco B", non "dopo" | Media |

### 2.3 Le tre debolezze della slide 10, lette alla lettera

| Debolezza | Paprika originale |
|---|---|
| Single point of failure ("Apple maintains central revocation lists. A compromised CA invalidates millions of devices.") | La CA sparisce solo perché nessuno certifica più i dispositivi. La revoca si sposta sul voto dell'oracolo e su eventuali chiavi di amministrazione, non specificate |
| Cross-platform lock-in | Rimossa davvero: chiunque registra, verifica, contesta |
| Retroactive censorship | Rimossa per lo spegnimento dei server; reintrodotta se un ban invalida le foto passate |

### 2.4 Che cosa c'è di buono

Tre cose, che tutte le revisioni hanno riconosciuto e che conviene non perdere:

1. **Apertura senza comitato di accreditamento.** Un design basato sui produttori ha sempre bisogno
   di qualcuno che decida quali produttori contano. Paprika no.
2. **Storia pubblica e non cancellabile**, verificabile con i soli dati della chain.
3. **Revoca decentralizzata e incentivata.** L'idea che chiunque possa contestare e venga pagato
   per farlo è un sostituto credibile del servizio di revoca privato di Apple, a condizione che la
   contestazione poggi su prove verificabili e non su un giudizio.


---

## 3. Paprika v2: la versione rinforzata

### 3.1 Che cosa è cambiato rispetto all'originale

Specifica in `spec/PROTOCOL.md`; motivo di ogni scelta in `docs/DECISIONS.md`.

| Originale | Paprika v2 |
|---|---|
| Si registra una chiave pubblica, gratis | La chiave dimostra il possesso e il proprietario blocca un **deposito** (0,25 ETH nel prototipo); una chiave si registra una volta sola |
| Il dispositivo "invia SHA(foto)" | Il dispositivo **firma** (P-256) l'hash della foto insieme a un hash di blocco recente; il contratto verifica la firma; chiunque può fare da relayer, quindi il dispositivo non ha bisogno di ETH |
| Solo "esisteva prima del blocco B" | Finestra temporale: firmato dopo il blocco di ancoraggio e prima del blocco di registrazione |
| Tariffa a un tesoro, ricompensa in ETH | **Nessun tesoro.** La ricompensa è una quota del deposito tagliato (50%), il resto viene bruciato |
| UMA risponde a "la foto è falsa?" | Due contestazioni distinte, una oggettiva e una con voto (§3.2) |
| Effetto del ban non definito | Una **segnalazione** con blocco e motivo: la chiave non attesta più, i record passati restano leggibili, chi verifica applica la propria politica. Nulla viene cancellato, da nessuno |
| Governance non definita | Contratto senza proprietario, senza amministratore, non aggiornabile |
| Un solo tipo di dispositivo | **Livelli di garanzia:** 0 = chiave auto-registrata con deposito; 1 = chiave approvata da un emittente (un produttore) che deposita una cauzione |

### 3.2 Le contestazioni

1. **Prova di uso improprio della chiave** (oggettiva, la decide il contratto). Chi presenta una
   firma fatta con la chiave del dispositivo su un messaggio che nessuna catena di cattura
   firmerebbe, e che nomina chi lo presenta, incassa metà del deposito. Niente voto. Non si può
   usare contro una chiave che non si possiede: un dispositivo onesto con chiave legata
   all'hardware non può essere segnalato così da nessuno. È l'idea crittografica più solida del
   progetto, e ha prior art precisa (crittografia "leakage-deterring" di Kiayias e Tang, CCS 2013
   e 2015; "accountable assertions" di Ruffing, Kate e Schröder, CCS 2015): va presentata come
   assemblaggio, non come novità.
2. **Accusa con voto**, per le prove che un contratto non sa leggere. In due fasi (impegno che
   non rivela il bersaglio, poi rivelazione), sempre contestata automaticamente dal contratto con
   il deposito del dispositivo, decisa da un oracolo ottimistico. Non è un rilevatore di immagini
   sintetiche e la specifica lo dice. È provata contro un oracolo finto; contro UMA reale richiede
   altre modifiche (§3.3) e non fa parte della demo.

**Ritirata: la prova di esistenza precedente.** Nelle revisioni v2.3 e v2.4 c'era una terza
contestazione oggettiva: tagliare il deposito a una chiave se un'altra chiave aveva già registrato
lo stesso file prima del suo blocco di ancoraggio (foto riciclata). Il revisore indipendente l'ha
rotta con un exploit eseguibile: il relayer che riceve la firma di una fotocamera onesta registra
lo stesso file con la propria chiave, trattiene il record della fotocamera finché l'ancoraggio
scade, e quando la fotocamera firma di nuovo incassa lui la ricompensa (+0,125 ETH, deposito
onesto perso). Era una mia aggiunta, suggerita dalla ricerca: l'ho tolta dalla specifica.

### 3.3 Che cosa hanno mostrato i test, revisione per revisione

Ogni revisione è stata implementata, attaccata e corretta sui difetti che gli attacchi hanno
trovato. Tabella completa in `experiments/p03-paprika-v2-hardened/README.md`.

| Revisione | Difetto trovato dai test della precedente | Correzione |
|---|---|---|
| v2 | I difetti dell'originale (§2.2) | Deposito, prova di possesso, firma verificata on-chain, ricompensa dal deposito tagliato, segnalazione al posto della cancellazione |
| v2.1 | Il falsario presentava la prova di uso improprio della propria chiave mentre l'accusa di un terzo era aperta e si riprendeva metà deposito; un dispositivo onesto non sorvegliato perdeva contro un'accusa falsa non contestata entro 2 ore | Le accuse aperte hanno priorità sul deposito; ogni accusa viene contestata dal contratto |
| v2.2 | Il falsario vedeva l'accusa in arrivo nel mempool e si auto-denunciava prima; oppure occupava con un secondo conto l'unico slot di contestazione | Accuse in due fasi con ricompense in deposito temporaneo; più accuse per dispositivo, ciascuna con la sua parte di deposito riservata |
| v2.3 | Il proprietario riempiva tutti gli slot di contestazione e ritirava nello stesso blocco | Periodo di attesa dopo l'ultima accusa; firma "low-s" e identificativo della chiave in ogni messaggio firmato |
| v2.4 | Due giurie: senza il livello 1 non c'è alcun legame con l'hardware | Emittenti con cauzione, registrazione con approvazione, taglia dell'emittente limitata alla parte bruciata del deposito del proprietario |
| v2.5 | Revisore indipendente sulla v2.3, con 12 exploit eseguibili: la prova di esistenza precedente permette a un relayer di far tagliare una fotocamera onesta, e chiunque può copiarla dal mempool; un'accusa accolta non si chiude se l'accusatore rifiuta il pagamento; il deposito "a rischio" mostrato includeva le cauzioni in mano all'oracolo | Prova di esistenza precedente ritirata; ricompense accreditate e ritirabili invece che inviate; deposito libero e riservato mostrati separatamente |

**Che cosa dice il revisore indipendente** (`docs/reviews/paprika-v2_3-redteam.md`): costruirebbe
stanotte sui record firmati, con finestra temporale e deposito, e sul percorso della prova di uso
improprio; non sul percorso con voto così com'è, perché contro UMA reale ogni rivelazione
fallirebbe (le cauzioni lì sono in un token ERC-20 e il minimo può cambiare). Ha verificato che
reggono: firme malformate o riusate (tutte rifiutate), assenza del precompile (il contratto
rifiuta tutto invece di accettare tutto), casi limite dell'ancoraggio, assenza di rientranza e di
doppi pagamenti.

**Che cosa regge nella versione finale** (attacchi ripetuti a ogni revisione): elusione del ban
(ora costa un deposito), furto dell'attestazione, svuotamento del tesoro, doppie ricompense,
registrazione della chiave altrui, accuse su foto mai attestate, cancellazione retroattiva,
riuso di firme fra domini o fra chiavi, accusa falsa contro un dispositivo non sorvegliato (se il
voto è onesto),
auto-revoca di una chiave di livello 1 per incassare la taglia dell'emittente (in perdita in
tutti e quattro i casi provati). Il test casuale a stati (5 semi da 5000 azioni, con dispositivi,
accuse, voti, prove, ritiri ed emittenti) non ha trovato violazioni degli invarianti contabili.

**Che cosa non regge, e non può reggere in questa famiglia di design:**

| Limite | Numero |
|---|---|
| Una chiave software di livello 0 attesta contenuto sintetico; è solo punibile a posteriori | Il falsario scoperto perde 0,125 ETH; se nessuno lo contesta entro 30 giorni perde solo l'immobilizzo |
| Il falsario può sempre auto-denunciarsi per primo: la penalità effettiva è la parte bruciata, non il deposito | (1 − 0,5) × 0,25 = 0,125 ETH |
| Il deposito limita la punizione, non il danno | Con probabilità di essere scoperti fra 1% e 10%, il deposito scoraggia falsi che valgono da circa 4 a circa 40 dollari; per un falso da 10 mila dollari servirebbero decine di ETH |
| Chi ruba una chiave onesta incassa metà del deposito della vittima e ne scredita tutto l'archivio | 0,125 ETH al ladro |
| Un emittente che conserva copie delle chiavi può fare lo stesso ai propri clienti | +0,125 ETH per chiave; unico freno, il contatore pubblico delle sue chiavi segnalate |
| Chiunque diventa emittente con 1 ETH e approva le proprie chiavi software | Riesce on-chain; chi verifica deve avere una propria lista di emittenti fidati |
| L'accusa con voto richiede 48–72 ore, dipende da un oracolo che non esiste su XRPL EVM, e un accusatore con un movente esterno molto più grande del deposito non si può scoraggiare con nessuna cauzione | — |
| Le foto riciclate non hanno più una contestazione oggettiva: restano al percorso con voto | — |
| Record collegabili fra loro e al conto del proprietario; corrispondenza solo sull'hash esatto; una foto di uno schermo fatta con un dispositivo vero produce un record valido | — |

**L'insegnamento principale.** In cinque revisioni ogni correzione al percorso con voto ha aperto
un varco nuovo, e anche la seconda prova oggettiva che avevo aggiunto è caduta alla prima
revisione indipendente. La prova di uso improprio, invece, ha retto dalla prima versione. Coincide con la
letteratura: il whitepaper di EIGEN distingue le colpe oggettivamente attribuibili da quelle
soggettive e sulle seconde scrive "we cannot build strong cryptoeconomic guarantees on these". La
regola di UMA dice la stessa cosa dal lato dell'oracolo.

### 3.4 Costi e reti

| Operazione | Gas (v2.3) |
|---|---|
| Registrazione | 146 mila |
| Attestazione | 64 mila |
| Prova di uso improprio | 94 mila |
| Accusa: impegno, poi rivelazione | 68 mila, poi 385 mila |

Il precompile P-256 risponde correttamente su tutte le 12 reti pubbliche provate in sola lettura,
comprese mainnet e testnet della sidechain EVM di XRPL. Un'attestazione costa circa 0,00006
dollari su XRPL EVM e circa 0,23 su Ethereum, ai prezzi campionati. UMA è presente ovunque tranne
che su XRPL EVM: lì il protocollo può girare con le sole contestazioni oggettive.

### 3.5 Dove il meccanismo ha senso

Dalla ricerca su rilevazione e deterrenza (`docs/research/seed/03-…`), con la cautela che nessuno
ha mai misurato la probabilità che un falso venga scoperto:

- **Plausibile:** frodi di basso valore con foto riciclate (annunci, mercatini), dove esiste una
  prova pubblica (la pubblicazione precedente) e il guadagno per chiave è piccolo.
- **Marginale:** frodi assicurative e profili falsi.
- **Senza speranza come deterrenza:** notizie, elezioni, prove legali, dove il guadagno non ha un
  tetto. Lì un record serve solo come etichetta di tempo e di chiave.

Tre frasi che si possono dire: un record dimostra che una chiave registrata ha firmato questo
esatto file in una finestra di blocchi nota, con un deposito pubblico alle spalle; chiavi estratte
si scoprono con una prova che il contratto controlla da solo; un record vale
al massimo quanto il deposito che lo copre. Tre che non si devono dire: "Paprika rileva i falsi";
"un record significa una vera cattura da fotocamera"; "il deposito garantisce la deterrenza o
risarcisce le vittime".


---

## 4. ORIGO, rivisto con lo stesso metro

Revisione indipendente completa in `docs/reviews/origo-independent-review.md` (15 rilievi).

### 4.1 Che cosa regge

- **Il circuito è corretto così com'è scritto.** La relazione dimostrata è: "conosco una firma
  ECDSA P-256 sul messaggio `m`, fatta da una chiave che è foglia dell'albero di Merkle con radice
  `root`, e `tag` è l'etichetta di revoca di quella chiave per `m`". Separazione dei domini negli
  hash, ingressi pubblici canonici e irrilevanza della malleabilità della firma sono stati
  controllati.
- **La prova e la verifica on-chain si riproducono su questa macchina:** stessa chiave di verifica
  byte per byte, `verify` restituisce vero a circa 4,08 milioni di gas, i due casi negativi
  falliscono. Misura aggiuntiva: la prova richiede 4,7 secondi su un solo core e 1,6 su quattro
  (non è un dato da telefono).

### 4.2 Le falle trovate

| # | Rilievo | Gravità | Correzione | Sforzo |
|---|---|---|---|---|
| O-01 | La non collegabilità vale solo verso chi non conosce la chiave pubblica del dispositivo: il produttore può riconoscere ogni foto. Il ripiego previsto ("pubblicare la firma") rivela la chiave e collega tutte le foto | Alta | Correggere le affermazioni sulla privacy; eliminare quel ripiego | 20 min |
| O-02 | La revoca di un dispositivo rende invalide e collegabili le sue foto passate: è "censura retroattiva" fatta da un quorum | Alta | Revoca con blocco di decorrenza: le foto precedenti risultano "valide quando attestate" | 45 min |
| O-03 | 2 registrar su 3 sopra i produttori-CA sono un consorzio, non decentralizzazione: due in collusione ammettono un produttore falso, due chiavi perse congelano il registro | Alta | È l'elemento più debole rispetto alla parola "decentralised". Vedi §6 | 1–1,5 h |
| O-04 | Circa 4,1 milioni di gas per foto: una decina di attestazioni per blocco su Ethereum | Alta per le affermazioni sul deployment | Dichiarare il dato; scegliere una rete a basso costo | — |
| O-06 | Trappola nel limite temporale: `blockhash(n)` vale 0 per blocchi futuri o scaduti, quindi un controllo ingenuo accetta lo zero | Media | Rifiutare esplicitamente lo zero e i blocchi non passati | incluso sotto |
| O-07 | "Un record per digest" permette a chiunque abbia un dispositivo registrato di precedere l'attestazione altrui | Media | Indicizzare i record per `tag` | incluso sotto |
| O-08 | Il messaggio firmato non ha etichetta di protocollo né versione | Media | Etichetta, chain e contratto nel messaggio | 45 min per O-06/07/08 insieme |
| O-05, O-09 | L'insieme di anonimato è un lotto (al massimo 1024 dispositivi); un produttore può aggiungere chiavi fantasma senza che nessuno possa verificarlo | Media | Limiti da dichiarare | — |
| O-14 | Documenti non allineati dopo la revisione delle 17:40 (D-12 dice ancora "no Solidity") | Bassa | Allineare | 15 min |

### 4.3 Le tre debolezze della slide 10

| Debolezza | ORIGO |
|---|---|
| Single point of failure | Spostata e ridotta, non rimossa: da Apple a ciascun produttore più un quorum di 2 su 3 |
| Cross-platform lock-in | Rimossa per la verifica; in parte spostata per la cattura, perché l'ammissione dipende dai registrar |
| Retroactive censorship | Rimossa per lo spegnimento dei server su una chain pubblica; reintrodotta dalla revoca retroattiva finché non viene corretta (O-02) |

### 4.4 Fattibilità entro le 08:00

La revisione stima 11,5–15,5 ore di lavoro seriale contro circa 9,5 disponibili partendo alle
22:30: il piano di ORIGO **non è realizzabile così com'è scritto**, lo diventa se l'agente fa
contratti, test e flusso da riga di comando (5–6,5 ore) mentre gli umani scrivono in parallelo
specifica, deck e scheda di difesa. Da allora però lo spike `p04` (§6) ha già scritto e provato lo
strato dei contratti, incluso il punto che la revisione indicava come rischio tecnico più alto
(l'accordo byte per byte del messaggio fra Node, circuito e Solidity).


---

## 5. Confronto alla pari

Tre candidati, ciascuno nella sua forma migliore:

- **P — Paprika v2** (questo repository): chiavi con deposito, firma verificata on-chain,
  contestazioni oggettiva (uso improprio della chiave) e con voto, emittenti a cauzione per il livello 1.
- **O — ORIGO** (repository `crypto`), giudicato **con** le correzioni piccole della sua revisione
  (revoca con decorrenza, igiene del contratto, affermazioni sulla privacy corrette) e con la sua
  governance così com'è progettata (2 registrar su 3).
- **C — la combinazione** (spike `p04`): l'attestazione ZK di ORIGO, con emittenti ammessi da una
  cauzione invece che da un comitato e revoca solo con prova di uso improprio.

### 5.1 Che cosa garantisce ciascuno a chi verifica

| | Garanzia, in una frase | Da che cosa dipende |
|---|---|---|
| P | Il possessore di una chiave registrata con deposito ha firmato questo esatto file fra il blocco b0 e il blocco b1, e si può leggere tutto ciò che è stato provato o deciso su quella chiave da allora | Al livello 0, solo dal deposito: è una garanzia economica, non di origine fisica. Al livello 1, dall'emittente e dalla fiducia che il verificatore ripone in lui |
| O | Una chiave nascosta, sotto la radice di un lotto di un produttore ammesso da 2 registrar su 3, ha firmato questo file fra i blocchi n e n1 e a quel momento non era revocata | Dall'onestà del produttore e dalla tenuta dell'hardware; dal quorum dei registrar |
| C | Come O, ma la radice appartiene a un indirizzo con cauzione, e sta a chi verifica decidere se fidarsene | Con una buona lista di emittenti fidati equivale a O; senza, non vale più di P, perché chiunque diventa emittente con 1 ETH |

### 5.2 Requisito per requisito

Sintesi delle due tabelle indipendenti della giuria (seggi A e B), che concordano.

| Requisito della traccia | P | O | C |
|---|---|---|---|
| "Design a secure protocol" (slide 11) | Sì: specifica con affermazione, messaggi, condizioni sugli incentivi, limiti | Parziale: registri delle decisioni e circuito, la specifica è da scrivere | Parziale: solo il README dello spike |
| "generalises to any device" | Sì in ampiezza: qualunque chiave P-256 con deposito. Al livello 0 la garanzia è la stessa, debole, per tutti | Parziale: qualunque chiave in hardware sicuro, arruolata da un produttore ammesso | Parziale/sì: qualunque dispositivo sotto qualunque emittente con cauzione |
| "guarantees authentic photo origin" / "cryptographic guarantees of physical origin" (slide 2) | No al livello 0. Al livello 1 come C, senza privacy | Parziale: crittografica, dalla chiave hardware del produttore al file; si ferma alla parola del produttore | Parziale: come O se il verificatore ha una lista di emittenti fidati |
| "via decentralised blockchains technology" | Sì: il contratto è tutto il sistema, senza amministratori | Sì: il contratto verifica la prova ZK | Sì |
| Crittografia avanzata (slide 12 e pagina dell'evento: "zero-knowledge proofs, digital signatures, privacy-enhancing technologies") | Parziale: firme, impegni, limiti temporali da hash di blocco. La novità è nel meccanismo più che nella crittografia | Sì: prova ZK di una firma P-256 più appartenenza a un albero di Merkle più etichetta di revoca, verificata on-chain | Sì: la stessa prova, più la prova oggettiva di uso improprio |
| Non collegabilità delle foto (proprietà del riferimento Apple, non richiesta dalle slide) | No | Parziale: verso chi non conosce la chiave pubblica; il produttore può riconoscere le foto | Come O |
| Costo per foto | 64–86 mila gas: circa 0,00006 $ su XRPL EVM, 0,23 $ su Ethereum | Circa 4,1 milioni di gas: 0,003 $ su XRPL EVM, 10,7 $ su Ethereum | Come O |

### 5.3 Le tre debolezze della slide 10

| Debolezza | P | O | C |
|---|---|---|---|
| Single point of failure | Rimossa per la CA, ma al livello 0 solo perché nessuno certifica i dispositivi. Le prove oggettive le decide il contratto, senza nessuno al comando. Le accuse con voto dipendono da un oracolo esterno | Spostata e ridotta: da Apple a ciascun produttore più un quorum di 2 su 3 | Rimossa on-chain per la revoca dei dispositivi. La fiducia negli emittenti si sposta su liste scelte da chi verifica |
| Cross-platform lock-in | Rimossa | Rimossa per la verifica; l'ammissione dipende dai registrar | Rimossa per verifica e ammissione |
| Retroactive censorship | Rimossa per spegnimento e alterazione: i record non si cancellano. Residuo: chi ruba una chiave può far perdere fiducia in tutto l'archivio della vittima | Rimossa con la correzione della decorrenza; la revoca resta l'atto di un quorum | La più pulita: revoca per singola chiave, con decorrenza, e nessuno può impostarla senza la firma della chiave stessa |

### 5.4 I punteggi della giuria simulata

Due seggi indipendenti, che non hanno letto il primo giro né l'uno il rapporto dell'altro. Scala
1–10 sui tre criteri della slide 14; fra parentesi la media. Sono giudizi di un modello che
interpreta dei giurati, con incertezza di circa ±1 per voce: servono a ordinare, non a misurare.

| | Seggio A, idea al meglio | Seggio B, idea al meglio | Seggio A, entro le 08:00 | Seggio B, entro le 08:00 |
|---|---|---|---|---|
| P (v2.3, solo livello 0) | 5 / 4,5 / 5 (4,8) | 5 / 5 / 5 (5,0) | (5,0) | (5,2) |
| O | 6 / 7 / 7 (6,7) | 6 / 7 / 7 (6,7) | (6,2) | (6,2) |
| C | 6 / 6,5 / 6 (6,2) | 6 / 7 / 6 (6,3) | (5,3) | (5,8) |

Nel primo giro, sulla proposta originale, il distacco era 9 contro 22 su 30. Il lavoro di
rinforzo lo ha ridotto molto, ma non lo ha chiuso.

**Perché P resta dietro, secondo entrambi i seggi.** Il divario è strutturale: la slide 2 chiede
garanzie crittografiche di origine fisica e la specifica di Paprika dichiara, onestamente, di non
darne al livello 0. Su "crypto vision" pesa il fatto che la pagina dell'evento cita proprio le
prove a conoscenza zero come esempio per questa traccia.

**Che cosa cambierebbe l'ordine**, sempre secondo i seggi:

- **C supera O** se riceve una lista di emittenti fidati dal lato di chi verifica e se si chiude
  il difetto dell'auto-revoca (vedi §6). Anche se i giudici insistono su "chi sono i tre
  registrar".
- **P guadagna circa 1,5 punti** se il livello 1 viene costruito davvero (stima del seggio A): è
  l'oggetto della revisione v2.4.
- **P supera O nella notte** solo se ORIGO arriva alle 08:00 con una demo rotta o solo da riga di
  comando: la demo di Paprika è quasi certa.

### 5.5 Rischio di realizzazione

| | Che cosa gira già | Che cosa manca | Rischio |
|---|---|---|---|
| P | Contratto in più revisioni con suite di attacco e test casuale; mock; bozza del deck | Libreria, riga di comando, pagina demo | Basso |
| O | Prova e verificatore on-chain; mock; bozza del deck | Contratti (il suo piano li dava finiti alle 20:30), libreria, pagina demo, specifica | Medio: il piano è in ritardo di circa 4 ore, ma `p04` ha già risolto il punto tecnico più rischioso |
| C | Contratto unico con prove reali (`p04`), più tutto ciò che esiste per O e per P | Come O, più lista di emittenti fidati e deposito del proprietario | Medio |

---

## 6. La combinazione

Le due proposte sono concorrenti sull'ancora di fiducia e complementari sulla revoca. Tre rapporti
indipendenti (giuria del primo giro, revisione avversaria di Paprika, ricerca sulla prior art)
sono arrivati alla stessa formula: **la crittografia decide chi entra, le contestazioni con
cauzione decidono chi esce.**

Lo spike `experiments/p04-combined-critical-path/` la realizza su chain locale: 9 test superati,
10 prove ZK reali generate al momento, verificatore identico byte per byte a quello di ORIGO.

| Che cosa prende da ORIGO | Che cosa prende da Paprika |
|---|---|
| Attestazione ZK: una chiave del lotto ha firmato, senza dire quale | Ammissione aperta con cauzione al posto dei 2 registrar su 3 |
| Limiti temporali dall'hash di blocco | Revoca solo con prova di uso improprio, pagata dalla cauzione dell'emittente |
| Etichetta di revoca ricalcolabile | Nessun proprietario, nessun comitato, record mai cancellati |

**Proprietà nuova, che nessuna delle due aveva da sola:** nessuno, né l'emittente né un quorum,
può revocare un dispositivo senza una firma fatta dalla chiave di quel dispositivo. La revoca non
può quindi diventare uno strumento di censura.

**I due difetti che lo spike dichiara, e come si chiudono:**

1. *Chiunque diventa "produttore" con 1 ETH.* La chain dice solo "una chiave sotto la radice
   dell'indirizzo X, che ha una cauzione, ha firmato". Serve una lista di emittenti fidati scelta
   da chi verifica (più liste, pubbliche, concorrenti: il contrario della lista unica di Apple).
   È lavoro di interfaccia, non di contratto.
2. *Il proprietario può auto-revocarsi per svuotare la cauzione di un emittente onesto.* Si chiude
   con l'idea centrale di Paprika: un deposito anche per il proprietario, e una taglia
   dell'emittente più piccola della parte di deposito che viene bruciata. È ciò che la revisione
   v2.4 implementa e misura (§3).

Costi misurati: attestazione 4,2 milioni di gas, prova di uso improprio 198 mila, registrazione
dell'emittente 90 mila.

---

## 7. Raccomandazione

**Presentare un solo progetto: il nucleo di ORIGO con lo strato di ammissione e revoca di
Paprika.** In ordine di motivi:

1. È l'unica delle tre opzioni che risponde sia a "cryptographic guarantees of physical origin"
   (che Paprika da solo non dà) sia a "decentralised" senza un comitato (che ORIGO da solo non dà).
2. Toglie a ORIGO la sua domanda più scomoda ("chi sono i tre registrar, e chi li ha scelti?") e
   il rilievo sulla revoca come censura per quorum.
3. Non costa quasi nulla in più: sostituisce la logica del multisig invece di aggiungersi, e il
   contratto esiste già in forma di spike.
4. La giuria simulata mette ORIGO e la combinazione entro l'incertezza l'uno dall'altra, e indica
   proprio i due difetti del §6 come ciò che separa la seconda dal primo posto.

**Che cosa resta di Paprika nel progetto presentato:** l'ammissione aperta con cauzione, la
revoca a prova, il deposito del proprietario, il principio "si annota, non si cancella", l'analisi
economica con i suoi numeri e, se il tempo lo consente, il livello 0 come modalità pubblica ed
economica per i dispositivi senza hardware sicuro (stesso linguaggio, 64 mila gas invece di 4,2
milioni). È la prima cosa da tagliare se il tempo stringe.

**Che cosa non consiglio:** presentare Paprika da solo. Anche nella versione migliore deve
ammettere nella prima slide che un record di livello 0 non dimostra l'origine fisica, in una
traccia che si intitola "photo-origin". E il suo percorso più caratteristico, l'accusa decisa da
un voto, è quello che in quattro revisioni ha continuato ad aprire varchi, mentre il percorso
oggettivo ha retto dalla prima.

**Alternativa prudente:** ORIGO con le sole correzioni della revisione (§4.2), tenendo i 2
registrar su 3. È la scelta con meno novità di progetto nelle prossime ore; lascia scoperta la
domanda sulla governance.

### Decisioni che spettano a te

| # | Decisione | La mia proposta |
|---|---|---|
| 1 | Quale candidato si presenta | La combinazione; ripiego: ORIGO con le correzioni |
| 2 | In quale repository si costruisce | In `crypto` (quello di ORIGO, che ha già remoto, issue e storia), portandovi `p04` e il contratto di Paprika come riferimento |
| 3 | Il percorso con voto (oracolo) | Fuori dalla demo: resta nella specifica come lavoro futuro, con i limiti dichiarati |
| 4 | Rete della demo | Deciso da te: una EVM locale di Ethereum, senza reti pubbliche. Con Hardhat basta impostare l'hardfork `osaka` per avere il precompile P-256. La prova su testnet non serve e non è stata fatta |
| 5 | Creare un repository GitHub per `crypto2` e pubblicarlo | Solo se vuoi conservarlo separato: è un'azione riservata a te |
| 6 | Livello 0 pubblico (firma diretta) come seconda modalità | Solo se avanza tempo |

---

## 8. Piani

### 8.1 Se si costruisce la combinazione (raccomandata)

Stime per un agente di sviluppo, con gli umani in parallelo su specifica, deck e scheda di difesa.
`T` è il momento del via.

| Blocco | Fino a | Contenuto | Verifica d'uscita |
|---|---|---|---|
| Contratti | T+1:15 | Portare `OpenRegistry` da `p04` in `impl/`; aggiungere deposito del proprietario e taglia limitata (da Paprika v2.4), decorrenza della revoca, vista di stato con emittente e suo storico | Suite verde, compresi tutti i casi negativi |
| Libreria e riga di comando | T+3:00 | Dispositivo simulato, lotto, prova, relayer, verifica con lista di emittenti fidati, prova di uso improprio | Flusso completo da riga di comando |
| Pagina demo | T+5:00 | Cattura, verifica, manomissione, revoca a prova, registro degli emittenti | La storia della demo gira da capo a fondo |
| Specifica | T+6:00 | Relazione dimostrata, messaggi, ipotesi, limiti; allineata al codice | Tabella specifica ↔ codice |
| Revisione indipendente | T+7:00 | Revisori nuovi su protocollo e codice; correzioni | Rilievi gestiti o dichiarati come limiti |
| Materiale per il pitch | T+8:30 | Deck, copione, copione della demo, registrazione di riserva, scheda di difesa, briefing | Letto ad alta voce in meno di 5 minuti |
| Passata finale | T+9:15 | Esecuzione da clone pulito, verifica delle affermazioni, disclosure | Tutto pubblicato |

Ordine dei tagli: livello 0 pubblico; cattura dalla fotocamera; schermata del registro; rifinitura
della pagina. Mai tagliare: transazioni reali, casi negativi rifiutati, onestà su ciò che è
simulato, disclosure, registrazione di riserva.

Con il via alle 23:00 la passata finale cade poco dopo le 08:00: non c'è margine, quindi i tagli
vanno applicati presto.

### 8.2 Se si costruisce Paprika v2 da solo

Piano completo con milestone e backlog in `docs/PLAN.md`: circa 9 ore, rischio basso perché il
contratto e la sua suite esistono già.

### 8.3 Se si costruisce ORIGO così com'è

Il suo `docs/PLAN.md` va ricalcolato: la revisione stima 11,5–15,5 ore seriali. Conviene comunque
partire dal contratto di `p04` togliendo cauzioni e taglia, invece di scrivere da zero registro e
attestazioni.

---

## 9. Dove trovare le cose

| Voglio vedere… | File |
|---|---|
| La proposta originale, com'è arrivata | `proposal/PAPRIKA.md` |
| Il protocollo rinforzato | `spec/PROTOCOL.md` |
| Perché ogni cosa è cambiata rispetto all'originale | `docs/DECISIONS.md` |
| Gli attacchi all'originale, eseguibili | `experiments/p01-paprika-baseline-attacks/` |
| Il contratto rinforzato, revisione per revisione, con gli attacchi ripetuti | `experiments/p03-paprika-v2-hardened/README.md` |
| I numeri economici | `experiments/p06-economic-model/README.md` |
| Reti, costi, XRPL EVM | `experiments/p05-chain-options/README.md` |
| UMA reale su fork locale | `experiments/p02-uma-oov3-feasibility/README.md` |
| La combinazione con ORIGO | `experiments/p04-combined-critical-path/README.md` |
| Le revisioni indipendenti | `docs/reviews/` |
| Gli exploit del revisore sul contratto rinforzato | `experiments/p08-redteam-v2_3/` |
| La letteratura | `docs/research/` e `docs/research/claims-ledger.md` |
| Come apparirebbe la demo | `impl/mock/ui-mock.html` e gli screenshot accanto |
| La bozza del deck | `slides/draft/deck-draft.pdf` |
| Piano e stato | `docs/PLAN.md`, `docs/STATUS.md` |
| Il confronto in inglese, per il repository | `docs/COMPARISON.md` |

---

## 10. Limiti di questo lavoro

- **I punteggi sono di giurie simulate**, non di giudici veri. Ordinano i candidati in modo
  coerente fra tre giri indipendenti, ma non conosciamo i pesi reali dei criteri.
- **I rapporti di ricerca non sono stati riaperti tutti da me.** Ho ricontrollato un campione
  (elencato nel registro delle affermazioni); il resto è da trattare come pista.
- **Il modello economico usa ipotesi non misurate da nessuno:** probabilità che un falso venga
  scoperto, accuratezza del voto, valore di un falso, prezzo di ETH. La letteratura trovata
  conferma che la prima non è mai stata misurata.
- **Niente è stato eseguito su una rete pubblica**, come deciso: chain locale, fork locale e
  chiamate in sola lettura.
- **I dispositivi e gli emittenti sono simulati**, in tutti e tre i candidati.
- **La combinazione esiste solo come spike** di contratto: né interfaccia né specifica propria.
- **Non ho modificato il repository di ORIGO.** Le correzioni del §4.2 sono proposte.

