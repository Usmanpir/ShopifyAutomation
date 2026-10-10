import { describe, expect, it } from "vitest";
import { RECIPES } from "@/lib/automation/recipes";
import { validateGraph } from "@/lib/automation/validate";
import { adviseCampaign, type CampaignInput } from "@/lib/marketing-advice";
import { chipsFor, looksLikeOrderFilter, parseOrderQuery } from "@/lib/nl-filters";
import { familyOf, groupNotifications, priorityOf } from "@/lib/notification-groups";
import { summarizeOrder, type SummaryInput } from "@/lib/order-summary";
import { impactFactor, rankItems, waitUrgency, type PriorityDraft } from "@/lib/priority";

const HOUR = 3_600_000;
const money = (n: number) => `Rs. ${(n / 100).toLocaleString("en-PK")}`;

describe("priority engine", () => {
  const draft = (over: Partial<PriorityDraft>): PriorityDraft => ({
    key: "x",
    category: "orders",
    tone: "warning",
    count: 1,
    title: "t",
    summary: "s",
    impactAmount: null,
    impactLabel: null,
    urgencyLabel: "",
    urgency: 0.5,
    confidence: null,
    confidenceLabel: null,
    action: { kind: "link", label: "Go", href: "/" },
    secondary: [],
    explain: { what: "", why: "", todo: "", evidence: [] },
    ...over,
  });

  it("measures impact against an average day of revenue", () => {
    expect(impactFactor(50_000, 100_000)).toBe(0.5);
    expect(impactFactor(300_000, 100_000)).toBe(1);
    expect(impactFactor(null, 100_000)).toBeLessThan(0.2);
  });

  it("grows urgency with waiting time", () => {
    expect(waitUrgency(0, HOUR, 4 * HOUR)).toBeCloseTo(0.3);
    expect(waitUrgency(2 * HOUR, HOUR, 4 * HOUR)).toBeGreaterThan(0.65);
    expect(waitUrgency(5 * HOUR, HOUR, 4 * HOUR)).toBe(1);
  });

  it("ranks money at stake and urgency above small, calm items and drops empty ones", () => {
    const ranked = rankItems(
      [
        draft({ key: "small", impactAmount: 1_000, urgency: 0.3 }),
        draft({ key: "big", impactAmount: 90_000, urgency: 0.9 }),
        draft({ key: "empty", count: 0, impactAmount: 999_999, urgency: 1 }),
      ],
      100_000,
    );
    expect(ranked.map((r) => r.key)).toEqual(["big", "small"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("treats counted facts as certain but discounts low-confidence predictions", () => {
    const [fact] = rankItems([draft({ impactAmount: 10_000, urgency: 0.5 })], 100_000);
    const [guess] = rankItems([draft({ impactAmount: 10_000, urgency: 0.5, confidence: 0.4 })], 100_000);
    expect(fact!.score).toBeGreaterThan(guess!.score);
  });
});

describe("natural-language order filters", () => {
  it("parses the reference sentence into filters", () => {
    const r = parseOrderQuery("Show high-risk COD orders from Lahore created in the last 3 days");
    expect(r.params).toMatchObject({ risk: "HIGH", payment: "COD", city: "Lahore", days: "3" });
    expect(r.leftover).toBe("");
    expect(r.chips.map((c) => c.label)).toEqual(["High risk", "Cash on delivery", "Lahore", "Last 3 days"]);
  });

  it("understands amounts, status words and weeks", () => {
    expect(parseOrderQuery("unconfirmed orders over 10k").params).toMatchObject({ tab: "attention", confirmation: "awaiting", min: "10000" });
    expect(parseOrderQuery("late orders").params).toMatchObject({ tab: "to_ship", late: "1" });
    expect(parseOrderQuery("returns in the past 2 weeks").params).toMatchObject({ tab: "returned", days: "14" });
    expect(parseOrderQuery("orders under Rs 2,500 from Rahim Yar Khan").params).toMatchObject({ max: "2500", city: "Rahim Yar Khan" });
  });

  it("reports words it didn't understand instead of guessing", () => {
    const r = parseOrderQuery("pretty orders from Karachi");
    expect(r.params.city).toBe("Karachi");
    expect(r.leftover).toBe("pretty");
    expect(r.params.q).toBeUndefined();
  });

  it("only treats sentences about orders as filters", () => {
    expect(looksLikeOrderFilter("cod orders in lahore")).toBe(true);
    expect(looksLikeOrderFilter("Muhammad Ali")).toBe(false);
    expect(chipsFor({ tab: "all" })).toEqual([]);
  });
});

describe("campaign advice", () => {
  const w = (spend: number, revenue: number, purchases: number, clicks = 500, impressions = 20_000) => ({ spend, revenue, purchases, clicks, impressions });
  const c = (over: Partial<CampaignInput>): CampaignInput => ({ id: "c", name: "C", objective: "OUTCOME_SALES", status: "ACTIVE", dailyBudget: 1_000_000, cur: w(1_000_000, 4_000_000, 20), prev: w(1_000_000, 4_000_000, 18), ...over });

  it("only suggests growth after two profitable weeks with enough purchases", () => {
    expect(adviseCampaign(c({}), 2, money)!.kind).toBe("scale");
    expect(adviseCampaign(c({ prev: w(1_000_000, 1_500_000, 18) }), 2, money)!.kind).toBe("hold");
  });

  it("says it's too early with few purchases", () => {
    expect(adviseCampaign(c({ cur: w(500_000, 2_000_000, 3) }), 2, money)!.kind).toBe("wait");
  });

  it("diagnoses creative vs conversion problems below break-even", () => {
    expect(adviseCampaign(c({ cur: w(1_000_000, 1_500_000, 8, 100, 20_000) }), 2, money)!.kind).toBe("fix_creative");
    expect(adviseCampaign(c({ cur: w(1_000_000, 1_500_000, 8, 600, 20_000) }), 2, money)!.kind).toBe("fix_conversion");
    expect(adviseCampaign(c({ cur: w(1_000_000, 1_000_000, 8), prev: w(1_000_000, 1_200_000, 8) }), 2, money)!.kind).toBe("stop_loss");
  });

  it("doesn't judge awareness campaigns on sales, and ignores paused ones", () => {
    expect(adviseCampaign(c({ objective: "OUTCOME_AWARENESS", cur: w(500_000, 0, 0) }), 2, money)!.kind).toBe("not_sales");
    expect(adviseCampaign(c({ status: "PAUSED" }), 2, money)).toBeNull();
  });
});

describe("automation wizard recipes", () => {
  it("every recipe builds a valid workflow for every choice", () => {
    for (const r of RECIPES) {
      const choices = [...r.timing, ...r.actions];
      const combos = choices.length ? choices.flatMap((ch) => ch.options.map((o) => ({ [ch.id]: o.value }))) : [{}];
      for (const opts of combos) {
        const built = r.build(opts);
        expect(validateGraph(built.graph).errors, `${r.key} ${JSON.stringify(opts)}`).toEqual([]);
      }
    }
  });

  it("applies timing and drops optional branches", () => {
    const cod = RECIPES.find((r) => r.key === "confirm-cod")!;
    const g = cod.build({ remind: "4", review: "none" }).graph;
    expect(g.nodes.find((n) => n.key === "wait_2h")!.config).toEqual({ amount: 4, unit: "hours" });
    expect(g.nodes.some((n) => n.key === "manual_review")).toBe(false);
  });
});

describe("notification grouping", () => {
  const n = (id: string, title: string, type = "INVENTORY", severity = "WARNING") => ({ id, type, severity, title, body: null, href: `/x/${id}`, readAt: null, createdAt: `2026-10-03T0${id}:00:00Z` });

  it("collapses similar notifications and counts distinct subjects", () => {
    const groups = groupNotifications([n("1", "Low stock: Black Shirt XL"), n("2", "Low stock: Navy Polo M"), n("3", "Low stock: Black Shirt XL")]);
    expect(groups.important).toHaveLength(1);
    expect(groups.important[0]!.countLabel).toBe("2 products");
    expect(groups.important[0]!.unread).toBe(3);
  });

  it("puts risky orders and waiting customers in Urgent", () => {
    expect(priorityOf({ type: "ORDER", severity: "WARNING", title: "High-risk order #1" })).toBe("urgent");
    expect(priorityOf({ type: "AI", severity: "INFO", title: "Approval needed: Increase budget" })).toBe("important");
    expect(priorityOf({ type: "AI", severity: "INFO", title: "Daily report is ready" })).toBe("info");
    expect(familyOf("Ali Khan needs a human")).toBe("Customers need a human");
  });
});

describe("AI order summary", () => {
  const base: SummaryInput = {
    status: "PENDING_CONFIRMATION",
    confirmationStatus: "PENDING",
    paymentMethod: "COD",
    riskLevel: "LOW",
    riskScore: 10,
    placedAt: new Date(),
    customerName: "Sana Khan",
    customer: { totalOrders: 4, deliveredCount: 3, cancelledCount: 1, returnedCount: 0, totalSpent: 1_200_000 },
    topSignal: null,
    confirmationSentAt: new Date(Date.now() - 5 * 60_000),
    shipment: null,
    openTicket: null,
    lastInbound: null,
  };

  it("waits for a fresh reply and reports minutes, not hours", () => {
    const s = summarizeOrder(base, money);
    expect(s.next.tone).toBe("wait");
    expect(s.next.action).toBeUndefined();
    expect(s.points.some((p) => p.text.includes("5 min ago"))).toBe(true);
  });

  it("asks a person to check high-risk orders and never suggests cancelling", () => {
    const s = summarizeOrder({ ...base, riskLevel: "HIGH", riskScore: 80 }, money);
    expect(s.next.label).toMatch(/call or message/i);
    expect(JSON.stringify(s)).not.toMatch(/cancel the order/i);
  });

  it("recommends booking the shipment once confirmed", () => {
    expect(summarizeOrder({ ...base, status: "CONFIRMED", confirmationStatus: "CONFIRMED" }, money).next.action).toBe("ship");
  });
});
