import { AreaTabs } from "@/components/layout/area-tabs";
import { cn } from "cn";
import { ArrowRight, ChevronRight, Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { RangeSelect, SelectFilter } from "@/components/shared/url-controls";
import { FALLBACK_ICON, REPORT_CATEGORIES, REPORT_ICONS } from "@/features/reports/report-meta";
import { ReportTable } from "@/features/reports/report-table";
import { requireAuth } from "@/lib/auth/session";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { buildReport, REPORT_TYPES, reportQuerySchema } from "@/services/report.service";

export async function generateMetadata({ searchParams }: PageProps<"/reports">) {
  const type = (await searchParams).type;
  const meta = REPORT_TYPES.find((r) => r.key === type);
  return { title: meta ? `${meta.name} · Reports` : "Reports" };
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const auth = await requireAuth("reports.view");
  const sp = await searchParams;
  const parsed = reportQuerySchema.safeParse(sp);
  if (!parsed.success) return <ReportCatalog />;

  const q = parsed.data;
  const f = makeFormatter(auth.store);
  const report = await buildReport(auth.store.id, q);
  const Icon = REPORT_ICONS[q.type] ?? FALLBACK_ICON;
  const category = REPORT_TYPES.find((r) => r.key === q.type)!.category;

  const prettyDay = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(key) ? f.date(`${key}T12:00:00Z`) : key);
  const period = report.period.includes("→")
    ? report.period
        .split("→")
        .map((s) => prettyDay(s.trim()))
        .join(" – ")
    : report.period.replace(/\d{4}-\d{2}-\d{2}/, (m) => prettyDay(m));

  const exportQs = (format: "csv" | "pdf") => {
    const p = new URLSearchParams({ type: q.type, range: q.range, format });
    if (q.range === "custom" && q.from && q.to) {
      p.set("from", q.from);
      p.set("to", q.to);
    }
    return `/api/reports/export?${p.toString()}`;
  };
  const canExport = can(auth.role, "reports.export");
  const isSnapshot = q.type === "inventory";

  return (
    <PageContainer>
      <PageHeader
        crumbs={[{ label: "Reports", href: "/reports" }, { label: category }]}
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-[18px]" />
            </span>
            {report.title}
          </span>
        }
        description={
          <>
            {REPORT_TYPES.find((r) => r.key === q.type)!.description} · <span className="font-medium text-foreground">{period}</span>
          </>
        }
        actions={
          canExport ? (
            <>
              <Button asChild variant="outline" className="h-9 bg-card">
                <a href={exportQs("csv")} download>
                  <FileSpreadsheet /> Export CSV
                </a>
              </Button>
              <Button asChild className="h-9">
                <a href={exportQs("pdf")} download>
                  <Download /> Export PDF
                </a>
              </Button>
            </>
          ) : null
        }
      />
      <AreaTabs area="analytics" className="-mt-2" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SelectFilter
          param="type"
          placeholder="All reports"
          className="sm:w-60"
          options={REPORT_TYPES.map((r) => ({ value: r.key, label: r.name }))}
        />
        {isSnapshot ? (
          <p className="text-xs text-muted-foreground">Inventory is a live snapshot — date range doesn&apos;t apply.</p>
        ) : (
          <RangeSelect defaultValue="30d" />
        )}
      </div>

      {report.summary.length > 0 && (
        <section aria-label="Summary" className={cn("grid grid-cols-2 gap-3 sm:gap-4", report.summary.length >= 5 ? "md:grid-cols-3 xl:grid-cols-6" : report.summary.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
          {report.summary.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <p className="truncate text-[13px] font-medium text-muted-foreground">{s.label}</p>
              <p className="tabular mt-1.5 truncate text-xl font-semibold tracking-tight" title={s.value}>
                {s.value}
              </p>
            </div>
          ))}
        </section>
      )}

      <SectionCard
        title={report.title}
        description={
          <>
            <span className="tabular">{report.rows.length.toLocaleString()}</span> row{report.rows.length === 1 ? "" : "s"} · generated {f.dateTime(report.generatedAt)}
          </>
        }
        contentClassName="px-0 pb-0"
        action={<span className="hidden text-xs text-muted-foreground sm:inline">Click a column to sort</span>}
      >
        <ReportTable columns={report.columns} rows={report.rows} />
      </SectionCard>

      <DailyReportPromo />
    </PageContainer>
  );
}

function DailyReportPromo() {
  return (
    <Link href="/reports/daily" className="group flex items-center gap-4 rounded-xl border bg-ai-gradient p-4 transition hover:border-ai/40 sm:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-soft text-ai">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Daily AI business report</p>
        <p className="text-sm text-muted-foreground">A morning briefing on yesterday&apos;s revenue, orders, ads and what to act on — written by AI.</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function ReportCatalog() {
  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Ready-made reports for every part of the business. Open one to filter by date and export to CSV or PDF."
        actions={
          <Button asChild variant="outline" className="h-9 bg-card">
            <Link href="/reports/daily">
              <Sparkles className="text-ai" /> Daily AI report
            </Link>
          </Button>
        }
      />
      <DailyReportPromo />
      <div className="space-y-8">
        {REPORT_CATEGORIES.map((cat) => {
          const items = REPORT_TYPES.filter((r) => r.category === cat.key);
          if (!items.length) return null;
          return (
            <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
              <div className="mb-3">
                <h2 id={`cat-${cat.key}`} className="text-[15px] font-semibold tracking-tight">
                  {cat.key}
                </h2>
                <p className="text-[13px] text-muted-foreground">{cat.description}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((r) => {
                  const Icon = REPORT_ICONS[r.key] ?? FALLBACK_ICON;
                  return (
                    <li key={r.key}>
                      <Link
                        href={`/reports?type=${r.key}&range=30d`}
                        className="group flex h-full items-center gap-3.5 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/15 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                      >
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", cat.tone)}>
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold group-hover:text-primary">{r.name}</span>
                          <span className="block text-[13px] text-muted-foreground">{r.description}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <SectionCard>
        <div className="flex items-start gap-3 text-sm">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Exports respect your role: owners, admins and managers can download CSV and PDF files. Every export is recorded in the audit log.
          </p>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
