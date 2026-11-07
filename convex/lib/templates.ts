import type { BlankBlock } from "./docx";
import type { DocCategory } from "./autofill";

/**
 * Modelli CORE829 inclusi nell'app. Usano i segnaposto {{...}} (compilati in automatico con i dati di CORE829 SRL e del cliente),
 * campi ____ , [tra parentesi] e caselle ☐ da completare nell'editor.
 *
 * IMPORTANTE: sono testi-base redatti con i riferimenti normativi piu' comuni (GDPR, diritto d'autore, IVA UE, ritardi di pagamento).
 * NON sostituiscono la revisione di un avvocato/consulente: vanno fatti verificare prima dell'uso con i clienti,
 * in particolare legge applicabile, foro competente, regime IVA e limiti di responsabilita'.
 * Il contratto quadro e' uno solo, il Master Services Agreement (MSA): non e' incluso qui ma si importa dal file ufficiale
 * ("Importa un modello"); questi modelli lo richiamano (Preventivo, Modulo d'ordine, Verbale di accettazione).
 */

export const TEMPLATES_VERSION = 1;

export type BuiltinTemplate = {
  key: string;
  name: string;
  category: DocCategory;
  description: string;
  blocks: BlankBlock[];
};

const parties: BlankBlock[] = [
  { type: "h1", text: "Fornitore" },
  {
    type: "table",
    rows: [
      ["Ragione sociale", "{{company.name}}"],
      ["Sede legale", "{{company.address}}"],
      ["CUI / Reg. Com.", "{{company.cui}} / {{company.regCom}}"],
      ["Rappresentante legale", "{{company.rep}} — {{company.repRole}}"],
      ["Email / Telefono", "{{company.email}} — {{company.phone}}"],
    ],
  },
  { type: "h1", text: "Cliente" },
  {
    type: "table",
    rows: [
      ["Denominazione", "{{client.name}}"],
      ["Sede legale", "{{client.address}}"],
      ["P. IVA / VAT ID", "{{client.vat}}"],
      ["PEC", "{{client.pec}}"],
      ["Rappresentante legale", "{{client.legalRep}}"],
      ["Referente", "{{client.contact}}"],
      ["Email", "{{client.email}}"],
    ],
  },
];

const signatures = (left: string, right: string): BlankBlock[] => [
  {
    type: "table",
    rows: [
      [left, right],
      ["Nome e carica: {{company.rep}}, {{company.repRole}}", "Nome e carica: ______________________"],
      ["Firma: ______________________", "Firma: ______________________"],
      ["Luogo e data: {{place.date}}", "Luogo e data: ______________________"],
    ],
  },
];

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: "preventivo",
    name: "Preventivo",
    category: "quote",
    description: "Preventivo con voci e importi, regime IVA UE, termini di pagamento, rinvio al MSA e accettazione. Revisione consigliata: regime IVA e termini.",
    blocks: [
      { type: "title", text: "PREVENTIVO N. {{contract.number}}" },
      { type: "p", text: "Data di emissione: {{contract.date}}. Validità dell'offerta: 30 giorni dalla data di emissione." },
      ...parties,
      { type: "h1", text: "Oggetto" },
      { type: "p", text: "[Descrizione sintetica del servizio o del progetto]" },
      { type: "h1", text: "Servizi e corrispettivi" },
      {
        type: "table",
        rows: [
          ["Descrizione", "Quantità", "Prezzo unitario (EUR)", "Importo (EUR)"],
          ["[servizio]", "[n.]", "[EUR]", "[EUR]"],
          ["[servizio]", "[n.]", "[EUR]", "[EUR]"],
          ["[servizio]", "[n.]", "[EUR]", "[EUR]"],
        ],
      },
      { type: "p", text: "Imponibile: EUR ____________   IVA: ____________   Totale: EUR ____________" },
      { type: "h1", text: "Regime IVA (selezionare)" },
      {
        type: "p",
        text: "☐ Prestazione di servizi B2B verso soggetto passivo stabilito in altro Stato UE: operazione non soggetta a IVA in Romania per carenza del requisito territoriale (art. 44 Direttiva 2006/112/CE); l'imposta è assolta dal committente in inversione contabile nel proprio Stato (per l'Italia: art. 17, comma 2, D.P.R. 633/1972).",
      },
      { type: "p", text: "☐ Cliente con sede in Romania: IVA con aliquota ordinaria vigente alla data di fatturazione." },
      { type: "h1", text: "Termini di pagamento" },
      { type: "p", text: "☐ 100% alla firma   ☐ 50% alla firma e 50% alla consegna   ☐ Altro: ______________________" },
      { type: "p", text: "Pagamento con bonifico bancario su IBAN ______________________ intestato a {{company.name}}, entro ____ giorni dalla data della fattura. In caso di ritardo si applicano gli interessi di mora previsti dal MSA o, in difetto, dalla legge applicabile (Direttiva 2011/7/UE)." },
      { type: "h1", text: "Condizioni" },
      { type: "p", text: "Il presente preventivo è regolato dal Master Services Agreement di {{company.name}} n. ______________ del ______________, che il Cliente dichiara di conoscere e di accettare. In caso di contrasto prevale quanto indicato nel MSA, salvo deroga espressa in questo documento." },
      { type: "p", text: "I dati personali sono trattati ai sensi del Regolamento (UE) 2016/679 (GDPR); l'informativa è disponibile su richiesta." },
      { type: "h1", text: "Accettazione" },
      ...signatures("Per {{company.name}}", "Per accettazione — {{client.name}}"),
    ],
  },
  {
    key: "modulo-ordine",
    name: "Modulo d'ordine (sotto MSA)",
    category: "contract",
    description: "Ordine di servizi collegato al MSA: servizi scelti, consegne, durata, corrispettivo, referenti e firme. Revisione consigliata: coerenza con le clausole del MSA.",
    blocks: [
      { type: "title", text: "MODULO D'ORDINE N. {{contract.number}}" },
      { type: "p", text: "Riferimento MSA n. ______________ del ______________. Il presente Modulo d'Ordine è parte integrante del Master Services Agreement tra le parti ed è soggetto ai suoi termini." },
      { type: "p", text: "Data di emissione: {{contract.date}}" },
      ...parties,
      { type: "h1", text: "Servizi ordinati" },
      { type: "p", text: "☐ Sviluppo software   ☐ Marketing e comunicazione   ☐ Servizi digitali per eventi (fotografia)   ☐ Servizi digitali per eventi (video / filmmaking)   ☐ Altro: ______________________" },
      { type: "h1", text: "Descrizione e consegne" },
      { type: "p", text: "[Descrizione dettagliata del servizio, requisiti e risultati attesi]" },
      { type: "p", text: "Consegne e scadenze: [elenco delle consegne con le relative date]" },
      { type: "h1", text: "Durata" },
      { type: "p", text: "Data di inizio: ______________   Durata o data di fine: ______________   ☐ Rinnovo tacito alle condizioni del MSA   ☐ Nessun rinnovo" },
      { type: "h1", text: "Corrispettivo" },
      { type: "p", text: "☐ Una tantum: EUR ____________   ☐ Canone ricorrente: EUR ____________ al ☐ mese ☐ anno   ☐ A consumo: ______________________" },
      { type: "p", text: "Importi al netto di IVA, ove dovuta. Termini di fatturazione e pagamento: ______________________" },
      { type: "h1", text: "Referenti operativi" },
      { type: "p", text: "Per {{company.name}}: ______________________   Per il Cliente: {{client.contact}} ({{client.email}})" },
      { type: "h1", text: "Firme" },
      ...signatures("Per {{company.name}}", "Per il Cliente — {{client.name}}"),
    ],
  },
  {
    key: "dpa-gdpr",
    name: "Accordo sul trattamento dei dati (DPA, art. 28 GDPR)",
    category: "legal",
    description: "Nomina di CORE829 a responsabile del trattamento con i contenuti minimi dell'art. 28, par. 3, GDPR. Revisione legale fortemente consigliata (sub-responsabili, trasferimenti extra SEE, misure di sicurezza).",
    blocks: [
      { type: "title", text: "ACCORDO SUL TRATTAMENTO DEI DATI PERSONALI (ART. 28 REG. UE 2016/679)" },
      { type: "p", text: "N. {{contract.number}} — {{contract.date}} — collegato al MSA n. ______________" },
      ...parties.slice(0, 2),
      { type: "h1", text: "1. Ruoli" },
      { type: "p", text: "{{client.name}} (il «Cliente») è Titolare del trattamento; {{company.name}} («CORE829») agisce come Responsabile del trattamento per conto del Cliente nello svolgimento dei servizi previsti dal MSA e dai relativi Moduli d'Ordine." },
      { type: "h1", text: "2. Oggetto, durata, natura e finalità" },
      { type: "p", text: "Oggetto: trattamento dei dati personali strettamente necessario all'esecuzione dei servizi concordati. Durata: pari a quella del MSA e fino alla restituzione o cancellazione dei dati. Natura e finalità: [descrivere, es. gestione sito web, campagne marketing, produzione foto/video per eventi]." },
      { type: "h1", text: "3. Tipologie di dati e categorie di interessati" },
      { type: "p", text: "Dati trattati: ☐ anagrafici e di contatto   ☐ immagini e video   ☐ dati di navigazione e analytics   ☐ dati di clienti/utenti del Cliente   ☐ altro: ______________________. Non sono previsti dati di cui agli artt. 9 e 10 GDPR, salvo diverso accordo scritto: ☐ previsti: ______________________." },
      { type: "p", text: "Categorie di interessati: ☐ clienti e potenziali clienti del Cliente   ☐ dipendenti e collaboratori   ☐ partecipanti a eventi   ☐ altro: ______________________." },
      { type: "h1", text: "4. Obblighi di CORE829" },
      { type: "p", text: "a) trattare i dati solo su istruzioni documentate del Cliente, anche per i trasferimenti extra SEE, salvo obblighi di legge; b) garantire che le persone autorizzate siano vincolate alla riservatezza; c) adottare le misure di sicurezza di cui all'art. 32 GDPR; d) rispettare le condizioni degli artt. 28, par. 2 e 4, per il ricorso a sub-responsabili; e) assistere il Cliente nel dare seguito alle richieste degli interessati; f) assistere il Cliente negli obblighi degli artt. 32-36 GDPR; g) a scelta del Cliente, cancellare o restituire i dati al termine dei servizi, salvo obblighi di conservazione; h) mettere a disposizione le informazioni necessarie a dimostrare il rispetto degli obblighi e consentire verifiche (audit) con ragionevole preavviso." },
      { type: "h1", text: "5. Violazioni dei dati" },
      { type: "p", text: "CORE829 informa il Cliente senza ingiustificato ritardo, e comunque entro ____ ore, dopo essere venuta a conoscenza di una violazione dei dati personali, fornendo le informazioni utili alla notifica prevista dall'art. 33 GDPR." },
      { type: "h1", text: "6. Sub-responsabili e trasferimenti" },
      { type: "p", text: "Il Cliente autorizza ☐ in via generale   ☐ in via specifica i sub-responsabili indicati: ______________________ (es. fornitori di hosting, email, analytics). CORE829 informa il Cliente di ogni modifica con preavviso di ____ giorni, consentendogli di opporsi. I trasferimenti verso Paesi terzi avvengono solo con garanzie adeguate (decisione di adeguatezza o clausole contrattuali tipo, artt. 45-46 GDPR)." },
      { type: "h1", text: "7. Misure di sicurezza" },
      { type: "p", text: "Controllo degli accessi e autenticazione, cifratura dei dati in transito, copie di sicurezza, registrazione degli accessi, minimizzazione e limitazione della conservazione. Misure ulteriori: ______________________." },
      { type: "h1", text: "8. Legge applicabile" },
      { type: "p", text: "Il presente accordo è regolato dal GDPR e dalla legge indicata nel MSA. In caso di contrasto con il MSA prevale il presente accordo per le sole materie di protezione dei dati." },
      { type: "h1", text: "Firme" },
      ...signatures("CORE829 — Responsabile del trattamento", "Il Cliente — Titolare del trattamento"),
    ],
  },
  {
    key: "nda",
    name: "Accordo di riservatezza reciproco (NDA)",
    category: "legal",
    description: "NDA bilaterale per trattative e collaborazioni. Revisione consigliata: durata, legge applicabile e foro competente (da scegliere).",
    blocks: [
      { type: "title", text: "ACCORDO DI RISERVATEZZA RECIPROCO" },
      { type: "p", text: "N. {{contract.number}} — {{contract.date}}" },
      ...parties.slice(0, 2),
      { type: "h1", text: "1. Scopo" },
      { type: "p", text: "Le parti intendono scambiarsi informazioni riservate al fine di valutare e/o eseguire la seguente collaborazione: [descrizione]." },
      { type: "h1", text: "2. Informazioni riservate" },
      { type: "p", text: "Sono tutte le informazioni tecniche, commerciali, finanziarie, creative e organizzative, in qualsiasi forma comunicate, che siano indicate come riservate o che per natura debbano ritenersi tali, inclusi codice sorgente, progetti, elenchi clienti, prezzi e strategie." },
      { type: "h1", text: "3. Obblighi" },
      { type: "p", text: "La parte ricevente si impegna a: usare le informazioni solo per lo scopo indicato; non divulgarle a terzi, salvo a collaboratori e consulenti che ne abbiano necessità e siano vincolati da pari obblighi; proteggerle con la stessa diligenza usata per le proprie informazioni e comunque con misure ragionevoli." },
      { type: "h1", text: "4. Eccezioni" },
      { type: "p", text: "Non sono riservate le informazioni che: siano o diventino di pubblico dominio senza colpa del ricevente; fossero già lecitamente note al ricevente; siano ricevute lecitamente da terzi; siano sviluppate in modo indipendente. La divulgazione imposta da legge o autorità è consentita previa comunicazione, ove possibile, alla parte divulgante." },
      { type: "h1", text: "5. Durata e restituzione" },
      { type: "p", text: "L'accordo vale dalla data di firma. Gli obblighi di riservatezza durano ____ anni dalla cessazione dei rapporti. Su richiesta, le informazioni e le copie vengono restituite o distrutte, con conferma scritta." },
      { type: "h1", text: "6. Proprietà e dati personali" },
      { type: "p", text: "Nessuna licenza o diritto sulle informazioni è concesso, salvo quanto qui previsto. Eventuali dati personali sono trattati nel rispetto del Regolamento (UE) 2016/679." },
      { type: "h1", text: "7. Legge applicabile e foro" },
      { type: "p", text: "Legge applicabile: ☐ italiana   ☐ rumena   ☐ altra: ____________. Foro competente: ______________________." },
      { type: "h1", text: "Firme" },
      ...signatures("Per {{company.name}}", "Per {{client.name}}"),
    ],
  },
  {
    key: "liberatoria-immagini",
    name: "Liberatoria per riprese foto/video e uso dell'immagine",
    category: "legal",
    description: "Consenso alla ripresa e alla pubblicazione di immagini (eventi, shooting, filmmaking), con informativa privacy. Revisione consigliata: minori, ambiti di utilizzo e durata.",
    blocks: [
      { type: "title", text: "LIBERATORIA PER L'UTILIZZO DELL'IMMAGINE E INFORMATIVA PRIVACY" },
      { type: "p", text: "N. {{contract.number}} — {{contract.date}}" },
      { type: "h1", text: "Soggetto ripreso" },
      {
        type: "table",
        rows: [
          ["Nome e cognome del soggetto", ""],
          ["Luogo e data di nascita del soggetto", ""],
          ["Indirizzo di residenza del soggetto", ""],
          ["Email del soggetto", ""],
          ["Evento / servizio", ""],
          ["Data e luogo della ripresa", ""],
        ],
      },
      { type: "h1", text: "Titolare delle riprese" },
      { type: "p", text: "{{company.name}}, {{company.address}}, CUI {{company.cui}}, email {{company.email}}, per conto di ☐ sé stessa   ☐ {{client.name}} (committente)." },
      { type: "h1", text: "Consenso" },
      { type: "p", text: "Il sottoscritto autorizza a titolo gratuito la realizzazione di fotografie e riprese video che lo ritraggono e la loro pubblicazione, ai sensi degli artt. 96 e 97 della Legge 633/1941 e dell'art. 10 del Codice civile (per i soggetti a cui si applicano), nei seguenti ambiti:" },
      { type: "p", text: "☐ sito web   ☐ social network   ☐ materiale promozionale e pubblicitario   ☐ stampa e pubblicazioni   ☐ proiezioni durante l'evento   ☐ archivio e portfolio" },
      { type: "p", text: "Durata: ☐ ____ anni   ☐ fino a revoca.   Territorio: ☐ mondiale   ☐ solo: ______________. L'uso non deve ledere il decoro e la reputazione della persona ritratta." },
      { type: "h1", text: "Informativa (art. 13 GDPR) e revoca" },
      { type: "p", text: "Le immagini sono dati personali trattati sulla base del consenso (art. 6, par. 1, lett. a) GDPR) per le finalità sopra indicate e conservati per la durata indicata. Il consenso è facoltativo e revocabile in ogni momento scrivendo a {{company.email}}, senza pregiudicare la liceità del trattamento già avvenuto; restano ferme le altre facoltà dell'interessato (accesso, rettifica, cancellazione, limitazione, opposizione, reclamo al Garante competente)." },
      { type: "h1", text: "Minori" },
      { type: "p", text: "Per i minori la liberatoria è firmata da chi esercita la responsabilità genitoriale. Genitore/tutore: nome ______________________   documento n. ______________." },
      { type: "h1", text: "Firma" },
      { type: "p", text: "Data e luogo di sottoscrizione: ______________________      Firma: ______________________" },
    ],
  },
  {
    key: "verbale-accettazione",
    name: "Verbale di consegna e accettazione",
    category: "other",
    description: "Attestazione di consegna e accettazione di un servizio o di un deliverable, collegata al MSA / Modulo d'ordine. Revisione consigliata: effetti dell'accettazione previsti dal MSA.",
    blocks: [
      { type: "title", text: "VERBALE DI CONSEGNA E ACCETTAZIONE" },
      { type: "p", text: "N. {{contract.number}} — Data di emissione: {{contract.date}} — Riferimento MSA / Modulo d'Ordine n. ______________" },
      ...parties.slice(0, 2),
      { type: "h1", text: "Oggetto della consegna" },
      { type: "p", text: "[Descrizione del servizio o dei deliverable consegnati]" },
      { type: "p", text: "Data di consegna: ______________   Modalità: ☐ digitale (link/download)   ☐ in presenza   ☐ altro: ____________" },
      { type: "h1", text: "Esito delle verifiche" },
      { type: "p", text: "☐ Accettato senza riserve   ☐ Accettato con riserve (indicate sotto)   ☐ Non accettato (motivazioni sotto)" },
      { type: "p", text: "Note e riserve: ______________________________________________" },
      { type: "p", text: "L'accettazione produce gli effetti previsti dal MSA, incluso il decorso dei termini di garanzia e di fatturazione del saldo." },
      { type: "h1", text: "Firme" },
      ...signatures("Per {{company.name}}", "Per il Cliente — {{client.name}}"),
    ],
  },
];
