import { parseJson, route } from "@/lib/api";
import { deleteKnowledge, knowledgeSchema, saveKnowledge } from "@/services/knowledge.service";

export const PATCH = route<{ id: string }>({ permission: "ai.agents.manage", rateLimit: 30 }, async ({ req, params, ctx }) => saveKnowledge(ctx, await parseJson(req, knowledgeSchema), params.id));

export const DELETE = route<{ id: string }>({ permission: "ai.agents.manage", rateLimit: 30 }, async ({ params, ctx }) => {
  await deleteKnowledge(ctx, params.id);
  return { ok: true };
});
