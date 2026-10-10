"use client";

import { cn } from "cn";
import { LayoutGrid, List } from "lucide-react";
import { useUrlState } from "@/components/shared/url-controls";

/** List / grid switch bound to ?view=grid. */
export function ViewToggle({ className }: { className?: string }) {
  const { params, set } = useUrlState();
  const view = params.get("view") === "grid" ? "grid" : "list";
  const opts = [
    { value: "list", label: "List view", Icon: List },
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Layout" className={cn("inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5", className)}>
      {opts.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          aria-label={label}
          title={label}
          onClick={() => set({ view: value === "list" ? null : value }, { keepPage: true })}
          className={cn("grid h-full w-8 place-items-center rounded-md transition", view === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
