# Firma elettronica del cliente

## Come funziona
1. **Richiesta (admin):** in *Bozze e invii → Invia* spunta «Chiedi al cliente di firmare il PDF nel portale» (il PDF viene sempre allegato), oppure *Clienti → Documenti → Richiedi firma* su un PDF già archiviato. Il cliente riceve un'email; la richiesta vale **30 giorni**.
2. **Firma (cliente):** apre il suo link personale → *Documenti* → **Firma**. Legge il PDF, scrive nome e cognome, accetta due dichiarazioni. Serve un **codice email confermato da meno di 10 minuti** (se più vecchio, ne chiede uno nuovo).
3. **Risultato:** copia firmata «… — firmato» nel suo spazio, con in coda un **certificato di firma** (nome, email, data/ora Roma e UTC, IP e browser, impronta SHA-256 del documento, dichiarazioni accettate). Cliente e CORE829 ricevono la copia per email. L'originale non viene mai modificato.
4. **Controllo (admin):** menu *Documenti → Firme dei clienti*: stato, chi ha firmato, quando, da quale IP; si può annullare una richiesta in attesa.

## Sicurezza
- Autorizzazione a ogni passo sul server: link valido + codice recente + richiesta del *proprio* cliente.
- **Integrità:** se il PDF cambia dopo la richiesta (impronta SHA-256 diversa) la firma è rifiutata.
- Nessuna doppia firma (la richiesta si blocca mentre si firma e poi si chiude). Richieste scadute/annullate non si firmano.
- Un documento firmato (o la sua copia) non si elimina senza conferma esplicita; l'evento va nel registro.
- L'IP e il browser sono registrati dall'endpoint `/portal/sign` (informativa privacy: indicare nella privacy policy la conservazione di questi dati come prova della sottoscrizione).

## Valore legale — leggere
È una **firma elettronica semplice** (art. 3, n. 10, Reg. UE 910/2014 «eIDAS»): identifica il cliente tramite link personale e codice sull'email. Ha **valore probatorio** valutabile liberamente dal giudice (art. 25 eIDAS: non può essere negata solo perché elettronica), ma **non è firma avanzata né qualificata**. Non è adatta ad atti per cui la legge richiede la forma scritta con firma qualificata/digitale o atto pubblico. Per i normali contratti di servizi B2B (MSA, preventivi, ordini) è uno strumento ragionevole; **fate validare l'uso a un avvocato**, soprattutto per clausole vessatorie (in Italia: doppia sottoscrizione specifica ex art. 1341 c.c.) e per clienti consumatori.
Per firme più forti (FEA/FEQ, es. SPID, Namirial, Aruba) serve un fornitore esterno: è una fase successiva possibile.
