"use client";

import { cn } from "cn";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUrlState } from "./url-controls";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** URL sort key; enables a sortable header. */
  sortKey?: string;
  align?: "left" | "right" | "center";
  /** Hide this column below a breakpoint to keep wide tables readable. */
  hideBelow?: "lg" | "xl" | "2xl";
  /** With `columnsKey`: hidden until the user turns it on. */
  defaultHidden?: boolean;
  /** With `columnsKey`: label in the Columns menu (defaults to the header text). */
  menuLabel?: string;
};

const HIDE: Record<string, string> = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell", "2xl": "hidden 2xl:table-cell" };

// ── Column visibility, remembered per table per browser ──
const colListeners = new Set<() => void>();
function readCols(key: string): string | null {
  try {
    return localStorage.getItem(`cai.cols.${key}`);
  } catch {
    return null;
  }
}
function useHiddenColumns<T>(key: string | undefined, columns: Column<T>[]) {
  const raw = useSyncExternalStore(
    (cb) => {
      colListeners.add(cb);
      return () => colListeners.delete(cb);
    },
    () => (key ? readCols(key) : null),
    () => null,
  );
  const hidden = new Set<string>(raw ? (JSON.parse(raw) as string[]) : columns.filter((c) => c.defaultHidden).map((c) => c.key));
  const toggle = (colKey: string) => {
    if (!key) return;
    const next = new Set(hidden);
    if (next.has(colKey)) next.delete(colKey);
    else next.add(colKey);
    try {
      localStorage.setItem(`cai.cols.${key}`, JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
    colListeners.forEach((l) => l());
  };
  return { hidden, toggle };
}

/**
 * Responsive data table: a real <table> on md+ and stacked cards on mobile.
 * Rows can link somewhere (keyboard accessible) and support multi-select.
 * Optional: column visibility (`columnsKey`), sticky header, row actions.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  rowHref,
  mobileCard,
  selectable,
  selected,
  onSelectedChange,
  empty,
  className,
  caption,
  columnsKey,
  toolbar,
  stickyHeader,
  rowActions,
}: {
  columns: Column<T>[];
  rows: T[];
  rowHref?: (row: T) => string;
  mobileCard?: (row: T) => React.ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  empty?: React.ReactNode;
  className?: string;
  caption?: string;
  /** Enables the Columns menu; visibility is remembered under this key. */
  columnsKey?: string;
  /** Content shown at the left of the table's top bar (with the Columns menu). */
  toolbar?: React.ReactNode;
  /** Keep the header visible while scrolling long tables. */
  stickyHeader?: boolean;
  /** Per-row actions (e.g. a "…" menu), shown in the last column and on mobile cards. */
  rowActions?: (row: T) => React.ReactNode;
}) {
  const router = useRouter();
  const { params, set } = useUrlState();
  const sort = params.get("sort");
  const dir = params.get("dir") ?? "desc";
  const allSelected = !!selected && rows.length > 0 && rows.every((r) => selected.has(r.id));
  const { hidden, toggle: toggleColumn } = useHiddenColumns(columnsKey, columns);
  const visible = columnsKey ? columns.filter((c, i) => i === 0 || !hidden.has(c.key)) : columns;

  const toggleAll = () => onSelectedChange?.(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange?.(next);
  };

  const topBar =
    toolbar || columnsKey ? (
      <div className="flex min-h-11 items-center gap-2 border-b px-3 py-1.5">
        <div className="min-w-0 flex-1">{toolbar}</div>
        {columnsKey && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden text-muted-foreground md:inline-flex">
                <Columns3 /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.slice(1).map((c) => (
                <DropdownMenuCheckboxItem key={c.key} checked={!hidden.has(c.key)} onCheckedChange={() => toggleColumn(c.key)} onSelect={(e) => e.preventDefault()}>
                  {c.menuLabel ?? (typeof c.header === "string" ? c.header : c.key)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    ) : null;

  if (!rows.length && empty)
    return (
      <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
        {topBar}
        {empty}
      </div>
    );

  const th = stickyHeader ? "sticky top-0 z-10 bg-surface-2" : "";

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {topBar}
      {/* Desktop */}
      <div className={cn("hidden overflow-x-auto md:block", stickyHeader && "scrollbar-thin max-h-[calc(100dvh-15rem)] min-h-64 overflow-y-auto")}>
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b bg-surface-2/60 text-left text-[12px] font-medium text-muted-foreground">
              {selectable && (
                <th scope="col" className={cn("w-10 py-2.5 pl-4", th)}>
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all rows" />
                </th>
              )}
              {visible.map((c) => {
                const active = c.sortKey && sort === c.sortKey;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("px-4 py-2.5 font-medium whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideBelow && HIDE[c.hideBelow], th, c.headerClassName)}
                  >
                    {c.sortKey ? (
                      <button
                        type="button"
                        onClick={() => set({ sort: c.sortKey!, dir: active && dir === "desc" ? "asc" : "desc" })}
                        className={cn("inline-flex items-center gap-1 rounded hover:text-foreground", active && "text-foreground")}
                      >
                        {c.header}
                        {active ? dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-50" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th scope="col" className={cn("w-12 px-2", th)}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={row.id}
                  onClick={(e) => {
                    if (!href) return;
                    const target = e.target as HTMLElement;
                    if (target.closest("a,button,input,[role=checkbox],[role=menuitem],[role=menu]")) return;
                    if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
                    else router.push(href);
                  }}
                  className={cn("group/row border-b transition-colors last:border-0", href && "cursor-pointer hover:bg-muted/40", selected?.has(row.id) && "bg-primary/[0.04]")}
                >
                  {selectable && (
                    <td className="py-3 pl-4">
                      <Checkbox checked={selected?.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label="Select row" />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "right" && "text-right whitespace-nowrap", c.align === "center" && "text-center", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions && <td className="px-2 py-3 text-right">{rowActions(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <ul className="divide-y md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const content = mobileCard ? mobileCard(row) : columns.slice(0, 3).map((c) => <div key={c.key}>{c.cell(row)}</div>);
          return (
            <li key={row.id} className="flex items-start gap-3 px-4 py-3.5">
              {selectable && <Checkbox className="mt-1" checked={selected?.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label="Select row" />}
              {href ? (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(href);
                  }}
                  className="min-w-0 flex-1"
                >
                  {content}
                </a>
              ) : (
                <div className="min-w-0 flex-1">{content}</div>
              )}
              {rowActions && <div className="-mr-2 shrink-0">{rowActions(row)}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
