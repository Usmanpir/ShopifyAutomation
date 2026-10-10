import { Suspense } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { RangeSelect } from "@/components/shared/url-controls";
import { AccessDeniedToast } from "@/features/dashboard/access-denied-toast";
import { DashboardInsights } from "@/features/dashboard/insights";
import { RevenueChart } from "@/features/dashboard/revenue-chart";
import { AiTeamList } from "@/features/home/ai-team";
import { AttentionQueue } from "@/features/home/attention-queue";
import { MorningBriefing } from "@/features/home/briefing";
import { StoreHealth } from "@/features/home/store-health";
import { requireAuth } from "@/lib/auth/session";
import { dayKey, rangeQuerySchema } from "@/lib/dates";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { dashboardKpis, topProductsWithGrowth } from "@/services/analytics.service";
import { aiTeamOverview, morningBriefing, storeHealth, todaySummary } from "@/services/home.service";
import { listInsights } from "@/services/insight.service";
import { priorityQueue } from "@/services/priority.service";

export const metadata = { title: "Home" };

const HOME_KPIS = ["revenue", "orders", "adSpend", "roas", "profit"];

function partOfDay(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

export default async function HomePage({ searchParams }: PageProps<"/dashboard">) {
  const auth = await requireAuth("dashboard.view");
  const q = rangeQuerySchema.parse(await searchParams);
  const storeId = auth.store.id;
  const f = makeFormatter(auth.store);
  const canAds = can(auth.role, "ads.view");

  const [{ kpis, series, range }, priorities, today, insights, top, team] = await Promise.all([
    dashboardKpis(storeId, q),
    priorityQueue(storeId, { role: auth.role }),
    todaySummary(storeId),
    listInsights(storeId, 4),
    topProductsWithGrowth(storeId, q, 5),
    can(auth.role, "approvals.view") ? aiTeamOverview(storeId) : Promise.resolve(null),
  ]);
  const [briefing, health] = await Promise.all([morningBriefing(storeId, priorities.items, auth.role), storeHealth(storeId, priorities.items, auth.role)]);

  const shownKpis = kpis.filter((k) => HOME_KPIS.includes(k.key) && (canAds || (k.key !== "adSpend" && k.key !== "roas")));
  const formatKpi = (k: (typeof kpis)[number]) =>
    k.format === "money" ? f.money(k.value) : k.format === "percent" ? `${k.value.toFixed(2)}%` : k.format === "ratio" ? `${k.value.toFixed(2)}×` : f.number(k.value);
  const pod = partOfDay(auth.store.timezone);
  const urgent = priorities.items.filter((p) => p.score >= 45).length;

  return (
    <PageContainer wide>
      <Suspense>
        <AccessDeniedToast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">
            Good {pod.toLowerCase()}, {auth.user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Today so far:</span> {f.money(today.revenue)} from {today.orders} order{today.orders === 1 ? "" : "s"}
            {today.change !== null && (
              <span className={today.change >= 0 ? "text-success" : "text-danger"}>
                {" "}
                ({today.change >= 0 ? "+" : ""}
                {today.change.toFixed(0)}% vs this time yesterday)
              </span>
            )}
            {" · "}
            {urgent ? `${urgent} thing${urgent === 1 ? "" : "s"} need${urgent === 1 ? "s" : ""} you` : "nothing urgent"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeSelect />
          {can(auth.role, "ai.use") && (
            <Button asChild variant="outline" className="h-9 bg-card">
              <Link href="/assistant">
                <Sparkles className="text-ai" /> Ask AI
              </Link>
            </Button>
          )}
        </div>
      </div>

      <MorningBriefing
        day={dayKey(new Date(), auth.store.timezone)}
        greeting={pod}
        headline={briefing.headline}
        points={briefing.points}
        reportHref={can(auth.role, "reports.view") ? (briefing.date ? `/reports/daily?date=${briefing.date}` : "/reports/daily") : null}
        canAsk={can(auth.role, "ai.use")}
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        {shownKpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={formatKpi(k)} change={k.change} comparison={range.comparisonLabel} spark={k.spark} invert={k.invert} />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section id="needs-attention" aria-labelledby="attention-title" className="scroll-mt-20 space-y-3 xl:col-span-2">
          <div>
            <h2 id="attention-title" className="text-[15px] font-semibold tracking-tight">
              Needs attention
            </h2>
            <p className="text-[13px] text-muted-foreground">Ranked by money at stake and urgency. Tap “Why?” to see the data behind each item.</p>
          </div>
          <AttentionQueue initial={JSON.parse(JSON.stringify(priorities.items))} />
        </section>
        <div className="space-y-4">
          <SectionCard title="Store health" description="One number per area, linked to the details">
            <StoreHealth areas={health} />
          </SectionCard>
          {team && (
            <SectionCard
              title="Your AI team"
              action={
                <Link href="/ai" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              <AiTeamList team={team} />
            </SectionCard>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Revenue" description={`${range.label} · daily`} className="xl:col-span-2">
          <RevenueChart series={series} />
        </SectionCard>
        <SectionCard
          title="Best sellers"
          description={range.label}
          action={
            <Link href="/products?sort=revenue" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
              All <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <ul className="space-y-3">
            {top.map((p, i) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="group flex items-center gap-3">
                  <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                  <ProductImage src={p.imageUrl} alt={p.title} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.units} units</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">{f.money(p.revenue, { compact: true })}</p>
                    {p.previousRevenue > 0 ? (
                      <p className={p.growth >= 0 ? "text-xs text-success" : "text-xs text-danger"}>
                        {p.growth >= 0 ? "↑" : "↓"} {Math.abs(p.growth).toFixed(0)}%
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">new</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
            {!top.length && <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period yet.</p>}
          </ul>
        </SectionCard>
      </div>

      <DashboardInsights initial={JSON.parse(JSON.stringify(insights))} canRefresh={can(auth.role, "ai.use")} />
    </PageContainer>
  );
}
