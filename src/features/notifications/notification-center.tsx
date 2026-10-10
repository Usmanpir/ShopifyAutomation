"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Archive, BellOff, CheckCheck, ChevronRight, Inbox, Loader2, MailOpen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NotificationIcon } from "@/components/shared/notification-icon";
import { EmptyState } from "@/components/shared/states";
import { useFormat } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import { TimeAgo } from "@/components/shared/time-ago";

export type NotificationRow = { id: string; type: string; severity: string; title: string; body: string | null; href: string | null; readAt: string | null; archivedAt: string | null; createdAt: string };

const DAY = 86_400_000;

function groupLabel(iso: string, timeZone: string) {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const k = key(new Date(iso));
  const now = new Date();
  if (k === key(now)) return "Today";
  if (k === key(new Date(now.getTime() - DAY))) return "Yesterday";
  if (new Date(iso).getTime() > now.getTime() - 7 * DAY) return "This week";
  return "Earlier";
}

export function NotificationCenter({
  initial,
  initialCursor,
  type,
  status,
  timeZone,
  unreadTotal,
}: {
  initial: NotificationRow[];
  initialCursor: string | null;
  type?: string;
  status: "unread" | "all" | "archived";
  timeZone: string;
  unreadTotal: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const f = useFormat();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const afterChange = () => {
    qc.invalidateQueries({ queryKey: ["shell-counts"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    router.refresh();
  };

  const read = useMutation({
    mutationFn: (ids: string[] | "all") => api("/api/notifications/read", { method: "POST", body: { ids } }),
    onMutate: (ids) => {
      const now = new Date().toISOString();
      setItems((xs) => xs.map((x) => (ids === "all" || ids.includes(x.id) ? { ...x, readAt: x.readAt ?? now } : x)));
    },
    onSuccess: (_, ids) => {
      if (ids === "all") toast.success("All notifications marked as read");
      else if (ids.length > 1) toast.success(`${ids.length} marked as read`);
      setSelected(new Set());
      afterChange();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      router.refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (ids: string[]) => api("/api/notifications/archive", { method: "POST", body: { ids } }),
    onMutate: (ids) => {
      const prev = items;
      setItems((xs) => xs.filter((x) => !ids.includes(x.id)));
      return { prev };
    },
    onSuccess: (_, ids) => {
      toast.success(ids.length === 1 ? "Notification archived" : `${ids.length} notifications archived`);
      setSelected(new Set());
      afterChange();
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) setItems(ctx.prev);
      toast.error(errorMessage(e));
    },
  });

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams({ status, cursor });
      if (type) p.set("type", type);
      const r = await api<{ items: NotificationRow[]; nextCursor: string | null }>(`/api/notifications?${p.toString()}`);
      setItems((xs) => [...xs, ...r.items.filter((n) => !xs.some((x) => x.id === n.id))]);
      setCursor(r.nextCursor);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = items.length > 0 && items.every((x) => selected.has(x.id));
  const busy = read.isPending || archive.isPending;
  const selectedIds = [...selected];
  const selectedUnread = items.filter((x) => selected.has(x.id) && !x.readAt).map((x) => x.id);
  const archivedView = status === "archived";

  if (!items.length) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={archivedView ? <Archive /> : status === "unread" ? <CheckCheck /> : <BellOff />}
          title={archivedView ? "Nothing archived" : status === "unread" ? "You're all caught up" : "No notifications yet"}
          description={
            archivedView
              ? "Archived notifications are kept here for reference."
              : status === "unread"
                ? "New orders, stock alerts and AI recommendations will show up here."
                : type
                  ? "No notifications of this type yet."
                  : "We'll notify you about orders, stock, conversations and AI recommendations."
          }
          action={
            status === "unread" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/notifications?status=all${type ? `&type=${type}` : ""}`}>View all notifications</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // Group by relative day, preserving order.
  const groups: { label: string; rows: NotificationRow[] }[] = [];
  for (const n of items) {
    const label = groupLabel(n.createdAt, timeZone);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.rows.push(n);
    else groups.push({ label, rows: [n] });
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div role="toolbar" aria-label="Notification actions" className={cn("flex min-h-12 flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2", selected.size > 0 && "sticky top-16 z-20 animate-slide-in shadow-lg")}>
        <Checkbox checked={allSelected ? true : selected.size ? "indeterminate" : false} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((x) => x.id)))} aria-label="Select all loaded notifications" className="ml-1" />
        {selected.size > 0 ? (
          <>
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="mx-1 h-5 w-px bg-border" />
            {!archivedView && (
              <Button size="sm" variant="ghost" disabled={busy || !selectedUnread.length} onClick={() => read.mutate(selectedUnread)}>
                <MailOpen /> Mark read
              </Button>
            )}
            {!archivedView && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => archive.mutate(selectedIds)}>
                <Archive /> Archive
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">
              <span className="tabular font-medium text-foreground">{items.length}</span>
              {cursor ? "+" : ""} shown
            </span>
            {!archivedView && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={busy || unreadTotal === 0} onClick={() => read.mutate("all")}>
                {read.isPending && read.variables === "all" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Mark all read
              </Button>
            )}
          </>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b bg-surface-2/60 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</h2>
          <ul className="divide-y">
            {g.rows.map((n) => {
              const unread = !n.readAt;
              const isSel = selected.has(n.id);
              return (
                <li key={n.id} className={cn("group relative flex items-start gap-3 px-3 py-3 transition sm:px-4", unread && "bg-primary/[0.035]", isSel && "bg-primary/[0.07]", "hover:bg-muted/40")}>
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(n.id)} aria-label={`Select “${n.title}”`} className="mt-2" />
                  <NotificationIcon type={n.type} severity={n.severity} className="mt-0.5" />
                  <Link
                    href={n.href ?? "#"}
                    onClick={(e) => {
                      if (!n.href) e.preventDefault();
                      if (unread) read.mutate([n.id]);
                    }}
                    className="min-w-0 flex-1 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                  >
                    <p className={cn("text-sm", unread ? "font-semibold" : "font-medium text-foreground/90")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <time dateTime={n.createdAt} title={f.dateTime(n.createdAt)}>
                        <TimeAgo date={n.createdAt} />
                      </time>
                      {n.href && (
                        <span className="inline-flex items-center text-primary opacity-0 transition group-hover:opacity-100">
                          Open <ChevronRight className="size-3" />
                        </span>
                      )}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {unread && <span className="mx-2 mt-0.5 size-2 rounded-full bg-primary" aria-label="Unread" role="img" />}
                    {!archivedView && (
                      <div className="hidden items-center gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 sm:flex">
                        {unread && (
                          <Button size="icon-sm" variant="ghost" onClick={() => read.mutate([n.id])} disabled={busy} aria-label="Mark as read" title="Mark as read">
                            <MailOpen />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" onClick={() => archive.mutate([n.id])} disabled={busy} aria-label="Archive" title="Archive">
                          <Archive />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {cursor ? (
        <div className="flex justify-center pt-1">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="bg-card">
            {loadingMore ? <Loader2 className="animate-spin" /> : <Inbox />} Load more
          </Button>
        </div>
      ) : (
        items.length > 10 && <p className="pt-1 text-center text-xs text-muted-foreground">You&apos;ve reached the end.</p>
      )}
    </div>
  );
}
