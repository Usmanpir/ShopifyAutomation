"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "cn";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { memo } from "react";
import { sourceHandles, summarizeNode } from "@/lib/automation/describe";
import { accentStyle, NODE_VISUAL } from "../meta";
import { useBuilder } from "./context";
import type { StepNode as StepNodeType } from "./graph";

const HANDLE = "size-2.5! min-w-0! min-h-0! border-2! border-card! bg-[var(--node-accent)]! transition-transform hover:scale-150";

const CHIP_TONE = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-[color-mix(in_oklch,var(--node-accent)_12%,transparent)] text-[var(--node-accent)]",
} as const;

function StepNodeComponent({ id, data, selected }: NodeProps<StepNodeType>) {
  const { issues, highlight, readOnly } = useBuilder();
  const v = NODE_VISUAL[data.type];
  const nodeIssues = issues.get(id);
  const hasError = !!nodeIssues?.errors.length;
  const hasWarning = !hasError && !!nodeIssues?.warnings.length;
  const handles = sourceHandles(data);
  const branching = data.type === "CONDITION" || data.type === "AI_DECISION" || data.type === "APPROVAL";
  const dimmed = highlight && !highlight.has(id);
  const visited = highlight?.has(id);

  return (
    <div
      style={accentStyle(data.type)}
      className={cn(
        "group/node relative w-[264px] rounded-xl border border-l-[3px] border-l-[var(--node-accent)] bg-card text-card-foreground shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-[box-shadow,opacity,border-color]",
        "hover:shadow-md",
        selected && "border-[color-mix(in_oklch,var(--node-accent)_55%,transparent)] shadow-md ring-[3px] ring-[color-mix(in_oklch,var(--node-accent)_22%,transparent)]",
        hasError && !selected && "border-danger/50",
        dimmed && "opacity-40",
        visited && "ring-2 ring-success/50",
      )}
    >
      {data.type !== "TRIGGER" && <Handle type="target" position={Position.Top} className={cn(HANDLE, "bg-muted-foreground!")} isConnectable={!readOnly} />}

      <div className="flex items-start gap-2.5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--node-accent)_13%,transparent)] text-[var(--node-accent)]" aria-hidden>
          <v.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-none font-semibold tracking-wider text-[var(--node-accent)] uppercase">{data.type === "TRIGGER" ? "When" : v.label}</p>
          <p className="mt-1 truncate text-[13.5px] leading-snug font-semibold" title={data.label}>
            {data.label}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={summarizeNode(data)}>
            {summarizeNode(data)}
          </p>
        </div>
        {(hasError || hasWarning) && (
          <span className={cn("mt-0.5 shrink-0", hasError ? "text-danger" : "text-warning")} title={[...(nodeIssues?.errors ?? []), ...(nodeIssues?.warnings ?? [])].join("\n")}>
            {hasError ? <AlertCircle className="size-4" aria-label="Has errors" /> : <AlertTriangle className="size-4" aria-label="Has warnings" />}
          </span>
        )}
      </div>

      {branching ? (
        <div className="flex items-center justify-around gap-1 border-t px-2 pt-1.5 pb-2">
          {handles.length === 0 && <span className="text-[11px] text-muted-foreground">Add outcomes to branch</span>}
          {handles.map((h) => (
            <span key={h.id} className={cn("relative max-w-[96px] rounded-md px-1.5 py-0.5 text-[10.5px] font-medium", CHIP_TONE[h.tone ?? "neutral"])} title={h.label}>
              <span className="block truncate">{h.label}</span>
              <Handle
                type="source"
                id={h.id}
                position={Position.Bottom}
                isConnectable={!readOnly}
                className={cn(HANDLE, "-bottom-[9px]!", h.tone === "success" ? "bg-success!" : h.tone === "danger" ? "bg-danger!" : "")}
                aria-label={`${h.label} branch`}
              />
            </span>
          ))}
        </div>
      ) : (
        <Handle type="source" id="next" position={Position.Bottom} className={HANDLE} isConnectable={!readOnly} />
      )}
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
