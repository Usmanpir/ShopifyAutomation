import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { aiActivity } from "@/services/agent.service";

export const GET = route({ permission: "approvals.view" }, async ({ req, auth }) => {
  const q = parseQuery(req, z.object({ agent: z.enum(["ORDER", "WHATSAPP", "SUPPORT", "MARKETING", "ADS", "INVENTORY", "BUSINESS"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(60) }));
  return aiActivity(auth.store.id, { agentKey: q.agent, limit: q.limit });
});
