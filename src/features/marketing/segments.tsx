"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, Loader2, Lock, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/states";
import { SegmentBadge } from "@/components/shared/status";
import { useCan, useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { SEGMENT_FIELDS, type SegmentField } from "@/schemas/segment";

export type SegmentRow = { id: string; key: string; name: string; description: string | null; color: string; isSystem: boolean; customerCount: number; computedAt: string | null };

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type Row = { uid: number; field: SegmentField; operator: Op; value: string };

const OP_LABEL: Record<Op, string> = { eq: "is", neq: "is not", gt: "greater than", gte: "at least", lt: "less than", lte: "at most" };
const fieldDef = (k: SegmentField) => SEGMENT_FIELDS.find((x) => x.key === k)!;
const opsFor = (k: SegmentField): Op[] => {
  const t = fieldDef(k).type;
  return t === "number" || t === "money" ? ["gte", "gt", "lte", "lt", "eq", "neq"] : t === "boolean" ? ["eq"] : ["eq", "neq"];
};
const defaultValue = (k: SegmentField) => {
  const d = fieldDef(k);
  return d.type === "boolean" ? "true" : d.type === "enum" ? d.options[0] : "";
};
const COLORS = ["indigo", "violet", "sky", "teal", "amber", "red", "slate"];

function toCondition(r: Row) {
  const t = fieldDef(r.field).type;
  if (r.value.trim() === "") return null;
  if (t === "number" || t === "money") {
    const n = Number(r.value);
    return Number.isFinite(n) ? { field: r.field, operator: r.operator, value: n } : null;
  }
  if (t === "boolean") return { field: r.field, operator: r.operator, value: r.value === "true" };
  return { field: r.field, operator: r.operator, value: r.value.trim() };
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

let uidSeq = 1;

function CreateSegmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const f = useFormat();
  const id = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("indigo");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [rows, setRows] = useState<Row[]>(() => [{ uid: uidSeq++, field: "totalOrders", operator: "gte", value: "2" }]);

  const conditions = rows.map(toCondition).filter((c): c is NonNullable<ReturnType<typeof toCondition>> => !!c);
  const rules = { match, conditions };
  const debounced = useDebounced(JSON.stringify(rules), 400);
  const preview = useQuery({
    queryKey: ["segment-preview", debounced],
    queryFn: ({ signal }) => api<{ count: number; sample: { id: string; name: string; totalSpent: number; totalOrders: number }[] }>("/api/marketing/segments/preview", { body: JSON.parse(debounced), signal }),
    enabled: open && conditions.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const update = (uid: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const reset = () => {
    setName("");
    setDescription("");
    setColor("indigo");
    setMatch("all");
    setRows([{ uid: uidSeq++, field: "totalOrders", operator: "gte", value: "2" }]);
  };

  const create = useMutation({
    mutationFn: () => api<{ customerCount: number }>("/api/marketing/segments", { body: { name: name.trim(), description: description.trim() || undefined, color, rules } }),
    onSuccess: (s) => {
      toast.success(`Segment “${name.trim()}” created`, { description: `${s?.customerCount ?? 0} customers match right now. It refreshes automatically.` });
      onOpenChange(false);
      reset();
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't create segment", { description: errorMessage(e) }),
  });

  const valid = name.trim().length >= 2 && conditions.length > 0 && conditions.length === rows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create segment</DialogTitle>
          <DialogDescription>Define who belongs with rules. Membership updates automatically as customers order.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_250px]">
          <form
            id={`${id}-form`}
            className="min-w-0 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) create.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lahore repeat buyers" maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-desc`}>Description</Label>
                <Input id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" maxLength={200} />
              </div>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Badge color</legend>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={cn("rounded-full ring-offset-2 ring-offset-popover transition", color === c ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100")}
                  >
                    <SegmentBadge name={c[0].toUpperCase() + c.slice(1)} color={c} />
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Customers matching</span>
                <ToggleGroup type="single" value={match} onValueChange={(v) => v && setMatch(v as "all" | "any")} variant="outline" size="sm" aria-label="Match mode">
                  <ToggleGroupItem value="all">all</ToggleGroupItem>
                  <ToggleGroupItem value="any">any</ToggleGroupItem>
                </ToggleGroup>
                <span>of these rules</span>
              </div>
              <ul className="space-y-2">
                {rows.map((r, i) => {
                  const def = fieldDef(r.field);
                  return (
                    <li key={r.uid} className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-surface-2 p-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                      <Select
                        value={r.field}
                        onValueChange={(v) => {
                          const k = v as SegmentField;
                          update(r.uid, { field: k, operator: opsFor(k)[0], value: defaultValue(k) });
                        }}
                      >
                        <SelectTrigger size="sm" className="w-full bg-card" aria-label={`Rule ${i + 1} field`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEGMENT_FIELDS.map((x) => (
                            <SelectItem key={x.key} value={x.key}>
                              {x.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" size="icon-sm" variant="ghost" className="sm:order-last" onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))} disabled={rows.length === 1} aria-label={`Remove rule ${i + 1}`}>
                        <Trash2 />
                      </Button>
                      <Select value={r.operator} onValueChange={(v) => update(r.uid, { operator: v as Op })}>
                        <SelectTrigger size="sm" className="w-full bg-card" aria-label={`Rule ${i + 1} operator`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {opsFor(r.field).map((o) => (
                            <SelectItem key={o} value={o}>
                              {OP_LABEL[o]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {def.type === "enum" || def.type === "boolean" ? (
                        <Select value={r.value} onValueChange={(v) => update(r.uid, { value: v })}>
                          <SelectTrigger size="sm" className="w-full bg-card" aria-label={`Rule ${i + 1} value`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(def.type === "boolean" ? ["true", "false"] : (def.options as readonly string[])).map((o) => (
                              <SelectItem key={o} value={o}>
                                {o === "true" ? "Yes" : o === "false" ? "No" : o[0] + o.slice(1).toLowerCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={r.value}
                          onChange={(e) => update(r.uid, { value: e.target.value })}
                          type={def.type === "string" ? "text" : "number"}
                          min={0}
                          placeholder={def.type === "money" ? f.currencySymbol : def.key === "city" ? "Lahore" : def.key === "purchasedCategory" ? "shirts" : "0"}
                          aria-label={`Rule ${i + 1} value`}
                          className="h-8 bg-card"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, { uid: uidSeq++, field: "daysSinceLastOrder", operator: "lte", value: "30" }])} disabled={rows.length >= 8}>
                <Plus /> Add rule
              </Button>
            </div>
          </form>

          <aside aria-live="polite" className="space-y-3 rounded-lg bg-surface-2 p-4">
            <p className="text-xs font-medium text-muted-foreground">Live preview</p>
            <div className="flex items-baseline gap-2">
              {preview.isFetching && !preview.data ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <span className="tabular text-3xl font-semibold tracking-tight">{conditions.length ? f.number(preview.data?.count ?? 0) : "—"}</span>
              )}
              <span className="text-sm text-muted-foreground">customers</span>
              {preview.isFetching && preview.data && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Updating" />}
            </div>
            {preview.isError && <p className="text-xs text-danger">{errorMessage(preview.error)}</p>}
            {conditions.length < rows.length && <p className="text-xs text-warning">Fill in every rule value to include it.</p>}
            {preview.data?.sample.length ? (
              <ul className="space-y-2 border-t pt-3">
                {preview.data.sample.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {c.totalOrders} · {f.money(c.totalSpent, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : conditions.length ? (
              !preview.isFetching && <p className="text-xs text-muted-foreground">No customers match these rules yet.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Add a rule to see who matches.</p>
            )}
          </aside>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Create segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SegmentCard({ s, compact }: { s: SegmentRow; compact?: boolean }) {
  const f = useFormat();
  return (
    <Link
      href={`/customers?segment=${s.key}`}
      className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/12 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <SegmentBadge name={s.name} color={s.color} />
        {s.isSystem && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Built-in segment">
            <Lock className="size-3" aria-hidden /> System
          </span>
        )}
      </div>
      <div>
        <p className="tabular text-2xl font-semibold tracking-tight">{f.number(s.customerCount)}</p>
        <p className="text-xs text-muted-foreground">customers</p>
      </div>
      {!compact && s.description && <p className="line-clamp-2 text-[13px] text-muted-foreground">{s.description}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{s.computedAt ? `Updated ${timeAgo(s.computedAt)}` : "Not computed yet"}</span>
        <span className="inline-flex items-center gap-1 font-medium text-primary opacity-80 group-hover:opacity-100">
          View <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function SegmentsGrid({ segments }: { segments: SegmentRow[] }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const custom = segments.filter((s) => !s.isSystem);
  const system = segments.filter((s) => s.isSystem);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Customer segments</h2>
          <p className="text-[13px] text-muted-foreground">{segments.length} segments · counts refresh as orders come in</p>
        </div>
        {can("marketing.manage") && (
          <Button onClick={() => setOpen(true)}>
            <Plus /> Create segment
          </Button>
        )}
      </div>
      <section aria-labelledby="custom-seg" className="space-y-3">
        <h3 id="custom-seg" className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
          Your segments
        </h3>
        {custom.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {custom.map((s) => (
              <li key={s.id}>
                <SegmentCard s={s} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed bg-card">
            <EmptyState
              compact
              icon={<Users />}
              title="No custom segments yet"
              description="Combine rules like total spend, city and days since last order to target exactly the right customers."
              action={
                can("marketing.manage") ? (
                  <Button variant="outline" onClick={() => setOpen(true)}>
                    <Plus /> Create segment
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>
      <section aria-labelledby="system-seg" className="space-y-3">
        <h3 id="system-seg" className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
          Built-in segments
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {system.map((s) => (
            <li key={s.id}>
              <SegmentCard s={s} />
            </li>
          ))}
        </ul>
      </section>
      <CreateSegmentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
