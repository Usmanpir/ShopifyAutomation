import { parseJson, route } from "@/lib/api";
import { listPopular, popularToggleSchema, togglePopular } from "@/services/popular-automations.service";

export const GET = route({ permission: "automations.view" }, async ({ auth }) => listPopular(auth.store.id));

/** One switch per popular automation (installs the workflow on first switch-on). */
export const POST = route({ permission: "automations.manage", rateLimit: 30 }, async ({ req, ctx }) => {
  const { key, on } = await parseJson(req, popularToggleSchema);
  return togglePopular(ctx, key, on);
});
