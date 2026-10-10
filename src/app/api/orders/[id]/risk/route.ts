import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { analyzeOrderRisk } from "@/services/order.service";

/** Re-runs the AI risk analysis for an order. */
export const POST = route<{ id: string }>({ permission: "orders.view", rateLimit: 30 }, async ({ params, auth }) => {
  const order = await db.order.findFirst({ where: { id: params.id, storeId: auth.store.id }, select: { id: true } });
  if (!order) throw notFound("Order");
  return analyzeOrderRisk(order.id);
});
