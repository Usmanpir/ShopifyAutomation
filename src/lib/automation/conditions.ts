import type { ConditionRule } from "./types";

/** Compares a resolved field value against a rule. Pure and type-tolerant. */
export function evaluateRule(actual: unknown, rule: ConditionRule): boolean {
  const expected = rule.value;
  switch (rule.operator) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    case "eq":
      return looseEquals(actual, expected);
    case "neq":
      return !looseEquals(actual, expected);
    case "gt":
      return toNumber(actual) > toNumber(expected);
    case "gte":
      return toNumber(actual) >= toNumber(expected);
    case "lt":
      return toNumber(actual) < toNumber(expected);
    case "lte":
      return toNumber(actual) <= toNumber(expected);
    case "contains":
      if (Array.isArray(actual)) return actual.some((a) => looseEquals(a, expected));
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "in": {
      const list = Array.isArray(expected) ? expected : String(expected ?? "").split(",").map((s) => s.trim());
      return list.some((v) => looseEquals(actual, v));
    }
    default:
      return false;
  }
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a).toLowerCase() === String(b).toLowerCase();
  if (typeof a === "number" || typeof b === "number") return toNumber(a) === toNumber(b);
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** Replaces `{{path.to.value}}` placeholders using an async resolver. */
export async function interpolate(template: string, resolve: (path: string) => Promise<unknown>): Promise<string> {
  const matches = [...template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)];
  let out = template;
  for (const m of matches) {
    const value = await resolve(m[1]);
    out = out.replace(m[0], value === undefined || value === null ? "" : String(value));
  }
  return out;
}

/** Reads a dotted path from a plain object. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
