import { parseJson, route } from "@/lib/api";
import { customerMessageSchema, messageCustomer } from "@/services/customer-actions.service";

/** Send one WhatsApp message to this customer. */
export const POST = route<{ id: string }>({ permission: "conversations.reply", rateLimit: 30 }, async ({ req, params, ctx }) => {
  const { text } = await parseJson(req, customerMessageSchema);
  return messageCustomer(ctx, params.id, text);
});
