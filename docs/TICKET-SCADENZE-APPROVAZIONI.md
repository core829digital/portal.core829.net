# Ticket, Scadenziario, Approvazioni

## Ticket di assistenza
- **Cliente** (portale → «Assistenza», dietro il codice email): apre una richiesta (oggetto, tipo, messaggio), segue la conversazione, risponde. Una risposta del cliente riapre sempre un ticket chiuso.
- **Noi** (`/admin/tickets`): coda per stato (Da rispondere / In attesa del cliente / In lavorazione / Chiuse), risposta, «Invia e chiudi», cambio stato. Il numero dei ticket «Da rispondere» compare nel menu.
- **Email:** nuovo ticket e risposta del cliente → a noi (la risposta, al massimo una ogni 10 minuti per ticket); nostra risposta e chiusura → al cliente (da `clients@core829.net`, con «Rispondi» verso `hello@core829.net`).
- **Limiti anti-abuso:** 5 ticket aperti e 30 messaggi nelle ultime 24 ore per cliente; testo ripulito (`cleanText`), 4000 caratteri.
- **Sicurezza:** il cliente si ricava dal link, mai da un argomento; ogni lettura/scrittura richiede lo sblocco; ticket di altri clienti = «non trovato».

## Scadenziario (`/admin/deadlines`)
Un solo elenco, per urgenza (Scadute / 7 giorni / 30 giorni / Più avanti), con fatture inviate o scadute, rinnovi di abbonamento, firme e approvazioni in attesa, e le **scadenze manuali** (dominio, hosting, contratto, altro).
- **Promemoria automatici** (ogni 6 ore): al cliente, una volta sola, 3 giorni prima della scadenza di una fattura visibile e non pagata; a noi, una volta sola, 7 giorni prima di una scadenza manuale.
- Orizzonte: 6 mesi. Le scadenze manuali concluse spariscono (si possono riaprire dal database, non dall'elenco).

## Approvazioni (`/admin/approvals`)
- Da scheda cliente → Documenti → **«Richiedi approvazione»** (anche con messaggio). Il documento diventa visibile al cliente; la richiesta vale 30 giorni.
- Il cliente (portale → Documenti, dopo lo sblocco) **approva** (nome + nota facoltativa) oppure **chiede modifiche** (descrizione obbligatoria). La decisione è definitiva: per cambiare, si invia una nuova richiesta.
- Email a noi con la decisione e il commento; tutto è nel registro di audit.
- **Non è una firma**: per la firma elettronica resta il flusso «Richiedi firma».

## Cose da fare dopo il deploy
1. `npx convex deploy` (nuove tabelle e cron).
2. Nessuna nuova variabile: usano `NOTIFY_ADMIN_EMAILS` / `CLIENTS_EMAIL_FROM` già impostate.
3. Nel Centro notifiche i nuovi tipi sono tutti attivi; si possono spegnere uno per uno.
