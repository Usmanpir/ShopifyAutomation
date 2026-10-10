import { cn } from "cn";
import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import { WhyButton } from "@/components/shared/explain";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { StatusPill } from "@/components/shared/status";
import { ADVICE_TONE, type Advice } from "@/lib/marketing-advice";
import type { Formatter } from "@/lib/formatter";
import { percentChange } from "@/lib/money";
import type { MarketingSnapshot } from "@/services/marketing-advisor.service";
import { MarketingCopilot } from "./marketing-copilot";

const KIND_LABEL: Record<Advice["kind"], string> = {
  scale: "Grow carefully",
  hold: "Hold",
  fix_creative: "Fix creative",
  fix_conversion: "Fix conversion",
  stop_loss: "Losing money",
  wait: "Too early",
  not_sales: "Awareness",
};

/** "Is my marketing working?" — answered on one screen. */
export function MarketingOverview({ s, f, canAsk }: { s: MarketingSnapshot; f: Formatter; canAsk: boolean }) {
  const roasTone = s.week.roas >= s.breakEven ? "text-success" : "text-danger";
  return (
    <div className="space-y-6">
      <section aria-label="Advertising results" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Revenue from ads" value={f.money(s.week.revenue)} change={percentChange(s.week.revenue, s.lastWeek.revenue)} comparison="Last 7 days vs the week before" />
        <KpiCard label="Ad spend" value={f.money(s.week.spend)} change={percentChange(s.week.spend, s.lastWeek.spend)} invert comparison="Last 7 days" />
        <KpiCard
          label="Return on ad spend"
          value={`${s.week.roas.toFixed(2)}×`}
          change={percentChange(s.week.roas, s.lastWeek.roas)}
          comparison={`Break-even ${s.breakEven.toFixed(2)}×${s.hasMarginData ? "" : " (assumed)"}`}
          icon={<span className={cn("text-[11.5px] font-semibold", roasTone)}>{s.week.roas >= s.breakEven ? "Profitable" : "Below break-even"}</span>}
        />
        <KpiCard label="WhatsApp campaign revenue" value={f.money(s.whatsappRevenue30d)} comparison="Broadcasts · last 30 days" />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {s.needsAttention.length > 0 && (
            <SectionCard title="Needs attention" description="Campaigns spending without enough return">
              <AdviceList items={s.needsAttention} />
            </SectionCard>
          )}
          <SectionCard
            title="Recommendations"
            description="Based on this week vs last week for each campaign — never “spend more” without proof"
            action={
              <Link href="/ads?tab=campaigns" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                All campaigns <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {s.advice.length ? (
              <AdviceList items={s.advice.filter((a) => !s.needsAttention.includes(a))} />
            ) : (
              <EmptyState compact title="No active campaigns" description="Connect Meta Ads or start a campaign — results and advice will appear here." />
            )}
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Best campaign" description="Highest return among campaigns with enough sales">
            {s.best ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  <Trophy className="size-4 text-warning" aria-hidden /> {s.best.name}
                </p>
                <p className="text-sm">
                  <span className="tabular font-semibold">{s.best.roas.toFixed(2)}×</span> return on {f.money(s.best.spend)} spend this week.
                </p>
                <Link href={`/ads/campaigns/${s.best.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open campaign <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No campaign has enough purchases this week to call a winner.</p>
            )}
          </SectionCard>
          {canAsk && (
            <SectionCard title="Marketing Copilot" description="Ask about ads, customers and campaigns">
              <MarketingCopilot />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

function AdviceList({ items }: { items: Advice[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing else to report.</p>;
  return (
    <ul className="-mx-1 divide-y">
      {items.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 px-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/ads/campaigns/${a.id}`} className="text-sm font-semibold hover:text-primary hover:underline">
                {a.name}
              </Link>
              <StatusPill tone={ADVICE_TONE[a.kind]}>{KIND_LABEL[a.kind]}</StatusPill>
            </div>
            <p className="mt-0.5 text-[13.5px] font-medium">{a.title}</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{a.reason}</p>
          </div>
          <WhyButton
            className="self-end sm:self-start"
            explain={{
              what: `${a.name} returned ${a.roas.toFixed(2)}× on ad spend this week (${a.prevRoas.toFixed(2)}× last week).`,
              why: "Return on ad spend shows how much revenue each rupee of ads brought back. Below break-even, every sale from the ad loses money after product costs.",
              todo: a.reason,
              evidence: a.evidence,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
