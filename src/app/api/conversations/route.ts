import { parseQuery, route } from "@/lib/api";
import { conversationListQuery, listConversations } from "@/services/conversation.service";

export const GET = route({ permission: "conversations.view" }, async ({ req, auth }) => listConversations(auth.store.id, auth.user.id, parseQuery(req, conversationListQuery)));
