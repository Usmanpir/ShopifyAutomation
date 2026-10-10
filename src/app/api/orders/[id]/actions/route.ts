import { parseJson, route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { transitionOrder, transitionSchema } from "@/services/order.service";

/** POST { action: confirm|process|ship|deliver|cancel|return|request_confirmation, reason? } */
export const POST = route<{ id: string }>({ permission: "orders.update", rateLimit: 60 }, async ({ req, params, ctx, auth }) => {
  const { action, reason } = await parseJson(req, transitionSchema);
  if (action === "cancel" && !can(auth.role, "orders.cancel")) throw forbidden("Your role can't cancel orders");
  return transitionOrder(ctx, params.id, action, reason);
});
