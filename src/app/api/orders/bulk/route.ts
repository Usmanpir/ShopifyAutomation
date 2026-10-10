import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { bulkTransition, ORDER_ACTIONS } from "@/services/order.service";

export const POST = route({ permission: "orders.update", rateLimit: 20 }, async ({ req, ctx, auth }) => {
  const input = await parseJson(req, z.object({ ids: z.array(z.string()).min(1).max(100), action: z.enum(ORDER_ACTIONS), reason: z.string().max(500).optional() }));
  if (input.action === "cancel" && !can(auth.role, "orders.cancel")) throw forbidden("Your role can't cancel orders");
  const results = await bulkTransition(ctx, input.ids, input.action, input.reason);
  return { succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
});
