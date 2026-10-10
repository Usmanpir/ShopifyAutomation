"use client";

import { cn } from "cn";
import { FlaskConical, Loader2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionCard } from "@/components/shared/page";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/client/api";

export function DemoModeCard({ enabled, readOnly }: { enabled: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const setDemo = async (next: boolean) => {
    setBusy(true);
    try {
      await api("/api/settings/demo", { body: { enabled: next } });
      toast.success(next ? "Demo mode on" : "Demo mode off", { description: next ? "Integrations without credentials now use simulated data." : "Only live, connected integrations will be used." });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="demo" className="scroll-mt-24">
      <SectionCard
        title="Demo mode"
        description="Explore every feature safely with realistic, simulated data."
        icon={
          <span className="grid size-9 place-items-center rounded-lg bg-warning-soft text-warning">
            <FlaskConical className="size-[18px]" aria-hidden />
          </span>
        }
        action={<StatusPill tone={enabled ? "warning" : "neutral"}>{enabled ? "Active" : "Off"}</StatusPill>}
      >
        <div className={cn("rounded-xl border p-4", enabled ? "border-warning/30 bg-warning-soft/40" : "bg-surface-2/50")}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 text-[13px] text-muted-foreground">
              <p>
                When demo mode is on, integrations that aren&apos;t connected (WhatsApp, Meta, courier) are simulated: messages are not really sent,
                shipments aren&apos;t really booked and the AI can practise on sample customers and orders.
              </p>
              <p>Turn it off once your real integrations are connected. Connected integrations always use live data.</p>
            </div>
            {readOnly ? null : enabled ? (
              <ConfirmDialog
                trigger={
                  // Wrapper takes the trigger's data-state so the Switch keeps its own checked styling.
                  <span className="mt-1 inline-flex">
                    <Switch checked aria-label="Demo mode" disabled={busy} />
                  </span>
                }
                title="Turn off demo mode?"
                description="Integrations that aren't connected will stop simulating activity. WhatsApp confirmations, courier bookings and ad syncs will only run through your real connected accounts."
                confirmLabel="Turn off demo mode"
                onConfirm={() => setDemo(false)}
              />
            ) : (
              <Switch checked={false} aria-label="Demo mode" disabled={busy} onCheckedChange={() => setDemo(true)} />
            )}
          </div>
          {busy && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Updating…
            </p>
          )}
        </div>
        {enabled && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShoppingCart className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium">Simulate activity</p>
                <p className="text-[13px] text-muted-foreground">Create a test order from the Orders page to watch risk scoring, WhatsApp confirmation and automations run end to end.</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
              <Link href="/orders">Open orders</Link>
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
