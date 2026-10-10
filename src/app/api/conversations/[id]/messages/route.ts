import { parseJson, route } from "@/lib/api";
import { agentReplySchema, sendAgentReply } from "@/services/conversation.service";

export const POST = route<{ id: string }>({ permission: "conversations.reply", rateLimit: 60 }, async ({ req, params, ctx }) => {
  const { text } = await parseJson(req, agentReplySchema);
  return sendAgentReply(ctx, params.id, text);
});
