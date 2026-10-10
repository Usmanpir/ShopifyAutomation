import { parseJson, route } from "@/lib/api";
import { knowledgeSchema, listKnowledge, saveKnowledge } from "@/services/knowledge.service";

export const GET = route({ permission: "approvals.view" }, async ({ auth }) => listKnowledge(auth.store.id));

export const POST = route({ permission: "ai.agents.manage", rateLimit: 30 }, async ({ req, ctx }) => saveKnowledge(ctx, await parseJson(req, knowledgeSchema)));
