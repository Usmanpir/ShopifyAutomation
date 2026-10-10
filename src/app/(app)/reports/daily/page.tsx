import { AreaTabs } from "@/components/layout/area-tabs";
import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Flame, Lightbulb, PackageX, Siren, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { DailyReportControls, GenerateFirstReport } from "@/features/reports/daily-report-controls";
import { requireAuth } from "@/lib/auth/session";
import { dayKey } from "@/lib/dates";
import { makeFormatter } from "@/lib/formatter";
import { percentChange } from "@/lib/money";
import { listDailyReports, type DailyReportMetrics } from "@/services/report.service";

export const metadata = { title: "Daily AI report" };

type Insight = { icon: string; label: string; text: string; href?: string };

const INSIGHT_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  "Best product": { icon: Flame, tone: "bg-warning-soft text-warning" },
  "Low stock": { icon: PackageX, tone: "bg-warning-soft text-warning" },
  Issue: { icon: Siren, tone: "bg-danger-soft text-danger" },
  Opportunity: { icon: Lightbulb, tone: "bg-success-soft text-success" },
};

/** Hide the app chrome when printing / saving as PDF. */
const PRINT_CSS = `@media print {
  aside, nav[aria-label="Mobile"], header:has(+ #main), [data-sonner-toaster] { display: none !important; }
  #main { padding: 0 !important; }
  body { background: #fff !important; }
  @page { margin: 14mm; }
}`;

function yesterdayKey(tz: string) {
  return dayKey(new Date(Date.now() - 86_400_000), tz);
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const change = percentChange(cur, prev);
  const flat = Math.abs(change) < 0.05;
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span className={cn("tabular inline-flex items-center gap-0.5 rounded-md px-1 py-px font-semibold", flat ? "bg-muted" : up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
        {!flat && <Icon className="size-3.5" aria-hidden />}
        {Math.abs(change).toFixed(1)}%<span className="sr-only">{up ? " increase" : " decrease"}</span>
      </span>
      <span className="whitespace-nowrap">vs <span className="hidden sm:inline">previous</span><span className="sm:hidden">prev.</span> day</span>
    </p>
  );
}

export default async function DailyReportPage({ searchParams }: PageProps<"/reports/daily">) {
  const auth = await requireAuth("reports.view");
  const { date } = await searchParams;
  const tz = auth.store.timezone;
  const f = makeFormatter(auth.store);
  const reports = await listDailyReports(auth.store.id, 60);

  const withKey = reports.map((r) => ({ ...r, key: dayKey(r.periodStart, tz) }));
  const wanted = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const report = wanted ? withKey.find((r) => r.key === wanted) : withKey[0];
  const yesterday = yesterdayKey(tz);
  const longDate = (key: string) => new Intl.DateTimeFormat(auth.store.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
  const options = withKey.map((r) => ({ value: r.key, label: new Intl.DateTimeFormat(auth.store.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.key}T12:00:00Z`)) }));

  const header = (
    <PageHeader
      crumbs={[{ label: "Reports", href: "/reports" }, { label: "Daily AI report" }]}
      title="Daily AI report"
      description="Your morning briefing — yesterday's numbers and what to act on, generated automatically every day."
      actions={<DailyReportControls options={options} selected={report?.key ?? null} yesterday={yesterday} hasReport={!!report} />}
      className="print:hidden"
    />
  );
  const tabs = <AreaTabs area="analytics" className="-mt-2" />;

  if (!report) {
    return (
      <PageContainer>
        {header}
        {tabs}
        <SectionCard>
          <EmptyState
            icon={<Sparkles />}
            title={wanted ? `No report for ${longDate(wanted)}` : "No daily reports yet"}
            description="Reports are generated each morning for the previous day. You can generate one right now."
            action={<GenerateFirstReport date={wanted ?? undefined} />}
          />
        </SectionCard>
      </PageContainer>
    );
  }

  const m = report.metrics as unknown as DailyReportMetrics;
  const all = (report.insights as unknown as Insight[]) ?? [];
  const lede = all.find((i) => i.label === "Revenue");
  const insights = all.filter((i) => i !== lede);
  const confirmRate = m.orders ? (m.confirmed / m.orders) * 100 : 0;
  const cancelRate = m.orders ? (m.cancelled / m.orders) * 100 : 0;
  const revenueUp = m.revenue >= m.previous.revenue;

  const tiles: { label: string; value: string; sub?: React.ReactNode }[] = [
    { label: "Revenue", value: f.money(m.revenue), sub: <Delta cur={m.revenue} prev={m.previous.revenue} /> },
    { label: "Orders", value: f.number(m.orders), sub: <Delta cur={m.orders} prev={m.previous.orders} /> },
    { label: "Confirmed", value: f.number(m.confirmed), sub: <p className="mt-1.5 text-xs text-muted-foreground">{confirmRate.toFixed(0)}% of orders</p> },
    { label: "Cancelled", value: f.number(m.cancelled), sub: <p className="mt-1.5 text-xs text-muted-foreground">{cancelRate.toFixed(0)}% cancellation rate</p> },
    { label: "Delivered", value: f.number(m.delivered), sub: <p className="mt-1.5 text-xs text-muted-foreground">Handed to customers</p> },
    { label: "Ad spend", value: f.money(m.adSpend), sub: <p className="mt-1.5 text-xs text-muted-foreground">Meta campaigns</p> },
    { label: "ROAS", value: `${m.roas.toFixed(2)}×`, sub: <p className="mt-1.5 text-xs text-muted-foreground">{m.roas >= 3 ? "Healthy return" : m.roas >= 1.5 ? "Break-even zone" : m.adSpend ? "Below target" : "No ad spend"}</p> },
    { label: "Profit", value: f.money(m.profit), sub: <p className="mt-1.5 text-xs text-muted-foreground">{m.revenue ? `${((m.profit / m.revenue) * 100).toFixed(0)}% margin` : "After COGS & ads"}</p> },
  ];

  return (
    <PageContainer className="max-w-[1100px] print:max-w-none print:space-y-4 print:p-0">
      <style>{PRINT_CSS}</style>
      {header}
      {tabs}

      <article className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] print:rounded-none print:border-0 print:shadow-none" aria-labelledby="report-title">
        {/* Masthead */}
        <div className="border-b bg-ai-gradient px-5 py-6 sm:px-8 sm:py-8 print:bg-none print:px-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-ai uppercase">Daily business report · {report.key}</p>
          <h2 id="report-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">
            {longDate(report.key)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {auth.store.name} · generated {f.dateTime(report.createdAt)}
          </p>
          {lede && (
            <p className="mt-5 flex max-w-2xl items-start gap-2.5 text-[15px] leading-relaxed">
              {revenueUp ? <TrendingUp className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <TrendingDown className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />}
              <span>
                The store made <span className="font-semibold">{f.money(m.revenue)}</span> from <span className="font-semibold">{f.number(m.orders)} orders</span> —{" "}
                {m.previous.revenue ? (
                  <>
                    <span className={cn("font-semibold", revenueUp ? "text-success" : "text-danger")}>
                      {revenueUp ? "up" : "down"} {Math.abs(percentChange(m.revenue, m.previous.revenue)).toFixed(1)}%
                    </span>{" "}
                    on the day before ({f.money(m.previous.revenue)}).
                  </>
                ) : (
                  "no sales the day before to compare against."
                )}
              </span>
            </p>
          )}
        </div>

        {/* Metrics */}
        <section aria-label="Key metrics" className="px-5 py-6 sm:px-8 print:px-0">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">The numbers</h3>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 print:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="bg-card p-4 print:break-inside-avoid">
                <p className="text-[12.5px] font-medium text-muted-foreground">{t.label}</p>
                <p className="tabular mt-1 truncate text-xl font-semibold tracking-tight" title={t.value}>
                  {t.value}
                </p>
                {t.sub}
              </div>
            ))}
          </div>
        </section>

        {/* Insights */}
        <section aria-label="AI insights" className="border-t px-5 py-6 sm:px-8 print:px-0">
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-ai uppercase">
            <Sparkles className="size-3.5" aria-hidden /> AI insights
          </h3>
          {insights.length ? (
            <ul className="divide-y rounded-xl border">
              {insights.map((ins, i) => {
                const s = INSIGHT_STYLE[ins.label] ?? { icon: Sparkles, tone: "bg-ai-soft text-ai" };
                const body = (
                  <>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", s.tone)}>
                      <s.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{ins.label}</span>
                      <span className="block text-sm leading-relaxed">{ins.text}</span>
                    </span>
                    {ins.href && <ChevronRight className="size-4 shrink-0 text-muted-foreground print:hidden" aria-hidden />}
                  </>
                );
                return (
                  <li key={i} className="print:break-inside-avoid">
                    {ins.href ? (
                      <Link href={ins.href} className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-muted/40">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3.5 px-4 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nothing unusual — a quiet day. No actions recommended.</p>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-surface-2/50 px-5 py-3 text-xs text-muted-foreground sm:px-8 print:bg-transparent print:px-0">
          <span>Figures in {auth.store.currency}, store time ({tz}). Profit = revenue − returns − COGS − ad spend.</span>
          <Link href="/analytics" className="font-medium text-primary hover:underline print:hidden">
            Explore in Analytics →
          </Link>
        </footer>
      </article>
    </PageContainer>
  );
}
