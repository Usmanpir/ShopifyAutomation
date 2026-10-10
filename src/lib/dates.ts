import { z } from "zod";

/** Date-range helpers. Day boundaries are computed in the store's timezone. */
export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const rangeQuerySchema = z.object({
  range: z.enum(RANGE_PRESETS).default("7d"),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export type ResolvedRange = {
  preset: RangePreset;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
  label: string;
  comparisonLabel: string;
};

const DAY = 86_400_000;

/** Offset in ms between UTC and the timezone at `date` (positive east of UTC). */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function startOfDayTz(date: Date, timeZone: string): Date {
  const offset = tzOffsetMs(date, timeZone);
  const local = new Date(date.getTime() + offset);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(startLocal - offset);
}

/** YYYY-MM-DD for `date` in the timezone. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function resolveRange(q: Partial<RangeQuery>, timeZone: string, now = new Date()): ResolvedRange {
  const preset = q.range ?? "7d";
  const todayStart = startOfDayTz(now, timeZone);
  let from: Date;
  let to: Date = now;

  if (preset === "custom" && q.from && q.to) {
    from = startOfDayTz(new Date(q.from), timeZone);
    to = new Date(startOfDayTz(new Date(q.to), timeZone).getTime() + DAY - 1);
  } else if (preset === "today") {
    from = todayStart;
  } else {
    const n = preset === "30d" ? 30 : preset === "90d" ? 90 : 7;
    from = new Date(todayStart.getTime() - (n - 1) * DAY);
  }
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);
  const days = Math.max(1, Math.round(span / DAY));

  const labels: Record<RangePreset, [string, string]> = {
    today: ["Today", "vs yesterday"],
    "7d": ["Last 7 days", "vs previous 7 days"],
    "30d": ["Last 30 days", "vs previous 30 days"],
    "90d": ["Last 90 days", "vs previous 90 days"],
    custom: ["Custom range", "vs previous period"],
  };
  return { preset, from, to, prevFrom, prevTo, days, label: labels[preset][0], comparisonLabel: labels[preset][1] };
}

/** Consecutive day keys from `from` to `to` inclusive, in the timezone. */
export function eachDayKey(from: Date, to: Date, timeZone: string): string[] {
  const keys: string[] = [];
  for (let t = startOfDayTz(from, timeZone).getTime(); t <= to.getTime(); t += DAY) {
    const k = dayKey(new Date(t + DAY / 2), timeZone);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / DAY);
}

export { DAY as DAY_MS };
