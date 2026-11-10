import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { cleanEmail, cleanPhone, cleanText, cleanVatId } from "./lib/text";

/**
 * Importazione dal CRM (b2b.core829.net → «Data → Export / Backup»).
 *  - Clienti, progetti e fatture. I lead restano nel CRM (il portale non ha i lead); i servizi/preventivi del CRM non diventano abbonamenti.
 *  - NON elimina nulla. Ripetibile: ogni record conserva l'id del CRM (`crmRef`). Un cliente gia' presente (stessa email) viene COMPLETATO, non sovrascritto.
 *  - Le fatture arrivano NASCOSTE al cliente e senza alcuna email: nessun cliente riceve avvisi per l'importazione. Le rendi visibili tu, una per una.
 *  - Un cliente senza email valida viene saltato (nel portale l'email e' obbligatoria e serve per i link di accesso).
 *  - `dryRun: true` mostra cosa succederebbe, senza scrivere.
 */

const DAY = 86_400_000;
const arr = (x: unknown, max: number): Record<string, unknown>[] => (Array.isArray(x) ? (x.slice(0, max) as Record<string, unknown>[]) : []);
const s = (x: unknown, max = 500): string => (typeof x === "string" ? x.trim().slice(0, max) : "");
const n = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const ms = (x: unknown): number | undefined => {
  const t = typeof x === "string" ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : undefined;
};
const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Esegue una pulizia che puo' rifiutare il valore: se lo rifiuta, il campo resta vuoto (non blocca l'importazione). */
function tryClean<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const PROJECT_STATUS: Record<string, Doc<"projects">["status"]> = { Active: "in_progress", "On-Hold": "on_hold", Completed: "completed", Cancelled: "on_hold" };
const INVOICE_STATUS: Record<string, Doc<"invoices">["status"]> = { Pending: "sent", Paid: "paid", Overdue: "overdue", Cancelled: "cancelled" };

export const run = mutation({
  args: { payload: v.any(), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const root = args.payload as { format?: unknown; clients?: unknown } | null;
    if (!root || root.format !== "core829-crm-export/1") throw new Error("File non valido: serve un'esportazione del CRM (Data → Export / Backup).");
    const write = !args.dryRun;
    const report = {
      dryRun: args.dryRun, clientsCreated: 0, clientsMatched: 0, clientsCompleted: 0, clientsSkipped: [] as string[],
      projectsCreated: 0, projectsExisting: 0, invoicesCreated: 0, invoicesExisting: 0, invoicesSkipped: [] as string[],
      servicesIgnored: 0,
    };

    for (const c of arr(root.clients, 1000)) {
      const crmRef = s(c.ref, 80);
      const name = s(c.clientName, 120) || s(c.company, 120);
      const company = s(c.company, 120) || name;
      const email = tryClean(() => cleanEmail(c.email));
      if (!crmRef || !name) continue;
      if (!email) {
        report.clientsSkipped.push(`${name}: email mancante o non valida`);
        continue;
      }

      let client: Doc<"clients"> | null = (await ctx.db.query("clients").collect().then((all) => all.find((x) => x.crmRef === crmRef))) ?? null;
      if (!client) client = await ctx.db.query("clients").withIndex("by_email", (q) => q.eq("email", email)).first();
      let clientId: Id<"clients"> | undefined = client?._id;

      const extra = {
        phone: tryClean(() => cleanPhone(c.phone)), vatId: tryClean(() => cleanVatId(c.vatId)), address: s(c.address, 200) || undefined,
        pec: tryClean(() => cleanEmail(c.pec, "PEC")), legalRep: s(c.legalRep, 120) || undefined, website: s(c.website, 200) || undefined,
      };
      if (client) {
        report.clientsMatched++;
        const patch: Record<string, unknown> = {};
        if (!client.crmRef) patch.crmRef = crmRef;
        const cur = client as Record<string, unknown>;
        for (const [k, val] of Object.entries(extra)) if (val && !cur[k]) patch[k] = val;
        if (Object.keys(patch).length) {
          report.clientsCompleted++;
          if (write && clientId) await ctx.db.patch("clients", clientId, patch);
        }
      } else {
        report.clientsCreated++;
        if (write) {
          clientId = await ctx.db.insert("clients", {
            displayName: cleanText(company, { field: "nome", min: 1, max: 120 }), contactName: cleanText(name, { field: "referente", min: 1, max: 120 }), email,
            packageType: "standard", status: "active", crmRef,
            ...Object.fromEntries(Object.entries(extra).filter(([, val]) => val)),
            internalNotes: s(c.notes, 4000) || undefined,
          });
          await audit(ctx, { actorType: "admin", actorId, clientId, action: "client.imported_from_crm", resourceType: "client", resourceId: clientId });
        }
      }

      const existingProjects = clientId ? await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", clientId!)).collect() : [];
      const projectIdByRef = new Map<string, Id<"projects">>();
      for (const p of arr(c.projects, 200)) {
        const pname = s(p.projectName, 120);
        if (!pname) continue;
        const status = PROJECT_STATUS[s(p.status, 30)] ?? "in_progress";
        const found = existingProjects.find((e) => e.crmRef === s(p.ref, 80)) ?? existingProjects.find((e) => norm(e.name) === norm(pname));
        if (found) {
          // Il progetto c'e' gia': si controllano comunque le sue fatture (potrebbero essercene di nuove).
          report.projectsExisting++;
          projectIdByRef.set(s(p.ref, 80), found._id);
          if (write && !found.crmRef) await ctx.db.patch("projects", found._id, { crmRef: s(p.ref, 80) });
        } else {
          report.projectsCreated++;
          if (write && clientId) {
            projectIdByRef.set(s(p.ref, 80), await ctx.db.insert("projects", {
              clientId, name: pname, description: s(p.description, 2000) || undefined, status, progress: status === "completed" ? 100 : 0,
              startDate: ms(p.startDate), dueDate: ms(p.deadline), crmRef: s(p.ref, 80),
            }));
          }
        }

        for (const i of arr(p.invoices, 500)) {
          const number = s(i.invoiceNumber, 40);
          const crmInvoiceRef = s(i.ref, 80);
          if (!number || !/^[A-Za-z0-9/_.-]+$/.test(number)) {
            report.invoicesSkipped.push(`${name}: numero fattura «${number || "vuoto"}» non valido`);
            continue;
          }
          const same = await ctx.db.query("invoices").withIndex("by_number", (q) => q.eq("number", number)).first();
          if (same) {
            if (same.crmRef === crmInvoiceRef || same.clientId === clientId) report.invoicesExisting++;
            else report.invoicesSkipped.push(`${name}: il numero ${number} esiste già per un altro cliente`);
            if (write && same.clientId === clientId && !same.crmRef) await ctx.db.patch("invoices", same._id, { crmRef: crmInvoiceRef });
            continue;
          }
          report.invoicesCreated++;
          if (write && clientId) {
            const issuedAt = ms(i.createdAt) ?? Date.now();
            const status = INVOICE_STATUS[s(i.status, 30)] ?? "sent";
            await ctx.db.insert("invoices", {
              clientId, projectId: projectIdByRef.get(s(p.ref, 80)), number, issuedAt, dueAt: issuedAt + 30 * DAY, amountCents: Math.max(0, Math.round(n(i.amount) * 100)),
              currency: "EUR", status, paidAt: status === "paid" ? issuedAt : undefined, note: s(i.notes, 500) || undefined,
              // Nascosta al cliente: nessuna email, nessun promemoria. La rendi visibile tu quando vuoi.
              visibleToClient: false, crmRef: crmInvoiceRef,
            });
          }
        }
      }
      report.servicesIgnored += arr(c.services, 200).length;
    }
    if (write) await audit(ctx, { actorType: "admin", actorId, action: "crm.import_run", resourceType: "import", metadata: { clients: String(report.clientsCreated + report.clientsMatched) } });
    return report;
  },
});
