import { cn } from "cn";
import { ArrowRight, BookOpen, Check, CheckCheck, Clock, Cpu, History, ShieldCheck, Workflow, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { DECISION_STATUS, Pill, StatusPill } from "@/components/shared/status";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { AgentKey } from "@/generated/prisma/enums";
import { AgentAutonomySelector, AgentConfigForm, AgentEnabledSwitch, AgentToolsTable } from "@/features/agents/agent-controls";
import { AgentAvatar, AUTONOMY, formatDuration, providerLabel, relatedHref, TASK_STATUS, type ToolInfo, toolLabel } from "@/features/agents/agent-meta";
import { StatTile } from "@/features/agents/stat-tile";
import { toolCatalog } from "@/lib/ai/tools/registry";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { getAgentDetail, listAgentsWithStats } from "@/services/agent.service";
import { TimeAgo } from "@/components/shared/time-ago";
import { friendlyAgentName } from "@/lib/ai/team";

const KEYS = ["ORDER", "WHATSAPP", "SUPPORT", "MARKETING", "ADS", "INVENTORY", "BUSINESS"] as const;

export async function generateMetadata({ params }: PageProps<"/agents/[key]">) {
  const { key } = await params;
  const name = { order: "Order Agent", whatsapp: "WhatsApp Agent", support: "Customer Support Agent", marketing: "Marketing Agent", ads: "Ads Analyst", inventory: "Inventory Agent", business: "Business Analyst" }[key.toLowerCase()];
  return { title: name ?? "AI Agent" };
}

export default async function AgentDetailPage({ params }: PageProps<"/agents/[key]">) {
  const auth = await requireAuth("approvals.view");
  const { key: rawKey } = await params;
  const key = rawKey.toUpperCase() as AgentKey;
  if (!(KEYS as readonly string[]).includes(key)) notFound();

  let agent: Awaited<ReturnType<typeof getAgentDetail>>;
  try {
    agent = await getAgentDetail(auth.store.id, key);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const stats = (await listAgentsWithStats(auth.store.id)).find((a) => a.key === key);
  const f = makeFormatter(auth.store);
  const canManage = can(auth.role, "ai.agents.manage");
  const catalog = toolCatalog() as ToolInfo[];
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const def = agent.definition;
  const config = (agent.config ?? {}) as { instructions?: string; confidenceThreshold?: number };
  const autonomy = AUTONOMY[agent.autonomy];

  const allowed = agent.tools.map((name) => {
    const t = byName.get(name);
    const always = t?.kind === "sensitive" || (t?.kind === "write" && agent.autonomy === "SUGGEST_ONLY");
    const conditional = !always && t?.kind === "write" && /approval/i.test(t.description);
    const note = always ? "approval required" : conditional ? "may need approval" : null;
    return { name, label: toolLabel(name), note, kind: t?.kind ?? "read" };
  });
  allowed.sort((a, b) => ["read", "write", "sensitive"].indexOf(a.kind) - ["read", "write", "sensitive"].indexOf(b.kind));
  const knowledge = [...agent.knowledge.map((k) => ({ ...k, shared: false })), ...agent.sharedKnowledge.map((k) => ({ ...k, shared: true }))];
  const tasks = agent.tasks.slice(0, 10);
  const lastModel = agent.tasks.find((t) => t.provider);

  return (
    <PageContainer>
      <PageHeader
        crumbs={[{ label: "AI team", href: "/ai" }, { label: friendlyAgentName(agent.key, agent.name) }]}
        title={
          <span className="flex items-center gap-3">
            <AgentAvatar icon={def.icon} size="lg" muted={!agent.enabled} />
            <span className="min-w-0">
              <span className="block truncate">{agent.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal tracking-normal">
                {agent.enabled ? (
                  <StatusPill tone="success">
                    Active
                  </StatusPill>
                ) : (
                  <StatusPill tone="neutral">Paused</StatusPill>
                )}
                <StatusPill tone={autonomy?.tone ?? "neutral"} dot={false}>
                  {autonomy?.label ?? agent.autonomy}
                </StatusPill>
                <span className="text-muted-foreground">{agent.lastActiveAt ? `Last active ${timeAgo(agent.lastActiveAt)}` : "No activity yet"}</span>
              </span>
            </span>
          </span>
        }
        actions={<AgentEnabledSwitch agentKey={agent.key} name={agent.name} enabled={agent.enabled} canManage={canManage} />}
      />

      <section aria-label="Agent stats" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Tasks completed", value: (stats?.tasksCompleted ?? 0).toLocaleString(), hint: "Last 30 days" },
          { label: "Success rate", value: stats?.successRate == null ? "—" : `${stats.successRate}%`, hint: `${stats?.tasksTotal ?? 0} attempted` },
          { label: "Pending approvals", value: String(stats?.pendingDecisions ?? 0), hint: "Awaiting a human", href: "/approvals" },
          { label: "Automations", value: String(stats?.automationCount ?? 0), hint: "Active rules using it", href: "/automations" },
        ].map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} hint={s.hint} href={s.href} />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="What this agent does" description={agent.description}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {def.responsibilities.map((r) => (
                <li key={r} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-ai-soft text-ai">
                    <Check className="size-3" aria-hidden />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Permissions"
            description="What this agent can and can never do"
            icon={<ShieldCheck className="size-4.5 text-success" aria-hidden />}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Allowed</h3>
                <ul className="space-y-1.5">
                  {allowed.map((p) => (
                    <li key={p.name} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Allowed" />
                      <span>
                        {p.label}
                        {p.note && <span className="text-muted-foreground"> ({p.note})</span>}
                      </span>
                    </li>
                  ))}
                  {!allowed.length && <li className="text-sm text-muted-foreground">No tools granted.</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Never allowed</h3>
                <ul className="space-y-1.5">
                  {def.denied.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm">
                      <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Denied" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Tools"
            description={canManage ? "Grant or revoke individual tools. Changes apply to the agent's next task." : "Tools this agent may call. Only owners and admins can change them."}
            contentClassName="px-0 pb-0"
          >
            <AgentToolsTable agentKey={agent.key} name={agent.name} catalog={catalog} granted={agent.tools} defaults={def.defaultTools} canManage={canManage} />
          </SectionCard>

          <SectionCard title="Autonomy" description="How much the agent may do without a human">
            <AgentAutonomySelector agentKey={agent.key} value={agent.autonomy} canManage={canManage} />
          </SectionCard>

          <SectionCard title="Configuration">
            <AgentConfigForm
              agentKey={agent.key}
              instructions={config.instructions ?? def.instructions}
              threshold={config.confidenceThreshold ?? 0.7}
              defaultInstructions={def.instructions}
              canManage={canManage}
            />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Recent activity"
            icon={<History className="size-4.5 text-muted-foreground" aria-hidden />}
            action={
              <Link href={`/agents/activity?agent=${agent.key}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                All <ArrowRight className="size-3.5" />
              </Link>
            }
            contentClassName="px-0 pb-1"
          >
            {tasks.length ? (
              <ul className="divide-y border-t">
                {tasks.map((t) => {
                  const rel = relatedHref(t.relatedType, t.relatedId);
                  const meta = [formatDuration(t.durationMs), providerLabel(t.provider) && `${providerLabel(t.provider)}${t.model ? ` · ${t.model}` : ""}`].filter(Boolean);
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[13px] leading-5 font-medium">{t.title}</p>
                        <Pill map={TASK_STATUS} value={t.status} className="h-5 text-[11px]" />
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
                        <span title={f.dateTime(t.createdAt)}><TimeAgo date={t.createdAt} /></span>
                        {meta.map((m) => (
                          <span key={m as string}>· {m}</span>
                        ))}
                      </p>
                      {t.error && <p className="mt-1 line-clamp-2 text-[11.5px] text-danger">{t.error}</p>}
                    </>
                  );
                  return (
                    <li key={t.id}>
                      {rel ? (
                        <Link href={rel.href} className="block px-5 py-2.5 hover:bg-muted/40">
                          {body}
                        </Link>
                      ) : (
                        <div className="px-5 py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">No tasks yet. Activity appears here as soon as the agent works.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Recent decisions"
            icon={<CheckCheck className="size-4.5 text-muted-foreground" aria-hidden />}
            action={
              <Link href="/approvals?status=all" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Approvals <ArrowRight className="size-3.5" />
              </Link>
            }
            contentClassName="px-0 pb-1"
          >
            {agent.decisions.length ? (
              <ul className="divide-y border-t">
                {agent.decisions.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    <Link href={`/approvals?${d.status === "PENDING_APPROVAL" ? "" : "status=all&"}focus=${d.id}`} className="block px-5 py-2.5 hover:bg-muted/40">
                      <p className="text-[13px] leading-5 font-medium">{d.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] text-muted-foreground">
                          <TimeAgo date={d.createdAt} />
                          {typeof d.confidence === "number" && <> · {Math.round(d.confidence * 100)}% confident</>}
                        </span>
                        <Pill map={DECISION_STATUS} value={d.status} className="h-5 text-[11px]" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">No recommendations from this agent yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Knowledge base"
            description={`${knowledge.length} article${knowledge.length === 1 ? "" : "s"} the agent can reference`}
            icon={<BookOpen className="size-4.5 text-muted-foreground" aria-hidden />}
          >
            {knowledge.length ? (
              <Accordion type="single" collapsible className="-my-1">
                {knowledge.map((k) => (
                  <AccordionItem key={k.id} value={k.id}>
                    <AccordionTrigger className="items-center gap-2 py-2.5 hover:no-underline">
                      <span className="min-w-0 flex-1 truncate text-[13px]">{k.title}</span>
                      <StatusPill tone={k.shared ? "neutral" : "ai"} dot={false} className="h-5 text-[10.5px]">
                        {k.category.charAt(0) + k.category.slice(1).toLowerCase()}
                      </StatusPill>
                    </AccordionTrigger>
                    <AccordionContent className="text-[13px] leading-6 text-muted-foreground">
                      {k.content}
                      <p className="mt-1.5 text-[11px]">{k.shared ? "Shared with all agents" : "Specific to this agent"}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No knowledge articles yet.</p>
            )}
          </SectionCard>

          <section className="rounded-xl border bg-ai-gradient p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-ai ring-1 ring-border">
                <Workflow className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">Automation rules</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {stats?.automationCount
                    ? `${stats.automationCount} active automation${stats.automationCount === 1 ? "" : "s"} trigger this agent.`
                    : "No active automations trigger this agent yet."}{" "}
                  Build when-this-then-that flows to put it to work.
                </p>
                <Link href="/automations" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open automations <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </section>

          {lastModel && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <Cpu className="size-3.5" aria-hidden /> Runs on {providerLabel(lastModel.provider)}
              {lastModel.model ? ` · ${lastModel.model}` : ""}
            </p>
          )}
          <p className={cn("flex items-center gap-1.5 px-1 text-xs text-muted-foreground")}>
            <Clock className="size-3.5" aria-hidden /> Added {f.date(agent.createdAt)} · updated <TimeAgo date={agent.updatedAt} />
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
