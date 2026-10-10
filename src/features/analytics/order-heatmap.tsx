import { cn } from "cn";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/**
 * Weekday × hour order heatmap. Single-hue sequential scale: the --chart-1
 * hue at increasing opacity. Every cell is labelled with its count.
 */
export function OrderHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="space-y-3">
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[720px] border-separate border-spacing-[3px] text-[10.5px]" aria-label="Orders by day of week and hour of day">
          <thead>
            <tr>
              <th scope="col" className="w-9">
                <span className="sr-only">Day</span>
              </th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} scope="col" className="tabular font-normal text-muted-foreground">
                  {h % 3 === 0 ? hourLabel(h) : <span className="sr-only">{hourLabel(h)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={d}>
                <th scope="row" className="pr-1 text-left text-[11px] font-medium text-muted-foreground">
                  {DAYS[d]}
                </th>
                {row.map((v, h) => {
                  const t = v / max;
                  const strong = t > 0.55;
                  return (
                    <td
                      key={h}
                      title={`${DAYS[d]} ${hourLabel(h)} · ${v} order${v === 1 ? "" : "s"}`}
                      className={cn("tabular h-7 rounded-[4px] text-center font-medium", v === 0 ? "bg-muted/60 text-muted-foreground/50" : strong ? "text-white" : "text-foreground/80")}
                      style={v ? { background: `color-mix(in oklab, var(--chart-1) ${Math.round(12 + t * 88)}%, transparent)` } : undefined}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>Fewer</span>
        <span className="flex gap-[3px]" aria-hidden>
          {[12, 34, 56, 78, 100].map((p) => (
            <span key={p} className="size-3 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--chart-1) ${p}%, transparent)` }} />
          ))}
        </span>
        <span>More orders</span>
      </div>
    </div>
  );
}
