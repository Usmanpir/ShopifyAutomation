import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { db } from "@/lib/db";
import { sendWhatsApp } from "@/services/messaging.service";
import { audit } from "@/lib/audit";

/** Send a WhatsApp text or approved template to one customer. */
export const POST = route({ permission: "conversations.reply", rateLimit: 60 }, async ({ req, ctx, auth }) => {
  const input = await parseJson(
    req,
    z.object({
      customerId: z.string().optional(),
      phone: z.string().optional(),
      text: z.string().trim().max(4096).optional(),
      template: z.object({ name: z.string(), variables: z.array(z.string().max(200)).max(10), language: z.string().optional() }).optional(),
    }),
  );
  if (!input.text && !input.template) throw badRequest("Provide text or a template");
  const customer = input.customerId ? await db.customer.findFirst({ where: { id: input.customerId, storeId: auth.store.id } }) : null;
  const { message } = await sendWhatsApp({
    storeId: auth.store.id,
    phone: customer?.phone ?? input.phone,
    name: customer?.name ?? input.phone ?? "Customer",
    customerId: customer?.id,
    sender: "AGENT",
    senderUserId: auth.user.id,
    text: input.text,
    template: input.template,
  });
  await audit(ctx, { action: "whatsapp.send", resourceType: "message", resourceId: message.id, resourceLabel: customer?.name ?? input.phone });
  return { messageId: message.id };
});
