import { route } from "@/lib/api";
import { cancelRun } from "@/services/automation.service";

export const DELETE = route<{ id: string }>({ permission: "automations.manage" }, async ({ params, ctx }) => {
  await cancelRun(ctx, params.id);
  return { ok: true };
});
