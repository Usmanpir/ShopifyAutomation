import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { setDemoMode } from "@/services/settings.service";

export const POST = route({ permission: "settings.manage" }, async ({ req, ctx }) => {
  const { enabled } = await parseJson(req, z.object({ enabled: z.boolean() }));
  await setDemoMode(ctx, enabled);
  return { enabled };
});
