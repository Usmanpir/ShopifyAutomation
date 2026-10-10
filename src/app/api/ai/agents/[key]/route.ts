import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { agentUpdateSchema, getAgentDetail, updateAgent } from "@/services/agent.service";

const keySchema = z.enum(["ORDER", "WHATSAPP", "SUPPORT", "MARKETING", "ADS", "INVENTORY", "BUSINESS"]);

export const GET = route<{ key: string }>({ permission: "approvals.view" }, async ({ params, auth }) => getAgentDetail(auth.store.id, keySchema.parse(params.key.toUpperCase())));

export const PATCH = route<{ key: string }>({ permission: "ai.agents.manage" }, async ({ req, params, ctx }) => updateAgent(ctx, keySchema.parse(params.key.toUpperCase()), await parseJson(req, agentUpdateSchema)));
