"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";

/** Approve / reject an AI decision with toasts and cache refresh. */
export function useDecisionActions(onDone?: (id: string) => void) {
  const qc = useQueryClient();
  const router = useRouter();
  const done = (id: string) => {
    qc.invalidateQueries({ queryKey: ["shell-counts"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    onDone?.(id);
    router.refresh();
  };
  const approve = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api<{ status: string }>(`/api/approvals/${id}/approve`, { method: "POST", body: { note } }),
    onSuccess: (r, v) => {
      if (r.status === "FAILED") toast.error("Approved, but the action failed — see the audit log for details.");
      else toast.success("Approved and executed");
      done(v.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api(`/api/approvals/${id}/reject`, { method: "POST", body: { note } }),
    onSuccess: (_, v) => {
      toast("Recommendation rejected");
      done(v.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return { approve, reject };
}
