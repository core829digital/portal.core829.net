# Sicurezza del portale clienti

Documento vivo: elenca cosa e' **gia' implementato e verificato**, cosa e' **pianificato** e i **limiti noti**.
Non promette sicurezza assoluta: riduce il rischio e rende le scelte verificabili.

## Modello di accesso
- **Cliente:** apre un link personale (token casuale da 256 bit). Vede stato, progetti, importi e abbonamenti
  in sola lettura, senza login. Per **contratti e fatture** serve un codice a 6 cifre ricevuto via email.
- **Amministratore (Stefan):** accesso autenticato, unico a poter creare o modificare dati.
- Il token nel link viene salvato **solo come hash** nel database; il link si puo' revocare e scade.

## Stato per voce OWASP Top 10 (2021)
| Voce | Misure | Stato |
|---|---|---|
| A01 Controllo degli accessi | `requireAdmin` come prima istruzione di ogni funzione admin; il portale ricava il cliente solo dal link, risposte costruite campo per campo; test "il cliente A non legge il cliente B" | **Fatto e testato** |
| A02 Crittografia | HTTPS forzato (HSTS); token (256 bit), sessioni e codici salvati solo come hash SHA-256; confronto a tempo costante | **Fatto e testato** |
| A03 Injection / XSS | Validatori Convex, `cleanText` (normalizzazione, invisibili/bidi, lunghezze), `escapeHtml`, CSP con nonce, lint contro `dangerouslySetInnerHTML` ed `eval` | **Fatto e testato** |
| A04 Design insicuro | Link magico + codice per i documenti, scadenze, revoca, limiti di tentativi | Dati e regole fatti (Fase 2); interfaccia Fase 4 |
| A05 Configurazione errata | Header di sicurezza, `X-Powered-By` disattivato, errori generici senza dettagli tecnici, `noindex` | **Fatto e verificato su server reale** |
| A06 Componenti vulnerabili | `npm audit --omit=dev` in CI, Dependabot settimanale | **Fatto** |
| A07 Autenticazione | 5 tentativi per codice, codice valido 10 minuti, max 3 codici ogni 15 minuti e 10 al giorno per link (circa 50 tentativi/giorno su 1.000.000 di combinazioni) | **Fatto e testato** |
| A08 Integrita' | Controllo anti Trojan Source in CI, lockfile, webhook con firma HMAC | Controllo fatto, webhook Fase 7 |
| A09 Log e monitoraggio | Registro di audit di ogni azione admin e di accessi/codici del cliente; vietati segreti nei metadati | **Fatto e testato** |
| A10 SSRF | Nessuna richiesta server verso URL forniti dall'utente; i link esterni passano da `cleanHttpsUrl` (solo https) | Fatto |

## Header e CSP (verificati con `next start`)
HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
(il link contiene un segreto: non deve finire nel Referer), `Permissions-Policy`, COOP/CORP, `X-Robots-Tag: noindex`.
La CSP e' generata per richiesta in `src/proxy.ts` con nonce nuovo a ogni risposta, `strict-dynamic`,
`frame-ancestors 'none'`, `object-src 'none'` e `connect-src` limitato al deployment Convex.

## Cosa NON si puo' garantire
- **Antivirus / "trojan":** si riduce il rischio (tipi di file ammessi, controllo del contenuto, scansione esterna,
  quarantena), ma nessuna scansione e' infallibile. Fase 6.
- **Allowlist IP per i webhook:** va applicata dal **firewall di Vercel**; controllare l'IP nel codice non basta,
  perche' l'header si puo' falsificare. Fase 7 e 9.
- **Limitazione delle richieste (rate limiting):** non e' fatta nel proxy (in ambiente serverless la memoria non e'
  condivisa). Si combinano limiti nei dati (tentativi per codice) e regole del firewall di Vercel. Fase 9.
- **Bilanciamento del carico:** gestito da Vercel e Convex; non c'e' un load balancer da configurare a mano.

## Limiti noti
- Il metodo HTTP `TRACE` produce una risposta 500 invece di 405 (nessuna fuga di dati). Da bloccare con una
  regola del firewall di Vercel in Fase 9.

## Dettagli di progettazione importanti
- **Errori e scritture in Convex:** un errore lanciato in una mutazione annulla tutte le sue scritture. Per questo
  i tentativi errati di codice *restituiscono un risultato* invece di lanciare: altrimenti il contatore sparirebbe e
  si potrebbe provare all'infinito. Esiste un test dedicato.
- **Scadenze senza orologio nelle query:** le query di Convex non devono leggere l'ora. La scadenza dei link e
  delle sessioni e' applicata da lavori periodici (`convex/crons.ts`, ogni 10 minuti): una scadenza puo' quindi
  applicarsi con un ritardo massimo di circa 10 minuti. La **revoca** manuale e' invece immediata.
- **Stesso errore per ogni link non valido:** inesistente, scaduto, revocato o malformato non si distinguono.
- **Elenchi sempre limitati** (`take`), mai `collect()` senza limite.

## Comandi da conoscere (dopo il collegamento a Convex)
- Primo amministratore: `npx convex run admins:bootstrap '{"email":"nome@dominio.it"}'`
- Prova della crittografia nel runtime reale: `npx convex run health:cryptoSelfTest` (tutti i valori devono essere `true`)

## Regole per chi sviluppa
1. Mai `dangerouslySetInnerHTML`, `eval`, `new Function` (il lint lo vieta).
2. Ogni funzione Convex ha validatori degli argomenti e verifica l'identita' lato server, mai da un argomento.
3. Mai restituire documenti interi al cliente: solo campi scelti esplicitamente.
4. Mai committare `.env*` (tranne `.env.example`) ne' scrivere segreti nel codice.
5. Prima di ogni commit: `npm run check`.
