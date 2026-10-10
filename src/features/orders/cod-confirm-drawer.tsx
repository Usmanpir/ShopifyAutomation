"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckCircle2, Loader2, Moon, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Drawer } from "@/components/shared/drawer";
import { ErrorState } from "@/components/shared/states";
import { RiskBadge } from "@/components/shared/status";
import { TimeAgo } from "@/components/shared/time-ago";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";

type Row = { id: string; name: string; customerName: string; city: string | null; total: number; riskLevel: string; riskScore: number; placedAt: string; kind: "request" | "reminder" };
type Plan = {
  toSend: Row[];
  overflow: number;
  excluded: (Row & { reason: string })[];
  waitingForReply: number;
  totalValue: number;
  quietHours: { start: number; end: number } | null;
};

const hour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });

/**
 * "Let AI handle" preview for COD confirmations. Shows exactly who gets a
 * WhatsApp message (and who is left for a person) before anything is sent.
 */
export function CodConfirmDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const f = useFormat();
  const router = useRouter();
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ["cod-plan"], queryFn: () => api<Plan>("/api/orders/confirmations"), enabled: open, staleTime: 0 });
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const selected = (plan.data?.toSend ?? []).filter((o) => !unchecked.has(o.id));

  const run = useMutation({
    mutationFn: () => api<{ sent: number; failed: { id: string; name: string; error: string }[] }>("/api/orders/confirmations", { body: { orderIds: selected.map((o) => o.id) } }),
    onSuccess: (r) => {
      if (r.failed.length) toast.warning(`${r.sent} sent · ${r.failed.length} skipped`, { description: `${r.failed[0]!.name}: ${r.failed[0]!.error}` });
      else toast.success(`Order Assistant sent ${r.sent} WhatsApp confirmation${r.sent === 1 ? "" : "s"}`, { description: "Customers who reply “yes” are confirmed automatically." });
      onOpenChange(false);
      setUnchecked(new Set());
      qc.invalidateQueries({ queryKey: ["priorities"] });
      qc.invalidateQueries({ queryKey: ["shell-counts"] });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const requests = selected.filter((o) => o.kind === "request").length;
  const reminders = selected.length - requests;
  const value = selected.reduce((s, o) => s + o.total, 0);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      icon={<Sparkles />}
      title="Let AI confirm COD orders"
      description="The Order Assistant will send each customer the WhatsApp confirmation template. Nothing is sent until you press the button below."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate()} disabled={!selected.length || run.isPending} className="bg-ai text-white hover:bg-ai/90 dark:text-zinc-950">
            {run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Send {selected.length} message{selected.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {plan.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : plan.isError ? (
        <ErrorState title="Couldn't prepare the list" description="No messages were sent. Please try again." onRetry={() => plan.refetch()} />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 divide-x rounded-xl border bg-surface-2/60 text-center">
            {[
              { label: "New requests", value: requests },
              { label: "Reminders", value: reminders },
              { label: "Order value", value: f.money(value, { compact: true }) },
            ].map((s) => (
              <div key={s.label} className="px-2 py-3">
                <dt className="text-[11.5px] text-muted-foreground">{s.label}</dt>
                <dd className="tabular mt-0.5 text-base font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>

          {plan.data.quietHours && (
            <p className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
              <Moon className="mt-0.5 size-4 shrink-0" aria-hidden />
              It&apos;s inside your quiet hours ({hour(plan.data.quietHours.start)}–{hour(plan.data.quietHours.end)}). Customers may be asleep — you can still send now.
            </p>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Will be messaged</h3>
            {plan.data.toSend.length ? (
              <ul className="divide-y rounded-xl border">
                {plan.data.toSend.map((o) => (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                      <Checkbox
                        checked={!unchecked.has(o.id)}
                        onCheckedChange={(on) => {
                          const next = new Set(unchecked);
                          if (on) next.delete(o.id);
                          else next.add(o.id);
                          setUnchecked(next);
                        }}
                        aria-label={`Include ${o.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          {o.name} <span className="font-normal text-muted-foreground">· {o.customerName}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.city ?? "—"} · <TimeAgo date={o.placedAt} /> · {o.kind === "reminder" ? "reminder (no reply in 24 h)" : "first request"}
                        </p>
                      </div>
                      <RiskBadge level={o.riskLevel} compact />
                      <span className="tabular w-20 text-right text-[13px] font-semibold">{f.money(o.total)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border px-3 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" /> Nothing to send — every customer has been asked{plan.data.waitingForReply ? ` and ${plan.data.waitingForReply} replies are still due today` : ""}.
              </p>
            )}
            {plan.data.overflow > 0 && <p className="mt-2 text-xs text-muted-foreground">{plan.data.overflow} more will be offered in the next batch (max 50 at a time).</p>}
          </section>

          {plan.data.excluded.length > 0 && (
            <section>
              <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                <ShieldAlert className="size-4 text-danger" aria-hidden /> Left for you to review
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">AI never messages these on its own.</p>
              <ul className="divide-y rounded-xl border">
                {plan.data.excluded.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          {o.name} <span className="font-normal text-muted-foreground">· {o.customerName}</span>
                        </p>
                        <p className={cn("truncate text-xs", o.riskLevel === "HIGH" ? "text-danger" : "text-muted-foreground")}>{o.reason}</p>
                      </div>
                      <span className="tabular text-[13px] font-semibold">{f.money(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each message is logged in the order timeline and the audit log. Orders that changed status since this list was prepared are skipped automatically.
          </p>
        </div>
      )}
    </Drawer>
  );
}
