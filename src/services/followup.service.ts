import { db } from "@/lib/db";
import { systemContext } from "@/lib/service-context";
import { notify } from "./notification.service";
import { addOrderEvent, addOrderTag } from "./order.service";

/**
 * Abandoned-confirmation follow-up: COD orders whose customer never
 * answered the WhatsApp confirmation within 24h are marked "no response"
 * and surfaced for a phone call. (Abandoned *checkouts* can be added via
 * Shopify's checkouts/create webhook using the same pattern.)
 */
export async function followUpStaleConfirmations(storeId: string, hours = 24) {
  const stale = await db.order.findMany({
    where: { storeId, status: "PENDING_CONFIRMATION", confirmationStatus: "PENDING", updatedAt: { lt: new Date(Date.now() - hours * 3_600_000) } },
    take: 100,
  });
  const ctx = systemContext(storeId, "Follow-up scheduler");
  for (const o of stale) {
    await db.order.update({ where: { id: o.id }, data: { confirmationStatus: "NO_RESPONSE" } });
    await addOrderTag(ctx, o.id, "no-response");
    await addOrderEvent(storeId, o.id, "no_response", `No reply after ${hours}h`, { description: "Call the customer before dispatching.", actorName: ctx.actor.name });
  }
  if (stale.length) {
    await notify(storeId, {
      type: "ORDER",
      severity: "WARNING",
      title: `${stale.length} COD order${stale.length === 1 ? "" : "s"} with no confirmation reply`,
      body: "Customers didn't answer the WhatsApp confirmation within 24 hours.",
      href: "/orders?tab=pending_confirmation",
      roles: ["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT"],
    });
  }
  return stale.length;
}
