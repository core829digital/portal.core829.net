import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  auditMetadata,
  clientStatus,
  currency,
  documentKind,
  invoiceStatus,
  packageType,
  projectStatus,
  scanStatus,
  subscriptionInterval,
  subscriptionStatus,
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
    packageType,
    status: clientStatus,
    /** Messaggio personalizzato mostrato nella pagina di benvenuto. */
    welcomeMessage: v.optional(v.string()),
    /** SOLO per l'amministratore. Non esporre mai al cliente. */
    internalNotes: v.optional(v.string()),
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

  /** Registro di audit: chi ha fatto cosa e quando. Mai segreti qui dentro. */
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
