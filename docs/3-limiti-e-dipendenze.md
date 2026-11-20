# 3. Limiti e dipendenze

Paprika non dipende da produttori di dispositivi. Questa scelta ha un prezzo, e qui lo scriviamo
per intero: da che cosa dipende invece, che cosa non riesce a fare, e come si confronta con ORIGO
proprio su questo punto.

## Da chi dipende Paprika

| Da chi | Dipende? | In che modo |
|---|---|---|
| Produttori di dispositivi | **No** | Nessuno certifica i dispositivi. Chiunque registra una chiave |
| Un comitato o un'autorità che accredita | **No** | Non esiste |
| Un amministratore del contratto | **No** | Il contratto non ha proprietario e non si può modificare |
| Un tesoro o una cassa comune | **No** | Non esiste. I soldi sono solo depositi e cauzioni dei singoli |
| Qualcuno che sorvegli la blockchain per difendere gli onesti | **No** | Il contratto difende da solo ogni dispositivo accusato |
| **Un arbitro decentralizzato** | **Sì** | Decide le accuse sulle foto. È la dipendenza principale: vedi sotto |
| **La blockchain** | **Sì** | Custodisce record e depositi. Deve essere una rete pubblica perché le garanzie valgano |
| **Il proprietario del dispositivo** | **Sì** | Deve custodire la chiave. Se gliela rubano, perde metà deposito |

### La dipendenza dall'arbitro

L'arbitro è il servizio che risponde alla domanda "le prove dimostrano che questa foto è un
falso?". Nella proposta originale è UMA, "ma potrebbe essere altro".

| Domanda | Risposta |
|---|---|
| Chi decide, in pratica? | Con UMA: chi possiede il token UMA, con un voto pubblico |
| Quanto ci mette? | Da 48 a 72 ore per ogni accusa |
| Può sbagliare? | Sì. Se accoglie un'accusa falsa, un dispositivo onesto viene segnalato e perde il deposito. I suoi record restano leggibili |
| Si può corrompere? | Chi controlla abbastanza voti può pilotare una decisione. La sicurezza del voto è quella dell'arbitro, non la nostra |
| Che cosa lo limita? | Decide solo sulla singola accusa. Non può cancellare record, non può toccare altri dispositivi, non può cambiare le regole |
| Si può sostituire? | Sì: con una giuria come Kleros, o con una giuria estratta fra chi ha un deposito in Paprika. Va scelto prima di pubblicare il contratto, perché poi non si cambia |
| E nella demo? | L'arbitro è simulato: decidiamo noi l'esito, per mostrare i due casi. Lo diciamo apertamente |

In sintesi: **Paprika sposta la fiducia dai produttori a un arbitro decentralizzato e al
deposito.** Non la elimina.

Se si vuole ridurre anche questa dipendenza, c'è una variante minima: togliere le accuse sulle
foto e tenere solo la prova che una chiave è uscita dal dispositivo, che non ha bisogno di
arbitro. Ma senza accuse sulle foto, chi attesta un falso con la propria chiave non rischia più
nulla. Per questo le accuse restano.

## Che cosa Paprika non riesce a fare

| Limite | In parole semplici |
|---|---|
| **Non dimostra che la foto viene da una fotocamera** | Un dispositivo registrato può firmare un'immagine generata. È la conseguenza diretta di non avere produttori |
| **Prende solo i falsi che lasciano prove pubbliche** | Se nessuno può dimostrare che l'immagine è falsa, l'accusa viene respinta e il falso resta attestato |
| **La punizione è limitata dal deposito** | Chi attesta un falso rischia al massimo 0,25 ETH. Se il falso gli rende di più, il deposito non lo ferma |
| **Chi sta per essere scoperto può limitare i danni** | Può far segnalare da solo il proprio dispositivo e recuperare metà deposito, purché lo faccia prima che un'accusa sia stata depositata |
| **Dopo 30 giorni senza accuse il deposito torna indietro** | Un falso che nessuno contesta in tempo è costato solo l'attesa |
| **Le foto di un dispositivo sono collegabili fra loro** | Chiunque vede quali foto ha attestato un dispositivo e quale conto lo ha registrato |
| **Vale solo per il file identico** | Una copia ricompressa o ritagliata, per il protocollo, è un'altra foto |
| **La foto di uno schermo** | Un dispositivo che fotografa un'immagine falsa su uno schermo produce un record regolare |
| **Il contratto non si può correggere** | Se c'è un difetto, bisogna pubblicarne uno nuovo |

## Quanto protegge il deposito, in numeri

Chi attesta un falso viene scoperto con una certa probabilità. Se viene scoperto perde il
deposito; se si muove per primo ne perde metà. Il deposito scoraggia quindi i falsi che rendono
meno di: *probabilità di essere scoperti × 0,125 ETH*.

| Probabilità che il falso venga dimostrato | Il deposito scoraggia falsi che valgono fino a |
|---|---|
| 1% | circa 4 dollari |
| 10% | circa 37 dollari |
| 50% | circa 190 dollari |

Con un prezzo ipotizzato di 3000 dollari per ETH. La probabilità è un'ipotesi: nessuno studio che
abbiamo trovato la misura. I calcoli completi sono in
[`prove/modello-economico/`](../prove/modello-economico/).

**Che cosa vuol dire.** Con questi valori Paprika è adatto a contesti dove un falso vale poco e
spesso lascia tracce: annunci di vendita, foto riciclate, piccole frodi. Non basta per notizie,
elezioni o prove legali, dove un falso può valere moltissimo. Alzare il deposito sposta la soglia,
ma esclude chi non può permetterselo.

## Paprika e ORIGO sulla dipendenza dai produttori

| | ORIGO | Paprika |
|---|---|---|
| Chi deve esistere perché il sistema dica qualcosa | Almeno un produttore che registra le chiavi dei suoi dispositivi, più chi ammette i produttori (2 registrar su 3) | Nessuno: basta il contratto. Per le accuse, un arbitro |
| Di chi ci si fida | Del produttore: che registri solo dispositivi veri e che le chiavi non escano dall'hardware | Dell'arbitro, e del fatto che chi firma ha soldi da perdere |
| Che cosa dimostra un record | Che ha firmato una chiave garantita da un produttore ammesso | Che ha firmato una chiave con un deposito in gioco |
| Legame con una fotocamera vera | Sì, tramite la parola del produttore | No |
| Chi può entrare | Chi ha un dispositivo di un produttore ammesso | Chiunque, con il deposito |
| Chi revoca | I registrar | Una decisione sull'accusa, o una prova con la chiave |
| Privacy delle foto | Le foto di un dispositivo non sono collegabili da chi non ne conosce la chiave | Sono collegabili da chiunque |
| Costo per foto (gas) | Circa 4,1 milioni | Circa 64 mila |
| Punto debole principale | La dipendenza da produttori e registrar | Nessuna prova di origine fisica; dipendenza dall'arbitro |

Sono due risposte diverse alla stessa traccia. ORIGO dà una garanzia più forte e accetta di
fidarsi dei produttori. Paprika non si fida di nessun produttore e accetta una garanzia più
debole, di tipo economico.

## Come dirlo, e come non dirlo

Si può dire:

1. Un record dimostra che un dispositivo registrato ha firmato questo esatto file in un intervallo
   di tempo noto, con un deposito pubblico in gioco.
2. Nessun produttore, comitato o amministratore può decidere chi partecipa né cancellare un record.
3. Chi attesta un falso che lascia prove pubbliche perde il deposito, e chi lo dimostra viene
   pagato.

Non si deve dire:

1. "Paprika riconosce i falsi."
2. "Un record prova che la foto viene da una fotocamera vera."
3. "Il deposito garantisce che nessuno bari."

## Come si potrebbe rafforzare restando senza produttori

Non fanno parte della versione finale. Sono direzioni possibili.

- **Reputazione del dispositivo.** Chi verifica può già leggere dalla blockchain da quanto tempo
  un dispositivo esiste e quante foto ha attestato senza contestazioni accolte, e fidarsi di più
  dei dispositivi con una storia lunga.
- **Deposito proporzionale all'uso.** Un piccolo deposito aggiuntivo per ogni foto, così chi
  attesta molto ha più soldi in gioco.
- **Arbitro interno.** Una giuria estratta a sorte fra chi ha un deposito in Paprika, per non
  dipendere da un servizio esterno.
