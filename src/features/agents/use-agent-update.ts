"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";

export type AgentPatch = {
  enabled?: boolean;
  autonomy?: "SUGGEST_ONLY" | "APPROVAL_REQUIRED" | "AUTONOMOUS";
  tools?: string[];
  instructions?: string;
  confidenceThreshold?: number;
};

/** PATCH /api/ai/agents/[key] with toast + server refresh. */
export function useAgentUpdate(agentKey: string, opts: { success?: (patch: AgentPatch) => string | null; onError?: () => void } = {}) {
  const router = useRouter();
  return useMutation({
    mutationFn: (patch: AgentPatch) => api(`/api/ai/agents/${agentKey.toLowerCase()}`, { method: "PATCH", body: patch }),
    onSuccess: (_, patch) => {
      const msg = opts.success ? opts.success(patch) : "Agent updated";
      if (msg) toast.success(msg);
      router.refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      opts.onError?.();
    },
  });
}
