import type { getConversation, listConversations } from "@/services/conversation.service";
import type { listTickets } from "@/services/ticket.service";

/** JSON-serialized shape of server data (Dates become ISO strings). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type ConversationList = Jsonify<Awaited<ReturnType<typeof listConversations>>>;
export type ConversationListItem = ConversationList["items"][number];
export type ConversationDetail = Jsonify<Awaited<ReturnType<typeof getConversation>>>;
export type ThreadMessage = ConversationDetail["messages"][number];
export type TicketRow = Jsonify<Awaited<ReturnType<typeof listTickets>>>[number];

export type ChannelKey = "WHATSAPP" | "FACEBOOK" | "INSTAGRAM";
export type InboxFilter = "all" | "needs_reply" | "waiting" | "unread" | "attention" | "ai" | "human" | "mine" | "resolved";
export type AiMode = "MANUAL" | "SUGGEST" | "AUTO";

export type AiMeta = { intent?: string; confidence?: number; language?: string; tools?: string[]; handoff?: boolean };

export function readAiMeta(meta: unknown): AiMeta | null {
  if (!meta || typeof meta !== "object") return null;
  return meta as AiMeta;
}
