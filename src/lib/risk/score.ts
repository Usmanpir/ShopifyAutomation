import type { PaymentMethod, RiskLevel } from "@/generated/prisma/enums";
import { isLikelyValidMobile } from "@/lib/phone";
import type { RiskSettings } from "@/schemas/store-settings";

/**
 * Configurable, explainable order risk scoring. Each signal yields a risk
 * factor in [0, 1] which is multiplied by its configured weight. The score is
 * the weighted average scaled to 0–100. Every signal is returned with a
 * human-readable explanation so the UI (and AI) can justify the result.
 */
export type RiskInput = {
  orderTotal: number;
  paymentMethod: PaymentMethod;
  customer: {
    totalOrders: number;
    deliveredCount: number;
    cancelledCount: number;
    returnedCount: number;
  } | null;
  phone: {
    normalized: string | null;
    /** Distinct customer names seen on orders using this phone. */
    distinctNames: number;
    /** Cancelled/refused orders placed with this phone. */
    cancelledOrders: number;
  };
  address: {
    line: string;
    city: string | null;
    /** Cities this customer previously ordered to. */
    previousCities: string[];
  };
  /** Orders from the same phone in the last 24 hours (excluding this one). */
  recentOrdersSamePhone: number;
};

export type RiskSignalKey = keyof RiskSettings["weights"];

export type RiskSignal = {
  key: RiskSignalKey;
  label: string;
  factor: number;
  points: number;
  detail: string;
  direction: "increase" | "decrease" | "neutral";
};

export type RiskResult = {
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
  recommendation: { action: "AUTO_PROCESS" | "REQUEST_CONFIRMATION" | "MANUAL_REVIEW"; label: string };
};

const LABELS: Record<RiskSignalKey, string> = {
  previousCancellations: "Previous cancellations",
  previousReturns: "Previous returns",
  successfulDeliveries: "Successful deliveries",
  orderFrequency: "Order frequency",
  orderAmount: "Order amount",
  phoneHistory: "Phone history",
  addressConsistency: "Address consistency",
  codBehavior: "COD behavior",
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scoreOrderRisk(input: RiskInput, settings: RiskSettings): RiskResult {
  const c = input.customer;
  const isNew = !c || c.totalOrders === 0;
  const factors: Record<RiskSignalKey, { factor: number; detail: string; direction?: RiskSignal["direction"] }> = {
    previousCancellations: (() => {
      if (!c || c.totalOrders === 0) return { factor: 0, detail: "No order history", direction: "neutral" };
      const rate = c.cancelledCount / c.totalOrders;
      const f = clamp01(c.cancelledCount * 0.3 + rate * 0.6);
      return {
        factor: f,
        detail: c.cancelledCount ? `${c.cancelledCount} of ${c.totalOrders} orders cancelled` : "No cancellations",
        direction: c.cancelledCount ? "increase" : "decrease",
      };
    })(),
    previousReturns: (() => {
      if (!c || c.totalOrders === 0) return { factor: 0, detail: "No order history", direction: "neutral" };
      const rate = c.returnedCount / c.totalOrders;
      const f = clamp01(c.returnedCount * 0.2 + rate * 0.6);
      return {
        factor: f,
        detail: c.returnedCount ? `${c.returnedCount} returned order(s)` : "No returns",
        direction: c.returnedCount ? "increase" : "decrease",
      };
    })(),
    successfulDeliveries: (() => {
      if (!c || c.deliveredCount === 0) return { factor: isNew ? 0.5 : 0.7, detail: "No successful deliveries yet", direction: "increase" };
      if (c.deliveredCount >= 3) return { factor: 0, detail: `${c.deliveredCount} successful deliveries`, direction: "decrease" };
      return { factor: 0.2, detail: `${c.deliveredCount} successful deliveries`, direction: "decrease" };
    })(),
    orderFrequency: (() => {
      const n = input.recentOrdersSamePhone;
      if (n >= 2) return { factor: 1, detail: `${n} other orders from this phone in 24h`, direction: "increase" };
      if (n === 1) return { factor: 0.5, detail: "1 other order from this phone in 24h", direction: "increase" };
      return { factor: 0, detail: "Normal ordering frequency", direction: "neutral" };
    })(),
    orderAmount: (() => {
      const high = settings.highValueOrderAmount || 1;
      const ratio = input.orderTotal / high;
      const f = clamp01((ratio - 0.5) / 1.5);
      return {
        factor: f,
        detail: ratio >= 1 ? "Above high-value threshold" : ratio >= 0.5 ? "Moderately high order value" : "Typical order value",
        direction: f > 0 ? "increase" : "neutral",
      };
    })(),
    phoneHistory: (() => {
      const p = input.phone;
      if (!isLikelyValidMobile(p.normalized)) return { factor: 1, detail: "Phone number looks invalid", direction: "increase" };
      if (p.cancelledOrders > 0)
        return { factor: clamp01(0.4 + p.cancelledOrders * 0.2), detail: `${p.cancelledOrders} cancelled order(s) on this phone`, direction: "increase" };
      if (p.distinctNames > 2) return { factor: 0.7, detail: `Phone used under ${p.distinctNames} different names`, direction: "increase" };
      return { factor: 0, detail: "Phone has a clean history", direction: "decrease" };
    })(),
    addressConsistency: (() => {
      const a = input.address;
      if (a.line.trim().length < 15) return { factor: 0.8, detail: "Address is incomplete", direction: "increase" };
      if (a.city && a.previousCities.length > 0 && !a.previousCities.some((pc) => pc.toLowerCase() === a.city!.toLowerCase()))
        return { factor: 0.4, detail: `New city (previously ${a.previousCities[0]})`, direction: "increase" };
      return { factor: 0, detail: "Address looks complete and consistent", direction: "decrease" };
    })(),
    codBehavior: (() => {
      if (input.paymentMethod !== "COD") return { factor: 0, detail: "Prepaid order", direction: "decrease" };
      if (c && c.cancelledCount > 0) return { factor: 1, detail: "COD with prior refusals", direction: "increase" };
      if (isNew) return { factor: 0.5, detail: "COD from a first-time customer", direction: "increase" };
      if (c && c.deliveredCount >= 2) return { factor: 0.1, detail: "COD with good payment history", direction: "decrease" };
      return { factor: 0.3, detail: "Cash on delivery", direction: "increase" };
    })(),
  };

  const weights = settings.weights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const signals: RiskSignal[] = (Object.keys(factors) as RiskSignalKey[]).map((key) => {
    const { factor, detail, direction } = factors[key];
    const points = Math.round(((factor * weights[key]) / totalWeight) * 100 * 10) / 10;
    return { key, label: LABELS[key], factor, points, detail, direction: direction ?? "neutral" };
  });

  const score = Math.round(Math.min(100, signals.reduce((s, x) => s + x.points, 0)));
  const level: RiskLevel = score >= settings.highThreshold ? "HIGH" : score >= settings.mediumThreshold ? "MEDIUM" : "LOW";

  const recommendation: RiskResult["recommendation"] =
    level === "HIGH"
      ? { action: "MANUAL_REVIEW", label: "Request WhatsApp confirmation and review before dispatch" }
      : level === "MEDIUM" || (input.paymentMethod === "COD" && settings.requireConfirmationForCod)
        ? { action: "REQUEST_CONFIRMATION", label: "Request WhatsApp confirmation" }
        : { action: "AUTO_PROCESS", label: "Safe to process" };

  signals.sort((a, b) => b.points - a.points);
  return { score, level, signals, recommendation };
}
