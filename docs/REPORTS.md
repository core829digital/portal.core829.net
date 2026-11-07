# Report mensili del cliente

Ogni mese puoi preparare per ogni cliente un report con i numeri dei servizi che ha acquistato. Il cliente lo vede nel suo spazio (voce **Report**) e lo scarica in PDF.

## Come si prepara (area admin)

1. Clienti → scegli il cliente → **Report mensili** → scegli il mese → *Apri / crea*.
2. Scrivi il **commento del mese** e i **prossimi passi**.
3. Apri i servizi del cliente e inserisci solo i numeri che hai: *Sito web* (visite, visitatori, rimbalzo, durata, contatti, Google), *Social* (Instagram, Facebook, TikTok, LinkedIn, YouTube: follower, copertura, interazioni, video…), *Pubblicità online*, *Email marketing*, *Eventi foto/video*, *Sviluppo software*, *Risultati per la tua attività*, più metriche **personalizzate** (nome + tipo di valore).
4. Accanto a ogni numero vedi il confronto col mese prima. Con **Importa da Excel / CSV** puoi caricare un file con il nome della metrica nella prima colonna e il valore nella seconda (es. «Visite al sito» | 1520, «Instagram Follower totali» | 2300): i nomi riconosciuti si compilano da soli, gli altri ti vengono elencati.
5. **Salva** (resta bozza, il cliente non la vede) → **Salva e pubblica** quando è pronto. *Ritira dal cliente* la toglie dalla vista.

Il portale aggiunge da solo, senza che tu inserisca nulla: pagamenti ricevuti nel mese, fatture emesse, aggiornamenti di progetto, documenti consegnati, abbonamenti attivi e costo mensile (solo dati visibili al cliente).

## Cosa vede il cliente e sicurezza

- La pagina **Report** compare nel menu solo se esiste almeno un report pubblicato.
- Per aprirla serve il **codice di 6 cifre via email** (come per i documenti): i numeri del business sono riservati.
- Vede solo i report **pubblicati** del proprio account; le bozze e gli altri clienti non esistono per lui. Il confronto col mese prima non rivela bozze.
- Il **PDF** è generato al momento e **non viene salvato** da nessuna parte (nessun indirizzo da condividere); ogni download è nel registro attività (`report.exported`).
- Eliminare un report già pubblicato richiede una conferma esplicita.

## Limiti

- Fino a 200 metriche per report, valori fino a 10^12.
- I dati dei social/Google/ads **non** si leggono in automatico dalle piattaforme: li inserisci tu (o importi da Excel). Un collegamento automatico (Google Analytics, Meta…) è una fase futura.
