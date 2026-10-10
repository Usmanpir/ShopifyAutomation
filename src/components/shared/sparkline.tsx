import { cn } from "cn";

/**
 * Lightweight SVG sparkline (server-renderable). 2px line in currentColor,
 * ~10% area wash, end-dot with a surface ring.
 */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 100;
  const h = 32;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (w - pad * 2), pad + (1 - (v - min) / range) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("overflow-visible", className)} aria-hidden>
      <path d={area} fill="currentColor" opacity="0.1" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r="2.6" fill="currentColor" stroke="var(--card)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
