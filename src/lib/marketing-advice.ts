/**
 * Evidence-based campaign advice. Rules over measured numbers only, and
 * deliberately conservative: "spend more" needs stable profit over two weeks
 * and enough purchases; otherwise the advice is to wait, fix, or hold.
 */
export type CampaignWindow = { spend: number; revenue: number; purchases: number; clicks: number; impressions: number };
export type CampaignInput = { id: string; name: string; objective: string; status: string; dailyBudget: number | null; cur: CampaignWindow; prev: CampaignWindow };

export type AdviceKind = "scale" | "hold" | "fix_creative" | "fix_conversion" | "stop_loss" | "wait" | "not_sales";
export type Advice = {
  id: string;
  name: string;
  kind: AdviceKind;
  title: string;
  reason: string;
  evidence: { label: string; value: string }[];
  roas: number;
  prevRoas: number;
  spend: number;
};

export const MIN_PURCHASES = 5;

const roas = (w: CampaignWindow) => (w.spend ? w.revenue / w.spend : 0);
const ctr = (w: CampaignWindow) => (w.impressions ? (w.clicks / w.impressions) * 100 : 0);
const cvr = (w: CampaignWindow) => (w.clicks ? (w.purchases / w.clicks) * 100 : 0);

export function adviseCampaign(c: CampaignInput, breakEven: number, money: (n: number) => string): Advice | null {
  if (c.status !== "ACTIVE" || c.cur.spend <= 0) return null;
  const r = roas(c.cur);
  const pr = roas(c.prev);
  const evidence = [
    { label: "Spend · 7 days", value: money(c.cur.spend) },
    { label: "Revenue · 7 days", value: money(c.cur.revenue) },
    { label: "Return on ad spend", value: `${r.toFixed(2)}× (prev. ${pr.toFixed(2)}×)` },
    { label: "Break-even return", value: `${breakEven.toFixed(2)}×` },
    { label: "Purchases", value: `${c.cur.purchases} (prev. ${c.prev.purchases})` },
    { label: "Click rate", value: `${ctr(c.cur).toFixed(2)}%` },
  ];
  const base = { id: c.id, name: c.name, roas: r, prevRoas: pr, spend: c.cur.spend, evidence };

  if (c.objective !== "OUTCOME_SALES")
    return { ...base, kind: "not_sales", title: "Judge by reach, not sales", reason: "This campaign is built for awareness or leads, so return on ad spend isn't the right yardstick. Check its reach and cost per result instead." };
  if (c.cur.purchases < MIN_PURCHASES)
    return { ...base, kind: "wait", title: "Too early to judge", reason: `Only ${c.cur.purchases} purchase${c.cur.purchases === 1 ? "" : "s"} in 7 days — at least ${MIN_PURCHASES} are needed before a budget change is meaningful.` };
  if (r < breakEven * 0.8 && pr < breakEven)
    return { ...base, kind: "stop_loss", title: "Losing money two weeks running", reason: `Returned ${r.toFixed(2)}× this week and ${pr.toFixed(2)}× last week, both under your ${breakEven.toFixed(2)}× break-even. Don't add budget; consider pausing (needs your approval).` };
  if (r < breakEven) {
    return ctr(c.cur) < 1
      ? { ...base, kind: "fix_creative", title: "Fix the creative before spending more", reason: `Few people click (${ctr(c.cur).toFixed(2)}%). The ad isn't stopping the scroll — try a new image or video before changing budget.` }
      : { ...base, kind: "fix_conversion", title: "Clicks don't turn into orders", reason: `People click (${ctr(c.cur).toFixed(2)}%) but only ${cvr(c.cur).toFixed(1)}% buy. Check the landing product's price, sizes in stock and delivery info before changing budget.` };
  }
  if (r >= breakEven * 1.5 && pr >= breakEven && c.cur.purchases >= MIN_PURCHASES * 2)
    return {
      ...base,
      kind: "scale",
      title: "Room to grow — carefully",
      reason: `Profitable for two weeks (${pr.toFixed(2)}× → ${r.toFixed(2)}×) with ${c.cur.purchases} purchases. A gradual increase of up to 20% is reasonable; larger jumps often lower the return. Budget changes go to your approval.`,
    };
  return { ...base, kind: "hold", title: "Keep the budget steady", reason: `Above break-even at ${r.toFixed(2)}×, but not by enough (or not for long enough) to justify more spend. Test a fresh creative to lift results.` };
}

export const ADVICE_TONE: Record<AdviceKind, "success" | "warning" | "danger" | "info" | "neutral"> = {
  scale: "success",
  hold: "info",
  fix_creative: "warning",
  fix_conversion: "warning",
  stop_loss: "danger",
  wait: "neutral",
  not_sales: "neutral",
};
