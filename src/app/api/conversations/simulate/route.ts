import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { simulateInbound } from "@/services/conversation.service";

/** Demo mode only: inject a customer message to watch the AI agent respond. */
export const POST = route({ permission: "conversations.reply", rateLimit: 30 }, async ({ req, ctx, auth }) => {
  if (!auth.store.demoMode) throw badRequest("Message simulation is only available in demo mode");
  const input = await parseJson(req, z.object({ conversationId: z.string().optional(), phone: z.string().optional(), name: z.string().max(80).optional(), text: z.string().trim().min(1).max(1000) }));
  return simulateInbound(ctx, input);
});
