# Studio documenti (contratti, preventivi, documenti legali)

Tutto dall'area admin, menu **Documenti**. Solo l'amministratore vede e usa queste pagine.

## Come si lavora

1. **Modelli** → *Importa un modello*: carichi un file Word (.docx), per esempio il Master Services Agreement. Stili, intestazioni,
   immagini e tabelle restano esattamente come nel file.
2. **Nuovo documento per un cliente** (da *Modelli → Usa per un cliente*, da *Bozze e invii*, o dalla scheda del cliente →
   *Contratti da inviare*): si parte da un modello oppure da un file Word caricato. I dati del cliente (nome, referente, email,
   telefono, P.IVA) e la data di oggi sono già inseriti.
3. **Editor**: a sinistra i *campi da compilare* (righe vuote, `[testo tra parentesi]`, caselle ☐, celle vuote dei moduli,
   segnaposto `{{chiave}}`); a destra il *testo del documento*, paragrafo per paragrafo, con ricerca, aggiunta ed eliminazione.
4. **Anteprima PDF** e **Word**: si aprono in una nuova scheda (il sistema salva prima le modifiche).
5. **Invia al cliente**: email da CORE829 (Resend) con PDF e/o Word in allegato; risposta a `office@core829.net`.
   Dopo l'invio il documento entra nel fascicolo del cliente (visibile nel suo portale, dietro il codice) e non si modifica più.

## Segnaposto

`{{client.name}}`, `{{client.contact}}`, `{{client.email}}`, `{{client.phone}}`, `{{client.vat}}`, `{{date.today}}`,
`{{company.name}}`, `{{company.address}}`, `{{company.vat}}`. Quelli senza valore noto (es. `{{contract.number}}`,
`{{client.address}}`) restano da compilare nell'editor. Si possono usare anche nelle intestazioni e nei piè di pagina del Word.

## Limiti dichiarati

- **Il PDF è "pulito", non identico al Word**: testo, titoli e tabelle sì; immagini, colori e impaginazione particolare no
  (logo e piè di pagina CORE829 sono aggiunti dal sistema). Per un PDF identico al Word: scaricare il Word e salvarlo in PDF,
  oppure collegare un convertitore esterno (es. CloudConvert) in una fase successiva.
- **Riscrivere un paragrafo** a mano ne mantiene lo stile ma unifica la formattazione interna (grassetto/corsivo a metà riga).
  Compilare i campi, invece, mantiene la formattazione originale.
- **Modifica diretta di un PDF già pronto**: non inclusa (fase successiva, task DOC 7).
- Dimensione massima del file: 15 MB. Allegati email: massimo 30 MB in totale.

## Sicurezza

Funzioni riservate all'admin (controllo sul server in ogni funzione). Il file caricato è dato non fidato: si controllano firma ZIP,
struttura e dimensione decompressa (anti *zip bomb*); i testi inseriti entrano nel documento solo come testo, mai come markup;
il messaggio dell'email è mostrato con l'escape. L'invio non salva nulla se Resend rifiuta il messaggio.

## Compilazione automatica

Alla creazione di una bozza (Word o PDF, qualunque categoria) il portale compila da solo:

- i segnaposto `{{...}}` (cliente: `client.name|contact|email|phone|vat|address|pec|legalRep|website`; azienda: `company.name|address|vat|cui|regCom|phone|email|officeEmail|rep|repRole`; documento: `contract.number|date|place`, `date.today`, `date.year`, `place.date`);
- i campi vuoti il cui nome/etichetta e' inequivocabile (Sede legale, P. IVA, PEC, Email, Telefono, Rappresentante legale, Referente, Sito web, Luogo e data, Riferimento MSA n.). I campi ambigui (Forma giuridica, Codice fiscale, SDI, Paese...) restano da compilare a mano: meglio vuoto che sbagliato;
- nei PDF con campi modulo, i campi di testo riconosciuti ricevono il testo come sovrapposizione modificabile (il PDF originale non cambia).

Numerazione automatica per categoria e anno: CTR-2026-001 (contratti), PRV (preventivi), LEG (legali), DOC (altri).
I dati del cliente mancanti non vengono scritti: il campo resta da compilare. Completa la scheda cliente per ottenere documenti pronti.

## Anteprima live e tabelle da Excel

- Nell'editor Word la vista **Anteprima live** mostra il documento come sarà (campi rossi = da compilare, verdi = compilati, gialli = testo modificato) e si aggiorna a ogni tasto. Clic su un campo → si va a compilarlo; clic su un testo → si corregge. Il badge «N campi vuoti» ti dice cosa manca prima dell'invio.
- **Inserisci tabella da Excel**: formati .xlsx, .xlsm, .ods, .csv/.tsv (max 5 MB, 2000 righe, 50 colonne). Le formule non si calcolano (si legge l'ultimo valore salvato). I vecchi **.xls/.xlsb non sono supportati**: in Excel «Salva con nome» → .xlsx. Scelta di proposito: l'unica libreria che li legge ha vulnerabilità note.

## Modelli CORE829 inclusi

In *Documenti → Modelli → Installa i modelli CORE829*: Preventivo, Modulo d'ordine (sotto MSA), Accordo sul trattamento dei dati (DPA, art. 28 GDPR), NDA reciproco, Liberatoria per riprese foto/video, Verbale di consegna e accettazione. Il contratto quadro resta uno solo, il **MSA**, che importi dal tuo file Word.

> **Revisione legale necessaria.** I testi contengono i riferimenti normativi più comuni (GDPR artt. 13, 28, 32, 33; L. 633/1941 artt. 96-97; Direttiva 2006/112/CE e 2011/7/UE) ma non possono sostituire la verifica di un avvocato: legge applicabile, foro, regime IVA, limiti di responsabilità e durata vanno validati prima dell'uso con i clienti.

## Eliminazione

- Le bozze si eliminano dall'elenco (con conferma); i documenti **già inviati** non si eliminano dalle bozze.
- Un documento inviato al cliente (es. contratto) richiede una **seconda conferma** esplicita per essere cancellato dal fascicolo; l'evento è nel registro con `wasSent`.

## Loghi, firma e timbro su ogni documento

- **Due loghi** (CORE829 + «829 Servers department», lo stesso della pagina Server personalizzati di core829.net) compaiono su ogni documento che esce: in intestazione su ogni pagina dei PDF, in cima ai file Word.
- **Firma e timbro** di CORE829 SRL si aggiungono in fondo: nei PDF generati dal Word, nei Word, nei report del cliente e, per i **PDF caricati**, in una pagina finale «Firma e timbro» (le pagine originali non si toccano, il timbro non copre mai il testo).
- Si applicano al file *in uscita* (anteprima, download, invio, fascicolo del cliente); la bozza modificabile resta pulita. Nell'invio c'è la casella «Aggiungi firma e timbro» (attiva di default).
- **Dove stanno firma e timbro:** nell'archivio privato di Convex, non nel codice (il repository GitHub è pubblico: chiunque potrebbe copiarli e falsificare documenti). Si caricano da **Documenti → Firma e timbro** (PNG trasparenti, max 2 MB). Solo l'amministratore li vede; ogni cambio è nel registro. Se mancano, un avviso nell'editor lo segnala e i documenti escono solo con i loghi.
- Se la firma/timbro dovessero finire in mani sbagliate: elimina e ricarica da quel pannello e valuta una nuova firma/timbro ufficiali.
