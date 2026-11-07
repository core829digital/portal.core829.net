/** Etichette in italiano per gli stati, usate sia dall'area admin sia dal portale cliente. */

export const clientStatusLabel = {
  onboarding: "In avvio",
  active: "Attivo",
  paused: "In pausa",
  closed: "Chiuso",
} as const;

export const packageLabel = {
  standard: "Sito Standard",
  advanced: "Sito Avanzato",
  custom: "Su misura",
} as const;

export const projectStatusLabel = {
  planned: "Pianificato",
  in_progress: "In lavorazione",
  in_review: "In revisione",
  completed: "Completato",
  on_hold: "In attesa",
} as const;

export const invoiceStatusLabel = {
  draft: "Bozza",
  sent: "Da pagare",
  overdue: "Scaduta",
  paid: "Pagata",
  cancelled: "Annullata",
} as const;

export const subscriptionStatusLabel = {
  active: "Attivo",
  paused: "In pausa",
  cancelled: "Annullato",
} as const;

export const intervalLabel = { month: "al mese", year: "all'anno" } as const;

export const documentKindLabel = {
  contract: "Contratto",
  quote: "Preventivo",
  invoice: "Fattura",
  deliverable: "Consegna",
  other: "Altro",
} as const;

/** Etichette leggibili per le azioni del registro di audit (le sconosciute si mostrano com'e'). */
export const auditActionLabel: Record<string, string> = {
  "client.created": "Cliente creato",
  "client.updated": "Cliente modificato",
  "access_link.created": "Link di accesso creato",
  "access_link.revoked": "Link di accesso revocato",
  "access_link.expired": "Link di accesso scaduto",
  "access_link.opened": "Link aperto dal cliente",
  "invoice.created": "Fattura creata",
  "invoice.updated": "Fattura modificata",
  "invoice.status_changed": "Stato fattura cambiato",
  "invoice.marked_overdue": "Fattura scaduta",
  "subscription.created": "Abbonamento creato",
  "subscription.updated": "Abbonamento modificato",
  "subscription.status_changed": "Stato abbonamento cambiato",
  "subscription.reminder_sent": "Promemoria di rinnovo inviato",
  "project.created": "Progetto creato",
  "project.updated": "Progetto modificato",
  "document.uploaded": "Documento caricato",
  "document.downloaded": "Documento scaricato dal cliente",
  "document.removed": "Documento eliminato",
  "page.saved": "Pagina cliente salvata",
  "doc.template_imported": "Modello di documento importato",
  "doc.template_archived": "Modello di documento archiviato",
  "doc.draft_created": "Bozza di documento creata",
  "doc.draft_saved": "Bozza di documento salvata",
  "doc.draft_deleted": "Bozza di documento eliminata",
  "doc.sent": "Documento inviato al cliente",
  "admin.bootstrapped": "Amministratore registrato",
};

export const docCategoryLabel = {
  contract: "Contratto",
  quote: "Preventivo",
  legal: "Documento legale",
  other: "Altro",
} as const;
