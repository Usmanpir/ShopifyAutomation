import { parseJson, route } from "@/lib/api";
import { chat, chatInputSchema } from "@/services/assistant.service";

/** Natural-language business assistant (tools are limited to the caller's RBAC). */
export const POST = route({ permission: "ai.use", rateLimit: 20 }, async ({ req, ctx }) => chat(ctx, await parseJson(req, chatInputSchema)));
