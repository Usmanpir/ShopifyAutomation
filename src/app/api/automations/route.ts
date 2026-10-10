import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { AUTOMATION_TEMPLATES } from "@/lib/automation/templates";
import { automationSaveSchema, createAutomation, createFromTemplate, listAutomations } from "@/services/automation.service";

export const GET = route({ permission: "automations.view" }, async ({ auth }) => ({
  automations: await listAutomations(auth.store.id),
  templates: AUTOMATION_TEMPLATES.map(({ graph, ...t }) => ({ ...t, steps: graph.nodes.length })),
}));

/** POST { templateKey } to install a template, or a full { name, description, graph }. */
export const POST = route({ permission: "automations.manage" }, async ({ req, ctx }) => {
  const body = await parseJson(req, z.union([z.object({ templateKey: z.string().min(1) }), automationSaveSchema]));
  if ("templateKey" in body) return createFromTemplate(ctx, body.templateKey);
  return createAutomation(ctx, body);
});
