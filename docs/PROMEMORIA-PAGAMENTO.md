# Promemoria di pagamento

## Cosa fa
1. **Automatico:** ogni giorno, dalle **10:30 ora italiana**, scrive ai clienti che hanno una scadenza **il giorno dopo**: pagamenti emessi e non ancora saldati + rinnovi degli abbonamenti attivi (le rate mensili). **Una sola email per cliente**, anche con più scadenze.
2. **Con un clic** (`/admin/payment-reminders`, menu «Lavoro e incassi»): scegli «Oggi e domani / entro 7 / 14 / 30 giorni», controlli chi riceve l'email e premi **Invia a tutti** (o **Invia ai selezionati**). Prima di partire compare una conferma con il numero di email.

Ogni email contiene l'avviso sui costi aggiuntivi (testo in `PAYMENT_NOTICE`, `convex/lib/notifyKinds.ts`):
> la rata concordata all'inizio del rapporto deve essere saldata entro la scadenza; in caso di mancato pagamento verranno addebitati costi aggiuntivi insieme alla rata successiva, perché per reintegrare i dati è necessario ricostruire il server da capo e configurarlo nuovamente.

Le email partono da `clients@core829.net`, con «Rispondi» verso `hello@core829.net` e copia nascosta nella casella ufficiale; sono tutte registrate nel **Centro notifiche**.

## Come funziona l'orario (10:30)
- Il controllo gira **ogni ora al minuto :30** (cron di Convex) e agisce solo **dalle 10:30 alle 18:59 ora di Roma**, quindi vale sia con l'ora solare sia con l'ora legale (verificato nei test, anche nei giorni del cambio d'ora).
- Se il sistema era fermo alle 10:30, recupera nelle ore successive (fino alle 18:59). Dalle 19:00 non spedisce più: la scadenza passa al giorno dopo.
- «Il giorno dopo» è il giorno di calendario di Roma, non «24 ore da adesso».

## Regole di sicurezza
- **Nessun doppione:** ogni pagamento/rinnovo viene segnato come «già ricordato»; chi ha già ricevuto un promemoria nelle ultime 20 ore non ne riceve un altro (anche con due clic).
- **Clienti esclusi** dalle email automatiche (scheda cliente → Modifica): non ricevono nulla, né automatico né a mano; il clic unico li mostra come «Escluso dalle email».
- **Interruttore** (pagina Promemoria o Centro notifiche): spegne solo l'invio **automatico**; l'invio a mano funziona sempre.
- Non vengono inclusi: documenti in bozza, già saldati, nascosti al cliente, già scaduti; abbonamenti annullati.
- Solo gli amministratori possono vedere l'anteprima e inviare; ogni invio a mano lascia una riga nel registro di audit.

## Da fare dopo il deploy
1. `npx convex deploy` (nuove funzioni e nuovo cron).
2. Controllare che `RESEND_API_KEY` e il mittente `clients@core829.net` siano attivi (vedi `docs/NOTIFICHE.md`).
3. Aprire `/admin/payment-reminders` e verificare l'anteprima.

## Attenzione: il testo sui costi aggiuntivi
L'email **avvisa**, ma i costi aggiuntivi si possono addebitare solo se sono **previsti nel contratto** (es. Master Services Agreement) e il cliente li ha accettati. Verifica che il contratto contenga questa clausola (e un importo o un criterio di calcolo) prima di applicarli. Nell'email non è indicato nessun importo: se vuoi indicarlo, si modifica `PAYMENT_NOTICE`. Non è consulenza legale.

## È l'unico promemoria ai clienti
Il promemoria delle 10:30 del giorno prima è **l'unico** che i clienti ricevono in anticipo. Sono stati tolti l'avviso «3 giorni prima» e il promemoria dei rinnovi con «giorni di anticipo» (campo non più usato).
- Nelle email al cliente di questo flusso **non compare mai la parola «fattura»** (c'è un test che lo verifica): gli elementi sono «Pagamento n. …» e «Rinnovo abbonamento …».
- Resta un promemoria **interno** (solo per noi) per le scadenze manuali dello scadenziario, 7 giorni prima.
- Le email-evento «emessa / pagata / scaduta» restano e si possono spegnere dal Centro notifiche.
