import { parseJson, route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { conversationUpdateSchema, getConversation, updateConversation } from "@/services/conversation.service";

export const GET = route<{ id: string }>({ permission: "conversations.view" }, async ({ params, auth }) => getConversation(auth.store.id, params.id));

/** Take over / hand back to AI / assign / resolve / tags / notes. */
export const PATCH = route<{ id: string }>({ permission: "conversations.reply" }, async ({ req, params, ctx, auth }) => {
  const input = await parseJson(req, conversationUpdateSchema);
  if ((input.assignedToId !== undefined || input.tags) && !can(auth.role, "conversations.manage")) throw forbidden();
  return updateConversation(ctx, params.id, input);
});
