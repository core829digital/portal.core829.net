import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  auditMetadata,
  clientStatus,
  currency,
  docCategory,
  pdfAnnotation,
  documentKind,
  invoiceStatus,
  packageType,
  projectStatus,
  scanStatus,
  subscriptionInterval,
  subscriptionStatus,
  reportMetric,
  widgetValidator,
} from "./lib/validators";

/**
 * Modello dati del portale clienti.
 *
 * Regole:
 * - gli importi sono sempre interi in centesimi (mai decimali);
 * - le date sono timestamp in millisecondi;
 * - i segreti (token del link, codici) non sono MAI salvati in chiaro, solo il loro hash;
 * - `internalNotes` e altri campi interni non vengono mai restituiti al cliente
 *   (le funzioni del cliente in `portal.ts` scelgono i campi uno per uno).
 */
export default defineSchema({
  /** Utenti, sessioni e account gestiti da Convex Auth. */
  ...authTables,

  /** Amministratori autorizzati. L'identita' arriva dal provider di login, l'autorizzazione da qui. */
  admins: defineTable({
    email: v.string(),
    addedAt: v.number(),
  }).index("by_email", ["email"]),

  clients: defineTable({
    displayName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    vatId: v.optional(v.string()),
    /** Sede legale / residenza: serve a compilare contratti e documenti. */
    address: v.optional(v.string()),
    pec: v.optional(v.string()),
    /** Rappresentante legale (nome e carica). */
    legalRep: v.optional(v.string()),
    website: v.optional(v.string()),
    packageType,
    status: clientStatus,
    /** Messaggio personalizzato mostrato nella pagina di benvenuto. */
    welcomeMessage: v.optional(v.string()),
    /** SOLO per l'amministratore. Non esporre mai al cliente. */
    internalNotes: v.optional(v.string()),
    /** Se false, il cliente non riceve le email automatiche del portale (restano al registro come «saltate»). Predefinito: si. */
    notifyEmail: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  projects: defineTable({
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    status: projectStatus,
    /** Avanzamento 0-100. */
    progress: v.number(),
    startDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
  }).index("by_clientId", ["clientId"]),

  /** Cronologia degli aggiornamenti di un progetto. */
  projectUpdates: defineTable({
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    title: v.string(),
    body: v.string(),
    visibleToClient: v.boolean(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_clientId_and_visibleToClient", ["clientId", "visibleToClient"]),

  documents: defineTable({
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    kind: documentKind,
    title: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    scanStatus,
    /** Perche' il file e' stato respinto (messaggio leggibile). */
    rejectReason: v.optional(v.string()),
    /** Impronta SHA-256 del contenuto, calcolata durante la scansione. */
    sha256: v.optional(v.string()),
    visibleToClient: v.boolean(),
  })
    .index("by_clientId", ["clientId"])
    .index("by_storageId", ["storageId"])
    .index("by_scanStatus", ["scanStatus"]),

  invoices: defineTable({
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    number: v.string(),
    issuedAt: v.number(),
    dueAt: v.number(),
    amountCents: v.number(),
    currency,
    status: invoiceStatus,
    paidAt: v.optional(v.number()),
    /** PDF della fattura, se caricato. */
    documentId: v.optional(v.id("documents")),
    /** Nota visibile al cliente (es. causale). */
    note: v.optional(v.string()),
    visibleToClient: v.boolean(),
    /** Quando e' partito il promemoria «scade tra pochi giorni»: evita invii doppi. */
    dueReminderSentAt: v.optional(v.number()),
    /** Quando e' partito il promemoria «scade domani» delle 10:30: evita invii doppi. */
    eveReminderSentAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_clientId_and_status", ["clientId", "status"])
    .index("by_number", ["number"])
    .index("by_status_and_dueAt", ["status", "dueAt"]),

  subscriptions: defineTable({
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    amountCents: v.number(),
    currency,
    interval: subscriptionInterval,
    status: subscriptionStatus,
    startedAt: v.number(),
    nextRenewalAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    /** Se presente, il cliente riceve un promemoria email questo numero di giorni prima del rinnovo (e l'admin una conferma). */
    reminderDaysBefore: v.optional(v.number()),
    /** Rinnovo (`nextRenewalAt`) per cui il promemoria e' gia' stato inviato: evita invii doppi. */
    lastReminderForRenewalAt: v.optional(v.number()),
    /** Rinnovo (`nextRenewalAt`) per cui e' gia' partito il promemoria «scade domani» delle 10:30. */
    eveReminderForRenewalAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_clientId_and_status", ["clientId", "status"])
    .index("by_status_and_nextRenewalAt", ["status", "nextRenewalAt"]),

  /** Pagina personalizzata del cliente: elenco ordinato di widget. Se manca, vale quella predefinita. */
  clientPages: defineTable({
    clientId: v.id("clients"),
    widgets: v.array(widgetValidator),
  }).index("by_clientId", ["clientId"]),

  /** Link personali del cliente. Si salva solo l'hash del token. */
  accessLinks: defineTable({
    clientId: v.id("clients"),
    tokenHash: v.string(),
    /**
     * Il link e' utilizzabile solo se `active` e' true. Le query non leggono l'orologio:
     * un lavoro periodico (maintenance.expireLinks) mette `active = false` alla scadenza.
     */
    active: v.boolean(),
    /** Primi 4 caratteri del token, solo per riconoscere il link nell'elenco admin. */
    prefix: v.string(),
    label: v.optional(v.string()),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    useCount: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_clientId", ["clientId"])
    .index("by_active_and_expiresAt", ["active", "expiresAt"]),

  /** Codici a 6 cifre per sbloccare i documenti. Si salva solo l'hash. */
  otpCodes: defineTable({
    linkId: v.id("accessLinks"),
    codeHash: v.string(),
    expiresAt: v.number(),
    /** Tentativi errati su questo codice. Dopo 5 il codice e' inutilizzabile. */
    attempts: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_linkId", ["linkId"])
    .index("by_expiresAt", ["expiresAt"]),

  /** Sessioni di sblocco dei documenti, a scadenza breve. Si salva solo l'hash. */
  unlockSessions: defineTable({
    linkId: v.id("accessLinks"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_linkId", ["linkId"])
    .index("by_expiresAt", ["expiresAt"]),

  /** Eventi webhook gia' elaborati: serve a ignorare i messaggi ripetuti (ogni evento ha un id unico). Pulita dopo 7 giorni. */
  webhookEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_receivedAt", ["receivedAt"]),

  /** Modelli di documento (file DOCX) riservati all'amministratore: contratti, preventivi, documenti legali. */
  docTemplates: defineTable({
    name: v.string(),
    category: docCategory,
    storageId: v.id("_storage"),
    sizeBytes: v.number(),
    paragraphCount: v.number(),
    fieldCount: v.number(),
    archived: v.boolean(),
    createdBy: v.string(),
    /** Solo per i modelli CORE829 inclusi nell'app: chiave stabile (es. "preventivo") e breve descrizione. */
    builtinKey: v.optional(v.string()),
    description: v.optional(v.string()),
  }).index("by_archived", ["archived"]),

  /** Bozza di un documento per un cliente (copia personalizzata di un modello o di un file caricato). */
  docDrafts: defineTable({
    clientId: v.id("clients"),
    templateId: v.optional(v.id("docTemplates")),
    name: v.string(),
    category: docCategory,
    /** "docx" (predefinito) = documento Word modificabile; "pdf" = PDF caricato con testi sovrapposti. */
    format: v.optional(v.union(v.literal("docx"), v.literal("pdf"))),
    /** File corrente: il DOCX della bozza, oppure il PDF con i testi gia' applicati. */
    storageId: v.id("_storage"),
    /** Solo PDF: il file caricato, mai modificato (ogni salvataggio riparte da qui). */
    originalStorageId: v.optional(v.id("_storage")),
    /** Solo PDF: i testi sovrapposti, per poterli modificare ancora. */
    annotations: v.optional(v.array(pdfAnnotation)),
    /** Ultima anteprima PDF generata (si cancella alla successiva). */
    previewStorageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("draft"), v.literal("sent")),
    sentAt: v.optional(v.number()),
    sentTo: v.optional(v.string()),
    documentIds: v.optional(v.array(v.id("documents"))),
  })
    .index("by_clientId", ["clientId"])
    .index("by_status", ["status"]),

  /** Registro di audit: chi ha fatto cosa e quando. Mai segreti qui dentro. */
  /** Report mensile del cliente: metriche per servizio + commento dell'amministratore. Il cliente vede solo quelli pubblicati. */
  clientReports: defineTable({
    clientId: v.id("clients"),
    /** Primo giorno del mese, 00:00 UTC. */
    month: v.number(),
    summary: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    metrics: v.array(reportMetric),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_clientId_and_month", ["clientId", "month"]),

  /** Firma e timbro di CORE829 (PNG trasparenti). Archivio PRIVATO: mai nel codice, perche' il repository e' pubblico. */
  brandAssets: defineTable({
    kind: v.union(v.literal("stamp"), v.literal("signature")),
    storageId: v.id("_storage"),
    sizeBytes: v.number(),
    width: v.number(),
    height: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_kind", ["kind"]),

  /**
   * Richieste di firma elettronica (semplice) di un PDF da parte del cliente. Le prove (chi, quando, da dove, impronta del file)
   * restano qui e nel certificato aggiunto al PDF firmato. "Scaduta" non e' uno stato salvato: si ricava da `expiresAt`.
   */
  signatureRequests: defineTable({
    clientId: v.id("clients"),
    documentId: v.id("documents"),
    draftId: v.optional(v.id("docDrafts")),
    status: v.union(v.literal("pending"), v.literal("signing"), v.literal("signed"), v.literal("revoked")),
    signerEmail: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    /** SHA-256 del PDF al momento della richiesta: se il file cambia, la firma non e' piu' possibile. */
    docSha256: v.string(),
    signedDocumentId: v.optional(v.id("documents")),
    signedAt: v.optional(v.number()),
    signedName: v.optional(v.string()),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    /** Quando il cliente ha confermato il codice ricevuto via email (sessione di sblocco usata per firmare). */
    otpVerifiedAt: v.optional(v.number()),
    consentVersion: v.optional(v.string()),
    signedSha256: v.optional(v.string()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_documentId", ["documentId"])
    .index("by_status", ["status"]),

  /** Approvazione di un documento (es. preventivo) da parte del cliente: approva o chiede modifiche. Decisione definitiva. */
  approvalRequests: defineTable({
    clientId: v.id("clients"),
    documentId: v.id("documents"),
    message: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("changes_requested"), v.literal("revoked")),
    createdAt: v.number(),
    expiresAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedName: v.optional(v.string()),
    comment: v.optional(v.string()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_documentId", ["documentId"])
    .index("by_status", ["status"]),

  /** Scadenze inserite a mano dall'amministratore (dominio, hosting, contratto...). Le altre sono ricavate dai dati. */
  deadlines: defineTable({
    title: v.string(),
    dueAt: v.number(),
    clientId: v.optional(v.id("clients")),
    category: v.union(v.literal("domain"), v.literal("hosting"), v.literal("contract"), v.literal("other")),
    notes: v.optional(v.string()),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
    /** Promemoria all'amministrazione gia' inviato (una volta sola). */
    reminderSentAt: v.optional(v.number()),
  })
    .index("by_done_and_dueAt", ["done", "dueAt"]),

  /** Ticket di assistenza: il cliente scrive dal portale, CORE829 risponde dal pannello. */
  tickets: defineTable({
    clientId: v.id("clients"),
    subject: v.string(),
    category: v.union(v.literal("question"), v.literal("issue"), v.literal("request"), v.literal("billing")),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("waiting_client"), v.literal("closed")),
    createdAt: v.number(),
    lastMessageAt: v.number(),
    lastMessageBy: v.union(v.literal("client"), v.literal("admin")),
    messageCount: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_clientId_and_lastMessageAt", ["clientId", "lastMessageAt"])
    .index("by_status_and_lastMessageAt", ["status", "lastMessageAt"]),

  ticketMessages: defineTable({
    ticketId: v.id("tickets"),
    clientId: v.id("clients"),
    author: v.union(v.literal("client"), v.literal("admin")),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_ticketId_and_createdAt", ["ticketId", "createdAt"])
    .index("by_clientId_and_author_and_createdAt", ["clientId", "author", "createdAt"]),

  /** Richieste arrivate dal modulo contatti di core829.net (il sito le invia firmate). */
  siteMessages: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    service: v.optional(v.string()),
    budget: v.optional(v.string()),
    message: v.string(),
    locale: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("handled"), v.literal("spam")),
    createdAt: v.number(),
    handledAt: v.optional(v.number()),
    /** Cliente creato a partire da questa richiesta. */
    clientId: v.optional(v.id("clients")),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  /** Risposte inviate dal portale alle richieste del sito (email da clients@core829.net). */
  siteReplies: defineTable({
    messageId: v.id("siteMessages"),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    actorId: v.string(),
  }).index("by_messageId", ["messageId"]),

  /** SEO modificabile dal portale: titolo, descrizione e indicizzazione di una pagina del sito in una lingua. */
  siteSeo: defineTable({
    page: v.string(),
    locale: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    noindex: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_page_and_locale", ["page", "locale"]),

  /** Contenuti semplici del sito (per ora: l'avviso in testata). Un documento per chiave. */
  siteSettings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Visite al sito: solo contatori giornalieri per pagina e lingua. Nessun IP, nessun identificativo del visitatore. */
  siteStats: defineTable({
    day: v.string(),
    path: v.string(),
    locale: v.string(),
    views: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_day_and_path_and_locale", ["day", "path", "locale"]),

  /** Registro di tutte le email automatiche tra portale, clienti e amministrazione (una riga per destinatario). */
  notifications: defineTable({
    kind: v.string(),
    audience: v.union(v.literal("client"), v.literal("admin")),
    clientId: v.optional(v.id("clients")),
    to: v.string(),
    subject: v.string(),
    heading: v.string(),
    body: v.string(),
    ctaLabel: v.optional(v.string()),
    /** Percorso dentro il portale (es. "/c" o "/admin/clients/..."), mai un indirizzo esterno. */
    ctaPath: v.optional(v.string()),
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    /** Perche' e' stata saltata o non e' partita (testo leggibile). */
    reason: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    /** Evita email ripetute per lo stesso evento in una finestra di tempo. */
    dedupeKey: v.optional(v.string()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_clientId_and_createdAt", ["clientId", "createdAt"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_dedupeKey_and_createdAt", ["dedupeKey", "createdAt"]),

  /** Quali tipi di notifica sono attivi (se manca la riga vale il predefinito del tipo). */
  notificationSettings: defineTable({
    kind: v.string(),
    enabled: v.boolean(),
  }).index("by_kind", ["kind"]),

  auditLogs: defineTable({
    actorType: v.union(v.literal("admin"), v.literal("client"), v.literal("system")),
    actorId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    action: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    metadata: v.optional(auditMetadata),
  })
    .index("by_clientId", ["clientId"])
    .index("by_action", ["action"]),
});
