# Configurazione dell'accesso amministratore

Passaggi una tantum per far funzionare il login dell'area `/admin`. Nessun segreto va scritto in file
del progetto o committato: si impostano solo su Convex (dashboard o comando) e in `.env.local`.

## 1. Prerequisiti
```bash
git pull origin claude/clever-cannon-8ohfai
npm install
npx convex dev        # lascialo in esecuzione in un terminale
```

## 2. Chiavi di firma e indirizzo del sito (comando ufficiale di Convex Auth)
In un secondo terminale:
```bash
npx @convex-dev/auth --web-server-url http://localhost:3000
```
Imposta sul deployment `JWT_PRIVATE_KEY`, `JWKS` e `SITE_URL`. Se chiede di modificare file, **rispondi di no**:
sono gia' presenti. Poi controlla con `git status` che non abbia cambiato `convex/auth.ts`, `convex/http.ts` o
`convex/schema.ts`; se lo ha fatto, ripristinali con `git checkout -- convex/`.

## 3. Variabili del deployment Convex
Dalla dashboard di Convex: **Settings → Environment Variables** (cosi' la chiave non finisce nella cronologia del terminale).

| Nome | Valore | Note |
|---|---|---|
| `ADMIN_EMAILS` | `tua-email@dominio.it` | Elenco separato da virgole. Solo questi indirizzi ricevono il codice. |
| `AUTH_EMAIL_FROM` | `CORE829 Portale <portal@core829.net>` | Il dominio deve essere verificato su Resend. Serve sia per il login admin sia per i codici ai clienti. |
| `RESEND_API_KEY` | chiave API di Resend | **Segreta.** Si crea su resend.com con permesso "Sending access". |
| `SITE_URL` | `http://localhost:3000` (poi `https://portal.core829.net`) | Lo imposta gia' `npx @convex-dev/auth`. Serve al CORS dei download. In produzione va aggiornato. |
| `VIRUSTOTAL_API_KEY` | chiave API di VirusTotal | **Facoltativa e segreta.** Attiva il confronto dell'impronta dei file con malware noto (non invia i file). |

## 4. Variabili di Next.js (`.env.local`, non committato)
```
NEXT_PUBLIC_CONVEX_URL=...        # la scrive gia' `npx convex dev`
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
Le variabili `NEXT_PUBLIC_*` vengono incorporate nel codice **durante la build**: su Vercel vanno impostate prima
del deploy, non dopo.

## 4b. Solo con dominio personalizzato per Convex
I download usano l'indirizzo `https://NOME.convex.site`, che si ricava da solo da `NEXT_PUBLIC_CONVEX_URL`. Se il deployment ha un
dominio personalizzato, imposta anche `NEXT_PUBLIC_CONVEX_SITE_URL` (prima della build).

## 4c. Webhook di Resend (facoltativo, consigliato)
Serve a sapere se un codice o un'email non e' stata recapitata (indirizzo sbagliato, spam).
1. Resend → **Webhooks** → aggiungi l'endpoint `https://NOME.convex.site/webhooks/resend` (stesso NOME del deployment).
2. Scegli gli eventi di recapito (respinta, segnalata come spam, in ritardo, fallita; controlla i nomi nel pannello).
3. Copia il **Signing Secret** (inizia con `whsec_`) e salvalo su Convex come `RESEND_WEBHOOK_SECRET` (dalla dashboard).
4. Invia l'evento di prova dal pannello di Resend: deve risultare consegnato (200).
Facoltativo: `WEBHOOK_IP_ALLOWLIST`. Leggi prima i limiti in `docs/SECURITY.md` (sezione Webhook).

## 5. Primo amministratore
```bash
npx convex run admins:bootstrap '{"email":"tua-email@dominio.it"}'
npx convex run health:cryptoSelfTest
```
Il secondo comando deve restituire quattro valori `true`.

## 6. Prova
Apri `http://localhost:3000/admin`, inserisci la tua email, leggi il codice a 8 cifre ricevuto e accedi.

## Se qualcosa non va
- **Nessuna email:** l'indirizzo non e' in `ADMIN_EMAILS` (per sicurezza il sistema non lo dice), oppure la chiave o il
  mittente di Resend non sono validi. Guarda i log in Convex → Logs.
- **«Accesso non autorizzato» dopo il login:** manca la riga in `admins` (rilancia il `bootstrap`).
- **Errore «Missing environment variable NEXT_PUBLIC_CONVEX_URL»:** la variabile non c'era al momento della build.
