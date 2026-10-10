"use client";

import { cn } from "cn";
import { ArrowDown, ArrowUp, ChevronsUpDown, FileSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/states";

type Cell = string | number;

const NUMERIC = /^[^\d\s-]{0,4}\.?\s?-?[\d,]+(\.\d+)?\s?[%×x]?$/;
const isNumeric = (v: Cell) => typeof v === "number" || NUMERIC.test(v.trim());
const toNumber = (v: Cell) => (typeof v === "number" ? v : Number(v.replace(/[^\d.-]/g, "")) || 0);

/** Report table: sticky header, scrollable body, tabular numbers, client-side sort. */
export function ReportTable({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);

  const numericCols = useMemo(
    () =>
      columns.map((_, c) => {
        const vals = rows.map((r) => r[c]).filter((v) => v !== undefined && v !== "—" && v !== "");
        return vals.length > 0 && vals.every((v) => isNumeric(v!));
      }),
    [columns, rows],
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { col, dir } = sort;
    const m = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[col] ?? "";
      const y = b[col] ?? "";
      if (numericCols[col]) return (toNumber(x) - toNumber(y)) * m;
      return String(x).localeCompare(String(y)) * m;
    });
  }, [rows, sort, numericCols]);

  if (!rows.length) {
    return <EmptyState icon={<FileSearch />} title="No data for this period" description="Try a longer date range — this report has nothing to show between these dates yet." />;
  }

  const toggle = (col: number) =>
    setSort((s) => (s?.col !== col ? { col, dir: numericCols[col] ? "desc" : "asc" } : s.dir === (numericCols[col] ? "desc" : "asc") ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : null));

  return (
    <div className="scrollbar-thin max-h-[min(70vh,720px)] overflow-auto print:max-h-none print:overflow-visible">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c, i) => {
              const active = sort?.col === i;
              const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c}
                  scope="col"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(
                    "sticky top-0 z-10 border-y bg-surface-2 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5",
                    numericCols[i] ? "text-right" : "text-left",
                  )}
                >
                  <button type="button" onClick={() => toggle(i)} className={cn("inline-flex items-center gap-1 hover:text-foreground", numericCols[i] && "flex-row-reverse", active && "text-foreground")}>
                    {c}
                    <Icon className={cn("size-3.5 print:hidden", !active && "opacity-40")} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, ri) => (
            <tr key={ri} className="hover:bg-muted/40">
              {r.map((v, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "border-b px-4 py-2.5 first:pl-5 last:pr-5",
                    numericCols[ci] ? "tabular text-right whitespace-nowrap" : "max-w-80 min-w-28",
                    ci === 0 && "min-w-40 font-medium",
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
