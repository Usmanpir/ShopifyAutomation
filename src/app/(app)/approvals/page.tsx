import { ArrowRight, Bot, ClipboardCheck, FileClock, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Fragment } from "react";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs } from "@/components/shared/url-controls";
import { ApprovalCenter } from "@/features/approvals/approval-center";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { AreaTabs } from "@/components/layout/area-tabs";
import { decisionListQuery, decisionStakes, decisionTabCounts, getDecision, listDecisions } from "@/services/decision.service";

export const metadata = { title: "Approvals" };

const query = decisionListQuery.extend({
  status: decisionListQuery.shape.status.catch("pending"),
  focus: z.string().max(64).optional(),
});

const FLOW = [
  { icon: Sparkles, label: "AI recommendation" },
  { icon: ClipboardCheck, label: "Approval request" },
  { icon: UserCheck, label: "Human approves" },
  { icon: Bot, label: "Action executed" },
  { icon: FileClock, label: "Audit log" },
];

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const auth = await requireAuth("approvals.view");
  const q = query.parse(await searchParams);
  const storeId = auth.store.id;
  const [decisions, counts] = await Promise.all([listDecisions(storeId, { status: q.status, limit: q.limit }), decisionTabCounts(storeId)]);

  // Deep links (?focus=) work from any tab: surface the decision even if it's in another status group.
  if (q.focus && !decisions.some((d) => d.id === q.focus)) {
    const focused = await getDecision(storeId, q.focus);
    if (focused) decisions.unshift(focused);
  }
  const stakes = await decisionStakes(storeId, decisions);

  const tabs = [
    { value: "pending", label: "Pending", count: counts.pending, tone: "warning" as const },
    { value: "approved", label: "Approved", count: counts.approved },
    { value: "executed", label: "Executed", count: counts.executed },
    { value: "rejected", label: "Rejected", count: counts.rejected },
    { value: "all", label: "All", count: counts.all },
  ];

  return (
    <PageContainer className="max-w-[1100px]">
      <PageHeader
        title="Your AI team"
        description="Sensitive actions your assistants prepared wait here. Each shows what happened, why it matters, what's at stake and the data behind it."
      />
      <AreaTabs area="ai" className="-mt-2" />

      <section aria-label="How approvals work" className="rounded-xl border bg-ai-gradient px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> Guardrails: nothing sensitive runs without a human
        </div>
        <ol className="scrollbar-thin mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[12.5px]">
          {FLOW.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
              <li className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card/80 px-2.5 py-1 font-medium whitespace-nowrap">
                <s.icon className="size-3.5 text-ai" aria-hidden />
                {s.label}
              </li>
            </Fragment>
          ))}
        </ol>
      </section>

      <FilterTabs param="status" defaultValue="pending" tabs={tabs} />

      <ApprovalCenter
        key={q.status}
        decisions={JSON.parse(JSON.stringify(decisions.map((d) => ({ ...d, stake: stakes[d.id] ?? null }))))}
        status={q.status}
        canDecide={can(auth.role, "approvals.decide")}
        focusId={q.focus ?? null}
      />
    </PageContainer>
  );
}
