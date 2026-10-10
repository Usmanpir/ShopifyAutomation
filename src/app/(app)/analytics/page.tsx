import { AreaTabs } from "@/components/layout/area-tabs";
import { cn } from "cn";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, FileText, Lightbulb } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { ORDER_STATUS, PAYMENT_METHOD, Pill } from "@/components/shared/status";
import { RangeSelect } from "@/components/shared/url-controls";
import { AovTrendChart, MoneyBars, MoneyDonut, OrdersTrendChart, RevenueProfitChart } from "@/features/analytics/analytics-charts";
import { OrderHeatmap } from "@/features/analytics/order-heatmap";
import { requireAuth } from "@/lib/auth/session";
import { RANGE_PRESETS, rangeQuerySchema } from "@/lib/dates";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { conversionFunnel, customerMix, dashboardKpis, orderHeatmap, salesBreakdowns, topProductsWithGrowth } from "@/services/analytics.service";

export const metadata = { title: "Analytics" };

const querySchema = rangeQuerySchema.extend({ range: z.enum(RANGE_PRESETS).catch("30d").default("30d") });
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

/** One-line "so what" under each chart. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-2 border-t pt-3 text-[13px] text-muted-foreground">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Daily trends need at least two days of data. */
function ShortRangeNote() {
  return (
    <div className="grid h-40 place-items-center rounded-lg border border-dashed bg-surface-2/40 px-4 text-center text-sm text-muted-foreground">
      <p>
        Trends need at least two days of data.
        <br />
        Pick <span className="font-medium text-foreground">Last 7 days</span> or longer to see the daily shape.
      </p>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const auth = await requireAuth("analytics.view");
  const q = querySchema.parse(await searchParams);
  const storeId = auth.store.id;
  const f = makeFormatter(auth.store);

  const [{ kpis, series, range }, funnel, breakdowns, mix, heat, top] = await Promise.all([
    dashboardKpis(storeId, q),
    conversionFunnel(storeId, q),
    salesBreakdowns(storeId, q),
    customerMix(storeId, q),
    orderHeatmap(storeId, q),
    topProductsWithGrowth(storeId, q, 10),
  ]);

  const formatKpi = (k: (typeof kpis)[number]) =>
    k.format === "money" ? f.money(k.value) : k.format === "percent" ? `${k.value.toFixed(2)}%` : k.format === "ratio" ? `${k.value.toFixed(2)}×` : f.number(k.value);
  const kpi = (key: string) => kpis.find((k) => k.key === key)!;

  // ── Derived series & captions ──
  const chartData = series.map((p) => {
    const net = p.orders - p.cancelled;
    return { date: p.date, revenue: p.revenue, profit: p.profit, orders: p.orders, confirmed: p.confirmed, cancelled: p.cancelled, aov: net > 0 ? Math.round(p.revenue / net) : 0 };
  });
  const revenue = kpi("revenue").value;
  const profit = kpi("profit").value;
  const totalOrders = series.reduce((s, p) => s + p.orders, 0);
  const totalConfirmed = series.reduce((s, p) => s + p.confirmed, 0);
  const totalCancelled = series.reduce((s, p) => s + p.cancelled, 0);
  const hasData = totalOrders > 0;
  const trendable = chartData.length > 1;

  const aovDays = chartData.filter((d) => d.aov > 0);
  const avgAov = totalOrders - totalCancelled > 0 ? Math.round(revenue / (totalOrders - totalCancelled)) : 0;
  const peakAov = aovDays.reduce<(typeof aovDays)[number] | null>((m, d) => (!m || d.aov > m.aov ? d : m), null);

  const dropOffs = funnel.steps.slice(1).map((s, i) => ({ from: funnel.steps[i]!, to: s, rate: s.stepRate ?? 0 }));
  const worstStep = dropOffs.reduce<(typeof dropOffs)[number] | null>((m, d) => (!m || d.rate < m.rate ? d : m), null);

  const categories = breakdowns.categories.slice(0, 8).map((c) => ({ label: c.name, value: c.revenue }));
  const categoryTotal = breakdowns.categories.reduce((s, c) => s + c.revenue, 0);
  const cities = breakdowns.cities.map((c) => ({ label: c.city, value: c.revenue }));
  const top2Cities = breakdowns.cities.slice(0, 2);
  const payments = [...breakdowns.payments].sort((a, b) => b.revenue - a.revenue).map((p) => ({ label: PAYMENT_METHOD[p.method] ?? p.method, value: p.revenue }));
  const paymentTotal = payments.reduce((s, p) => s + p.value, 0);

  const statusOrder = Object.keys(ORDER_STATUS);
  const statuses = [...breakdowns.statuses].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
  const statusTotal = statuses.reduce((s, x) => s + x.orders, 0);
  const statusCount = (s: string) => statuses.find((x) => x.status === s)?.orders ?? 0;
  const maxStatus = Math.max(1, ...statuses.map((s) => s.orders));

  const mixRevenue = mix.new.revenue + mix.returning.revenue;
  const mixOrders = mix.new.orders + mix.returning.orders;

  const cells = heat.grid.flatMap((row, d) => row.map((v, h) => ({ d, h, v })));
  const peak = cells.reduce((m, c) => (c.v > m.v ? c : m), { d: 0, h: 0, v: 0 });
  const heatTotal = cells.reduce((s, c) => s + c.v, 0);
  const evening = cells.filter((c) => c.h >= 18).reduce((s, c) => s + c.v, 0);
  const byDay = heat.grid.map((row) => row.reduce((s, v) => s + v, 0));
  const bestDay = byDay.indexOf(Math.max(...byDay));

  const topRevenue = top.reduce((s, p) => s + p.revenue, 0);
  const risers = top.filter((p) => p.previousRevenue > 0 && p.growth > 0).sort((a, b) => b.growth - a.growth);

  return (
    <PageContainer wide>
      <PageHeader
        title="Analytics"
        description={`Business intelligence for ${auth.store.name} — ${range.label.toLowerCase()}, ${range.comparisonLabel}.`}
        actions={
          <>
            <RangeSelect defaultValue="30d" />
            {can(auth.role, "reports.view") && (
              <Button asChild variant="outline" className="h-9 bg-card">
                <Link href={`/reports?type=daily_sales&range=${q.range}${q.from ? `&from=${q.from}&to=${q.to}` : ""}`}>
                  <FileText /> Reports
                </Link>
              </Button>
            )}
          </>
        }
      />
      <AreaTabs area="analytics" className="-mt-2" />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={formatKpi(k)} change={k.change} comparison={range.comparisonLabel} spark={k.spark} invert={k.invert} />
        ))}
      </section>

      {!hasData ? (
        <SectionCard>
          <EmptyState icon={<BarChart3 />} title="No orders in this period" description="Pick a longer date range, or connect Shopify to start syncing orders." action={<RangeSelect defaultValue="30d" />} />
        </SectionCard>
      ) : (
        <>
          {/* ── Trends ── */}
          <SectionCard title="Revenue & profit" description={`${range.label} · daily · net of cancellations`}>
            {trendable ? <RevenueProfitChart data={chartData} /> : <ShortRangeNote />}
            <Caption>
              Profit is <Strong>{pct(profit, revenue).toFixed(0)}%</Strong> of revenue ({f.money(profit, { compact: true })} on {f.money(revenue, { compact: true })}); revenue is{" "}
              <Strong>
                {kpi("revenue").change >= 0 ? "up" : "down"} {Math.abs(kpi("revenue").change).toFixed(1)}%
              </Strong>{" "}
              {range.comparisonLabel}.
            </Caption>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Orders" description="Placed, confirmed and cancelled per day">
              {trendable ? <OrdersTrendChart data={chartData} /> : <ShortRangeNote />}
              <Caption>
                <Strong>{pct(totalConfirmed, totalOrders).toFixed(0)}%</Strong> of {f.number(totalOrders)} orders were confirmed and <Strong>{pct(totalCancelled, totalOrders).toFixed(0)}%</Strong> were cancelled.
              </Caption>
            </SectionCard>
            <SectionCard title="Average order value" description="Revenue ÷ non-cancelled orders, per day">
              {trendable ? <AovTrendChart data={chartData} /> : <ShortRangeNote />}
              <Caption>
                AOV averaged <Strong>{f.money(avgAov)}</Strong>
                {peakAov && (
                  <>
                    , peaking at <Strong>{f.money(peakAov.aov)}</Strong> on {f.dateShort(peakAov.date + "T12:00:00Z")}
                  </>
                )}
                .
              </Caption>
            </SectionCard>
          </div>

          {/* ── Funnel + customers ── */}
          <div className="grid gap-4 xl:grid-cols-5">
            <SectionCard title="Conversion funnel" description="Storefront sessions to placed orders" className="xl:col-span-3">
              <ol className="space-y-3.5">
                {funnel.steps.map((s, i) => (
                  <li key={s.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground tabular">{i + 1}</span>
                        {s.label}
                      </span>
                      <span className="tabular">
                        <span className="font-semibold">{f.number(s.value)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{s.overallRate.toFixed(s.overallRate < 10 ? 2 : 0)}% of sessions</span>
                      </span>
                    </div>
                    <div className="h-7 overflow-hidden rounded-md bg-muted/60" role="presentation">
                      <div className="h-full rounded-md bg-chart-1 transition-[width]" style={{ width: `${Math.max(s.overallRate, 1.2)}%`, opacity: 1 - i * 0.16 }} />
                    </div>
                    {i < funnel.steps.length - 1 && (
                      <p className="mt-1.5 pl-7 text-xs text-muted-foreground">
                        <span className="tabular font-medium text-foreground">{(funnel.steps[i + 1]!.stepRate ?? 0).toFixed(1)}%</span> continue ·{" "}
                        <span className="tabular text-danger">{f.number(s.value - funnel.steps[i + 1]!.value)} drop off</span>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              <Caption>
                Overall conversion is <Strong>{funnel.conversion.toFixed(2)}%</Strong> ({funnel.conversion >= funnel.prevConversion ? "up" : "down"} from {funnel.prevConversion.toFixed(2)}%).
                {worstStep && (
                  <>
                    {" "}
                    Biggest leak: <Strong>{worstStep.from.label.toLowerCase()} → {worstStep.to.label.toLowerCase()}</Strong>, where only {worstStep.rate.toFixed(0)}% continue.
                  </>
                )}
              </Caption>
            </SectionCard>

            <SectionCard title="New vs returning customers" description="Non-cancelled orders in the period" className="xl:col-span-2">
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Returning customers ${pct(mix.returning.revenue, mixRevenue).toFixed(0)}% of revenue`}>
                <div className="h-full bg-chart-1" style={{ width: `${pct(mix.new.revenue, mixRevenue)}%` }} />
                <div className="h-full border-l-2 border-card bg-chart-2" style={{ width: `${pct(mix.returning.revenue, mixRevenue)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["New", mix.new, "bg-chart-1"],
                    ["Returning", mix.returning, "bg-chart-2"],
                  ] as const
                ).map(([label, m, dot]) => (
                  <div key={label} className="rounded-lg border bg-surface-2/50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span aria-hidden className={cn("size-2 rounded-sm", dot)} />
                      {label}
                    </p>
                    <p className="tabular mt-1.5 text-lg font-semibold tracking-tight">{f.money(m.revenue, { compact: true })}</p>
                    <p className="tabular text-xs text-muted-foreground">{pct(m.revenue, mixRevenue).toFixed(0)}% of revenue</p>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Orders</dt>
                        <dd className="tabular font-medium">
                          {f.number(m.orders)} <span className="text-muted-foreground">· {pct(m.orders, mixOrders).toFixed(0)}%</span>
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Customers</dt>
                        <dd className="tabular font-medium">{f.number(m.customers)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">AOV</dt>
                        <dd className="tabular font-medium">{f.money(m.aov, { compact: true })}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Revenue change</dt>
                        <dd className={cn("tabular font-medium", m.change >= 0 ? "text-success" : "text-danger")}>
                          {m.change >= 0 ? "↑" : "↓"} {Math.abs(m.change).toFixed(0)}%
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <Caption>
                Returning customers bring <Strong>{pct(mix.returning.revenue, mixRevenue).toFixed(0)}%</Strong> of revenue
                {mix.returning.aov && mix.new.aov ? (
                  <>
                    {" "}
                    and spend <Strong>{f.money(mix.returning.aov, { compact: true })}</Strong> per order vs {f.money(mix.new.aov, { compact: true })} for first-timers
                  </>
                ) : null}
                .
              </Caption>
            </SectionCard>
          </div>

          {/* ── Breakdowns ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Sales by category" description="Revenue, excluding cancelled orders">
              {categories.length ? <MoneyBars data={categories} /> : <p className="py-8 text-center text-sm text-muted-foreground">No category sales yet.</p>}
              {categories[0] && (
                <Caption>
                  <Strong>{categories[0].label}</Strong> leads with {pct(categories[0].value, categoryTotal).toFixed(0)}% of category revenue
                  {categories[1] && (
                    <>
                      , followed by <Strong>{categories[1].label}</Strong> ({pct(categories[1].value, categoryTotal).toFixed(0)}%)
                    </>
                  )}
                  .
                </Caption>
              )}
            </SectionCard>
            <SectionCard title="Sales by city" description="Top 8 cities by revenue">
              {cities.length ? <MoneyBars data={cities} /> : <p className="py-8 text-center text-sm text-muted-foreground">No city data yet.</p>}
              {top2Cities.length > 0 && (
                <Caption>
                  <Strong>{top2Cities.map((c) => c.city).join(" and ")}</Strong> drive {pct(top2Cities.reduce((s, c) => s + c.revenue, 0), revenue).toFixed(0)}% of revenue.
                </Caption>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Payment mix" description="Order value by payment method">
              <MoneyDonut data={payments} centerLabel="Order value" />
              {payments[0] && (
                <Caption>
                  <Strong>{payments[0].label}</Strong> accounts for {pct(payments[0].value, paymentTotal).toFixed(0)}% of order value
                  {payments[0].label === "COD" ? " — confirmation before dispatch protects most of your revenue." : "."}
                </Caption>
              )}
            </SectionCard>
            <SectionCard title="Order status" description={`${f.number(statusTotal)} orders placed in the period`}>
              <ul className="space-y-2.5">
                {statuses.map((s) => (
                  <li key={s.status} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-sm">
                    <Pill map={ORDER_STATUS} value={s.status} className="justify-self-start" />
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${(s.orders / maxStatus) * 100}%` }} />
                    </div>
                    <span className="tabular w-24 text-right">
                      <span className="font-semibold">{f.number(s.orders)}</span> <span className="text-xs text-muted-foreground">· {pct(s.orders, statusTotal).toFixed(0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Caption>
                <Strong>{pct(statusCount("DELIVERED"), statusTotal).toFixed(0)}%</Strong> delivered, <Strong>{pct(statusCount("CANCELLED"), statusTotal).toFixed(0)}%</Strong> cancelled and{" "}
                <Strong>{pct(statusCount("RETURNED"), statusTotal).toFixed(0)}%</Strong> returned.
              </Caption>
            </SectionCard>
          </div>

          {/* ── When people buy ── */}
          <SectionCard title="When customers order" description={`Orders by day of week and hour (${auth.store.timezone})`}>
            <OrderHeatmap grid={heat.grid} />
            {heatTotal > 0 && (
              <Caption>
                Busiest slot is <Strong>{DAYS[peak.d]} {hour12(peak.h)}–{hour12((peak.h + 1) % 24)}</Strong>; <Strong>{pct(evening, heatTotal).toFixed(0)}%</Strong> of orders arrive after 6pm and{" "}
                {DAYS[bestDay]} is the strongest day — schedule campaigns and WhatsApp broadcasts just before.
              </Caption>
            )}
          </SectionCard>

          {/* ── Top products ── */}
          <SectionCard
            title="Top products"
            description={`By revenue · growth ${range.comparisonLabel}`}
            contentClassName="px-0 pb-0"
            action={
              <Link href="/products?sort=revenue" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                All products <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <caption className="sr-only">Top 10 products by revenue</caption>
                <thead className="bg-surface-2/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-10 py-2.5 pl-5 text-left font-medium">#</th>
                    <th scope="col" className="py-2.5 text-left font-medium">Product</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Units</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Revenue</th>
                    <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">Previous</th>
                    <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium sm:table-cell">Share</th>
                    <th scope="col" className="py-2.5 pr-5 text-right font-medium">Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {top.map((p, i) => {
                    const up = p.growth >= 0;
                    return (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="tabular py-2.5 pl-5 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 pr-3">
                          <Link href={`/products/${p.id}`} className="group flex min-w-0 items-center gap-3">
                            <ProductImage src={p.imageUrl} alt={p.title} className="size-9" />
                            <span className="line-clamp-2 font-medium group-hover:text-primary">{p.title}</span>
                          </Link>
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right">{f.number(p.units)}</td>
                        <td className="tabular py-2.5 pr-4 text-right font-semibold">{f.money(p.revenue)}</td>
                        <td className="tabular hidden py-2.5 pr-4 text-right text-muted-foreground md:table-cell">{p.previousRevenue ? f.money(p.previousRevenue) : "—"}</td>
                        <td className="tabular hidden py-2.5 pr-4 text-right text-muted-foreground sm:table-cell">{pct(p.revenue, revenue).toFixed(1)}%</td>
                        <td className="py-2.5 pr-5 text-right">
                          {p.previousRevenue === 0 ? (
                            <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info">New</span>
                          ) : (
                            <span className={cn("tabular inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                              {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                              {Math.abs(p.growth).toFixed(0)}%<span className="sr-only">{up ? " increase" : " decrease"}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 pb-5">
              <Caption>
                Your top {top.length} products generate <Strong>{pct(topRevenue, revenue).toFixed(0)}%</Strong> of revenue
                {risers[0] && (
                  <>
                    ; <Strong>{risers[0].title}</Strong> is the fastest riser (+{risers[0].growth.toFixed(0)}%)
                  </>
                )}
                .
              </Caption>
            </div>
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}
