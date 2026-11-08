# Notifiche email e Centro notifiche

Ogni email automatica tra CORE829 e i clienti passa da un solo punto (`convex/lib/notify.ts`) ed è registrata nel **Centro notifiche** (`/admin/notifications`, menu «Sistema»). Per un singolo cliente: scheda cliente → «Email inviate».

## Regola d'oro
Solo interazioni **admin ↔ cliente** (o cliente → noi). Le azioni fatte solo da noi nel portale (bozze, note interne, elementi non visibili al cliente) **non** generano email.

## Cosa viene inviato
| Verso | Evento | Note |
|---|---|---|
| Cliente | Nuova fattura / Pagamento ricevuto / Fattura scaduta | solo se la fattura è visibile al cliente |
| Cliente | Nuovo documento disponibile | dopo il controllo antivirus e solo se visibile |
| Cliente | Aggiornamento di progetto | solo se visibile al cliente |
| Cliente | Report mensile pubblicato | una volta per mese |
| Cliente | Documento da firmare / copia firmata | la copia firmata è in allegato |
| Cliente | Promemoria di rinnovo | inviato dal controllo periodico; qui solo traccia |
| Noi | Nuova richiesta dal sito | |
| Noi | Il cliente ha firmato | con copia firmata in allegato |
| Noi | Il cliente ha aperto il suo spazio | max 1 ogni 12 h per cliente |
| Noi | Il cliente ha sbloccato i documenti | spenta di default; max 1 ogni 6 h |
| Noi | Il cliente ha scaricato un documento / il report | anti-ripetizione 30 min / 1 h |
| Noi | Troppi codici errati (sicurezza) | max 1 l'ora |

Ogni tipo si accende/spegne da **Centro notifiche → Impostazioni**. Ogni cliente può essere escluso dalle email automatiche (scheda cliente → Modifica → «Invia a questo cliente le email automatiche»): in quel caso resta una riga «Saltata» nel registro.

## Mittenti
- **Ai clienti**: `CLIENTS_EMAIL_FROM` (predefinito `CORE829 <clients@core829.net>`). «Rispondi» va a `hello@core829.net` (l'indirizzo del footer di core829.net); una copia nascosta (bcc) arriva alla stessa casella; il testo avvisa che `clients@` non viene letto.
- **A noi**: `AUTH_EMAIL_FROM`, verso `NOTIFY_ADMIN_EMAILS` (se manca, `ADMIN_EMAILS`). Il Centro notifiche avvisa se non c'è nessun destinatario.

## Stati
`In invio` → `Inviata` | `Non inviata` (pulsante **Riprova**) | `Saltata` (con il motivo).

## Sicurezza
- Il testo libero (nome, messaggio…) è escapato nell'HTML.
- I pulsanti nelle email a noi puntano solo a percorsi interni del portale (`/admin/...`); mai indirizzi esterni.
- Le email ai clienti **non contengono mai** il link personale o codici: rimandano al link già ricevuto.
- Solo gli amministratori leggono il registro, cambiano le impostazioni o riprovano un invio.
- Una notifica non fa mai fallire l'azione che l'ha generata.

## Aggiungere un nuovo tipo
1. Aggiungilo in `convex/lib/notifyKinds.ts` (testo, destinatario, anti-ripetizione).
2. Chiama `notify(ctx, "nome", {...})` nella mutazione che produce l'evento.
3. Aggiungi un test in `convex/notifications.test.ts`.
