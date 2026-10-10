"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { Check, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusPill, type Tone } from "@/components/shared/status";
import { handleLabel, nodeVerb, orderedNodes, summarizeNode } from "@/lib/automation/describe";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/lib/automation/templates";
import type { AutomationGraph } from "@/lib/automation/types";
import { api, errorMessage } from "@/lib/client/api";
import { pluralize } from "@/lib/format";
import { accentStyle, categoryIcon, NODE_VISUAL } from "./meta";

const CATEGORY_TONE: Record<string, Tone> = { Orders: "brand", Shipping: "info", Customers: "success", Inventory: "warning", Marketing: "ai" };

/** Compact vertical WHEN → IF → SEND… preview of a workflow. */
export function MiniFlow({ graph, max = 5, className }: { graph: AutomationGraph; max?: number; className?: string }) {
  const ordered = orderedNodes(graph);
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;
  return (
    <ol className={cn("relative", className)} aria-label="Workflow steps">
      {shown.map(({ node, via }, i) => {
        const v = NODE_VISUAL[node.type];
        const text = node.type === "CONDITION" || node.type === "WAIT" ? summarizeNode(node) : node.label;
        const branch = via ? handleLabel(byKey.get(via.from), via.handle) : "";
        const last = i === shown.length - 1 && rest <= 0;
        return (
          <li key={node.key} className="relative flex items-center gap-2.5 py-1" style={accentStyle(node.type)}>
            {!last && <span aria-hidden className="absolute top-[22px] -bottom-[6px] left-[10px] w-px bg-border" />}
            <span className="relative z-10 grid size-[21px] shrink-0 place-items-center rounded-md bg-[color-mix(in_oklch,var(--node-accent)_14%,var(--card))] text-[var(--node-accent)]">
              <v.icon className="size-3" aria-hidden />
            </span>
            <span className="w-12 shrink-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{nodeVerb(node)}</span>
            <span className="min-w-0 truncate text-[13px]">{text}</span>
            {branch && <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">{branch}</span>}
          </li>
        );
      })}
      {rest > 0 && (
        <li className="flex items-center gap-2.5 py-1 pl-[31px] text-xs text-muted-foreground">
          <span className="w-12" />+{pluralize(rest, "more step")}
        </li>
      )}
    </ol>
  );
}

export function TemplatesGallery({ canManage, installedKeys }: { canManage: boolean; installedKeys: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {AUTOMATION_TEMPLATES.map((t) => (
        <TemplateCard key={t.key} template={t} canManage={canManage} installed={installedKeys.includes(t.key)} />
      ))}
    </div>
  );
}

function TemplateCard({ template: t, canManage, installed }: { template: AutomationTemplate; canManage: boolean; installed: boolean }) {
  const router = useRouter();
  const use = useMutation({
    mutationFn: () => api<{ id: string }>("/api/automations", { body: { templateKey: t.key } }),
    onSuccess: (a) => {
      toast.success(`“${t.name}” added as a draft`, { description: "Review the steps, then activate it." });
      router.push(`/automations/${a.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <article className="flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/15 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70" aria-hidden>
          {createElement(categoryIcon(t.category), { className: "size-5" })}
        </span>
        <div className="flex items-center gap-1.5">
          {installed && (
            <StatusPill tone="success" dot={false}>
              <Check className="size-3" /> In use
            </StatusPill>
          )}
          <StatusPill tone={CATEGORY_TONE[t.category] ?? "neutral"}>{t.category}</StatusPill>
        </div>
      </div>
      <div className="px-5 pt-3">
        <h3 className="text-[15px] font-semibold tracking-tight">{t.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
      </div>
      <div className="mx-5 mt-4 rounded-lg border bg-surface-2/50 px-3 py-2">
        <MiniFlow graph={t.graph} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 px-5 pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{pluralize(t.graph.nodes.length, "step")}</p>
        {canManage && (
          <Button size="sm" variant={installed ? "outline" : "default"} onClick={() => use.mutate()} disabled={use.isPending}>
            {use.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {installed ? "Use again" : "Use template"}
          </Button>
        )}
      </div>
    </article>
  );
}
