import { describe, expect, it } from "vitest";
import { scoreOrderRisk, type RiskInput } from "@/lib/risk/score";
import { defaultStoreSettings } from "@/schemas/store-settings";

const settings = defaultStoreSettings().risk;

const base: RiskInput = {
  orderTotal: 450_000,
  paymentMethod: "COD",
  customer: { totalOrders: 6, deliveredCount: 6, cancelledCount: 0, returnedCount: 0 },
  phone: { normalized: "923001234567", distinctNames: 1, cancelledOrders: 0 },
  address: { line: "House 12, Street 4, DHA Phase 5", city: "Lahore", previousCities: ["Lahore"] },
  recentOrdersSamePhone: 0,
};

describe("order risk scoring", () => {
  it("scores a loyal customer as low risk", () => {
    const r = scoreOrderRisk(base, settings);
    expect(r.level).toBe("LOW");
    expect(r.score).toBeLessThan(settings.mediumThreshold);
    expect(r.signals).toHaveLength(8);
  });

  it("flags a risky COD order as high risk and recommends review, never cancellation", () => {
    const r = scoreOrderRisk(
      {
        ...base,
        orderTotal: 3_000_000,
        customer: { totalOrders: 3, deliveredCount: 0, cancelledCount: 3, returnedCount: 0 },
        phone: { normalized: "12345", distinctNames: 4, cancelledOrders: 3 },
        address: { line: "Lahore", city: "Karachi", previousCities: ["Lahore"] },
        recentOrdersSamePhone: 2,
      },
      settings,
    );
    expect(r.level).toBe("HIGH");
    expect(r.recommendation.action).toBe("MANUAL_REVIEW");
    expect(r.signals[0].points).toBeGreaterThanOrEqual(r.signals[r.signals.length - 1].points);
  });

  it("treats a first-time COD customer as needing confirmation", () => {
    const r = scoreOrderRisk({ ...base, customer: null }, settings);
    expect(r.recommendation.action).toBe("REQUEST_CONFIRMATION");
  });

  it("prepaid orders from known customers are safe to process", () => {
    const r = scoreOrderRisk({ ...base, paymentMethod: "CARD" }, settings);
    expect(r.recommendation.action).toBe("AUTO_PROCESS");
  });

  it("respects configurable weights", () => {
    const zeroWeights = Object.fromEntries(Object.keys(settings.weights).map((k) => [k, 0])) as typeof settings.weights;
    zeroWeights.phoneHistory = 10;
    const r = scoreOrderRisk({ ...base, phone: { ...base.phone, normalized: "bad" } }, { ...settings, weights: zeroWeights });
    expect(r.score).toBe(100);
  });
});
