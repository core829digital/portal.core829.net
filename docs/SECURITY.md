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

## Il link del cliente
- Formato `https://portale/c#<token>`: il segreto sta **dopo il `#`**, che i browser non inviano mai al server. Non finisce
  quindi nei log di Vercel, nelle intestazioni Referer ne' nelle richieste dei programmi che scansionano i link nelle email.
- Appena letto, il token viene **tolto dall'indirizzo** (`history.replaceState`) e conservato solo in `sessionStorage`
  (muore con la scheda). Mai in `localStorage` o nei cookie. Verificato in Chromium.
- Token da 256 bit, salvato sul server solo come hash; scade (default 90 giorni) e si revoca subito dall'area admin.
- Contratti e fatture richiedono in piu' un **codice a 6 cifre via email** (5 tentativi per codice, 3 codici ogni 15 minuti,
  10 al giorno). Il codice in chiaro esiste solo in memoria nell'azione che spedisce l'email: non e' salvato ne' passato
  come argomento di una funzione pianificata (c'e' un test che lo verifica).
- Limite onesto: chi ha il link vede stato, importi e abbonamenti senza altri controlli. E' una scelta di semplicita';
  se il link viene inoltrato per errore si **revoca** e se ne crea uno nuovo.

## Webhook (eventi di Resend)
Endpoint `POST /webhooks/resend` sul dominio `.convex.site`: riceve gli esiti di recapito delle email (respinta, segnalata
come spam, in ritardo, fallita) e li annota nel registro del cliente interessato (senza l'indirizzo email).

**Difese, in quest'ordine** (ogni rifiuto e' un `401` identico, senza dire quale controllo e' fallito):
1. dimensione massima 64 KB (`413`);
2. *facoltativo* lista di IP consentiti;
3. **firma HMAC-SHA256** secondo lo standard Standard Webhooks (intestazioni `webhook-id`, `webhook-timestamp`,
   `webhook-signature` o alias `svix-*`), confronto a tempo costante. Verificata con un vettore generato da un'implementazione
   indipendente;
4. **timestamp entro 5 minuti** (passato e futuro): un messaggio intercettato non si puo' riusare dopo;
5. **idempotenza**: ogni evento ha un id unico, un messaggio ripetuto risponde 200 ma non viene rielaborato;
6. solo cinque tipi di evento vengono elaborati; gli altri si accettano e si ignorano.
Senza `RESEND_WEBHOOK_SECRET` l'endpoint rifiuta tutto (`503`). Provato: tolte una alla volta firma, anti-replay e finestra di
tempo, ogni volta un test ha fallito.

**Lista di IP consentiti: cosa si puo' e cosa non si puo' garantire**
- Il codice la supporta (`WEBHOOK_IP_ALLOWLIST`, indirizzi singoli e CIDR IPv4/IPv6, *fail closed*: IP assente o non valido = rifiuto),
  ma e' **disattivata di default** e **non e' la difesa principale**: lo e' la firma.
- L'IP arriva dall'intestazione `X-Forwarded-For`. **Non e' verificato come Convex la valorizzi.** Se la accoda, il primo
  elemento potrebbe essere scelto dal chiamante e l'elenco non proteggerebbe; se non la imposta, con l'elenco attivo
  verrebbero rifiutati anche i messaggi veri. Prima di attivarla, prova con un evento di test di Resend e controlla.
- Per una vera applicazione per IP serve un firewall **davanti** al server. Gli indirizzi da consentire vanno presi dalla
  documentazione ufficiale di Resend/Svix, non da questo documento (cambiano).

## Caricamento e download dei documenti
**Percorso di un file:** caricamento -> registrazione (controlli rapidi) -> scansione -> `pulito` oppure `respinto`.
Fino alla fine della scansione il file e' `in controllo` e **non e' scaricabile da nessuno**.

**Controlli sul contenuto** (sul server, senza fidarsi di nome o tipo dichiarati dal browser):
1. solo PDF, PNG, JPEG, DOCX, XLSX; massimo 15 MB; file vuoti rifiutati;
2. si leggono i **primi byte** per capire cosa e' davvero il file;
3. gli **eseguibili** (Windows, Linux, macOS, script) sono rifiutati anche se rinominati `.pdf`;
4. l'estensione deve corrispondere al contenuto (una `.png` con dentro un PDF e' rifiutata);
5. PDF con `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/RichMedia` (anche con nomi offuscati `#xx`) sono rifiutati;
   DOCX/XLSX con macro (`vbaProject`) o senza la struttura Office sono rifiutati;
6. **opzionale**: l'impronta SHA-256 si confronta con VirusTotal (`VIRUSTOTAL_API_KEY`). Si invia **solo l'impronta, mai il file**.

**Download del cliente:** endpoint `POST /portal/download` (segreti nel corpo, mai nell'URL). Ogni richiesta e' autorizzata
da capo: link valido + sessione di sblocco (codice via email) + documento del cliente, visibile e `pulito`. **Un solo errore
(404) per qualunque rifiuto.** Il file e' sempre servito come `attachment` con `nosniff` e `CSP sandbox`; CORS limitato al sito
del portale; ogni download finisce nel registro di audit. Provato: tre protezioni rimosse una alla volta, un test ha fallito per ognuna.

**Limiti onesti**
- Sono controlli **euristici**, non un antivirus. Un PDF con codice nascosto in flussi compressi (ObjStm) o un file Office
  costruito ad arte potrebbero non essere riconosciuti. Mitigazioni: tipi ammessi pochissimi, file mai aperti nel sito, scaricati
  solo con link + codice, e (se attivo) controllo dell'impronta contro malware noto. Un file "sconosciuto" a VirusTotal non e' "sicuro".
- Se VirusTotal non risponde si va avanti (gli altri controlli sono gia' passati); l'impronta resta salvata per verifiche successive.
- Se l'amministratore carica un file ma chiude la pagina prima di registrarlo, resta un file **non referenziato** nello storage:
  non e' raggiungibile da nessun cliente, ma occupa spazio. Pulizia automatica da valutare in Fase 9.
- Per alcuni browser un nome file con lettere accentate puo' diventare generico: il nome di salvataggio e' sempre ASCII.

## Pagina componibile (widget)
- L'amministratore sceglie per ogni cliente quali blocchi mostrare e in che ordine. I blocchi liberi (avviso, link utili,
  contatti) contengono **solo testo**: validato sul server (lunghezze, caratteri invisibili, massimo 20 blocchi e 10 link),
  salvato com'e' e mostrato sempre con l'escape di React. Provato nel browser: un testo con `<script>` e `<img onerror>` appare
  come testo, nessun codice viene eseguito.
- I link ammessi sono **solo https** e senza credenziali, controllati al salvataggio e di nuovo in visualizzazione; si aprono con
  `noopener noreferrer`.
- L'anteprima dell'admin usa la stessa funzione che costruisce i dati del cliente: mostra esattamente cio' che il cliente vedra'.

## Accesso dell'amministratore
- **Codice a 8 cifre via email** (Resend), valido 10 minuti, nessuna password da rubare o riutilizzare.
- Il codice parte **solo** verso gli indirizzi in `ADMIN_EMAILS`: per gli altri la risposta e' identica e non succede nulla
  (non si scopre chi e' amministratore e il dominio non si puo' usare per spedire email a chiunque).
- Per contare come amministratore servono: sessione valida, **email verificata con il codice**, email presente nella
  tabella `admins`. Test e prova di rottura per ciascuna condizione.
- Sessione: 12 ore al massimo, 2 senza attivita'; al massimo 5 codici errati all'ora per account.
- **Nota onesta:** `@convex-dev/auth` e' ancora in versione 0.0.x (pre-1.0). L'abbiamo scelto per semplicita' e perche'
  l'autorizzazione vera resta nel nostro codice (`requireAdmin`), ma va tenuto aggiornato e riesaminato prima del lancio.

## Interfaccia e CSP
- Le librerie di interfaccia che inseriscono stili vanno gestite con il **nonce** (Base UI: `CSPProvider`, vedi `UiProvider`).
  Le notifiche sono scritte in casa (`src/lib/toast.ts`) perche' la libreria precedente iniettava stili senza nonce.
- Verificato in Chromium in produzione: zero violazioni CSP nel login, e con dialog, schede e notifiche.

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

## Browser supportati e configurazioni manuali su Vercel

- **Provati in un browser reale:** Chromium (desktop) e un profilo Android. Firefox e Safari/WebKit sono configurati in
  `playwright.config.ts` ma non eseguibili in questo ambiente: vanno provati a mano prima del lancio.
- **Regione:** `vercel.json` fissa Francoforte (`fra1`), vicina ai clienti italiani.
- **Da attivare nel pannello Vercel (non si puo' fare da codice):** Firewall con limite di richieste per indirizzo IP
  (consigliato su `/c` e `/admin/login`) e blocco del metodo TRACE.

