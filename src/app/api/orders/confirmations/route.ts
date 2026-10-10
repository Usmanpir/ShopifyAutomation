import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { codConfirmationPlan, executeCodConfirmationPlan } from "@/services/confirmation-assist.service";

/** Preview: which COD orders "Let AI handle" would message, and which it leaves for a person. */
export const GET = route({ permission: "orders.view" }, async ({ auth }) => codConfirmationPlan(auth.store.id));

/** Runs the previewed plan for the exact order ids the user confirmed. */
export const POST = route({ permission: "orders.update", rateLimit: 10 }, async ({ req, ctx }) => {
  const input = await parseJson(req, z.object({ orderIds: z.array(z.string().min(1)).min(1).max(50) }));
  return executeCodConfirmationPlan(ctx, input.orderIds);
});
