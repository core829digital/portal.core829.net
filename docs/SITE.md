# Backoffice di Andromedia Web dentro il portale

Dal menu **Sito Andromedia Web** dell'area admin gestisci il sito andromediaweb.it senza usare il suo vecchio `/admin`:
panoramica (visite, clic, pagine più viste), **Blog**, **Portfolio**, **Messaggi** del modulo contatti, **Contenuti** (dati generali, pagina iniziale, FAQ), **SEO** per pagina, **Sicurezza e registro**.

## Come funziona (il «ponte»)

I dati restano nel database del sito (un altro deployment Convex): il sito pubblico continua a funzionare senza modifiche.
Il portale parla con quel database **dal server** (mai dal browser):

1. entri nel portale come amministratore (codice via email);
2. ogni azione del backoffice controlla *per prima cosa* che tu sia amministratore;
3. poi chiama il database del sito con la **firma** (SHA-256 del segreto condiviso) che il sito già richiede per ogni scrittura;
4. ogni modifica finisce nel registro del sito e nel registro attività del portale.

## Collegamento (una volta sola)

Su **Convex del portale** (dashboard → produzione → Settings → Environment Variables):

| Variabile | Valore |
|---|---|
| `AW_CONVEX_URL` | indirizzo del Convex di Andromedia Web, `https://….convex.cloud` (lo trovi nel `.env.local` del sito: `NEXT_PUBLIC_CONVEX_URL`) |
| `AW_CONVEX_GUARD` | **lo stesso segreto** che il sito ha come `AW_CONVEX_GUARD` (nel suo `.env.local` e su Vercel). Il sito, su Convex, ha `AW_GUARD_DIGEST` = SHA-256 di quel segreto: non va cambiato |

Se mancano o non coincidono, le pagine mostrano un messaggio che dice cosa controllare («firma rifiutata» = i due segreti sono diversi).

## Cose da sapere

- **Il vecchio `/admin` del sito resta attivo** finché non lo spegni; conviene toglierlo (e le sue credenziali predefinite in `src/lib/admin-credentials.ts`) quando passi al portale.
- **Messaggi e articoli sono leggibili da chiunque conosca l'indirizzo Convex del sito** (le funzioni `messages:list`, `posts:list` non hanno controlli): i messaggi contengono nomi ed email dei visitatori. Consiglio: nel repository del sito proteggere `messages:list` con la stessa guardia (o spostarla in una funzione interna) e leggerla solo dal ponte.
- Le immagini di copertina e del portfolio si caricano nell'archivio del sito tramite un indirizzo temporaneo generato dal ponte.
- Le statistiche (visite/clic) le registra il sito con il suo tracker: qui si leggono e si possono pulire quelle oltre 90 giorni.
