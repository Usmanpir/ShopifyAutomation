import { route } from "@/lib/api";
import { getOrderDetail } from "@/services/order.service";

export const GET = route<{ id: string }>({ permission: "orders.view" }, async ({ params, auth }) => getOrderDetail(auth.store.id, params.id));
