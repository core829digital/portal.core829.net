import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit } from "./lib/audit";

/** Registro del ponte con Andromedia Web: ogni scrittura sul sito e' tracciata anche qui (chi, cosa, su cosa). */
export const log = internalMutation({
  args: { actorId: v.string(), action: v.string(), target: v.string() },
  handler: async (ctx, args): Promise<null> => {
    await audit(ctx, { actorType: "admin", actorId: args.actorId, action: `site.${args.action}`, resourceType: "site", metadata: { target: args.target.slice(0, 120) } });
    return null;
  },
});
