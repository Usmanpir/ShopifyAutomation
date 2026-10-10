import { parseJson, route } from "@/lib/api";
import { automationSaveSchema, deleteAutomation, getAutomation, updateAutomation } from "@/services/automation.service";

export const GET = route<{ id: string }>({ permission: "automations.view" }, async ({ params, auth }) => getAutomation(auth.store.id, params.id));

export const PUT = route<{ id: string }>({ permission: "automations.manage" }, async ({ req, params, ctx }) => updateAutomation(ctx, params.id, await parseJson(req, automationSaveSchema)));

export const DELETE = route<{ id: string }>({ permission: "automations.manage" }, async ({ params, ctx }) => {
  await deleteAutomation(ctx, params.id);
  return { ok: true };
});
