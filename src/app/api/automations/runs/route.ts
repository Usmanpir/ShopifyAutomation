import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { listRuns } from "@/services/automation.service";

export const GET = route({ permission: "automations.view" }, async ({ req, auth }) => {
  const q = parseQuery(req, z.object({ automationId: z.string().optional(), status: z.enum(["RUNNING", "WAITING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }));
  return listRuns(auth.store.id, q);
});
