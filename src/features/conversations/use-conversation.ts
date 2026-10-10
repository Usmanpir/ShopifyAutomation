"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";
import type { ConversationDetail, ThreadMessage } from "./types";

export const conversationKey = (id: string) => ["conversation", id] as const;

export function useConversation(id: string | null, initial?: ConversationDetail | null) {
  return useQuery({
    queryKey: conversationKey(id ?? "none"),
    queryFn: () => api<ConversationDetail>(`/api/conversations/${id}`),
    enabled: !!id,
    initialData: initial && initial.id === id ? initial : undefined,
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });
}

export type ConversationPatch = {
  handler?: "AI" | "HUMAN";
  aiMode?: "MANUAL" | "SUGGEST" | "AUTO";
  status?: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  notes?: string | null;
  tags?: string[];
  dismissAttention?: boolean;
};

const PATCH_SUCCESS = (p: ConversationPatch) =>
  p.aiMode === "AUTO"
    ? "AI replies automatically to approved topics"
    : p.aiMode === "SUGGEST"
      ? "AI will suggest replies — you send them"
      : p.aiMode === "MANUAL"
        ? "AI is off for this conversation"
        : p.handler === "HUMAN"
    ? "You've taken over — the AI is paused for this chat"
    : p.handler === "AI"
      ? "Handed back to the AI agent"
      : p.status === "RESOLVED"
        ? "Conversation resolved"
        : p.status === "CLOSED"
          ? "Conversation closed"
          : p.status === "OPEN"
            ? "Conversation reopened"
            : p.dismissAttention
              ? "Marked as handled"
              : p.tags
                ? "Tags updated"
                : p.notes !== undefined
                  ? "Notes saved"
                  : "Updated";

/** All mutations for a single conversation; keeps the list + thread caches fresh. */
export function useConversationActions(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: conversationKey(id) });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
    void qc.invalidateQueries({ queryKey: ["shell-counts"] });
  };

  const update = useMutation({
    mutationFn: (p: ConversationPatch) => api(`/api/conversations/${id}`, { method: "PATCH", body: p }),
    onSuccess: (_r, p) => {
      toast.success(PATCH_SUCCESS(p));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const send = useMutation({
    mutationFn: (text: string) => api<ThreadMessage>(`/api/conversations/${id}/messages`, { body: { text } }),
    onMutate: async (text) => {
      // Optimistic bubble so sending feels instant.
      await qc.cancelQueries({ queryKey: conversationKey(id) });
      const prev = qc.getQueryData<ConversationDetail>(conversationKey(id));
      if (prev) {
        const temp: ThreadMessage = {
          ...(prev.messages[0] ?? ({} as ThreadMessage)),
          id: `temp-${Date.now()}`,
          direction: "OUTBOUND",
          sender: "AGENT",
          senderUserId: null,
          body: text,
          status: "QUEUED",
          templateName: null,
          aiMeta: null,
          error: null,
          mediaUrl: null,
          mediaType: null,
          externalId: null,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData<ConversationDetail>(conversationKey(id), {
          ...prev,
          handler: "HUMAN",
          aiMode: prev.aiMode === "AUTO" ? "SUGGEST" : prev.aiMode,
          needsAttention: false,
          messages: [...prev.messages, temp],
        });
      }
      return { prev };
    },
    onError: (e, _t, ctx) => {
      if (ctx?.prev) qc.setQueryData(conversationKey(id), ctx.prev);
      toast.error("Message not sent", { description: errorMessage(e) });
    },
    onSettled: refresh,
  });

  const simulate = useMutation({
    mutationFn: (text: string) => api(`/api/conversations/simulate`, { body: { conversationId: id, text } }),
    onSuccess: () => {
      toast.success("Customer message simulated", { description: "Watch the WhatsApp agent reply in a few seconds." });
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const markRead = useMutation({
    mutationFn: () => api(`/api/conversations/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["shell-counts"] });
    },
  });

  return { update, send, simulate, markRead, refresh };
}
