import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Chiavi che suggeriscono un segreto: vietate nei metadati di audit (errore di programmazione). */
const SECRET_KEY = /token|secret|password|passcode|otp|hash|code/i;

export type AuditEntry = {
  actorType: "admin" | "client" | "system";
  actorId?: string;
  clientId?: Id<"clients">;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Scrive una riga nel registro di audit. Mai inserire segreti, token o codici:
 * il registro e' leggibile da chi amministra il sistema.
 */
export async function audit(ctx: MutationCtx, entry: AuditEntry): Promise<void> {
  let metadata: Record<string, string | number | boolean | null> | undefined;
  if (entry.metadata) {
    const keys = Object.keys(entry.metadata);
    if (keys.length > 20) throw new Error("audit: troppi metadati");
    metadata = {};
    for (const key of keys) {
      if (SECRET_KEY.test(key)) throw new Error(`audit: chiave non ammessa (${key})`);
      const value = entry.metadata[key];
      metadata[key] = typeof value === "string" ? value.slice(0, 200) : value;
    }
  }
  await ctx.db.insert("auditLogs", { ...entry, metadata });
}
