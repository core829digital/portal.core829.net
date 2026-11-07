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
