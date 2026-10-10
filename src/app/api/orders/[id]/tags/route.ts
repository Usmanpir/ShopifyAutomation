import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { addOrderTag } from "@/services/order.service";

export const POST = route<{ id: string }>({ permission: "orders.update" }, async ({ req, params, ctx }) => {
  const { tag } = await parseJson(req, z.object({ tag: z.string().trim().min(1).max(40) }));
  return addOrderTag(ctx, params.id, tag);
});
