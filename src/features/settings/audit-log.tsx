"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Bot, ChevronLeft, ChevronRight, Cog, Loader2, ScrollText, Search, User, UserRound, Webhook, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/page";
import { TableSkeleton } from "@/components/shared/skeletons";
import { EmptyState, ErrorState } from "@/components/shared/states";
import type { Tone } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/client/api";
import { titleCase } from "@/lib/format";

type AuditRow = {
  id: string;
  actorType: "USER" | "AI" | "SYSTEM" | "CUSTOMER" | "WEBHOOK";
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
};
type AuditPage = { items: AuditRow[]; total: number; page: number; pageSize: number; pageCount: number };

const ACTORS: Record<AuditRow["actorType"], { label: string; tone: Tone; icon: React.ElementType }> = {
  AI: { label: "AI", tone: "ai", icon: Bot },
  USER: { label: "User", tone: "brand", icon: UserRound },
  SYSTEM: { label: "System", tone: "neutral", icon: Cog },
  WEBHOOK: { label: "Webhook", tone: "info", icon: Webhook },
  CUSTOMER: { label: "Customer", tone: "success", icon: User },
};

const RESOURCE_TYPES = ["order", "customer", "product", "variant", "conversation", "ticket", "automation", "automation_run", "ai_decision", "ai_agent", "campaign", "marketing_campaign", "segment", "integration", "store", "membership", "user", "session", "report"];

function Actor({ row }: { row: AuditRow }) {
  const a = ACTORS[row.actorType] ?? ACTORS.SYSTEM;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium", row.actorType === "AI" ? "bg-ai-soft text-ai" : row.actorType === "USER" ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}>
        <a.icon className="size-3" aria-hidden />
        {a.label}
      </span>
      <span className="max-w-40 truncate text-[13px]" title={row.actorName}>{row.actorName}</span>
    </div>
  );
}

function stringify(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function changedKeys(oldV: unknown, newV: unknown): { key: string; from: unknown; to: unknown }[] {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  if (!isObj(oldV) && !isObj(newV)) return oldV === undefined && newV === undefined ? [] : [{ key: "value", from: oldV, to: newV }];
  const o = isObj(oldV) ? oldV : {};
  const n = isObj(newV) ? newV : {};
  return [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => ({ key: k, from: o[k], to: n[k] }));
}

function Diff({ row }: { row: AuditRow }) {
  if (row.oldValue == null && row.newValue == null) return <span className="text-muted-foreground">—</span>;
  const changes = changedKeys(row.oldValue ?? undefined, row.newValue ?? undefined);
  const first = changes[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="max-w-56 truncate rounded-md border border-dashed px-1.5 py-0.5 text-left font-mono text-[11.5px] text-muted-foreground hover:border-solid hover:text-foreground">
          {first ? (
            <>
              {first.key !== "value" && <span className="text-foreground">{first.key}: </span>}
              {row.oldValue != null && <span className="text-danger line-through decoration-danger/50">{stringify(first.from)}</span>}
              {row.oldValue != null && " → "}
              <span className="text-success">{stringify(first.to)}</span>
              {changes.length > 1 && <span> +{changes.length - 1}</span>}
            </>
          ) : (
            "View details"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,460px)] p-0">
        <div className="border-b px-3 py-2 text-xs font-medium">Changes · {row.action}</div>
        <div className="max-h-80 overflow-auto p-3">
          {changes.length ? (
            <table className="w-full font-mono text-[11.5px]">
              <tbody>
                {changes.map((c) => (
                  <tr key={c.key} className="align-top">
                    <td className="py-1 pr-3 text-muted-foreground">{c.key}</td>
                    <td className="py-1">
                      {row.oldValue != null && <div className="rounded bg-danger-soft px-1.5 text-danger break-all">− {stringify(c.from)}</div>}
                      <div className="mt-0.5 rounded bg-success-soft px-1.5 text-success break-all">+ {stringify(c.to)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="text-[11.5px] whitespace-pre-wrap">{JSON.stringify(row.newValue ?? row.oldValue, null, 2)}</pre>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AuditLog() {
  const f = useFormat();
  const [actorType, setActorType] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (actorType !== "all") params.set("actorType", actorType);
  if (resourceType !== "all") params.set("resourceType", resourceType);
  if (q) params.set("q", q);

  const query = useQuery({ queryKey: ["audit", params.toString()], queryFn: () => api<AuditPage>(`/api/audit?${params}`), placeholderData: keepPreviousData });
  const data = query.data;
  const filtered = actorType !== "all" || resourceType !== "all" || !!q;

  const columns: Column<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      cell: (r) => (
        <span className="text-[13px] whitespace-nowrap" title={f.dateTime(r.createdAt)}>
          <TimeAgo date={r.createdAt} />
        </span>
      ),
    },
    { key: "actor", header: "Actor", cell: (r) => <Actor row={r} /> },
    {
      key: "action",
      header: "Action",
      cell: (r) => (
        <div className="min-w-0 max-w-64 space-y-1">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{r.action}</code>
          <p className="truncate text-xs text-muted-foreground" title={r.resourceLabel ?? undefined}>
            {titleCase(r.resourceType)} · <span className="text-foreground/80">{r.resourceLabel ?? r.resourceId ?? "—"}</span>
          </p>
        </div>
      ),
    },
    { key: "change", header: "Change", cell: (r) => <Diff row={r} />, hideBelow: "lg" },
    { key: "reason", header: "Reason", cell: (r) => <span className="line-clamp-2 max-w-52 text-[13px] text-muted-foreground">{r.reason ?? "—"}</span>, hideBelow: "2xl" },
    { key: "ip", header: "IP", cell: (r) => <span className="font-mono text-[11.5px] text-muted-foreground">{r.ip ?? "—"}</span>, hideBelow: "2xl" },
  ];

  return (
    <SectionCard
      title="Audit log"
      description="Every change made by people, AI agents, webhooks and the system — who, what, when and why."
      icon={<ScrollText className="size-4 text-muted-foreground" aria-hidden />}
      action={query.isFetching && !query.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, actor or resource"
              aria-label="Search audit log"
              className="h-9 w-full rounded-lg border bg-card pr-8 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select
            value={actorType}
            onValueChange={(v) => {
              setActorType(v);
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="h-9 bg-card sm:w-40" aria-label="Actor type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              {(["AI", "USER", "SYSTEM", "WEBHOOK", "CUSTOMER"] as const).map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTORS[a].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={resourceType}
            onValueChange={(v) => {
              setResourceType(v);
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="h-9 bg-card sm:w-48" aria-label="Resource type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All resources</SelectItem>
              {RESOURCE_TYPES.map((r) => (
                <SelectItem key={r} value={r}>
                  {titleCase(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton rows={6} cols={5} />
        ) : query.isError ? (
          <ErrorState description="We couldn't load the audit log." onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Audit log"
              columns={columns}
              rows={data!.items}
              className={cn(query.isFetching && "opacity-70 transition-opacity")}
              empty={
                <EmptyState
                  compact
                  icon={<ScrollText />}
                  title={filtered ? "No matching events" : "No activity yet"}
                  description={filtered ? "Try a different filter or search term." : "Changes to orders, settings and AI actions will appear here."}
                />
              }
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Actor row={r} />
                    <span className="shrink-0 text-xs text-muted-foreground"><TimeAgo date={r.createdAt} /></span>
                  </div>
                  <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{r.action}</code>
                  <p className="text-[13px] text-muted-foreground">
                    {titleCase(r.resourceType)} · {r.resourceLabel ?? r.resourceId ?? "—"}
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground">“{r.reason}”</p>}
                </div>
              )}
            />
            {data!.total > 0 && (
              <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                <span className="tabular">
                  {(data!.page - 1) * data!.pageSize + 1}–{Math.min(data!.page * data!.pageSize, data!.total)} of {data!.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="tabular px-2">
                    {data!.page} / {data!.pageCount}
                  </span>
                  <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= data!.pageCount} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}

