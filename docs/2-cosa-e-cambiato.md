# 2. Che cosa è cambiato rispetto alla prima versione, e perché

La prima versione è in [`proposal/PAPRIKA.md`](../proposal/PAPRIKA.md), intatta.
La versione finale è spiegata in [1. Come funziona](1-come-funziona.md).

## In breve

**L'idea è la stessa.** Tre fasi (registrazione, attestazione, ban), aperto a tutti, basato sugli
incentivi economici, senza un'autorità centrale e senza produttori.

**Sono cambiati i dettagli di ogni fase**, perché nella prima versione ciascuna aveva un buco che
si poteva sfruttare. Li abbiamo trovati scrivendo il contratto esattamente come descritto nella
proposta e provando ad attaccarlo: i test sono in
[`prove/originale-attaccato/`](../prove/originale-attaccato/).

| Fase | Quanto è cambiata |
|---|---|
| 1. Registrazione | Stessa idea, con due aggiunte: un deposito e una prova di possesso |
| 2. Attestazione | Stessa idea, ma ora il dispositivo firma. Sparisce la tariffa |
| 3. Ban | Stessa idea (qualcuno contesta, una decisione decentralizzata stabilisce chi ha ragione, chi ha ragione viene premiato), ma con regole precise su soldi, tempi ed effetti. Più un secondo modo di far segnalare un dispositivo |

## Fase 1 — Registrazione

> *Prima versione:* "To register a device, an Ethereum account needs to register it, with its own
> public key. The registration fails if the device is banned."

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| Registrarsi era gratis | Un dispositivo bannato creava una chiave nuova e si registrava di nuovo, al solo costo della commissione. Il ban non costava nulla a chi lo subiva | Per registrarsi serve un **deposito** di 0,25 ETH. Il ban ora fa perdere soldi veri, e rientrare costa un altro deposito |
| Bastava conoscere una chiave pubblica per registrarla | Chiunque poteva registrare la chiave di un altro, farla bannare e renderla inutilizzabile per sempre | Il dispositivo deve **firmare** la richiesta: si registra solo chi possiede davvero la chiave |

**Che cosa vi costa questa modifica:** chi non può bloccare 0,25 ETH non può partecipare.

## Fase 2 — Attestazione

> *Prima versione:* "The device takes a picture. It asks for attestation to be recorded. The smart
> contract saves the attestation if the device is not banned." Con una tariffa pagata al tesoro.

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| Il dispositivo inviava solo l'impronta della foto: la sua chiave non firmava nulla | Chi osservava la rete copiava la richiesta prima che fosse confermata e la inviava a proprio nome. Risultava lui l'autore, e la richiesta onesta veniva rifiutata | Il dispositivo **firma** l'impronta. Il contratto controlla la firma. Copiare la richiesta non serve: il record resta legato a chi ha firmato |
| Si sapeva solo che la foto esisteva *prima* di un certo blocco | Si poteva attestare oggi una foto vecchia di anni | Il dispositivo firma anche il codice di un blocco recente: il record dice "firmata *dopo* il blocco A e *prima* del blocco B" |
| La tariffa finiva in un tesoro | Vedi fase 3: il tesoro si poteva svuotare. E qualcuno avrebbe dovuto amministrarlo | **Niente tariffa e niente tesoro.** Contro lo spam bastano la commissione della blockchain e il deposito |
| Il dispositivo doveva avere ETH per pagare | — | Chiunque può portare la firma sulla blockchain al posto del dispositivo |

## Fase 3 — Ban

> *Prima versione:* "A user claims an irregular device exists. The claim is checked in decentralized
> fashion (in this example using UMA but it could be something else). Ban and a reward are issued
> or not depending on the case."

Questa è la fase rimasta più fedele nello spirito e più cambiata nei dettagli, perché la prima
versione lasciava aperte quasi tutte le domande pratiche.

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| La ricompensa veniva pagata dal tesoro | Una sola persona controllava un dispositivo e un conto accusatore: attestava una cosa qualunque, si accusava da sola e incassava. Con tariffa 0,001, costo dell'accusa 0,01 e ricompensa 0,05 ETH guadagnava 0,785 ETH svuotando un tesoro da 1 ETH | La ricompensa esce **solo dal deposito del dispositivo segnalato**, e metà viene distrutta. Accusarsi da soli fa sempre perdere soldi |
| L'accusa non era legata a un record | Un dispositivo veniva bannato per una foto che non aveva mai attestato | Si può accusare solo una foto che quel dispositivo ha davvero attestato |
| Lo stesso dispositivo poteva essere premiato più volte | Cinque ricompense per una sola foto | Un deposito si perde una volta sola |
| Accusare non costava nulla all'accusatore se sbagliava | Si potevano bersagliare dispositivi onesti senza rischiare niente | L'accusatore blocca una **cauzione** di 0,11 ETH e la perde se l'accusa è respinta. Metà va al dispositivo accusato |
| Con un arbitro come UMA, un'accusa che nessuno contesta entro 2 ore passa come vera | Un dispositivo onesto il cui proprietario dormiva veniva bannato | Il contratto **contesta sempre da solo** a nome del dispositivo. Serve una decisione esplicita: il silenzio non banna nessuno |
| Il proprietario poteva vedere l'accusa in arrivo sulla rete | Si muoveva prima dell'accusatore e gli toglieva la ricompensa | L'accusa si fa in **due tempi**: prima una busta chiusa, poi l'apertura |
| Non era scritto che cosa succede alle foto già attestate dopo un ban | Se il ban le cancellava: un solo errore rendeva inverificabili 100 foto oneste su 100. Se non le cancellava: la foto giudicata falsa restava "attestata" come le altre | Il ban è una **segnalazione con la data**. Nulla viene cancellato. La foto giudicata falsa è marcata. Chi verifica vede tutto e decide |
| Non era scritto chi controlla il contratto e il tesoro | Chi controllava l'arbitro poteva muovere i soldi del tesoro | Il contratto **non ha proprietario** e non si può modificare. Non c'è tesoro |

### La domanda posta all'arbitro

La prima versione chiedeva: *"la foto A è falsa?"*.

Qui non abbiamo cambiato l'idea, ma dobbiamo dirvi con chiarezza un limite che resta. Le regole di
UMA dicono di rispondere "sì" solo se l'affermazione è **vera e verificabile pubblicamente**, e
"no" quando non si può stabilire con certezza. Guardando solo i pixel, un falso ben fatto non si
distingue: lo dice la traccia stessa ("indistinguishable from genuine camera captures"), e gli
studi che abbiamo trovato lo confermano.

Quindi un'accusa viene accolta solo quando **porta prove che chiunque può controllare**. Per
esempio: la stessa immagine era già stata pubblicata prima della data del record; l'immagine si
può rigenerare identica da un modello noto; il contenuto contraddice fatti pubblici. Un falso che
non lascia prove di questo tipo non viene preso. È il limite principale di Paprika, ed è descritto
in [3. Limiti e dipendenze](3-limiti-e-dipendenze.md).

### Il secondo modo di far segnalare un dispositivo (nuovo)

Nella prima versione non c'era. Se qualcuno ha in mano la chiave di un dispositivo registrato, può
dimostrarlo con una firma e prendersi metà del deposito, senza arbitro.

Perché l'abbiamo aggiunto: senza questa regola un dispositivo registrato si potrebbe prestare o
vendere liberamente, e una chiave rubata resterebbe attiva finché qualcuno non contesta una foto.
Con questa regola, chi consegna la chiave a un altro gli consegna anche il deposito.

## Che cosa non è cambiato

- Le tre fasi e il loro ordine.
- Chiunque può registrare un dispositivo, senza chiedere il permesso a nessuno.
- Nessun produttore di dispositivi, nessuna autorità che accredita, nessun comitato.
- Il contratto rifiuta registrazione e attestazione di un dispositivo bannato.
- Chiunque può contestare, e chi ha ragione viene premiato.
- La decisione sulle contestazioni è decentralizzata ("UMA, but it could be something else").
- La sicurezza poggia sugli incentivi economici.

## Strade provate e scartate

Le elenchiamo perché non vengano riproposte senza sapere com'è andata.

| Strada | Perché è stata scartata |
|---|---|
| Aggiungere produttori che garantiscono le chiavi con una cauzione | Funzionava, ma introduceva proprio la dipendenza dai produttori che non vogliamo |
| Lasciare che un'accusa non contestata passi da sola | Un dispositivo onesto non sorvegliato perdeva sempre |
| Punire in automatico chi attesta un file già attestato da un altro | Un revisore indipendente ha mostrato che chi trasporta la firma di una fotocamera onesta poteva usare la regola contro di lei |
| Tenere un tesoro alimentato dalle tariffe | Si svuotava, e richiedeva qualcuno che lo amministrasse |

## Le tre debolezze della traccia, prima e dopo

| Debolezza (slide 10) | Prima versione | Versione finale |
|---|---|---|
| Single point of failure | Nessuna autorità che certifica, ma un tesoro e un contratto di cui non si sapeva chi avesse le chiavi | Nessun proprietario, nessun tesoro, nessuna lista di revoca tenuta da qualcuno. Resta la dipendenza dall'arbitro per le accuse sulle foto |
| Cross-platform lock-in | Rimossa: chiunque registra e verifica | Rimossa, come prima |
| Retroactive censorship | Dipendeva da che cosa faceva il ban, che non era scritto | I record non si cancellano e le segnalazioni hanno una data |
