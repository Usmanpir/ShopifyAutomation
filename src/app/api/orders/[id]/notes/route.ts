import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { addOrderNote } from "@/services/order.service";

export const POST = route<{ id: string }>({ permission: "orders.update" }, async ({ req, params, ctx }) => {
  const { note } = await parseJson(req, z.object({ note: z.string().trim().min(1).max(1000) }));
  await addOrderNote(ctx, params.id, note);
  return { ok: true };
});
