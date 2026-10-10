import { parseJson, route } from "@/lib/api";
import { createShipment, createShipmentSchema } from "@/services/shipment.service";

export const POST = route<{ id: string }>({ permission: "orders.update" }, async ({ req, params, ctx }) => {
  const input = await parseJson(req, createShipmentSchema);
  return createShipment(ctx, params.id, input);
});
