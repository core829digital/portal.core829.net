# Backoffice del sito core829.net

Dal menu **Sito core829.net** dell'area admin gestisci il sito pubblico (repo `core829.net-new`):

| Pagina | Cosa fa |
|---|---|
| **Panoramica** | richieste da gestire, visite (con consenso analytics), SEO personalizzate, avviso attivo |
| **Richieste dal sito** | i messaggi del modulo contatti; rispondi, segna come gestita/spam, **crea il cliente** con un clic (note comprese), elimina |
| **SEO** | titolo, descrizione e «nascondi ai motori» per ogni pagina e lingua (24); «Tutte le lingue» vale dove manca il testo |
| **Avviso in testata** | una riga in cima a tutte le pagine (chiusure, novità) |

(Il backoffice nasce dall'idea di quello di Andromedia Web, ma è pensato per core829.net. Andromedia Web è un cliente come gli altri: nessun collegamento al suo database.)

## Come comunicano sito e portale
- **Sito → portale (firmato):** il server del sito invia al portale i messaggi (`POST /site/contact`) e le visite (`POST /site/event`) con firma HMAC «Standard Webhooks» (stessa del collegamento B2B): senza firma valida, risposta generica 401. Il visitatore non parla mai con il portale.
- **Portale → sito (pubblico, sola lettura):** `GET /site/config` restituisce SEO e avviso, solo testi pensati per il sito. Il sito li legge dal server e li tiene in cache 5 minuti.
- Se il portale non risponde il sito **non si rompe**: usa i testi predefiniti, e il modulo contatti continua a inviare l'email come prima (il portale è una copia in più).

## Collegamento (una volta sola)
1. Genera un segreto: `openssl rand -base64 32`; il segreto è `whsec_` + quel valore.
2. **Convex del portale** (produzione): `SITE_BRIDGE_SECRET` = `whsec_…`.
3. **Vercel del sito** (Production): `PORTAL_SITE_URL` = indirizzo Convex HTTP del portale (`https://<deployment>.convex.site`), `SITE_BRIDGE_SECRET` = lo stesso `whsec_…`. Redeploy.

## Privacy
- Le **visite** sono solo contatori giornalieri per pagina e lingua: nessun IP, nessun identificativo. Il sito li invia **solo se il visitatore ha accettato i cookie analitici**. Fate verificare la dicitura nella privacy policy.
- Le **richieste dal modulo contatti** contengono dati personali: eliminarle quando non servono più (pulsante «Elimina»).
