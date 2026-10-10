"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, Copy, MoreHorizontal, Plus, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/states";
import { Pill } from "@/components/shared/status";
import { api, errorMessage } from "@/lib/client/api";
import { pluralize, timeAgo } from "@/lib/format";
import { AUTOMATION_STATUS, triggerMeta } from "./meta";

export type AutomationCardData = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  triggerType: string;
  lastRunAt: string | null;
  updatedAt: string;
  _count: { nodes: number };
  stats: { runs30d: number; completed: number; failed: number; waiting: number; successRate: number | null };
};

export function AutomationCards({ automations, canManage }: { automations: AutomationCardData[]; canManage: boolean }) {
  if (!automations.length) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={<Workflow />}
          title="No automations yet"
          description="Automate your repetitive ecommerce tasks — confirm COD orders, share tracking, win back customers."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/automations/new" prefetch={false}>
                  <Plus /> Create automation
                </Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {automations.map((a) => (
        <AutomationCard key={a.id} automation={a} canManage={canManage} />
      ))}
    </div>
  );
}

function AutomationCard({ automation: a, canManage }: { automation: AutomationCardData; canManage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(a.status);
  const trig = triggerMeta(a.triggerType);
  const TrigIcon = trig.icon;

  const toggle = useMutation({
    mutationFn: (next: "ACTIVE" | "PAUSED") => api(`/api/automations/${a.id}/status`, { body: { status: next } }),
    onMutate: (next) => {
      const prev = status;
      setStatus(next);
      return { prev };
    },
    onSuccess: (_d, next) => {
      toast.success(next === "ACTIVE" ? `“${a.name}” is live` : `“${a.name}” paused`);
      router.refresh();
    },
    onError: (e, _next, ctx) => {
      if (ctx) setStatus(ctx.prev);
      toast.error(errorMessage(e), { description: "Open the builder to fix the workflow, then activate it again." });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const duplicate = useMutation({
    mutationFn: async () => {
      const full = await api<{ name: string; description: string | null; graph: unknown }>(`/api/automations/${a.id}`);
      return api<{ id: string }>("/api/automations", { body: { name: `${full.name} (copy)`.slice(0, 120), description: full.description, graph: full.graph } });
    },
    onSuccess: (created) => {
      toast.success("Duplicated as a draft");
      router.push(`/automations/${created.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/automations/${a.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`“${a.name}” deleted`);
      setConfirmDelete(false);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const s = a.stats;
  const stats = [
    { label: "Runs · 30d", value: s.runs30d.toLocaleString() },
    { label: "Success", value: s.successRate === null ? "—" : `${s.successRate}%` },
    { label: "Failed", value: s.failed.toLocaleString(), tone: s.failed > 0 ? "text-danger" : undefined },
    { label: "Waiting", value: s.waiting.toLocaleString(), tone: s.waiting > 0 ? "text-warning" : undefined },
  ];

  return (
    <article className="group flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/15 hover:shadow-md">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-soft text-ai ring-1 ring-ai/15" aria-hidden>
          <TrigIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">
              <Link href={`/automations/${a.id}`} className="hover:text-primary">
                {a.name}
              </Link>
            </h3>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">When</span> {trig.label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill map={AUTOMATION_STATUS} value={status} className="hidden sm:inline-flex" />
          {canManage && (
            <Switch
              checked={status === "ACTIVE"}
              disabled={toggle.isPending}
              onCheckedChange={(on) => toggle.mutate(on ? "ACTIVE" : "PAUSED")}
              aria-label={status === "ACTIVE" ? `Pause ${a.name}` : `Activate ${a.name}`}
            />
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${a.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => duplicate.mutate()} disabled={duplicate.isPending}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 px-5 text-sm text-muted-foreground">{a.description || "No description."}</p>

      <dl className="mx-5 mt-4 grid grid-cols-4 divide-x rounded-lg border bg-surface-2/50">
        {stats.map((st) => (
          <div key={st.label} className="px-2.5 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{st.label}</dt>
            <dd className={cn("tabular mt-0.5 text-sm font-semibold", st.tone)}>{st.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 px-5 pt-4 pb-4">
        <p className="truncate text-xs text-muted-foreground">
          {a.lastRunAt ? `Last run ${timeAgo(a.lastRunAt)}` : "Never run"} · {pluralize(a._count.nodes, "step")}
        </p>
        <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0 text-primary hover:text-primary">
          <Link href={`/automations/${a.id}`}>
            Open builder <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{a.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The workflow stops immediately and any waiting runs are cancelled. Run history is kept for auditing.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              Delete automation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
