"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckCircle2, MessagesSquare, MoreHorizontal, Plus, Ticket, UserRoundCheck, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { Pill, PRIORITY, TICKET_STATUS } from "@/components/shared/status";
import { useCan, useStore } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import { titleCase } from "@/lib/format";
import { NewTicketDialog, TICKET_PRIORITIES } from "./new-ticket-dialog";
import type { TicketRow } from "./types";

type StatusTab = "open" | "resolved" | "all";
type TicketPatch = { status?: string; priority?: string; assignedToId?: string | null };

function setStatusParam(v: StatusTab) {
  const url = new URL(window.location.href);
  if (v === "open") url.searchParams.delete("status");
  else url.searchParams.set("status", v);
  url.searchParams.delete("ticket");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function TicketsView({ initial, initialStatus, counts }: { initial: TicketRow[]; initialStatus: StatusTab; counts: { open: number; resolved: number; all: number } }) {
  const sp = useSearchParams();
  const raw = sp.get("status");
  const status: StatusTab = raw === "resolved" || raw === "all" ? raw : "open";
  const highlight = sp.get("ticket");
  const can = useCan();
  const canManage = can("conversations.manage");
  const { user } = useStore();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["tickets", status],
    queryFn: () => api<TicketRow[]>(`/api/tickets?status=${status}`),
    initialData: status === initialStatus ? initial : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketPatch }) => api(`/api/tickets/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (_r, { patch }) => {
      toast.success(patch.status ? `Status set to ${TICKET_STATUS[patch.status]?.label ?? patch.status}` : patch.priority ? `Priority set to ${PRIORITY[patch.priority]?.label}` : patch.assignedToId ? "Assigned to you" : "Unassigned");
      void qc.invalidateQueries({ queryKey: ["tickets"] });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useEffect(() => {
    if (!highlight || !q.data) return;
    document.getElementById(`ticket-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, q.data]);

  const rows = q.data ?? [];
  const tabs: { value: StatusTab; label: string; count: number }[] = [
    { value: "open", label: "Open", count: counts.open },
    { value: "resolved", label: "Resolved", count: counts.resolved },
    { value: "all", label: "All", count: counts.all },
  ];

  const statusCell = (t: TicketRow) =>
    canManage ? (
      <Select value={t.status} onValueChange={(v) => update.mutate({ id: t.id, patch: { status: v } })}>
        <SelectTrigger size="sm" aria-label={`Status of ticket #${t.number}`} className="h-7 w-auto gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TICKET_STATUS).map(([k]) => (
            <SelectItem key={k} value={k}>
              <Pill map={TICKET_STATUS} value={k} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Pill map={TICKET_STATUS} value={t.status} />
    );

  const priorityCell = (t: TicketRow) =>
    canManage ? (
      <Select value={t.priority} onValueChange={(v) => update.mutate({ id: t.id, patch: { priority: v } })}>
        <SelectTrigger size="sm" aria-label={`Priority of ticket #${t.number}`} className="h-7 w-auto gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TICKET_PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              <Pill map={PRIORITY} value={p.value} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Pill map={PRIORITY} value={t.priority} />
    );

  const rowMenu = (t: TicketRow) =>
    canManage && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ticket #${t.number}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {t.assignedTo?.id === user.id ? (
            <DropdownMenuItem onSelect={() => update.mutate({ id: t.id, patch: { assignedToId: null } })}>
              <UserRoundX /> Unassign me
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => update.mutate({ id: t.id, patch: { assignedToId: user.id } })}>
              <UserRoundCheck /> Assign to me
            </DropdownMenuItem>
          )}
          {t.status !== "RESOLVED" && t.status !== "CLOSED" && (
            <DropdownMenuItem onSelect={() => update.mutate({ id: t.id, patch: { status: "RESOLVED" } })}>
              <CheckCircle2 /> Mark resolved
            </DropdownMenuItem>
          )}
          {t.conversationId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/conversations?c=${t.conversationId}`}>
                  <MessagesSquare /> Open conversation
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const columns: Column<TicketRow>[] = [
    {
      key: "ticket",
      header: "Ticket",
      cell: (t) => (
        <div id={`ticket-${t.id}`} className={cn("max-w-md min-w-0 rounded-md", highlight === t.id && "-m-1.5 bg-primary/5 p-1.5 ring-2 ring-primary/30")}>
          <p className="truncate font-medium">
            <span className="tabular text-muted-foreground">#{t.number}</span> {t.subject}
          </p>
          <p className="text-xs text-muted-foreground">
            {titleCase(t.category)} · <TimeAgo date={t.createdAt} />
            {t.createdByType === "AI" && <span className="text-ai"> · by AI</span>}
          </p>
        </div>
      ),
    },
    { key: "priority", header: "Priority", cell: priorityCell },
    { key: "status", header: "Status", cell: statusCell },
    {
      key: "customer",
      header: "Customer",
      hideBelow: "lg",
      cell: (t) =>
        t.customer ? (
          <Link href={`/customers/${t.customer.id}`} className="font-medium whitespace-nowrap hover:underline">
            {t.customer.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "order",
      header: "Order",
      hideBelow: "lg",
      cell: (t) =>
        t.order ? (
          <Link href={`/orders/${t.order.id}`} className="font-medium text-primary hover:underline">
            {t.order.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "assignee",
      header: "Assignee",
      hideBelow: "xl",
      cell: (t) => (t.assignedTo ? <span>{t.assignedTo.id === user.id ? "You" : t.assignedTo.name}</span> : <span className="text-muted-foreground">Unassigned</span>),
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (t) => rowMenu(t) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Ticket status" className="flex gap-1">
          {tabs.map((t) => {
            const active = status === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => setStatusParam(t.value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
                  active ? "border-foreground/10 bg-foreground text-background" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("tabular rounded-full px-1.5 text-[11px]", active ? "bg-background/20" : "bg-muted")}>{t.count}</span>
              </button>
            );
          })}
        </div>
        {canManage && (
          <NewTicketDialog
            trigger={
              <Button>
                <Plus /> New ticket
              </Button>
            }
          />
        )}
      </div>
      <div className={cn("transition-opacity", q.isFetching && q.isPlaceholderData && "opacity-60")}>
        <DataTable
          caption="Support tickets"
          columns={columns}
          rows={rows}
          empty={
            <EmptyState
              icon={<Ticket />}
              title={status === "open" ? "No open tickets" : status === "resolved" ? "No resolved tickets yet" : "No tickets yet"}
              description={status === "open" ? "Inbox zero. The AI agent opens tickets automatically for exchanges, returns and escalations." : "Tickets created by your team or the AI agent will appear here."}
            />
          }
          mobileCard={(t) => (
            <div id={`ticket-m-${t.id}`} className={cn("space-y-2", highlight === t.id && "rounded-lg ring-2 ring-primary/40")}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium">
                  <span className="tabular text-muted-foreground">#{t.number}</span> {t.subject}
                </p>
                {rowMenu(t)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill map={TICKET_STATUS} value={t.status} />
                <Pill map={PRIORITY} value={t.priority} />
                <span className="text-xs text-muted-foreground">
                  {titleCase(t.category)}
                  {t.customer && ` · ${t.customer.name}`}
                  {t.order && ` · ${t.order.name}`} · <TimeAgo date={t.createdAt} />
                </span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
