# 2. Che cosa è cambiato rispetto alla prima versione, e perché

La prima versione è in [`proposal/PAPRIKA.md`](../proposal/PAPRIKA.md), intatta.
La versione definitiva è spiegata in [1. Come funziona](1-come-funziona.md).

## In breve

**L'idea è la stessa.** Tre fasi (registrazione, attestazione, ban), aperto a tutti, basato sugli
incentivi economici, deciso da UMA, senza un'autorità centrale e senza produttori.

**Sono cambiati i dettagli di ogni fase**, perché nella prima versione ciascuna aveva un buco che
si poteva sfruttare. Li abbiamo trovati scrivendo il contratto esattamente come descritto nella
proposta e provando ad attaccarlo: i test sono in
[`prove/originale-attaccato/`](../prove/originale-attaccato/).

| Fase | Quanto è cambiata |
|---|---|
| 1. Registrazione | Stessa idea. In più il dispositivo deve firmare la richiesta |
| 2. Attestazione | Ora il dispositivo firma. La tariffa diventa un deposito che torna indietro |
| 3. Ban | Stessa idea: qualcuno accusa, UMA decide, chi ha ragione è premiato. Cambiano le regole su soldi, tempi ed effetti |

I simboli (`B`, `T_foto`, `T_reveal`, `f`) sono spiegati nel documento 1.

## Fase 1 — Registrazione

> *Prima versione:* "To register a device, an Ethereum account needs to register it, with its own
> public key. The registration fails if the device is banned."

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| Bastava conoscere una chiave pubblica per registrarla | Chiunque poteva registrare la chiave di un altro, farla bannare e renderla inutilizzabile per sempre | Il dispositivo deve **firmare** la richiesta: si registra solo chi possiede davvero la chiave |

**Rimasto com'era:** registrarsi è gratuito, e un dispositivo bannato non si registra di nuovo.

**Un limite che resta, e che conviene sapere.** Dato che registrarsi è gratuito, chi viene bannato
può creare una chiave nuova e rientrare. Il ban gli costa il deposito della foto accusata e la
storia del dispositivo, non l'accesso. La punizione vera è il deposito per foto della fase 2.

## Fase 2 — Attestazione

> *Prima versione:* "The device takes a picture. It asks for attestation to be recorded. The smart
> contract saves the attestation if the device is not banned." Con una tariffa pagata al tesoro.

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| Il dispositivo inviava solo l'hash della foto: la sua chiave non firmava nulla | Chi osservava la rete copiava la richiesta prima che fosse confermata e la inviava a proprio nome. Risultava lui l'autore, e la richiesta onesta veniva rifiutata | Il dispositivo **firma** l'hash della foto. Il contratto controlla la firma. Copiare la richiesta non cambia chi ha firmato |
| Si sapeva solo che la foto esisteva *prima* di un certo blocco | Si poteva attestare oggi una foto vecchia di anni | Il dispositivo firma anche l'**hash di un blocco recente**: il record dice "firmata *dopo* il blocco A e *prima* del blocco B" |
| La tariffa finiva in un tesoro, da cui si pagavano le ricompense | Chi si accusava da solo svuotava il tesoro (vedi fase 3). E qualcuno avrebbe dovuto amministrarlo | Al posto della tariffa c'è un **deposito `B` per ogni foto**. Non va in un tesoro: resta legato a quella foto. Torna indietro dopo `T_foto` se nessuno la accusa; va a chi la accusa se il falso viene dimostrato |

**Perché un deposito e non una tariffa.** Una tariffa deve finire da qualche parte: in un tesoro
(che qualcuno amministra e che si può svuotare) oppure distrutta. Un deposito frena lo spam allo
stesso modo, perché chi attesta molte foto deve tenere bloccati molti soldi, ma non crea una cassa
comune e non costa nulla a chi è onesto.

## Fase 3 — Ban

> *Prima versione:* "A user claims an irregular device exists. The claim is checked in decentralized
> fashion (in this example using UMA but it could be something else). Ban and a reward are issued
> or not depending on the case."

UMA resta l'arbitro. La prima versione però lasciava aperte quasi tutte le domande pratiche.

| Che cosa non andava | Che cosa succedeva nel test | Com'è ora |
|---|---|---|
| La ricompensa veniva pagata dal tesoro | Una sola persona controllava un dispositivo e un conto accusatore: attestava una cosa qualunque, si accusava da sola e incassava, svuotando il tesoro | La ricompensa è **il deposito della foto accusata**. Accusarsi da soli fa sempre perdere la commissione di UMA |
| L'accusa non era legata a un record | Un dispositivo veniva bannato per una foto che non aveva mai attestato | Si può accusare solo una foto che quel dispositivo ha attestato, ed entro `T_foto` |
| Lo stesso dispositivo poteva essere premiato più volte | Più ricompense per una sola foto | Un deposito si perde una volta sola |
| Chi accusava pagava una "tariffa UMA" | In UMA non esiste una tariffa per chi accusa: esiste una cauzione, che si perde se si ha torto | L'accusatore blocca una **cauzione `B`**, uguale al deposito. La perde se l'accusa è respinta |
| In UMA un'affermazione che nessuno contesta vale come vera | Un dispositivo onesto il cui proprietario non guardava veniva bannato | Il contratto porta l'accusa a UMA e **la contesta nello stesso momento** con il deposito della foto: ogni accusa arriva a un voto |
| L'accusa era visibile a tutti prima di essere confermata | Chiunque poteva copiarla e inviarla a proprio nome; anche chi aveva attestato il falso, per limitare la perdita | L'accusa si fa in **due passaggi (commit–reveal)**: prima l'impronta, poi i dati |
| Non era scritto che cosa succede alle foto già attestate dopo un ban | Se il ban le cancellava: un solo errore rendeva inverificabili tutte le foto oneste di quel dispositivo. Se non le cancellava: la foto giudicata falsa restava "attestata" come le altre | La foto accusata è **marcata come falso**. Il dispositivo è **segnalato** e non attesta più. Le altre foto restano com'erano. Nulla viene cancellato |
| Non era scritto chi controlla il contratto | Chi controllava l'arbitro poteva muovere i soldi del tesoro | Il contratto **non ha proprietario** e non si può modificare. Non c'è tesoro |

### Come usiamo UMA, in concreto

UMA funziona così: qualcuno fa un'affermazione e mette una cauzione; se qualcuno la contesta
mettendo una cauzione uguale, decide un voto; chi perde lascia la cauzione, che va a chi vince
meno una commissione per UMA.

Nella versione definitiva:

1. L'affermazione portata a UMA è l'**accusa**: "le prove allegate dimostrano che questa foto non
   è una vera cattura". La cauzione è quella dell'accusatore.
2. Il contratto la **contesta subito** con il deposito della foto. Per questo deposito e cauzione
   devono essere uguali: lo richiede UMA.
3. UMA vota. Per le sue regole risponde sì solo a ciò che si può verificare pubblicamente.
4. UMA paga chi vince; il contratto marca la foto e segnala il dispositivo, oppure lascia tutto
   com'era.

Abbiamo scelto che a dover essere dimostrata sia l'accusa, non la foto. Se fosse il contrario,
chi attesta dovrebbe dimostrare che la propria foto è vera, cosa che nessuno può fare, e
qualunque accusa vincerebbe.

### La domanda posta a UMA

La prima versione chiedeva: *"la foto A è falsa?"*. Guardando solo i pixel, un falso ben fatto non
si distingue: lo dice la traccia stessa ("indistinguishable from genuine camera captures"). Per
questo la domanda è diventata: *"le prove allegate lo dimostrano?"*. Un'accusa viene accolta solo
quando porta prove che chiunque può controllare, per esempio la stessa immagine già pubblicata
prima della data del record. Un falso che non lascia prove di questo tipo non viene preso.

### La revoca della chiave (nuova)

Nella prima versione non c'era. Chi ha in mano la chiave di un dispositivo può farlo segnalare con
una firma. Serve al proprietario a cui hanno rubato o copiato la chiave: senza, una chiave rubata
resterebbe attiva.

## Che cosa non è cambiato

- Le tre fasi e il loro ordine.
- Chiunque può registrare un dispositivo, gratis e senza chiedere il permesso a nessuno.
- Nessun produttore di dispositivi, nessuna autorità che accredita, nessun comitato.
- Il contratto rifiuta registrazione e attestazione di un dispositivo bannato.
- Chiunque può accusare, e chi ha ragione viene premiato.
- Decide UMA.
- La sicurezza poggia sugli incentivi economici.

## Le tre debolezze della traccia, prima e dopo

| Debolezza (slide 10) | Prima versione | Versione definitiva |
|---|---|---|
| Single point of failure | Nessuna autorità che certifica, ma un tesoro e un contratto di cui non si sapeva chi avesse le chiavi | Nessun proprietario, nessun tesoro, nessuna lista di revoca tenuta da qualcuno. Resta la dipendenza da UMA per le accuse |
| Cross-platform lock-in | Rimossa: chiunque registra e verifica | Rimossa, come prima |
| Retroactive censorship | Dipendeva da che cosa faceva il ban, che non era scritto | I record non si cancellano; le decisioni hanno una data e riguardano una foto alla volta |
