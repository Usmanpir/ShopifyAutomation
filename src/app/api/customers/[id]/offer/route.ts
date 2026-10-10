import { parseJson, route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { createCustomerOffer, customerOfferSchema } from "@/services/customer-actions.service";

/** Create a personal single-use offer code, optionally sent on WhatsApp. */
export const POST = route<{ id: string }>({ permission: "marketing.manage", rateLimit: 20 }, async ({ req, params, ctx, auth }) => {
  const input = await parseJson(req, customerOfferSchema);
  if (input.send && !can(auth.role, "conversations.reply")) throw forbidden("Your role can create the code but not message customers");
  return createCustomerOffer(ctx, params.id, input);
});
