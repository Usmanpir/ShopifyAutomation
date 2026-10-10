import { parseQuery, route } from "@/lib/api";
import { listOrders, orderListQuery, orderTabCounts } from "@/services/order.service";

export const GET = route({ permission: "orders.view" }, async ({ req, auth }) => {
  const q = parseQuery(req, orderListQuery);
  const [list, counts] = await Promise.all([listOrders(auth.store.id, q), orderTabCounts(auth.store.id)]);
  return { ...list, counts };
});
