import { db } from "@/lib/db";
import { DAY_MS } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Role } from "@/generated/prisma/enums";
import { CATEGORY_PERMISSION, formatWait, rankItems, waitUrgency, type PriorityCategory, type PriorityDraft, type PriorityItem } from "@/lib/priority";
import { can } from "@/lib/rbac";
import { inventoryOverview } from "./inventory.service";
import { adsOverview } from "./meta.service";
import { getStore } from "./store.service";

const HOUR = 3_600_000;
const OPEN_STATUSES = ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"] as const;

/** Average daily revenue over the last 30 days — the yardstick for "impact". */
export async function averageDailyRevenue(storeId: string) {
  const agg = await db.order.aggregate({
    where: { storeId, placedAt: { gte: new Date(Date.now() - 30 * DAY_MS) }, status: { not: "CANCELLED" } },
    _sum: { total: true },
  });
  return Math.round((agg._sum.total ?? 0) / 30);
}

/**
 * Gross margin over the last 30 days → break-even ROAS (1 / margin).
 * Ads below it lose money on every sale; this is the benchmark for every
 * marketing recommendation instead of a generic "good ROAS" number.
 */
export async function breakEvenRoas(storeId: string) {
  const rows = await db.$queryRaw<{ revenue: bigint | number | null; cogs: bigint | number | null }[]>`
    SELECT SUM(i.total) AS revenue, SUM(COALESCE(i."unitCost", i."unitPrice" * 45 / 100) * i.quantity) AS cogs
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE o."storeId" = ${storeId} AND o."placedAt" >= ${new Date(Date.now() - 30 * DAY_MS)} AND o.status NOT IN ('CANCELLED', 'RETURNED')`;
  const revenue = Number(rows[0]?.revenue ?? 0);
  const cogs = Number(rows[0]?.cogs ?? 0);
  const margin = revenue > 0 ? (revenue - cogs) / revenue : 0;
  return { margin, breakEven: margin > 0.05 ? Math.round((1 / margin) * 100) / 100 : null };
}

/**
 * The AI Priority Engine. Collects every open problem from live data, prices
 * it, and ranks by impact × urgency × certainty (see lib/priority.ts).
 * Nothing here is invented: each number is a query result.
 */
export async function priorityQueue(storeId: string, opts: { role?: Role } = {}): Promise<{ items: PriorityItem[]; avgDailyRevenue: number }> {
  const allowed = (c: PriorityCategory) => !opts.role || can(opts.role, CATEGORY_PERMISSION[c]);
  const { items, avgDailyRevenue } = await buildQueue(storeId, { ads: allowed("marketing"), inventory: allowed("inventory") });
  return {
    avgDailyRevenue,
    items: items
      .filter((i) => allowed(i.category))
      // Roles that can't act get a link to look instead of the one-click action.
      .map((i) => (i.action.kind === "cod_confirm" && opts.role && !can(opts.role, "orders.update") ? { ...i, action: { kind: "link" as const, label: "View orders", href: "/orders?tab=attention" } } : i)),
  };
}

async function buildQueue(storeId: string, include: { ads: boolean; inventory: boolean }): Promise<{ items: PriorityItem[]; avgDailyRevenue: number }> {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const now = Date.now();

  const [avgDaily, codOpen, highRisk, late, decisions, handoffs, tickets, failedRuns] = await Promise.all([
    averageDailyRevenue(storeId),
    db.order.findMany({
      where: { storeId, paymentMethod: "COD", status: { in: ["NEW", "PENDING_CONFIRMATION"] }, riskLevel: { not: "HIGH" } },
      select: { id: true, total: true, placedAt: true, confirmationStatus: true },
    }),
    db.order.findMany({
      where: { storeId, riskLevel: "HIGH", status: { in: [...OPEN_STATUSES] } },
      select: { id: true, name: true, total: true, riskScore: true, placedAt: true, city: true },
      orderBy: { riskScore: "desc" },
    }),
    db.order.findMany({
      where: { storeId, status: { in: ["CONFIRMED", "PROCESSING"] }, confirmedAt: { lt: new Date(now - 48 * HOUR) } },
      select: { id: true, total: true, confirmedAt: true },
    }),
    db.aIDecision.findMany({
      where: { storeId, status: "PENDING_APPROVAL" },
      select: { id: true, title: true, confidence: true, expiresAt: true, createdAt: true, riskLevel: true, expectedImpact: true },
      orderBy: { createdAt: "asc" },
    }),
    db.conversation.findMany({
      where: { storeId, needsAttention: true, status: { in: ["OPEN", "PENDING"] } },
      select: { id: true, contactName: true, lastMessageAt: true, attentionReason: true, order: { select: { total: true, status: true } } },
      orderBy: { lastMessageAt: "asc" },
    }),
    db.supportTicket.findMany({
      where: { storeId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, createdAt: true, priority: true },
      orderBy: { createdAt: "asc" },
    }),
    db.automationRun.count({ where: { storeId, status: "FAILED", startedAt: { gte: new Date(now - 7 * DAY_MS) } } }),
  ]);

  const drafts: PriorityDraft[] = [];
  const sum = (xs: { total: number }[]) => xs.reduce((s, x) => s + x.total, 0);
  const oldest = (dates: Date[]) => (dates.length ? Math.min(...dates.map((d) => d.getTime())) : now);

  // 1) COD orders waiting for confirmation (high-risk ones are handled separately).
  if (codOpen.length) {
    const notAsked = codOpen.filter((o) => o.confirmationStatus !== "PENDING");
    const awaiting = codOpen.filter((o) => o.confirmationStatus === "PENDING");
    const staleReplies = awaiting.filter((o) => now - o.placedAt.getTime() > 24 * HOUR);
    const waited = now - oldest(codOpen.map((o) => o.placedAt));
    const value = sum(codOpen);
    drafts.push({
      key: "cod_confirmation",
      category: "orders",
      tone: "warning",
      count: codOpen.length,
      title: `${codOpen.length} COD order${codOpen.length === 1 ? "" : "s"} waiting for confirmation`,
      summary: notAsked.length
        ? `${notAsked.length} not asked yet${awaiting.length ? ` · ${awaiting.length} waiting for the customer's reply` : ""}`
        : `All asked on WhatsApp — ${awaiting.length} waiting for a reply`,
      impactAmount: value,
      impactLabel: `${money(value)} on hold`,
      urgencyLabel: `Oldest waiting ${formatWait(waited)}`,
      urgency: waitUrgency(waited, 6 * HOUR, 24 * HOUR),
      confidence: null,
      confidenceLabel: null,
      action: notAsked.length || staleReplies.length ? { kind: "cod_confirm", label: "Let AI handle" } : { kind: "link", label: "Review orders", href: "/orders?tab=attention&confirmation=awaiting" },
      secondary: [{ label: "Review orders", href: "/orders?tab=attention&payment=COD" }],
      explain: {
        what: `${codOpen.length} cash-on-delivery orders worth ${money(value)} can't be dispatched until the customer confirms.`,
        why: "Unconfirmed COD orders are the most common cause of parcels refused at the door — you pay shipping both ways and the stock is stuck.",
        todo: notAsked.length
          ? `Let the Order Assistant send the WhatsApp confirmation to the ${notAsked.length} low/medium-risk orders that haven't been asked. You'll see the exact list before anything is sent.`
          : staleReplies.length
            ? `Send a reminder to the ${staleReplies.length} customers who haven't replied in 24 hours.`
            : "Nothing to send — customers have been asked. Replies confirm orders automatically.",
        evidence: [
          { label: "Not asked yet", value: String(notAsked.length) },
          { label: "Awaiting reply", value: String(awaiting.length) },
          { label: "No reply after 24 h", value: String(staleReplies.length) },
          { label: "Value on hold", value: money(value) },
        ],
      },
    });
  }

  // 2) High-risk orders still open.
  if (highRisk.length) {
    const value = sum(highRisk);
    const top = highRisk[0]!;
    const waited = now - oldest(highRisk.map((o) => o.placedAt));
    drafts.push({
      key: "high_risk",
      category: "orders",
      tone: "danger",
      count: highRisk.length,
      title: `${highRisk.length} high-risk order${highRisk.length === 1 ? "" : "s"} to review`,
      summary: `Highest: ${top.name}${top.city ? ` from ${top.city}` : ""} · risk ${top.riskScore}/100`,
      impactAmount: value,
      impactLabel: `${money(value)} at risk`,
      urgencyLabel: `Oldest ${formatWait(waited)} ago`,
      urgency: Math.max(0.7, waitUrgency(waited, 4 * HOUR, 24 * HOUR)),
      confidence: null,
      confidenceLabel: null,
      action: { kind: "link", label: "Review", href: highRisk.length === 1 ? `/orders/${top.id}` : "/orders?tab=attention&risk=HIGH" },
      secondary: [],
      explain: {
        what: `${highRisk.length} open order${highRisk.length === 1 ? " has" : "s have"} a risk score above your high-risk threshold (${store.settings.risk.highThreshold}).`,
        why: "The score combines the customer's past cancellations and returns, phone history, order value and address consistency. High scores are refused at the door far more often.",
        todo: "Open each order, read the risk signals and confirm with the customer by WhatsApp or phone before dispatch. AI never cancels orders on its own.",
        evidence: highRisk.slice(0, 4).map((o) => ({ label: o.name, value: `${o.riskScore}/100 · ${money(o.total)}` })),
      },
    });
  }

  // 3) AI recommendations awaiting approval.
  if (decisions.length) {
    const soonest = decisions.filter((d) => d.expiresAt).sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())[0];
    const hoursLeft = soonest?.expiresAt ? (soonest.expiresAt.getTime() - now) / HOUR : null;
    const measured = decisions.map((d) => d.confidence).filter((c): c is number => typeof c === "number");
    drafts.push({
      key: "approvals",
      category: "ai",
      tone: "ai",
      count: decisions.length,
      title: `${decisions.length} AI recommendation${decisions.length === 1 ? "" : "s"} waiting for your decision`,
      summary: decisions[0]!.title,
      impactAmount: null,
      impactLabel: null,
      urgencyLabel: hoursLeft !== null ? (hoursLeft > 0 ? `First expires in ${formatWait(hoursLeft * HOUR)}` : "Expiring now") : `Oldest ${formatWait(now - decisions[0]!.createdAt.getTime())}`,
      urgency: hoursLeft === null ? 0.5 : hoursLeft < 6 ? 1 : hoursLeft < 24 ? 0.75 : 0.45,
      confidence: measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null,
      confidenceLabel: measured.length ? `Average model confidence across ${measured.length}` : null,
      action: { kind: "link", label: "Review", href: "/approvals" },
      secondary: [],
      explain: {
        what: "These actions are sensitive (refunds, price changes, ad budgets, broadcasts or cancellations), so the AI prepared them but did not run them.",
        why: "Nothing happens until someone with permission approves. Unreviewed recommendations expire automatically.",
        todo: "Open each one to see the evidence, then approve or reject.",
        evidence: decisions.slice(0, 4).map((d) => ({ label: d.title, value: d.expectedImpact ?? `${d.riskLevel.toLowerCase()} risk` })),
      },
    });
  }

  // 4) Conversations the AI handed to a human.
  if (handoffs.length) {
    const waited = now - handoffs[0]!.lastMessageAt.getTime();
    const linked = handoffs.filter((h) => h.order && !["CANCELLED", "DELIVERED", "RETURNED"].includes(h.order.status));
    const value = linked.reduce((s, h) => s + (h.order?.total ?? 0), 0);
    drafts.push({
      key: "handoffs",
      category: "inbox",
      tone: "warning",
      count: handoffs.length,
      title: `${handoffs.length} customer${handoffs.length === 1 ? "" : "s"} waiting for a human reply`,
      summary: handoffs[0]!.attentionReason ? `${handoffs[0]!.contactName}: ${handoffs[0]!.attentionReason}` : `Longest wait: ${handoffs[0]!.contactName}`,
      impactAmount: value || null,
      impactLabel: value ? `${money(value)} in linked orders` : null,
      urgencyLabel: `Longest wait ${formatWait(waited)}`,
      urgency: waitUrgency(waited, 30 * 60_000, 3 * HOUR),
      confidence: null,
      confidenceLabel: null,
      action: { kind: "link", label: "Reply", href: "/conversations?filter=attention" },
      secondary: [],
      explain: {
        what: "The Customer Assistant stopped answering these chats and asked for a person.",
        why: "Customers who wait more than an hour on WhatsApp often cancel or buy elsewhere. Complaints left unanswered turn into returns.",
        todo: "Open the inbox — the AI has drafted a suggested reply for each conversation that you can send or edit.",
        evidence: handoffs.slice(0, 4).map((h) => ({ label: h.contactName, value: h.attentionReason ?? `waiting ${formatWait(now - h.lastMessageAt.getTime())}` })),
      },
    });
  }

  // 5) Confirmed orders not dispatched after 48 h.
  if (late.length) {
    const value = sum(late);
    const waited = now - oldest(late.map((o) => o.confirmedAt!));
    drafts.push({
      key: "late_dispatch",
      category: "orders",
      tone: "warning",
      count: late.length,
      title: `${late.length} confirmed order${late.length === 1 ? "" : "s"} not shipped after 2 days`,
      summary: "Customers confirmed but nothing has been booked with the courier",
      impactAmount: value,
      impactLabel: `${money(value)} delayed`,
      urgencyLabel: `Oldest confirmed ${formatWait(waited)} ago`,
      urgency: waitUrgency(waited, 48 * HOUR, 96 * HOUR),
      confidence: null,
      confidenceLabel: null,
      action: { kind: "link", label: "View orders", href: "/orders?tab=to_ship&late=1" },
      secondary: [],
      explain: {
        what: `${late.length} orders were confirmed more than 48 hours ago and haven't shipped.`,
        why: "Late dispatch is the main reason customers change their mind on COD orders.",
        todo: "Book these with your courier, or message customers about the delay.",
        evidence: [
          { label: "Orders", value: String(late.length) },
          { label: "Value", value: money(value) },
        ],
      },
    });
  }

  // 6) Open support tickets.
  if (tickets.length) {
    const waited = now - tickets[0]!.createdAt.getTime();
    const urgent = tickets.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length;
    drafts.push({
      key: "tickets",
      category: "support",
      tone: "info",
      count: tickets.length,
      title: `${tickets.length} open support ticket${tickets.length === 1 ? "" : "s"}`,
      summary: urgent ? `${urgent} marked high priority` : "Returns, exchanges and delivery issues",
      // A ticket doesn't put its order's full value at stake, so no money figure here (urgency ranks it).
      impactAmount: null,
      impactLabel: null,
      urgencyLabel: `Oldest opened ${formatWait(waited)} ago`,
      urgency: Math.min(1, waitUrgency(waited, 24 * HOUR, 72 * HOUR) + (urgent ? 0.15 : 0)),
      confidence: null,
      confidenceLabel: null,
      action: { kind: "link", label: "Open tickets", href: "/conversations?view=tickets" },
      secondary: [],
      explain: {
        what: `${tickets.length} tickets are open or in progress.`,
        why: "Tickets are requests the AI can't complete alone — exchanges, returns and complaints.",
        todo: "Work through them oldest first.",
        evidence: [
          { label: "High priority", value: String(urgent) },
          { label: "Oldest", value: formatWait(waited) },
        ],
      },
    });
  }

  // 7) Failed automation runs.
  if (failedRuns) {
    drafts.push({
      key: "automations",
      category: "automations",
      tone: "danger",
      count: failedRuns,
      title: `${failedRuns} automation run${failedRuns === 1 ? "" : "s"} failed this week`,
      summary: "Some customers may not have received a message",
      impactAmount: null,
      impactLabel: null,
      urgencyLabel: "Last 7 days",
      urgency: 0.5,
      confidence: null,
      confidenceLabel: null,
      action: { kind: "link", label: "See failures", href: "/automations?tab=runs&status=FAILED" },
      secondary: [],
      explain: {
        what: `${failedRuns} automation runs stopped with an error in the last 7 days.`,
        why: "A failed step usually means a message wasn't sent or an order wasn't tagged.",
        todo: "Open the failed runs to see which step failed and why.",
        evidence: [{ label: "Failed runs (7d)", value: String(failedRuns) }],
      },
    });
  }

  // 8) Stock that will run out (forecast from real sales velocity).
  if (include.inventory) {
    const inv = await inventoryOverview(storeId);
    const atRisk = inv.rows.filter((r) => r.coverage.averageDailySales > 0 && ["OUT_OF_STOCK", "CRITICAL", "LOW"].includes(r.coverage.status));
    if (atRisk.length) {
      const prices = await db.productVariant.groupBy({ by: ["productId"], where: { storeId, productId: { in: atRisk.map((r) => r.id) } }, _avg: { price: true } });
      const price = new Map(prices.map((p) => [p.productId, Math.round(p._avg.price ?? 0)]));
      // Revenue lost over the next 7 days if not restocked: daily sales × price × days without stock.
      const lost = atRisk.map((r) => {
        const daysWithout = Math.max(0, 7 - (r.coverage.coverageDays ?? 0));
        return { r, lost: Math.round(r.coverage.averageDailySales * (price.get(r.id) ?? 0) * daysWithout) };
      });
      const total = lost.reduce((s, x) => s + x.lost, 0);
      const out = atRisk.filter((r) => r.coverage.status === "OUT_OF_STOCK").length;
      const worst = [...lost].sort((a, b) => b.lost - a.lost)[0]!;
      drafts.push({
        key: "stock",
        category: "inventory",
        tone: out ? "danger" : "warning",
        count: atRisk.length,
        title: out ? `${out} selling product${out === 1 ? " is" : "s are"} out of stock` + (atRisk.length > out ? ` · ${atRisk.length - out} running low` : "") : `${atRisk.length} product${atRisk.length === 1 ? "" : "s"} will run out within ${store.settings.inventory.coverageWarningDays} days`,
        summary: `${worst.r.title}: ${worst.r.coverage.coverageDays === null || worst.r.coverage.coverageDays <= 0 ? "out of stock" : `${worst.r.coverage.coverageDays} days left`} at ${worst.r.coverage.averageDailySales}/day`,
        impactAmount: total || null,
        impactLabel: total ? `≈ ${money(total)} sales at risk this week` : null,
        urgencyLabel: out ? "Selling items unavailable now" : "Within days",
        urgency: out ? 0.9 : 0.6,
        confidence: null,
        confidenceLabel: null,
        action: { kind: "link", label: "View forecast", href: "/inventory?status=critical" },
        secondary: [],
        explain: {
          what: `${atRisk.length} products that are selling have less than ${store.settings.inventory.coverageWarningDays} days of stock at their recent sales speed.`,
          why: `Sales speed is measured over the last ${inv.windowDays} days. When a product runs out, those sales are lost, and ads keep spending on it.`,
          todo: "Reorder the products at the top of the forecast. Suggested quantities cover 30 days of sales.",
          evidence: lost
            .sort((a, b) => b.lost - a.lost)
            .slice(0, 4)
            .map(({ r, lost: l }) => ({ label: r.title, value: `${r.stock} left · ${r.coverage.averageDailySales}/day${l ? ` · ≈ ${money(l)}` : ""}` })),
        },
      });
    }
  }

  // 9) Ad campaigns losing money (below break-even ROAS over 7 days).
  if (include.ads) {
    const [ads, be] = await Promise.all([adsOverview(storeId, { range: "7d" }), breakEvenRoas(storeId)]);
    const threshold = be.breakEven ?? 1;
    const losing = ads.campaigns.filter((c) => c.status === "ACTIVE" && c.objective === "OUTCOME_SALES" && c.metrics.spend > 0 && c.metrics.roas < threshold && c.metrics.spend >= avgDaily * 0.05);
    if (losing.length) {
      const spend = losing.reduce((s, c) => s + c.metrics.spend, 0);
      const worst = [...losing].sort((a, b) => a.metrics.roas - b.metrics.roas)[0]!;
      drafts.push({
        key: "ads_losing",
        category: "marketing",
        tone: "warning",
        count: losing.length,
        title: `${losing.length} ad campaign${losing.length === 1 ? " is" : "s are"} spending below break-even`,
        summary: `${worst.name}: ${worst.metrics.roas.toFixed(2)}× return vs ${threshold.toFixed(2)}× break-even`,
        impactAmount: spend,
        impactLabel: `${money(spend)} spent in 7 days`,
        urgencyLabel: "Spending every day",
        urgency: 0.6,
        confidence: null,
        confidenceLabel: null,
        action: { kind: "link", label: "Review ads", href: "/marketing" },
        secondary: [],
        explain: {
          what: `Over the last 7 days these sales campaigns returned less revenue per rupee than you need to cover product costs.`,
          why: be.breakEven
            ? `Your gross margin over 30 days is ${Math.round(be.margin * 100)}%, so you need at least ${be.breakEven.toFixed(2)}× return on ad spend to break even.`
            : "Without margin data we use 1× (revenue equals spend) as the break-even line.",
          todo: "Check the creatives and audience first. Pausing is a recommendation the Marketing Assistant will send for your approval — it never pauses on its own.",
          evidence: losing.slice(0, 4).map((c) => ({ label: c.name, value: `${money(c.metrics.spend)} · ${c.metrics.roas.toFixed(2)}×` })),
        },
      });
    }
  }

  return { items: rankItems(drafts, avgDaily), avgDailyRevenue: avgDaily };
}
