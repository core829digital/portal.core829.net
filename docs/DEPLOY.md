# Messa online e uso quotidiano

Da fare **dopo** i passi di `docs/SETUP.md` (chiavi Convex Auth, variabili, primo amministratore).

## 1. Convex in produzione

1. Nel terminale del progetto: `npx convex deploy` (crea/aggiorna il deployment di **produzione**, separato da quello di sviluppo).
2. Nella dashboard Convex, sul deployment di produzione, imposta le stesse variabili di `SETUP.md` (`ADMIN_EMAILS`, `RESEND_API_KEY`,
   `AUTH_EMAIL_FROM`, `SITE_URL=https://portal.core829.net`, ed eventualmente `RESEND_WEBHOOK_SECRET`, `WEBHOOK_IP_ALLOWLIST`,
   `VIRUSTOTAL_API_KEY`). Le chiavi vanno **solo qui**, mai nel repository.
3. Registra il primo amministratore: `npx convex run --prod admins:bootstrap '{"email":"tua@email"}'`.

## 2. Vercel

1. Importa il repository `core829digital/portal.core829.net` in Vercel (framework Next.js, regione gia' fissata in `vercel.json`).
2. Variabili d'ambiente di Vercel (Production): `NEXT_PUBLIC_CONVEX_URL` (indirizzo del deployment di produzione),
   `NEXT_PUBLIC_APP_URL=https://portal.core829.net`. Per far costruire anche Convex da Vercel si puo' usare
   `npx convex deploy --cmd "npm run build"` come comando di build, con `CONVEX_DEPLOY_KEY` impostata in Vercel.
3. Dominio: in Vercel > Domains aggiungi `portal.core829.net` e crea il record DNS indicato (CNAME). HTTPS e' automatico.
4. Vercel > Firewall: limite di richieste per IP su `/c` e `/admin/login`; blocco del metodo TRACE.
5. Webhook Resend (facoltativo): endpoint `https://<deployment>.convex.site/webhooks/resend`, segreto in `RESEND_WEBHOOK_SECRET`.

## 3. Controllo dopo la pubblicazione

- `https://portal.core829.net/c` mostra l'invito ad aprire il link personale; `/admin` porta al login.
- Accedi con il codice ricevuto per email; crea un cliente di prova, genera il link, aprilo in una finestra privata.
- Carica un PDF, sblocca con il codice, scaricalo dal portale cliente.
- Controlla le intestazioni su https://securityheaders.com (obiettivo A o superiore).
- Prova a mano Firefox e Safari (non verificabili in automatico).

## 4. Backup

- Convex: dashboard > Settings > Backups (backup giornalieri/settimanali) e, a mano prima di modifiche grandi,
  `npx convex export --prod --include-file-storage --path backup.zip`. Conserva il file fuori dal repository e fuori dal PC di lavoro.
- Prova una volta il ripristino in un deployment di prova (`npx convex import`): un backup mai provato non e' un backup.

## 5. Uso quotidiano

- **Nuovo cliente:** Clienti > Nuovo cliente > aggiungi progetti, fatture (importo + PDF), abbonamenti, documenti > Link di accesso.
- **Invio del link:** il link si mostra una sola volta alla creazione; invialo al cliente (email/WhatsApp). Per revocarlo: pannello Link > Revoca.
- **Il cliente** apre il link, inserisce il codice a 6 cifre ricevuto per email e vede solo i propri dati, in sola lettura.
- **Pagina personalizzata:** Clienti > Pagina > componi i blocchi (testo, elenchi, link https).
- **Documenti respinti:** se un file non supera i controlli compare il motivo; non viene mai reso scaricabile.

## 6. Periodicamente

- Controlla le richieste di aggiornamento di Dependabot e il risultato di CI (verde = ok).
- Ruota le chiavi (Resend, VirusTotal, segreto webhook) almeno una volta l'anno o dopo ogni sospetto di fuga.
- Leggi il registro di audit per accessi insoliti.
