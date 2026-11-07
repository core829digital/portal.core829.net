import { v } from "convex/values";

/** Validatori condivisi tra schema e funzioni: un solo punto dove si definiscono gli stati ammessi. */

export const clientStatus = v.union(
  v.literal("onboarding"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("closed"),
);

export const packageType = v.union(v.literal("standard"), v.literal("advanced"), v.literal("custom"));

export const projectStatus = v.union(
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("completed"),
  v.literal("on_hold"),
);

export const invoiceStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("paid"),
  v.literal("overdue"),
  v.literal("cancelled"),
);

export const subscriptionStatus = v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled"));
export const subscriptionInterval = v.union(v.literal("month"), v.literal("year"));

export const documentKind = v.union(
  v.literal("contract"),
  v.literal("quote"),
  v.literal("invoice"),
  v.literal("deliverable"),
  v.literal("other"),
);

/** Stato della scansione di sicurezza di un file (Fase 6). Solo `clean` e' scaricabile dal cliente. */
export const scanStatus = v.union(v.literal("pending"), v.literal("clean"), v.literal("rejected"));

export const currency = v.literal("EUR");

/** Categorie dei modelli di documento. */
export const docCategory = v.union(v.literal("contract"), v.literal("quote"), v.literal("legal"), v.literal("other"));

/** Metadati di audit: solo valori semplici, mai oggetti annidati o segreti. */
export const auditMetadata = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
);

/** Widget della pagina cliente. Deve restare allineato ai tipi in lib/widgets.ts. */
const coreWidgetType = v.union(
  v.literal("welcome"),
  v.literal("onboarding"),
  v.literal("summary"),
  v.literal("projects"),
  v.literal("billing"),
  v.literal("subscriptions"),
  v.literal("documents"),
);

export const widgetValidator = v.union(
  v.object({ id: v.string(), type: coreWidgetType, enabled: v.boolean() }),
  v.object({ id: v.string(), type: v.literal("notice"), enabled: v.boolean(), title: v.string(), body: v.string() }),
  v.object({
    id: v.string(),
    type: v.literal("links"),
    enabled: v.boolean(),
    title: v.string(),
    items: v.array(v.object({ label: v.string(), url: v.string() })),
  }),
  v.object({ id: v.string(), type: v.literal("contact"), enabled: v.boolean(), title: v.string(), body: v.string() }),
);

/** Testo posizionato sopra un PDF (coordinate relative alla pagina, 0-1, origine in alto a sinistra). */
export const pdfAnnotation = v.object({
  page: v.number(),
  x: v.number(),
  y: v.number(),
  text: v.string(),
  size: v.number(),
  color: v.union(v.literal("black"), v.literal("graphite"), v.literal("red"), v.literal("blue")),
  bold: v.boolean(),
});
