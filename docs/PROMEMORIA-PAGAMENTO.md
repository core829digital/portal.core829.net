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

## Collegamento pagamenti ↔ abbonamenti
- Ogni pagamento (fattura) può essere **collegato a un abbonamento** dello stesso cliente: alla creazione («Abbonamento») o dopo, dal menu nella tabella (vale anche sui pagamenti già saldati, per sistemare lo storico).
- Se un pagamento collegato è in scadenza lo stesso giorno del rinnovo, il promemoria delle 10:30 mostra **una sola riga** (il pagamento), non due.
- **Storico:** nella scheda Fatture del cliente compare un riquadro «Collega» quando un pagamento ha lo stesso importo di **un solo** abbonamento: un clic li collega. Nei casi dubbi non propone nulla.
- Nell'elenco abbonamenti: quante fatture sono collegate, quante da saldare, ultimo incasso. Negli elenchi globali e nel portale cliente ogni fattura mostra l'abbonamento.
- Gli abbonamenti possono essere collegati anche a un **progetto** e a un **contratto** (documento) dello stesso cliente.

## Ticket e scadenze collegati
- **Ticket:** quando il cliente apre una richiesta può scegliere «Riguarda» (un suo pagamento, abbonamento o progetto: solo cose che vede nel suo spazio, mai bozze o abbonamenti annullati). Nell'area admin il ticket mostra cosa riguarda e lo si può collegare, cambiare o scollegare (anche con cose che il cliente non vede). Un collegamento a elementi di un altro cliente viene rifiutato.
- **Scadenze manuali:** si possono collegare a una fattura, un abbonamento o un progetto (il cliente si ricava da solo, ed è sempre lo stesso). **Incassando o annullando la fattura, o annullando l'abbonamento, la scadenza collegata si chiude da sola.**
- Nell'elenco dei ticket e nello Scadenziario il collegamento è scritto accanto al titolo.


## PDF della fattura
- Nella tabella Fatture del cliente, colonna **PDF**: **Carica PDF** (solo file PDF, max come gli altri documenti), poi **Apri PDF**, **Sostituisci**, **Stacca**. Funziona anche sulle fatture già pagate.
- Il file passa dal controllo di sicurezza come ogni documento («PDF in controllo…» poi apribile; se viene rifiutato lo vedi scritto).
- Si salva anche tra i **Documenti** del cliente (tipo «Fattura»). Il cliente lo vede lì solo se la fattura è visibile e non è più una bozza: premendo «Segna come inviata» il PDF diventa visibile da solo. Nello spazio del cliente la fattura mostra «Il PDF è disponibile nella sezione Documenti».
- **Stacca** non cancella il file (resta nei Documenti); eliminare il documento stacca il PDF dalla fattura, che resta.

## Portale ⇄ CRM (collegati con due file)
- **Portale → CRM:** pagina **Clienti → Esporta per il CRM** scarica un file; nel CRM **Data → Import from portal** (anteprima, poi importa).
- **CRM → Portale:** nel CRM **Data → Export / Backup → Download backup**; nel portale **Clienti → Importa dal CRM** (anteprima, poi importa). Importa clienti, progetti e fatture. I lead restano nel CRM; i preventivi/servizi del CRM non diventano abbonamenti.
- Entrambe le direzioni: **non cancellano nulla**, si possono ripetere senza doppioni (ogni record ricorda l'id dell'altro sistema), completano i campi vuoti senza sovrascrivere. Le fatture importate nel portale sono **nascoste al cliente e senza email**.
- I file contengono dati personali: tienili privati, mai su GitHub.
