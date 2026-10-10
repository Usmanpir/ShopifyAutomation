import type { Tone } from "@/components/shared/status";

export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  DRAFT: { label: "Draft", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export type StockFlags = { low: number; out: number; variants: number };

/** Product-level stock indicator text (never color alone). */
export function productStockState(total: number, flags?: StockFlags): { label: string; tone: Tone } | null {
  if (total <= 0) return { label: "Out of stock", tone: "danger" };
  if (flags && flags.out > 0) return { label: `${flags.out} size${flags.out === 1 ? "" : "s"} out`, tone: "danger" };
  if (flags && flags.low > 0) return { label: `${flags.low} size${flags.low === 1 ? "" : "s"} low`, tone: "warning" };
  return null;
}
