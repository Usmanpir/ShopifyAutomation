"use client";

import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Plus, TicketPercent } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusPill, type Tone } from "@/components/shared/status";
import { useCan, useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/client/api";

export type PromotionRow = {
  id: string;
  name: string;
  code: string;
  type: string;
  value: number;
  minSubtotal: number | null;
  usageCount: number;
  usageLimit: number | null;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
};

const TYPE_LABEL: Record<string, string> = { PERCENTAGE: "Percentage", FIXED_AMOUNT: "Fixed amount", FREE_SHIPPING: "Free shipping" };

function state(p: PromotionRow): { label: string; tone: Tone } {
  const now = Date.now();
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return { label: "Expired", tone: "neutral" };
  if (!p.active) return { label: "Inactive", tone: "neutral" };
  if (new Date(p.startsAt).getTime() > now) return { label: "Scheduled", tone: "info" };
  if (p.usageLimit && p.usageCount >= p.usageLimit) return { label: "Limit reached", tone: "warning" };
  return { label: "Live", tone: "success" };
}

function ActiveSwitch({ p, disabled }: { p: PromotionRow; disabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(p.active);
  const toggle = useMutation({
    mutationFn: (active: boolean) => api(`/api/marketing/promotions/${p.id}`, { method: "PATCH", body: { active } }),
    onSuccess: (_d, active) => {
      toast.success(`${p.code} ${active ? "activated" : "deactivated"}`);
      router.refresh();
    },
    onError: (e) => {
      setOn(p.active);
      toast.error("Couldn't update promotion", { description: errorMessage(e) });
    },
  });
  return (
    <Switch
      checked={on}
      disabled={disabled || toggle.isPending}
      onCheckedChange={(v) => {
        setOn(v);
        toggle.mutate(v);
      }}
      aria-label={`${on ? "Deactivate" : "Activate"} ${p.code}`}
    />
  );
}

export function PromotionsTable({ rows }: { rows: PromotionRow[] }) {
  const f = useFormat();
  const can = useCan();
  const canManage = can("marketing.manage");
  const valueLabel = (p: PromotionRow) => (p.type === "PERCENTAGE" ? `${p.value}% off` : p.type === "FIXED_AMOUNT" ? `${f.money(p.value)} off` : "Free shipping");
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code).then(
      () => toast.success(`Copied ${code}`),
      () => toast.error("Couldn't copy"),
    );
  };
  const columns: Column<PromotionRow>[] = [
    {
      key: "name",
      header: "Promotion",
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium">{p.name}</p>
          {p.minSubtotal ? <p className="text-xs text-muted-foreground">Min. order {f.money(p.minSubtotal)}</p> : null}
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      cell: (p) => (
        <button type="button" onClick={() => copy(p.code)} className="group inline-flex items-center gap-1.5 rounded-md border border-dashed bg-surface-2 px-2 py-0.5 font-mono text-[12.5px] font-semibold" aria-label={`Copy code ${p.code}`}>
          {p.code}
          <Copy className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
        </button>
      ),
    },
    { key: "type", header: "Type", hideBelow: "lg", cell: (p) => <span className="text-[13px] text-muted-foreground">{TYPE_LABEL[p.type] ?? p.type}</span> },
    { key: "value", header: "Value", cell: (p) => <span className="tabular font-medium">{valueLabel(p)}</span> },
    {
      key: "usage",
      header: "Usage",
      cell: (p) => (
        <div className="w-28">
          <p className="tabular text-[13px]">
            <span className="font-semibold">{f.number(p.usageCount)}</span>
            <span className="text-muted-foreground">{p.usageLimit ? ` / ${f.number(p.usageLimit)}` : " uses"}</span>
          </p>
          {p.usageLimit ? (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, (p.usageCount / p.usageLimit) * 100)}%` }} />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Runs",
      hideBelow: "lg",
      cell: (p) => (
        <span className="text-[13px] whitespace-nowrap text-muted-foreground">
          {f.dateShort(p.startsAt)} – {p.endsAt ? f.dateShort(p.endsAt) : "No end"}
        </span>
      ),
    },
    {
      key: "state",
      header: "Status",
      cell: (p) => {
        const s = state(p);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
    },
    { key: "active", header: "Active", align: "right", cell: (p) => <ActiveSwitch p={p} disabled={!canManage} /> },
  ];
  return (
    <DataTable
      caption="Promotions"
      columns={columns}
      rows={rows}
      empty={<EmptyState icon={<TicketPercent />} title="No promotions yet" description="Create discount codes to use in WhatsApp campaigns and ads." action={canManage ? <NewPromotionButton /> : undefined} />}
      mobileCard={(p) => {
        const s = state(p);
        return (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{p.name}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded border border-dashed px-1.5 font-mono font-semibold text-foreground">{p.code}</span>
                {valueLabel(p)} · {p.usageCount} used
              </p>
              <StatusPill tone={s.tone}>{s.label}</StatusPill>
            </div>
            <ActiveSwitch p={p} disabled={!canManage} />
          </div>
        );
      }}
    />
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function NewPromotionButton() {
  const router = useRouter();
  const f = useFormat();
  const id = useId();
  const [open, setOpen] = useState(useSearchParams().get("new") === "1");
  const [form, setForm] = useState({ name: "", code: "", type: "PERCENTAGE", value: "10", minSubtotal: "", startsAt: today(), endsAt: "", usageLimit: "" });
  const set = (patch: Partial<typeof form>) => setForm((x) => ({ ...x, ...patch }));
  const value = Number(form.value);
  const valueOk = form.type === "FREE_SHIPPING" || (Number.isFinite(value) && value > 0 && (form.type !== "PERCENTAGE" || value <= 90));
  const codeOk = /^[A-Z0-9_-]{3,30}$/i.test(form.code);
  const datesOk = !form.endsAt || form.endsAt >= form.startsAt;
  const valid = form.name.trim().length >= 2 && codeOk && valueOk && datesOk && !!form.startsAt;

  const create = useMutation({
    mutationFn: () =>
      api("/api/marketing/promotions", {
        body: {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          type: form.type,
          value: form.type === "FREE_SHIPPING" ? 0 : value,
          minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : undefined,
          startsAt: form.startsAt,
          endsAt: form.endsAt || undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(`Promotion ${form.code.toUpperCase()} created`);
      setOpen(false);
      setForm({ name: "", code: "", type: "PERCENTAGE", value: "10", minSubtotal: "", startsAt: today(), endsAt: "", usageLimit: "" });
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't create promotion", { description: errorMessage(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="h-9" onClick={() => setOpen(true)}>
        <Plus /> New promotion
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New promotion</DialogTitle>
          <DialogDescription>Create a discount code customers can use at checkout.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Eid weekend 15%" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-code`}>Code</Label>
            <Input id={`${id}-code`} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="EID15" maxLength={30} className="font-mono uppercase" aria-invalid={!!form.code && !codeOk} />
            {form.code && !codeOk && <p className="text-xs text-danger">3–30 letters, numbers, - or _</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-type`}>Type</Label>
            <Select value={form.type} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger id={`${id}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.type !== "FREE_SHIPPING" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-value`}>{form.type === "PERCENTAGE" ? "Discount (%)" : `Discount (${f.currencySymbol})`}</Label>
              <Input id={`${id}-value`} type="number" min={1} max={form.type === "PERCENTAGE" ? 90 : undefined} value={form.value} onChange={(e) => set({ value: e.target.value })} aria-invalid={!valueOk} />
              {!valueOk && <p className="text-xs text-danger">{form.type === "PERCENTAGE" ? "Between 1% and 90%." : "Enter an amount."}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-min`}>Minimum order ({f.currencySymbol})</Label>
            <Input id={`${id}-min`} type="number" min={0} value={form.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-start`}>Starts</Label>
            <Input id={`${id}-start`} type="date" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-end`}>Ends</Label>
            <Input id={`${id}-end`} type="date" value={form.endsAt} min={form.startsAt} onChange={(e) => set({ endsAt: e.target.value })} aria-invalid={!datesOk} />
            {!datesOk && <p className="text-xs text-danger">End date must be after the start.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-limit`}>Usage limit</Label>
            <Input id={`${id}-limit`} type="number" min={1} value={form.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} placeholder="Unlimited" />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Create promotion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
