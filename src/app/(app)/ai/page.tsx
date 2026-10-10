import { cn } from "cn";
import { ArrowRight, Ban, CheckCircle2, Eye, Hand, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { AreaTabs } from "@/components/layout/area-tabs";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { StatusPill } from "@/components/shared/status";
import { TimeAgo } from "@/components/shared/time-ago";
import { Button } from "@/components/ui/button";
import { AgentAvatar, relatedHref } from "@/features/agents/agent-meta";
import { KnowledgeBase } from "@/features/ai/knowledge-base";
import { AI_TEAM, friendlyAgentName } from "@/lib/ai/team";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { aiActivity } from "@/services/agent.service";
import { aiTeamOverview } from "@/services/home.service";
import { listKnowledge } from "@/services/knowledge.service";
import { getStore } from "@/services/store.service";
import { trustCenter } from "@/services/trust.service";

export const metadata = { title: "AI" };

const query = z.object({ tab: z.enum(["team", "knowledge", "trust"]).catch("team").default("team") });

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const auth = await requireAuth("approvals.view");
  const { tab } = query.parse(await searchParams);
  const storeId = auth.store.id;

  return (
    <PageContainer>
      <PageHeader
        title="Your AI team"
        description="Five assistants run the routine work. Anything sensitive waits for you — and you can see everything they do."
        actions={
          can(auth.role, "ai.use") ? (
            <Button asChild variant="outline" className="bg-card">
              <Link href="/assistant">
                <Sparkles className="text-ai" /> Ask AI
              </Link>
            </Button>
          ) : null
        }
      />
      <AreaTabs area="ai" className="-mt-2" />
      {tab === "team" && <TeamTab storeId={storeId} />}
      {tab === "knowledge" && <KnowledgeTab storeId={storeId} canEdit={can(auth.role, "ai.agents.manage")} canEditVoice={can(auth.role, "ai.agents.manage") && can(auth.role, "settings.manage")} />}
      {tab === "trust" && <TrustTab storeId={storeId} />}
    </PageContainer>
  );
}

async function TeamTab({ storeId }: { storeId: string }) {
  const [team, activity] = await Promise.all([aiTeamOverview(storeId), aiActivity(storeId, { limit: 12 })]);
  const pending = team.reduce((s, m) => s + m.pendingApprovals, 0);
  return (
    <div className="space-y-6">
      {pending > 0 && (
        <Link href="/approvals" className="flex items-center gap-3 rounded-xl border border-ai/25 bg-ai-soft/50 px-4 py-3 transition hover:border-ai/40">
          <Hand className="size-5 shrink-0 text-ai" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">
              {pending} recommendation{pending === 1 ? "" : "s"} waiting for your decision.
            </span>{" "}
            <span className="text-muted-foreground">Nothing happens until you approve.</span>
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary">
            Review <ArrowRight className="size-3.5" />
          </span>
        </Link>
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {team.map((m) => {
          const def = AI_TEAM.find((t) => t.key === m.key)!;
          return (
            <li key={m.key} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <AgentAvatar icon={m.icon} size="lg" muted={!m.active} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-[15px] font-semibold">{m.name}</h2>
                    <StatusPill tone={m.active ? "success" : "neutral"}>{m.active ? "Active" : "Paused"}</StatusPill>
                  </div>
                  <p className="text-[13px] text-muted-foreground">{m.role}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 divide-x rounded-lg border bg-surface-2/50 text-center">
                <div className="px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Tasks today</dt>
                  <dd className="tabular text-sm font-semibold">{m.tasks24h}</dd>
                </div>
                <div className="px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">To approve</dt>
                  <dd className={cn("tabular text-sm font-semibold", m.pendingApprovals && "text-ai")}>{m.pendingApprovals}</dd>
                </div>
                <div className="px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Last active</dt>
                  <dd className="text-sm font-semibold">{m.lastActiveAt ? <TimeAgo date={m.lastActiveAt} /> : "—"}</dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-1.5 text-[13px]">
                {def.does.map((d) => (
                  <li key={d} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {d}
                  </li>
                ))}
                {def.asks.length > 0 && (
                  <li className="flex gap-2 text-muted-foreground">
                    <Hand className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> Asks you first: {def.asks.join(", ").toLowerCase()}
                  </li>
                )}
              </ul>
              {m.failed24h > 0 && <p className="mt-3 text-xs font-medium text-danger">{m.failed24h} task{m.failed24h === 1 ? "" : "s"} failed today</p>}
              <div className="mt-auto flex justify-end pt-3">
                <Link href={m.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Settings & history <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <SectionCard
        title="What your AI team did"
        description="Latest actions and recommendations"
        action={
          <Link href="/agents/activity" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            Full activity <ArrowRight className="size-3.5" />
          </Link>
        }
        contentClassName="px-0 pb-0"
      >
        <ul className="divide-y border-t">
          {activity.map((a) => {
            const rel = a.kind === "decision" ? { href: `/approvals?focus=${a.id}`, label: "Review" } : relatedHref(a.relatedType, a.relatedId);
            const name = friendlyAgentName(a.agent?.key);
            return (
              <li key={`${a.kind}-${a.id}`} className="flex items-center gap-3 px-5 py-2.5">
                <AgentAvatar agentKey={a.agent?.key} size="sm" muted={!a.agent} />
                <p className="min-w-0 flex-1 truncate text-[13.5px]">
                  <span className="font-medium">{name}</span> <span className="text-muted-foreground">· {a.agent?.name && a.title.startsWith(a.agent.name) ? a.title.slice(a.agent.name.length + 1) : a.title}</span>
                </p>
                {a.status === "FAILED" && <StatusPill tone="danger">Failed</StatusPill>}
                {a.status === "PENDING_APPROVAL" && <StatusPill tone="ai">Needs approval</StatusPill>}
                <span className="shrink-0 text-xs text-muted-foreground">
                  <TimeAgo date={a.at} />
                </span>
                {rel && (
                  <Link href={rel.href} className="shrink-0 text-[12.5px] font-medium text-primary hover:underline">
                    {rel.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

async function KnowledgeTab({ storeId, canEdit, canEditVoice }: { storeId: string; canEdit: boolean; canEditVoice: boolean }) {
  const [articles, store] = await Promise.all([listKnowledge(storeId), getStore(storeId)]);
  return <KnowledgeBase articles={JSON.parse(JSON.stringify(articles))} aiSettings={store.settings.ai} canEdit={canEdit} canEditVoice={canEditVoice} />;
}

const TOPIC: Record<string, string> = {
  CONFIRM_ORDER: "order confirmations",
  DECLINE_ORDER: "order cancellations by the customer",
  ORDER_STATUS: "order status",
  PRODUCT_AVAILABILITY: "stock questions",
  PRICE: "prices",
  DELIVERY: "delivery",
  FAQ: "FAQs",
  GREETING: "greetings",
  THANKS: "thank-yous",
  EXCHANGE: "exchanges",
  RETURN: "returns",
  COMPLAINT: "complaints",
};

async function TrustTab({ storeId }: { storeId: string }) {
  const t = await trustCenter(storeId);
  const col = (title: string, icon: React.ReactNode, tone: string, items: string[], foot?: React.ReactNode) => (
    <section className="flex flex-col rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <span className={cn("grid size-8 place-items-center rounded-lg", tone)}>{icon}</span>
        {title}
      </h2>
      <ul className="mt-3 space-y-2 text-[13.5px]">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-foreground/30" />
            {i}
          </li>
        ))}
      </ul>
      {foot && <div className="mt-auto pt-4 text-xs text-muted-foreground">{foot}</div>}
    </section>
  );
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border bg-success-soft/40 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          Every AI action goes through the same checks: it&apos;s validated, checked against the assistant&apos;s permissions, sent for approval when sensitive, and written to the audit log.{" "}
          <Link href="/settings/security" className="font-medium text-primary hover:underline">
            View audit log
          </Link>
        </span>
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {col(
          "Does on its own",
          <CheckCircle2 className="size-4" />,
          "bg-success-soft text-success",
          [...t.onItsOwn, `Answers customers about ${t.autoReplyTopics.map((x) => TOPIC[x] ?? x.toLowerCase()).join(", ")}`],
          <>Plus reading your orders, products, customers and ads ({t.reads.length} read-only lookups).</>,
        )}
        {col(
          "Only with your approval",
          <Hand className="size-4" />,
          "bg-warning-soft text-warning",
          t.withApproval.map((w) => w.label),
          <>
            Requests expire after {t.expiryHours} hours if nobody decides.{" "}
            <Link href="/settings/automation" className="font-medium text-primary hover:underline">
              Change limits
            </Link>
          </>,
        )}
        {col("Never does", <Ban className="size-4" />, "bg-danger-soft text-danger", t.never)}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Eye className="size-3.5" aria-hidden /> AI engine: {t.provider === "local" ? "CommerceAI rules (runs on our servers, no external AI)" : t.provider}. Confidence is shown only when it comes from a model or a measured rate.
      </p>
    </div>
  );
}
