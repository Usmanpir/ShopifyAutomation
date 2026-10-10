"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { cn } from "cn";
import { X } from "lucide-react";
import { memo } from "react";
import { useBuilder } from "./context";
import type { BranchEdge as BranchEdgeType } from "./graph";

const LABEL_TONE = {
  success: "border-success/25 bg-success-soft text-success",
  danger: "border-danger/25 bg-danger-soft text-danger",
  neutral: "border-border bg-card text-foreground/80",
} as const;

/** Smooth-step edge with a branch label chip and an inline delete button when selected. */
function BranchEdgeComponent({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected, data }: EdgeProps<BranchEdgeType>) {
  const { deleteElements } = useReactFlow();
  const { readOnly, highlight } = useBuilder();
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 22 });
  const tone = data?.tone ?? "neutral";
  // Straight drops sit right under the node's branch chip, so a second label is noise.
  const showLabel = !!label && (selected || Math.abs(sourceX - targetX) > 24);
  const dimmed = !!highlight && !(highlight.has(source) && highlight.has(target));

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={selected ? "url(#cai-arrow-selected)" : "url(#cai-arrow)"}
        style={{ stroke: selected ? "var(--primary)" : "var(--chart-axis)", strokeWidth: selected ? 2 : 1.5, opacity: dimmed ? 0.35 : 1 }}
        interactionWidth={24}
      />
      {(showLabel || (selected && !readOnly)) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {showLabel && <span className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-medium shadow-xs", LABEL_TONE[tone], dimmed && "opacity-50")}>{label}</span>}
            {selected && !readOnly && (
              <button
                type="button"
                onClick={() => void deleteElements({ edges: [{ id }] })}
                aria-label="Delete connection"
                title="Delete connection (Del)"
                className="grid size-5 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm hover:border-danger/40 hover:text-danger"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const BranchEdge = memo(BranchEdgeComponent);

/** Arrow markers referenced by BranchEdge (colors from tokens). */
export function EdgeMarkers() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        <marker id="cai-arrow" viewBox="-10 -10 20 20" markerWidth="14" markerHeight="14" orient="auto-start-reverse" refX="0" refY="0">
          <polyline points="-5,-4 0,0 -5,4 -5,-4" style={{ fill: "var(--chart-axis)", stroke: "var(--chart-axis)", strokeWidth: 1, strokeLinejoin: "round" }} />
        </marker>
        <marker id="cai-arrow-selected" viewBox="-10 -10 20 20" markerWidth="14" markerHeight="14" orient="auto-start-reverse" refX="0" refY="0">
          <polyline points="-5,-4 0,0 -5,4 -5,-4" style={{ fill: "var(--primary)", stroke: "var(--primary)", strokeWidth: 1, strokeLinejoin: "round" }} />
        </marker>
      </defs>
    </svg>
  );
}
