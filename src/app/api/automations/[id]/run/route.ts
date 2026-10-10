import { parseJson, route } from "@/lib/api";
import { testRun, testRunSchema } from "@/services/automation.service";

/** Manually run an automation against a chosen (or the most recent) entity. */
export const POST = route<{ id: string }>({ permission: "automations.manage", rateLimit: 20 }, async ({ req, params, ctx }) => {
  const input = await parseJson(req, testRunSchema).catch(() => ({}));
  return testRun(ctx, params.id, input);
});
