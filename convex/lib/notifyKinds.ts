import { formatDateIt, formatEuroIt } from "./reminders";

/**
 * Catalogo delle notifiche email automatiche. Regole:
 *  - solo cio' che nasce da un'interazione tra amministrazione e cliente (o dal cliente verso di noi);
 *  - mai per azioni solo interne dell'amministratore;
 *  - i testi sono semplici e in italiano; i dati variabili arrivano come testo e vengono escapati al momento dell'invio.
 */

export type NotifyAudience = "client" | "admin";
export type NotifyData = Record<string, string>;
export type Rendered = { subject: string; heading: string; body: string; ctaLabel?: string };

export type KindSpec = {
  audience: NotifyAudience;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Finestra (ms) entro cui lo stesso evento non genera una seconda email. */
  dedupeMs?: number;
  render: (d: NotifyData) => Rendered;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

const OPEN_PORTAL = "Apri il tuo spazio";

export const NOTIFY_KINDS = {
  // ---- Verso il cliente ----
  invoice_sent: {
    audience: "client",
    label: "Nuova fattura",
    description: "Quando una fattura viene emessa e resa visibile al cliente.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Nuova fattura ${d.number}: ${d.amount}`,
      heading: "Hai una nuova fattura",
      body: `La fattura ${d.number} di ${d.amount} è disponibile nel tuo spazio. Scadenza: ${d.due}.${d.note ? `\n\n${d.note}` : ""}\n\nApri il link personale che ti abbiamo inviato e vai in «Fatture».`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  invoice_paid: {
    audience: "client",
    label: "Pagamento ricevuto",
    description: "Quando una fattura risulta pagata.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Pagamento ricevuto: fattura ${d.number}`,
      heading: "Grazie, pagamento ricevuto",
      body: `Abbiamo ricevuto il pagamento della fattura ${d.number} di ${d.amount}. La trovi segnata come pagata nel tuo spazio.`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  invoice_overdue: {
    audience: "client",
    label: "Fattura scaduta",
    description: "Quando una fattura inviata supera la scadenza senza risultare pagata.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Fattura ${d.number} scaduta`,
      heading: "Una fattura risulta scaduta",
      body: `La fattura ${d.number} di ${d.amount} è scaduta il ${d.due}. Se hai già pagato, ignora questo messaggio; altrimenti ti chiediamo di provvedere appena possibile.`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  document_available: {
    audience: "client",
    label: "Nuovo documento disponibile",
    description: "Quando un documento controllato viene reso visibile al cliente (non per quelli inviati da «Bozze e invii», che hanno la loro email).",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Nuovo documento: ${d.title}`,
      heading: "C'è un nuovo documento per te",
      body: `Abbiamo reso disponibile «${d.title}» nel tuo spazio. Per aprirlo vai in «Documenti» (serve il codice che ti arriva via email).`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  project_update: {
    audience: "client",
    label: "Aggiornamento di progetto",
    description: "Quando viene pubblicato un aggiornamento visibile al cliente.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Aggiornamento su ${d.project}: ${d.title}`,
      heading: `Novità su ${d.project}`,
      body: `${d.title}\n\n${d.text}`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  report_published: {
    audience: "client",
    label: "Nuovo report mensile",
    description: "Quando il report del mese viene pubblicato.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Il tuo report di ${d.month} è pronto`,
      heading: "Il report del mese è pronto",
      body: `Abbiamo pubblicato il report di ${d.month}: numeri dei servizi, confronto con il mese prima e prossimi passi. Lo trovi in «Report» e puoi scaricarlo in PDF.`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  signature_requested: {
    audience: "client",
    label: "Documento da firmare",
    description: "Quando si chiede al cliente di firmare un PDF.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Da firmare: ${d.title}`,
      heading: "Hai un documento da firmare",
      body: `CORE829 ti ha inviato «${d.title}» da firmare.\n\nApri il tuo link personale, vai in «Documenti» e premi «Firma». Serve un codice che ti arriverà per email. La richiesta è valida fino al ${d.until}.`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  signature_signed_client: {
    audience: "client",
    label: "Copia del documento firmato",
    description: "Dopo la firma, la copia firmata al cliente.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Firmato: ${d.title}`,
      heading: "Documento firmato",
      body: `Grazie, ${d.name}: «${d.title}» è stato firmato. In allegato trovi la copia firmata, che resta sempre disponibile anche nel tuo spazio.`,
      ctaLabel: OPEN_PORTAL,
    }),
  },
  subscription_renewal: {
    audience: "client",
    label: "Promemoria di rinnovo",
    description: "Promemoria prima del rinnovo di un abbonamento (inviato dal controllo periodico; qui si registra nel centro).",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Promemoria: pagamento di ${d.amount} in scadenza il ${d.date}`,
      heading: "Promemoria di pagamento",
      body: `Il pagamento di ${d.amount} per «${d.name}» è in scadenza il ${d.date}.`,
    }),
  },
  invoice_due_soon: {
    audience: "client",
    label: "Fattura in scadenza",
    description: "Promemoria gentile 3 giorni prima della scadenza di una fattura non ancora pagata.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Promemoria: fattura ${d.number} in scadenza il ${d.due}`,
      heading: "Una fattura sta per scadere",
      body: `La fattura ${d.number} di ${d.amount} scade il ${d.due}. Se hai già provveduto, ignora questo messaggio.`,
    }),
  },
  ticket_admin_reply: {
    audience: "client",
    label: "Risposta alla tua richiesta di assistenza",
    description: "Quando rispondiamo a un ticket di assistenza.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Risposta alla tua richiesta: ${d.subject}`,
      heading: "Abbiamo risposto alla tua richiesta",
      body: `${d.excerpt}\n\nPer continuare la conversazione apri il tuo link personale e vai in «Assistenza».`,
    }),
  },
  ticket_closed: {
    audience: "client",
    label: "Richiesta di assistenza chiusa",
    description: "Quando chiudiamo un ticket di assistenza.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Richiesta chiusa: ${d.subject}`,
      heading: "La tua richiesta è stata chiusa",
      body: `Abbiamo chiuso la richiesta «${d.subject}». Se ti serve ancora aiuto, apri «Assistenza» nel tuo spazio e rispondi: la riapriamo subito.`,
    }),
  },
  // ---- Verso l'amministrazione ----
  deadline_due: {
    audience: "admin",
    label: "Scadenza in arrivo",
    description: "Promemoria per le scadenze inserite nello Scadenziario (7 giorni prima).",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Scadenza in arrivo: ${d.title} (${d.date})`,
      heading: "Una scadenza si avvicina",
      body: `${d.title}${d.client ? ` — ${d.client}` : ""}\nScade il ${d.date}.${d.notes ? `\n\n${d.notes}` : ""}`,
      ctaLabel: "Apri lo scadenziario",
    }),
  },
  ticket_new: {
    audience: "admin",
    label: "Nuovo ticket di assistenza",
    description: "Quando un cliente apre una richiesta di assistenza dal portale.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Nuovo ticket da ${d.client}: ${d.subject}`,
      heading: "Nuovo ticket di assistenza",
      body: `${d.client} · ${d.category}\n\n${d.subject}\n\n${d.excerpt}`,
      ctaLabel: "Apri i ticket",
    }),
  },
  ticket_client_reply: {
    audience: "admin",
    label: "Il cliente ha risposto a un ticket",
    description: "Quando un cliente scrive in un ticket esistente (una email ogni 10 minuti al massimo per ticket).",
    defaultEnabled: true,
    dedupeMs: 10 * MIN,
    render: (d) => ({
      subject: `${d.client} ha risposto: ${d.subject}`,
      heading: "Nuova risposta del cliente",
      body: `${d.client} ha scritto nel ticket «${d.subject}»:\n\n${d.excerpt}`,
      ctaLabel: "Apri i ticket",
    }),
  },
  site_message: {
    audience: "admin",
    label: "Nuova richiesta dal sito",
    description: "Quando arriva un messaggio dal modulo contatti di core829.net.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `Nuova richiesta dal sito: ${d.name}`,
      heading: "Nuova richiesta dal sito",
      body: `${d.name}${d.company ? ` (${d.company})` : ""} — ${d.email}${d.service ? `\nServizio: ${d.service}` : ""}${d.budget ? `\nBudget: ${d.budget}` : ""}\n\n${d.message}`,
      ctaLabel: "Apri le richieste",
    }),
  },
  signature_signed_admin: {
    audience: "admin",
    label: "Documento firmato dal cliente",
    description: "Quando un cliente firma, con la copia firmata in allegato.",
    defaultEnabled: true,
    render: (d) => ({
      subject: `${d.name} ha firmato: ${d.title}`,
      heading: "Un cliente ha firmato",
      body: `${d.name} (${d.client}) ha firmato «${d.title}». La copia firmata è in allegato e nel fascicolo del cliente.`,
      ctaLabel: "Apri il cliente",
    }),
  },
  client_opened: {
    audience: "admin",
    label: "Il cliente ha aperto il suo spazio",
    description: "Quando un cliente apre il suo link dopo molte ore (una email ogni 12 ore al massimo per cliente).",
    defaultEnabled: true,
    dedupeMs: 12 * HOUR,
    render: (d) => ({
      subject: `${d.client} ha aperto il suo spazio`,
      heading: "Cliente collegato",
      body: `${d.client} ha appena aperto il suo spazio sul portale.`,
      ctaLabel: "Apri il cliente",
    }),
  },
  client_unlocked: {
    audience: "admin",
    label: "Il cliente ha sbloccato i documenti",
    description: "Quando un cliente conferma il codice email (al massimo una ogni 6 ore per cliente).",
    defaultEnabled: false,
    dedupeMs: 6 * HOUR,
    render: (d) => ({
      subject: `${d.client} ha sbloccato i documenti`,
      heading: "Documenti sbloccati dal cliente",
      body: `${d.client} ha inserito il codice ricevuto via email e può vedere i documenti.`,
      ctaLabel: "Apri il cliente",
    }),
  },
  document_downloaded: {
    audience: "admin",
    label: "Il cliente ha scaricato un documento",
    description: "Quando un cliente scarica un documento (una email ogni 30 minuti al massimo per documento).",
    defaultEnabled: true,
    dedupeMs: 30 * MIN,
    render: (d) => ({
      subject: `${d.client} ha scaricato «${d.title}»`,
      heading: "Documento scaricato",
      body: `${d.client} ha scaricato «${d.title}».`,
      ctaLabel: "Apri i documenti",
    }),
  },
  report_exported: {
    audience: "admin",
    label: "Il cliente ha scaricato il report",
    description: "Quando un cliente scarica il PDF del report mensile.",
    defaultEnabled: true,
    dedupeMs: HOUR,
    render: (d) => ({
      subject: `${d.client} ha scaricato il report di ${d.month}`,
      heading: "Report scaricato",
      body: `${d.client} ha scaricato il PDF del report di ${d.month}.`,
      ctaLabel: "Apri il cliente",
    }),
  },
  otp_locked: {
    audience: "admin",
    label: "Codici sbagliati: accesso bloccato",
    description: "Avviso di sicurezza: troppi codici errati su un link cliente (una email l'ora al massimo).",
    defaultEnabled: true,
    dedupeMs: HOUR,
    render: (d) => ({
      subject: `Avviso: troppi codici errati per ${d.client}`,
      heading: "Troppi tentativi di sblocco",
      body: `Sul link di ${d.client} sono stati inseriti troppi codici errati e l'accesso ai documenti è stato bloccato. Se il cliente ha avuto difficoltà aiutalo; se non ti aspetti un accesso, valuta di revocare il link.`,
      ctaLabel: "Apri i link di accesso",
    }),
  },
} as const satisfies Record<string, KindSpec>;

export type NotifyKind = keyof typeof NOTIFY_KINDS;

export const isNotifyKind = (k: string): k is NotifyKind => k in NOTIFY_KINDS;

export const KIND_LIST = (Object.keys(NOTIFY_KINDS) as NotifyKind[]).map((k) => ({ kind: k, ...NOTIFY_KINDS[k] }));

/** Formattazioni condivise dai punti in cui nasce un evento. */
export const fmt = { euro: formatEuroIt, date: formatDateIt };
