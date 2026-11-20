# 3. Limiti e dipendenze

Paprika non dipende da produttori di dispositivi. Questa scelta ha un prezzo, e qui lo scriviamo
per intero: da che cosa dipende invece, che cosa non riesce a fare, e come si confronta con ORIGO
proprio su questo punto. I simboli (`B`, `T_foto`, `T_reveal`, `f`) sono spiegati nel
[documento 1](1-come-funziona.md).

## Da chi dipende Paprika

| Da chi | Dipende? | In che modo |
|---|---|---|
| Produttori di dispositivi | **No** | Nessuno certifica i dispositivi. Chiunque registra una chiave |
| Un comitato o un'autorità che accredita | **No** | Non esiste |
| Un amministratore del contratto | **No** | Il contratto non ha proprietario e non si può modificare |
| Un tesoro o una cassa comune | **No** | Non esiste. I soldi sono solo depositi e cauzioni dei singoli |
| Qualcuno che sorvegli la blockchain per difendere gli onesti | **No** | Ogni accusa arriva a un voto: nessuna foto è condannata per silenzio |
| **UMA** | **Sì** | Decide le accuse. È la dipendenza principale: vedi sotto |
| **La blockchain** | **Sì** | Custodisce record e depositi. Deve essere una rete pubblica perché le garanzie valgano |
| **Chi possiede il dispositivo** | **Sì** | Deve custodire la chiave. Se gliela rubano può solo revocarla |

### La dipendenza da UMA

| Domanda | Risposta |
|---|---|
| Chi decide, in pratica? | Chi possiede il token UMA, con un voto pubblico |
| Quanto ci mette? | Su una rete vera, da 48 a 72 ore per ogni accusa |
| Può sbagliare? | Sì. Se accoglie un'accusa falsa, una foto vera viene marcata come falso, chi l'ha attestata perde `B` e il dispositivo è segnalato. Gli altri record restano |
| Si può corrompere? | Chi controlla abbastanza voti può pilotare una decisione. La sicurezza del voto è quella di UMA, non la nostra |
| Che cosa lo limita? | Ogni decisione riguarda una sola foto. UMA non può cancellare record, non può toccare altre foto, non può cambiare le regole |
| Chi fissa `f` e la cauzione minima? | UMA. Noi scegliamo `B`, che non può stare sotto il minimo di UMA |
| E nella demo? | I contratti di UMA sono quelli veri, pubblicati su una blockchain locale. Il voto è simulato con lo strumento che UMA usa sulle reti di prova: l'esito lo inseriamo noi |

In sintesi: **Paprika sposta la fiducia dai produttori a UMA e al deposito.** Non la elimina.

## Che cosa Paprika non riesce a fare

| Limite | In parole semplici |
|---|---|
| **Non dimostra che la foto viene da una fotocamera** | Un dispositivo registrato può firmare un'immagine generata. È la conseguenza diretta di non avere produttori |
| **Prende solo i falsi che lasciano prove pubbliche** | Se nessuno può dimostrare che l'immagine è falsa, l'accusa viene respinta e il falso resta attestato |
| **Solo entro `T_foto`** | Dopo quel tempo il deposito è tornato indietro e non c'è più nulla da togliere a chi ha attestato |
| **La punizione è limitata dal deposito** | Chi attesta un falso rischia al massimo `B`. Se il falso gli rende di più, il deposito non lo ferma |
| **Chi teme di essere scoperto può limitare la perdita** | Può accusarsi da solo, con le prove vere, prima che lo faccia un altro: perde `f×B` invece di `B` |
| **Il ban costa poco** | Registrarsi è gratuito: chi viene segnalato rientra con una chiave nuova. Perde il deposito di quella foto e la storia del dispositivo |
| **Capitale bloccato in proporzione all'uso** | Chi attesta N foto tiene bloccato N × `B` per il tempo `T_foto` |
| **Le foto di un dispositivo sono collegabili fra loro** | Chiunque vede quali foto ha attestato un dispositivo e quale conto lo ha registrato |
| **Vale solo per il file identico** | Una copia ricompressa o ritagliata, per il protocollo, è un'altra foto |
| **La foto di uno schermo** | Un dispositivo che fotografa un'immagine falsa su uno schermo produce un record regolare |
| **Il contratto non si può correggere** | Se c'è un difetto, bisogna pubblicarne uno nuovo |

## Quanto protegge il deposito

Chiamiamo `p` la probabilità che qualcuno dimostri un falso entro `T_foto`, e `G` quello che il
falso rende a chi lo attesta.

- Chi attesta un falso e viene scoperto perde `B`.
- Se si accusa da solo per primo perde solo `f×B`.

Il deposito scoraggia quindi i falsi per cui `G` è minore di `p × f × B` nel caso peggiore, e
minore di `p × B` nel caso migliore.

Due conseguenze:

1. **`B` va scelto in base a quanto vale ciò che si protegge.** Un deposito piccolo ferma solo
   falsi di poco valore. Un deposito grande esclude chi non può bloccare quella somma per ogni
   foto.
2. **`p` non lo conosce nessuno.** Gli studi che abbiamo trovato dicono che persone e programmi
   riconoscono male le immagini generate guardando solo i pixel. Paprika funziona meglio dove un
   falso lascia tracce verificabili: foto riciclate, immagini già pubblicate altrove.

Paprika è quindi adatto a contesti dove un falso vale poco e spesso lascia tracce, come gli
annunci di vendita. Non basta per notizie, elezioni o prove legali.

## Paprika e ORIGO sulla dipendenza dai produttori

| | ORIGO | Paprika |
|---|---|---|
| Chi deve esistere perché il sistema dica qualcosa | Almeno un produttore che registra le chiavi dei suoi dispositivi, più chi ammette i produttori (2 registrar su 3) | Nessuno: basta il contratto. Per le accuse, UMA |
| Di chi ci si fida | Del produttore: che registri solo dispositivi veri e che le chiavi non escano dall'hardware | Di UMA, e del fatto che chi attesta ha soldi da perdere |
| Che cosa dimostra un record | Che ha firmato una chiave garantita da un produttore ammesso | Che ha firmato una chiave registrata, con un deposito in gioco |
| Legame con una fotocamera vera | Sì, tramite la parola del produttore | No |
| Chi può entrare | Chi ha un dispositivo di un produttore ammesso | Chiunque |
| Chi revoca | I registrar | UMA per una foto accusata; chi ha la chiave, per la propria chiave |
| Privacy delle foto | Le foto di un dispositivo non sono collegabili da chi non ne conosce la chiave | Sono collegabili da chiunque |
| Punto debole principale | La dipendenza da produttori e registrar | Nessuna prova di origine fisica; dipendenza da UMA |

Sono due risposte diverse alla stessa traccia. ORIGO dà una garanzia più forte e accetta di
fidarsi dei produttori. Paprika non si fida di nessun produttore e accetta una garanzia più
debole, di tipo economico.

## Come dirlo, e come non dirlo

Si può dire:

1. Un record dimostra che un dispositivo registrato ha firmato questo esatto file in un intervallo
   di tempo noto, e che chi l'ha attestato ha messo un deposito in gioco.
2. Nessun produttore, comitato o amministratore può decidere chi partecipa né cancellare un record.
3. Chi attesta un falso che lascia prove pubbliche perde il deposito, e chi lo dimostra viene
   pagato.

Non si deve dire:

1. "Paprika riconosce i falsi."
2. "Un record prova che la foto viene da una fotocamera vera."
3. "Il deposito garantisce che nessuno bari."
