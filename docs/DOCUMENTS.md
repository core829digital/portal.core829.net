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
