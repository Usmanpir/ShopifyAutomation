"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowUpRight, Bot, CircleAlert, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { DECISION_STATUS, Pill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/store-context";
import { friendlyNameFromLabel } from "@/lib/ai/team";
import { api } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { AgentAvatar, formatDuration, relatedHref, TASK_STATUS } from "./agent-meta";

export type ActivityItem = {
  id: string;
  kind: "task" | "decision";
  at: string;
  agent: { name: string; key: string } | null;
  title: string;
  status: string;
  relatedType: string | null;
  relatedId: string | null;
  durationMs: number | null;
};

type KindFilter = "all" | "task" | "decision" | "failed";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "task", label: "Tasks" },
  { value: "decision", label: "Recommendations" },
  { value: "failed", label: "Failed" },
];

function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Strip a leading agent name so lines read "Order Agent · confirmed #10452" without repetition. */
function stripAgent(title: string, agent?: string | null) {
  if (agent && title.startsWith(agent + " ")) return title.slice(agent.length + 1);
  return title;
}

export function ActivityTimeline({ initial, agent }: { initial: ActivityItem[]; agent: string | null }) {
  const { store } = useStore();
  const [limit, setLimit] = useState(100);
  const [kind, setKind] = useState<KindFilter>("all");
  const seen = useRef<Set<string>>(new Set(initial.map((i) => i.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const { data, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["ai-activity", agent, limit],
    queryFn: () => api<ActivityItem[]>(`/api/ai/activity?limit=${limit}${agent ? `&agent=${agent}` : ""}`),
    initialData: limit === 100 ? initial : undefined,
    initialDataUpdatedAt: now,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  // Highlight items that arrived since the last poll.
  useEffect(() => {
    if (!data) return;
    const incoming = data.filter((i) => !seen.current.has(i.id)).map((i) => i.id);
    data.forEach((i) => seen.current.add(i.id));
    if (incoming.length) setFresh(new Set(incoming));
  }, [data]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => {
    const all = data ?? [];
    if (kind === "all") return all;
    if (kind === "failed") return all.filter((i) => i.status === "FAILED");
    return all.filter((i) => i.kind === kind);
  }, [data, kind]);

  const groups = useMemo(() => {
    const today = dayKey(new Date(now), store.timezone);
    const yesterday = dayKey(new Date(now - 86_400_000), store.timezone);
    const dateFmt = new Intl.DateTimeFormat(store.locale, { timeZone: store.timezone, weekday: "long", day: "numeric", month: "long" });
    const out: { key: string; label: string; items: ActivityItem[] }[] = [];
    for (const it of items) {
      const d = new Date(it.at);
      const k = dayKey(d, store.timezone);
      let g = out[out.length - 1];
      if (!g || g.key !== k) {
        g = { key: k, label: k === today ? "Today" : k === yesterday ? "Yesterday" : dateFmt.format(d), items: [] };
        out.push(g);
      }
      g.items.push(it);
    }
    return out;
  }, [items, store.timezone, store.locale, now]);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat(store.locale, { timeZone: store.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [store]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const today = dayKey(new Date(now), store.timezone);
    const todays = all.filter((i) => dayKey(new Date(i.at), store.timezone) === today);
    const durations = all.filter((i) => i.durationMs !== null).map((i) => i.durationMs!);
    return {
      today: todays.length,
      failed: todays.filter((i) => i.status === "FAILED").length,
      decisions: all.filter((i) => i.kind === "decision" && i.status === "PENDING_APPROVAL").length,
      avg: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : null,
    };
  }, [data, store.timezone, now]);

  if (isError && !data) return <ErrorState description="We couldn't load AI activity." onRetry={() => refetch()} className="rounded-xl border bg-card" />;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Actions today", value: String(stats.today) },
          { label: "Failed today", value: String(stats.failed), tone: stats.failed ? "text-danger" : undefined },
          { label: "Awaiting approval", value: String(stats.decisions), tone: stats.decisions ? "text-warning" : undefined, href: "/approvals" },
          { label: "Avg. response time", value: formatDuration(stats.avg) ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-[12.5px] text-muted-foreground">{s.label}</dt>
            <dd className={cn("tabular mt-0.5 text-lg font-semibold", s.tone)}>{s.href && s.value !== "0" ? <Link href={s.href} className="hover:underline">{s.value}</Link> : s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Activity type" className="inline-flex rounded-lg bg-muted p-0.5">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.value}
              role="tab"
              aria-selected={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn("h-7 rounded-md px-2.5 text-[13px] font-medium transition", kind === k.value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {isFetching ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <span className="size-1.5 animate-pulse-dot rounded-full bg-success" aria-hidden />}
          Live · updated {timeAgo(new Date(dataUpdatedAt), Math.max(now, dataUpdatedAt))}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={<Bot />}
            title={kind === "failed" ? "No failures" : "No AI activity yet"}
            description={kind === "failed" ? "Every recent agent task completed successfully." : "When agents confirm orders, answer customers or recommend actions, it shows up here in real time."}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`}>
              <h2 id={`day-${g.key}`} className="sticky top-14 z-10 -mx-1 mb-2 flex items-center gap-2 bg-background/90 px-1 py-1.5 text-[13px] font-semibold backdrop-blur">
                {g.label}
                <span className="tabular rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{g.items.length}</span>
              </h2>
              <ol className="relative overflow-hidden rounded-xl border bg-card">
                {g.items.map((it) => (
                  <TimelineRow key={`${it.kind}-${it.id}`} item={it} time={timeFmt.format(new Date(it.at))} fresh={fresh.has(it.id)} />
                ))}
              </ol>
            </section>
          ))}
          {(data?.length ?? 0) >= limit && limit < 200 && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit(200)} disabled={isFetching}>
                {isFetching && <Loader2 className="animate-spin" />} Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ item, time, fresh }: { item: ActivityItem; time: string; fresh: boolean }) {
  const rel = item.kind === "decision" ? { href: `/approvals?${item.status === "PENDING_APPROVAL" ? "" : "status=all&"}focus=${item.id}`, label: "Review" } : relatedHref(item.relatedType, item.relatedId);
  const duration = formatDuration(item.durationMs);
  const failed = item.status === "FAILED";
  return (
    <li className={cn("group relative flex items-start gap-3 border-b px-4 py-3 last:border-0 sm:px-5", fresh && "animate-slide-in bg-ai-soft/40")}>
      <time dateTime={item.at} className="tabular w-11 shrink-0 pt-1.5 text-xs text-muted-foreground">
        {time}
      </time>
      <div className="relative">
        <AgentAvatar agentKey={item.agent?.key} size="sm" muted={!item.agent} />
        {failed && (
          <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-card">
            <CircleAlert className="size-3.5 text-danger" aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-5">
          <span className="sr-only">{time} · </span>
          <span className="font-semibold">{friendlyNameFromLabel(item.agent?.name)}</span> <span className="text-foreground/90">{stripAgent(item.title, item.agent?.name)}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {item.kind === "decision" ? (
            <span className="inline-flex items-center gap-1 font-medium text-ai">
              <Sparkles className="size-3" aria-hidden /> Recommendation
            </span>
          ) : (
            <span>Task</span>
          )}
          <span aria-hidden>·</span>
          <Pill map={item.kind === "decision" ? DECISION_STATUS : TASK_STATUS} value={item.status} className="h-5 text-[11px]" />
          {duration && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">{duration}</span>
            </>
          )}
        </div>
      </div>
      {rel && (
        <Link
          href={rel.href}
          className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-primary hover:bg-primary/8 focus-visible:outline-2"
          aria-label={`${rel.label}: ${item.title}`}
        >
          <span className="hidden sm:inline">{rel.label}</span>
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
}
