import { route } from "@/lib/api";
import { suggestReplies } from "@/services/conversation.service";

/** AI suggested replies, grounded in live catalog/order data. */
export const GET = route<{ id: string }>({ permission: "conversations.reply", rateLimit: 30 }, async ({ params, auth }) => ({ suggestions: await suggestReplies(auth.store.id, params.id) }));
