import { route } from "@/lib/api";
import { markConversationRead } from "@/services/conversation.service";

export const POST = route<{ id: string }>({ permission: "conversations.view" }, async ({ params, auth }) => {
  await markConversationRead(auth.store.id, params.id);
  return { ok: true };
});
