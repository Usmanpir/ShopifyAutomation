import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { setAutomationStatus } from "@/services/automation.service";

export const POST = route<{ id: string }>({ permission: "automations.manage" }, async ({ req, params, ctx }) => {
  const { status } = await parseJson(req, z.object({ status: z.enum(["ACTIVE", "PAUSED", "DRAFT"]) }));
  return setAutomationStatus(ctx, params.id, status);
});
