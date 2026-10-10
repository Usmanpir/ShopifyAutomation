"use client";

import { cn } from "cn";
import { GripVertical } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { NodeType } from "@/lib/automation/types";
import { accentStyle, NODE_TYPE_ORDER, NODE_VISUAL } from "../meta";

export const DND_MIME = "application/x-commerceai-step";

/** Step palette: click to add below the selected step, or drag onto the canvas. */
export function Palette({ onAdd, hasTrigger, hasSelection }: { onAdd: (type: NodeType) => void; hasTrigger: boolean; hasSelection: boolean }) {
  return (
    <TooltipProvider delayDuration={200}>
      <nav aria-label="Add a step" className="flex h-full w-14 shrink-0 flex-col border-r bg-card lg:w-[212px]">
        <div className="hidden border-b px-4 py-3 lg:block">
          <h2 className="text-[13px] font-semibold">Steps</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hasSelection ? "Click to add below the selected step, or drag onto the canvas." : "Click to add at the end, or drag onto the canvas."}</p>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-2">
          {NODE_TYPE_ORDER.map((type) => {
            const v = NODE_VISUAL[type];
            const disabled = type === "TRIGGER" && hasTrigger;
            return (
              <li key={type}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      draggable={!disabled}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_MIME, type);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onAdd(type)}
                      style={accentStyle(type)}
                      aria-label={`Add ${v.label} step${disabled ? " (a workflow has one trigger)" : ""}`}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-lg border border-transparent p-1.5 text-left transition lg:p-2",
                        "hover:border-border hover:bg-surface-2 hover:shadow-xs focus-visible:border-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--node-accent)_13%,transparent)] text-[var(--node-accent)]">
                        <v.icon className="size-4" />
                      </span>
                      <span className="hidden min-w-0 flex-1 lg:block">
                        <span className="block text-[13px] font-medium">{v.label}</span>
                        <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground">{v.description}</span>
                      </span>
                      <GripVertical className="hidden size-3.5 shrink-0 text-muted-foreground/0 transition group-hover:text-muted-foreground/70 group-disabled:hidden lg:block" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-56 lg:hidden">
                    <p className="font-medium">{v.label}</p>
                    <p className="opacity-80">{disabled ? "A workflow can only have one trigger" : v.description}</p>
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
    </TooltipProvider>
  );
}
