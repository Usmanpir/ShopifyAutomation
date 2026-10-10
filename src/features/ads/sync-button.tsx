"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";

type SyncResult = { synced: boolean; reason?: string; campaigns?: number; insights?: number };

export function SyncNowButton() {
  const router = useRouter();
  const sync = useMutation({
    mutationFn: () => api<SyncResult>("/api/meta/sync", { method: "POST" }),
    onSuccess: (r) => {
      if (r.synced) {
        toast.success("Meta Ads synchronized", { description: `${r.campaigns ?? 0} campaigns · ${r.insights ?? 0} daily insight rows updated` });
        router.refresh();
      } else if (r.reason === "demo") {
        toast.info("Demo mode — nothing to sync", { description: "Your ad data is simulated. Connect a real Meta ad account in Integrations to sync live data." });
      } else if (r.reason === "no_account") {
        toast.warning("No ad account connected", { description: "Connect Meta Ads in Integrations first." });
      } else {
        toast.warning("Sync skipped", { description: r.reason });
      }
    },
    onError: (e) => toast.error("Unable to sync Meta Ads", { description: errorMessage(e) }),
  });
  return (
    <Button variant="outline" className="h-9 bg-card" onClick={() => sync.mutate()} disabled={sync.isPending}>
      {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {sync.isPending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
