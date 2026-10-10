import { z } from "zod";
import { AreaTabs } from "@/components/layout/area-tabs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs } from "@/components/shared/url-controls";
import { ActivityTimeline } from "@/features/agents/activity-timeline";
import { requireAuth } from "@/lib/auth/session";
import { aiActivity, listAgentOptions } from "@/services/agent.service";

export const metadata = { title: "AI Activity" };

const query = z.object({
  agent: z
    .string()
    .transform((s) => s.toUpperCase())
    .pipe(z.enum(["ORDER", "WHATSAPP", "SUPPORT", "MARKETING", "ADS", "INVENTORY", "BUSINESS"]))
    .optional()
    .catch(undefined),
});

export default async function AIActivityPage({ searchParams }: PageProps<"/agents/activity">) {
  const auth = await requireAuth("approvals.view");
  const q = query.parse(await searchParams);
  const [items, agents] = await Promise.all([
    aiActivity(auth.store.id, { agentKey: q.agent, limit: 100 }),
    listAgentOptions(auth.store.id),
  ]);

  return (
    <PageContainer>
      <PageHeader title="Your AI team" description="Everything your assistants did — every task and recommendation, in order, with a link to what it touched." />
      <AreaTabs area="ai" className="-mt-2" />
      <FilterTabs param="agent" defaultValue="all" tabs={[{ value: "all", label: "Everyone" }, ...agents.map((a) => ({ value: a.key, label: a.name }))]} />
      <ActivityTimeline key={q.agent ?? "all"} initial={JSON.parse(JSON.stringify(items))} agent={q.agent ?? null} />
    </PageContainer>
  );
}
