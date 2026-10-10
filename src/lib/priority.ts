/**
 * AI Priority Engine — pure scoring (no I/O, browser-safe types).
 *
 * Every "needs attention" item is ranked by:
 *   impact     money at stake relative to an average day of revenue (0–1)
 *   urgency    how soon it goes wrong if nobody acts (0–1)
 *   certainty  1 for counted facts; the measured confidence for predictions
 *
 *   score = 100 × (0.5·impact + 0.35·urgency + 0.15·certainty)
 */

export type PriorityCategory = "orders" | "inbox" | "inventory" | "marketing" | "ai" | "automations" | "support";
export type PriorityTone = "danger" | "warning" | "info" | "ai";
export type Evidence = { label: string; value: string };

export type PriorityAction =
  | { kind: "link"; label: string; href: string }
  /** Opens the "Let AI handle" preview for COD confirmations. */
  | { kind: "cod_confirm"; label: string };

export type PriorityItem = {
  key: string;
  category: PriorityCategory;
  tone: PriorityTone;
  count: number;
  title: string;
  summary: string;
  /** Money at stake in minor units, when there is a real amount. */
  impactAmount: number | null;
  impactLabel: string | null;
  urgencyLabel: string;
  /** Only set when it comes from a model or a measured rate. */
  confidence: number | null;
  confidenceLabel: string | null;
  action: PriorityAction;
  secondary: { label: string; href: string }[];
  explain: { what: string; why: string; todo: string; evidence: Evidence[] };
  score: number;
  /** Components, so the UI can explain the rank. */
  factors: { impact: number; urgency: number; certainty: number };
};

export type PriorityDraft = Omit<PriorityItem, "score" | "factors"> & { urgency: number };

export const WEIGHTS = { impact: 0.5, urgency: 0.35, certainty: 0.15 } as const;

/** Who may see each kind of item (mirrors the page each item links to). */
export const CATEGORY_PERMISSION = {
  orders: "orders.view",
  inbox: "conversations.view",
  support: "conversations.view",
  inventory: "inventory.view",
  marketing: "ads.view",
  ai: "approvals.view",
  automations: "automations.view",
} as const satisfies Record<PriorityCategory, string>;

/** Impact relative to an average day of revenue; items with no amount get a small floor. */
export function impactFactor(amount: number | null, avgDailyRevenue: number) {
  if (amount === null) return 0.15;
  if (avgDailyRevenue <= 0) return amount > 0 ? 0.5 : 0;
  return Math.min(1, amount / avgDailyRevenue);
}

/** Urgency from how long something has been waiting vs when it becomes a problem. */
export function waitUrgency(waitedMs: number, warnMs: number, criticalMs: number) {
  if (waitedMs >= criticalMs) return 1;
  if (waitedMs >= warnMs) return 0.65 + 0.35 * ((waitedMs - warnMs) / Math.max(1, criticalMs - warnMs));
  return 0.3 + 0.35 * (waitedMs / Math.max(1, warnMs));
}

export function scoreItem(draft: PriorityDraft, avgDailyRevenue: number): PriorityItem {
  const impact = impactFactor(draft.impactAmount, avgDailyRevenue);
  const urgency = Math.max(0, Math.min(1, draft.urgency));
  const certainty = draft.confidence ?? 1;
  const score = Math.round(100 * (WEIGHTS.impact * impact + WEIGHTS.urgency * urgency + WEIGHTS.certainty * certainty));
  const { urgency: _u, ...rest } = draft;
  void _u;
  return { ...rest, score, factors: { impact: round2(impact), urgency: round2(urgency), certainty: round2(certainty) } };
}

export function rankItems(drafts: PriorityDraft[], avgDailyRevenue: number): PriorityItem[] {
  return drafts
    .filter((d) => d.count > 0)
    .map((d) => scoreItem(d, avgDailyRevenue))
    .sort((a, b) => b.score - a.score);
}

/** Human label for a score band. */
export function priorityBand(score: number): { label: string; tone: PriorityTone } {
  if (score >= 70) return { label: "Act now", tone: "danger" };
  if (score >= 45) return { label: "Today", tone: "warning" };
  return { label: "When you can", tone: "info" };
}

export function formatWait(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
