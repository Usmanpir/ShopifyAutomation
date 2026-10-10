"use client";

import { useMutation } from "@tanstack/react-query";
import { BarChart3, Boxes, MessageCircle, PackageCheck, ShieldAlert, ShieldCheck, Sparkles, Star, Truck, UserRoundPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/client/api";
import type { PopularItem } from "@/services/popular-automations.service";

const ICON: Record<string, LucideIcon> = {
  "cod-confirmation": PackageCheck,
  "whatsapp-auto-reply": MessageCircle,
  "delivery-notification": Truck,
  "review-request": Star,
  "low-inventory": Boxes,
  "inactive-customer": UserRoundPlus,
  "high-risk-review": ShieldAlert,
  "daily-report": BarChart3,
};

/** One switch per common automation — no builder needed. */
export function PopularAutomations({ items, canManage }: { items: PopularItem[]; canManage: boolean }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((it) => (
        <PopularRow key={it.key} item={it} canManage={canManage} />
      ))}
    </ul>
  );
}

function PopularRow({ item, canManage }: { item: PopularItem; canManage: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(item.on);
  const Icon = ICON[item.key] ?? Sparkles;
  const toggle = useMutation({
    mutationFn: (next: boolean) => api(`/api/automations/popular`, { body: { key: item.key, on: next } }),
    onMutate: (next) => setOn(next),
    onSuccess: (_r, next) => {
      toast.success(next ? `“${item.name}” is on` : `“${item.name}” is off`);
      router.refresh();
    },
    onError: (e, next) => {
      setOn(!next);
      toast.error(errorMessage(e));
    },
  });
  return (
    <li className="flex gap-3 rounded-xl border bg-card p-4 transition hover:border-foreground/12">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${on ? "bg-ai-soft text-ai" : "bg-muted text-muted-foreground"}`} aria-hidden>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14.5px] leading-snug font-semibold">{item.name}</p>
          <Switch checked={on} disabled={!canManage || toggle.isPending} onCheckedChange={(v) => toggle.mutate(v)} aria-label={`${on ? "Turn off" : "Turn on"} ${item.name}`} />
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> {item.safety}
          </p>
          {item.kind === "workflow" && item.automationId && (
            <Link href={`/automations/${item.automationId}`} className="text-[12.5px] font-medium text-primary hover:underline">
              Customize
            </Link>
          )}
          {item.key === "whatsapp-auto-reply" && (
            <Link href="/agents/WHATSAPP" className="text-[12.5px] font-medium text-primary hover:underline">
              Settings
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
