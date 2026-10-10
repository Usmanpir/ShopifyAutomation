import { route } from "@/lib/api";
import { dismissInsight } from "@/services/insight.service";

export const DELETE = route<{ id: string }>({ permission: "dashboard.view" }, async ({ params, auth }) => {
  await dismissInsight(auth.store.id, params.id);
  return { ok: true };
});
