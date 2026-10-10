"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";

/** Demo mode: push a burst of live activity through the real pipeline. */
export function SimulateOrderButton({ label = "Simulate activity" }: { label?: string }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => api<{ actions: string[] }>("/api/demo/simulate", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.actions.length ? `Simulated: ${r.actions.join(", ")}` : "Simulated ad spend & traffic", { description: "Risk scoring, automations and the WhatsApp agent ran on it." });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button variant="outline" className="bg-card" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="animate-spin" /> : <Zap className="text-warning" />} {label}
    </Button>
  );
}
