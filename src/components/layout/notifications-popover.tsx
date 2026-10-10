"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Bell, Check, CheckCheck, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationIcon } from "@/components/shared/notification-icon";
import { TimeAgo } from "@/components/shared/time-ago";
import { api } from "@/lib/client/api";
import { groupNotifications, PRIORITY_LABEL, type NotificationGroup, type NotificationLike, type Priority } from "@/lib/notification-groups";
import { useShellCounts } from "./use-shell-counts";

const PRIORITY_DOT: Record<Priority, string> = { urgent: "bg-danger", important: "bg-warning", info: "bg-muted-foreground/50" };

/** Smart notifications: Urgent / Important / Info, with similar alerts collapsed into one line. */
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: counts } = useShellCounts();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "popover"],
    queryFn: () => api<{ items: NotificationLike[] }>("/api/notifications?limit=60&status=unread"),
    enabled: open,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["shell-counts"] });
  };
  const markRead = useMutation({ mutationFn: (ids: string[] | "all") => api("/api/notifications/read", { method: "POST", body: { ids } }), onSuccess: refresh });
  const unread = counts?.notifications ?? 0;
  const groups = groupNotifications(data?.items ?? []);
  const empty = !isLoading && !data?.items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9.5px] leading-4 font-semibold text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(94vw,400px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={() => markRead.mutate("all")} disabled={!unread || markRead.isPending}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[440px] overflow-y-auto">
          {isLoading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton-shimmer size-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-shimmer h-3 w-2/3 rounded bg-muted" />
                    <div className="skeleton-shimmer h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {empty && <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
          {(["urgent", "important", "info"] as Priority[]).map((p) =>
            groups[p].length ? (
              <section key={p} aria-label={PRIORITY_LABEL[p]}>
                <h3 className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-popover/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                  <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[p])} aria-hidden /> {PRIORITY_LABEL[p]}
                </h3>
                {groups[p].map((g) => (
                  <GroupRow key={g.key} g={g} onNavigate={() => setOpen(false)} onRead={(ids) => markRead.mutate(ids)} />
                ))}
              </section>
            ) : null,
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupRow({ g, onNavigate, onRead }: { g: NotificationGroup; onNavigate: () => void; onRead: (ids: string[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const first = g.items[0]!;
  const collapsed = g.items.length > 1;
  const body = (
    <>
      <NotificationIcon type={first.type} severity={first.severity} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">
          {g.title}
          {g.countLabel && <span className="ml-1.5 font-normal text-muted-foreground">· {g.countLabel}</span>}
        </p>
        {!collapsed && first.body && <p className="line-clamp-2 text-xs text-muted-foreground">{first.body}</p>}
        {collapsed && <p className="truncate text-xs text-muted-foreground">Latest: {first.title}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">
          <TimeAgo date={g.latest} />
        </p>
      </div>
    </>
  );
  return (
    <div className="border-b last:border-0">
      <div className="group flex items-start gap-1 pr-2 hover:bg-muted/50">
        {collapsed ? (
          <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left">
            {body}
            <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition", expanded && "rotate-180")} aria-hidden />
          </button>
        ) : (
          <Link href={first.href ?? "/notifications"} onClick={() => {
            onRead([first.id]);
            onNavigate();
          }} className="flex min-w-0 flex-1 gap-3 px-4 py-3">
            {body}
          </Link>
        )}
        <Button variant="ghost" size="icon-sm" className="mt-2.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => onRead(g.items.map((i) => i.id))} aria-label={`Mark “${g.title}” as read`}>
          <Check />
        </Button>
      </div>
      {collapsed && expanded && (
        <ul className="bg-surface-2/50 pb-1">
          {g.items.map((n) => (
            <li key={n.id}>
              <Link href={n.href ?? "/notifications"} onClick={() => {
                  onRead([n.id]);
                  onNavigate();
                }} className="block truncate py-1.5 pr-4 pl-15 text-[12.5px] hover:text-primary">
                {n.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
