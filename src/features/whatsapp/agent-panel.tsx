import { ArrowRight, Ban, Check, Database, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/page";
import { StatusPill, type Tone } from "@/components/shared/status";
import { titleCase } from "@/lib/format";
import { TimeAgo } from "@/components/shared/time-ago";

const AUTONOMY: Record<string, { label: string; tone: Tone; help: string }> = {
  AUTONOMOUS: { label: "Autonomous", tone: "success", help: "Replies to customers on its own and hands off when unsure." },
  APPROVAL_REQUIRED: { label: "Approval required", tone: "warning", help: "Drafts replies that a team member approves before sending." },
  SUGGEST_ONLY: { label: "Suggest only", tone: "neutral", help: "Only suggests replies inside the inbox composer." },
};

const HANDLES = [
  { title: "Order confirmation", desc: "Confirms COD orders when customers reply “yes”/“haan”." },
  { title: "Order status & tracking", desc: "Looks up the order by phone and shares courier status." },
  { title: "Product questions", desc: "Fabric, fit and size guidance from your catalog." },
  { title: "Prices", desc: "Quotes the live Shopify price, including active sale prices." },
  { title: "Availability", desc: "Checks real stock per size and color before answering." },
  { title: "Delivery", desc: "Delivery times and charges by city from your policies." },
  { title: "Exchanges", desc: "Explains the exchange policy and opens a ticket." },
  { title: "Returns", desc: "Checks eligibility windows and escalates exceptions." },
  { title: "FAQs", desc: "Answers from your knowledge base in Urdu, Roman Urdu or English." },
];

export type AgentPanelData = {
  name: string;
  description: string;
  enabled: boolean;
  autonomy: string;
  lastActiveAt: string | null;
  tools: string[];
  denied: string[];
  confidenceThreshold: number | null;
};

export function AgentPanel({ agent, stats }: { agent: AgentPanelData | null; stats: { aiResolvedShare: number | null; aiResolvedLast7d: number; activeLast7d: number } }) {
  const autonomy = agent ? (AUTONOMY[agent.autonomy] ?? { label: titleCase(agent.autonomy), tone: "neutral" as Tone, help: "" }) : null;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="relative overflow-hidden rounded-xl border bg-card xl:col-span-2">
        <div aria-hidden className="bg-ai-gradient pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ai text-background shadow-sm">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold tracking-tight">{agent?.name ?? "WhatsApp Agent"}</h2>
                <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{agent?.description ?? "Answers customers on WhatsApp 24/7 using live Shopify data."}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {agent?.enabled ? <StatusPill tone="success">Active</StatusPill> : <StatusPill tone="neutral">Paused</StatusPill>}
                  {autonomy && (
                    <StatusPill tone={autonomy.tone} dot={false}>
                      {autonomy.label}
                    </StatusPill>
                  )}
                  {agent?.lastActiveAt && <span className="text-xs text-muted-foreground">Last reply <TimeAgo date={agent.lastActiveAt} /></span>}
                </div>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0 bg-card">
              <Link href="/agents/whatsapp">
                Configure agent <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold">Never invents stock or prices</p>
              <p className="text-[13px] text-muted-foreground">Every availability or price answer is checked against live Shopify inventory first. When it isn&apos;t sure, it hands the chat to your team with a reason.</p>
            </div>
          </div>

          <h3 className="mt-6 mb-3 text-[13px] font-semibold">What it handles</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {HANDLES.map((h) => (
              <li key={h.title} className="flex gap-2.5 rounded-lg border bg-card/80 p-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ai-soft text-ai">
                  <Check className="size-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{h.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="space-y-4">
        <SectionCard title="Performance" description="Last 7 days">
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Resolved without a human</dt>
              <dd className="tabular text-lg font-semibold">{stats.aiResolvedShare === null ? "—" : `${Math.round(stats.aiResolvedShare * 100)}%`}</dd>
            </div>
            {stats.aiResolvedShare !== null && (
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(stats.aiResolvedShare * 100)}% resolved by AI`}>
                <div className="h-full rounded-full bg-ai" style={{ width: `${Math.round(stats.aiResolvedShare * 100)}%` }} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats.aiResolvedLast7d} of {stats.activeLast7d} active WhatsApp conversations
            </p>
            {autonomy?.help && <p className="border-t pt-3 text-xs text-muted-foreground">{autonomy.help}</p>}
            {agent?.confidenceThreshold != null && (
              <p className="text-xs text-muted-foreground">Hands off below {Math.round(agent.confidenceThreshold * 100)}% confidence.</p>
            )}
          </dl>
        </SectionCard>

        {agent && agent.tools.length > 0 && (
          <SectionCard title="Live data it can use" icon={<Database className="size-4 text-muted-foreground" />}>
            <ul className="flex flex-wrap gap-1.5">
              {agent.tools.map((t) => (
                <li key={t} className="inline-flex items-center gap-1 rounded-md border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px]">
                  <Wrench className="size-3 text-muted-foreground" /> {t}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {agent && agent.denied.length > 0 && (
          <SectionCard title="Never allowed to">
            <ul className="space-y-1.5">
              {agent.denied.map((d) => (
                <li key={d} className="flex items-start gap-2 text-sm">
                  <Ban className="mt-0.5 size-3.5 shrink-0 text-danger" /> {d}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
