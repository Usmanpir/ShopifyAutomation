import { Wrench } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, SelectFilter } from "@/components/shared/url-controls";
import { AutomationCards } from "@/features/automations/automation-cards";
import { AutomationWizardButton } from "@/features/automations/automation-wizard";
import { PopularAutomations } from "@/features/automations/popular-automations";
import { RunsTable } from "@/features/automations/runs-table";
import { TemplatesGallery } from "@/features/automations/templates-gallery";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listAutomations, listRuns } from "@/services/automation.service";
import { listPopular } from "@/services/popular-automations.service";

export const metadata = { title: "Automations" };

const RUN_STATUSES = ["RUNNING", "WAITING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"] as const;

const querySchema = z.object({
  // "templates" stays reachable for old links; Popular replaces it in the tabs.
  tab: z.enum(["popular", "automations", "templates", "runs"]).catch("popular").default("popular"),
  status: z.enum(RUN_STATUSES).optional().catch(undefined),
});

export default async function AutomationsPage({ searchParams }: PageProps<"/automations">) {
  const auth = await requireAuth("automations.view");
  const q = querySchema.parse(await searchParams);
  const canManage = can(auth.role, "automations.manage");
  const storeId = auth.store.id;

  const [automations, runs, popular] = await Promise.all([
    listAutomations(storeId),
    q.tab === "runs" ? listRuns(storeId, { status: q.status, limit: 50 }) : Promise.resolve([]),
    q.tab === "popular" ? listPopular(storeId) : Promise.resolve([]),
  ]);

  const totals = automations.reduce(
    (t, a) => ({ runs: t.runs + a.stats.runs30d, failed: t.failed + a.stats.failed, waiting: t.waiting + a.stats.waiting, active: t.active + (a.status === "ACTIVE" ? 1 : 0) }),
    { runs: 0, failed: 0, waiting: 0, active: 0 },
  );
  const successRate = totals.runs ? Math.round(((totals.runs - totals.failed) / totals.runs) * 1000) / 10 : null;

  const tabs = [
    { value: "popular", label: "Popular" },
    { value: "automations", label: "My automations", count: automations.length },
    { value: "runs", label: "Activity", count: totals.failed || undefined, tone: "danger" as const },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Automations"
        description="Turn on what you need with one switch. Every automation explains what it does and never takes a sensitive action without your approval."
        actions={
          canManage ? (
            <>
              <Button asChild variant="outline" className="bg-card">
                <Link href="/automations/new" prefetch={false}>
                  <Wrench /> Advanced editor
                </Link>
              </Button>
              <AutomationWizardButton />
            </>
          ) : null
        }
      />

      <section aria-label="Automation metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Running" value={`${totals.active} of ${automations.length}`} />
        <KpiCard label="Runs · last 30 days" value={totals.runs.toLocaleString()} />
        <KpiCard label="Success rate" value={successRate === null ? "—" : `${successRate}%`} />
        <KpiCard label="Waiting / for approval" value={totals.waiting.toLocaleString()} />
      </section>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <FilterTabs tabs={tabs} defaultValue="popular" />
          {q.tab === "runs" && (
            <SelectFilter
              param="status"
              placeholder="All statuses"
              options={[
                { value: "RUNNING", label: "Running" },
                { value: "WAITING", label: "Waiting" },
                { value: "AWAITING_APPROVAL", label: "Awaiting approval" },
                { value: "COMPLETED", label: "Completed" },
                { value: "FAILED", label: "Failed" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          )}
        </div>

        {q.tab === "popular" && <PopularAutomations items={popular} canManage={canManage} />}
        {q.tab === "automations" && <AutomationCards automations={JSON.parse(JSON.stringify(automations))} canManage={canManage} />}
        {q.tab === "templates" && <TemplatesGallery canManage={canManage} installedKeys={automations.map((a) => a.templateKey).filter((k): k is string => !!k)} />}
        {q.tab === "runs" && <RunsTable rows={JSON.parse(JSON.stringify(runs))} filtered={!!q.status} />}
      </div>
    </PageContainer>
  );
}
