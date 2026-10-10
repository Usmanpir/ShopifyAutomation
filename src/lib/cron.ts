/**
 * Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
 * Supports `*`, lists `a,b`, ranges `a-b`, and steps `*\/n` / `a-b/n`.
 * Evaluated in the store's timezone by the scheduler tick.
 */
const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function parseField(field: string, [min, max]: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`Invalid cron step: ${part}`);
    let start = min;
    let end = max;
    if (rangePart !== "*") {
      const [a, b] = rangePart.split("-").map((n) => parseInt(n, 10));
      if (!Number.isFinite(a)) throw new Error(`Invalid cron value: ${part}`);
      start = a;
      end = b !== undefined && Number.isFinite(b) ? b : stepPart ? max : a;
    }
    if (start < min || end > max || start > end) throw new Error(`Cron value out of range: ${part}`);
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): Set<number>[] {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron expression must have 5 fields");
  return fields.map((f, i) => parseField(f, RANGES[i]));
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of `date` in an IANA timezone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minute: parseInt(get("minute"), 10),
    hour: parseInt(get("hour"), 10),
    day: parseInt(get("day"), 10),
    month: parseInt(get("month"), 10),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

export function cronMatches(expr: string, date: Date, timeZone = "UTC"): boolean {
  const [min, hour, dom, mon, dow] = parseCron(expr);
  const p = zonedParts(date, timeZone);
  return min.has(p.minute) && hour.has(p.hour) && dom.has(p.day) && mon.has(p.month) && dow.has(p.weekday);
}

/** Human readable summary for common patterns (used in settings UI). */
export function describeCron(expr: string): string {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return expr;
  const [m, h, dom, mon, dow] = f;
  if (dom === "*" && mon === "*" && dow === "*") {
    if (m.startsWith("*/") && h === "*") return `Every ${m.slice(2)} minutes`;
    if (/^\d+$/.test(m) && h === "*") return `Hourly at :${m.padStart(2, "0")}`;
    if (/^\d+$/.test(m) && h.startsWith("*/")) return `Every ${h.slice(2)} hours`;
    if (/^\d+$/.test(m) && /^\d+$/.test(h)) return `Daily at ${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }
  return expr;
}
