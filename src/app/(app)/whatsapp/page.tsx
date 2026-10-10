import { cn } from "cn";
import { AlertTriangle, Clock, FileText, Inbox as InboxIcon, MessageCircle, Send, Sparkles } from "lucide-react";
import { z } from "zod";
import { Inbox, type InboxInitial } from "@/features/conversations/inbox";
import { SegmentedNav } from "@/features/conversations/segmented-nav";
import { AgentPanel, type AgentPanelData } from "@/features/whatsapp/agent-panel";
import { TemplatesGrid } from "@/features/whatsapp/templates-grid";
import { AGENTS_BY_KEY } from "@/lib/ai/agents";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { makeFormatter } from "@/lib/formatter";
import { getAgent } from "@/services/agent.service";
import { conversationListQuery, getConversation, listConversations, listMessageTemplates, whatsappStats } from "@/services/conversation.service";

export const metadata = { title: "WhatsApp" };

const pageQuery = z.object({
  tab: z.enum(["inbox", "templates", "agent"]).catch("inbox").default("inbox"),
  c: z.string().max(64).optional().catch(undefined),
});

const toJson = <T,>(x: T) => JSON.parse(JSON.stringify(x));

function formatDuration(sec: number | null) {
  if (sec === null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function Stat({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4", tone)}>{icon}</span>
      <div className="min-w-0 pr-1">
        <p className="truncate text-xs font-medium whitespace-nowrap text-muted-foreground">{label}</p>
        <p className="tabular text-lg leading-tight font-semibold tracking-tight">
          {value}
          {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

export default async function WhatsAppPage({ searchParams }: PageProps<"/whatsapp">) {
  const auth = await requireAuth("conversations.view");
  const sp = await searchParams;
  const page = pageQuery.parse(sp);
  const storeId = auth.store.id;
  const f = makeFormatter(auth.store);
  const stats = await whatsappStats(storeId);

  let content: React.ReactNode;
  if (page.tab === "templates") {
    const templates = await listMessageTemplates(storeId);
    content = (
      <div className="flex-1 px-4 pb-6 sm:px-6 lg:min-h-0 lg:overflow-y-auto">
        <p className="mb-4 text-sm text-muted-foreground">Pre-approved WhatsApp Business templates. Used for order confirmations, shipping updates and any message sent outside the 24-hour customer service window.</p>
        <TemplatesGrid templates={toJson(templates)} />
      </div>
    );
  } else if (page.tab === "agent") {
    const agent = await getAgent(storeId, "WHATSAPP");
    const def = AGENTS_BY_KEY.get("WHATSAPP");
    const config = (agent?.config ?? {}) as { confidenceThreshold?: number };
    const data: AgentPanelData | null = agent
      ? {
          name: agent.name,
          description: agent.description,
          enabled: agent.enabled,
          autonomy: agent.autonomy,
          lastActiveAt: agent.lastActiveAt?.toISOString() ?? null,
          tools: agent.tools,
          denied: def?.denied ?? [],
          confidenceThreshold: typeof config.confidenceThreshold === "number" ? config.confidenceThreshold : null,
        }
      : null;
    content = (
      <div className="flex-1 px-4 pb-6 sm:px-6 lg:min-h-0 lg:overflow-y-auto">
        <AgentPanel agent={data} stats={stats} />
      </div>
    );
  } else {
    const parsed = conversationListQuery.safeParse({ ...sp, channel: "WHATSAPP" });
    const q = parsed.success ? parsed.data : conversationListQuery.parse({ channel: "WHATSAPP" });
    const [list, conversation] = await Promise.all([
      listConversations(storeId, auth.user.id, q),
      page.c
        ? getConversation(storeId, page.c).catch((e) => {
            if (e instanceof AppError && e.status === 404) return null;
            throw e;
          })
        : Promise.resolve(null),
    ]);
    const initial: InboxInitial = {
      list: toJson(list),
      conversation: conversation ? toJson(conversation) : null,
      params: { channel: "WHATSAPP", filter: q.filter, q: q.q ?? "" },
    };
    content = (
      <div className="flex-1 px-4 pb-4 sm:px-6 lg:min-h-0">
        <Inbox initial={initial} fixedChannel="WHATSAPP" className="h-[72dvh] rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:h-full" />
      </div>
    );
  }

  const share = stats.aiResolvedShare === null ? "—" : `${Math.round(stats.aiResolvedShare * 100)}%`;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-col gap-3 px-4 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[22px] leading-tight font-semibold tracking-tight sm:text-2xl">WhatsApp Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Your WhatsApp Business inbox, templates and the AI agent that answers customers 24/7 from live store data.</p>
        </div>
        <SegmentedNav
          label="WhatsApp sections"
          items={[
            { href: "/whatsapp", label: "Inbox", active: page.tab === "inbox", icon: <InboxIcon />, count: stats.attention, tone: "warning" },
            { href: "/whatsapp?tab=templates", label: "Templates", active: page.tab === "templates", icon: <FileText /> },
            { href: "/whatsapp?tab=agent", label: "AI Agent", active: page.tab === "agent", icon: <Sparkles /> },
          ]}
        />
      </div>

      <section aria-label="WhatsApp metrics" className="scrollbar-thin -mt-1 mb-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-1 sm:px-6 xl:grid xl:grid-cols-5 xl:overflow-visible">
        <Stat label="Open conversations" value={f.number(stats.open)} icon={<MessageCircle />} tone="bg-success-soft text-success" />
        <Stat label="Needs attention" value={f.number(stats.attention)} icon={<AlertTriangle />} tone="bg-warning-soft text-warning" />
        <Stat label="AI-resolved · 7 days" value={share} sub={`${stats.aiResolvedLast7d}/${stats.activeLast7d}`} icon={<Sparkles />} tone="bg-ai-soft text-ai" />
        <Stat label="Messages sent today" value={f.number(stats.sentToday)} icon={<Send />} tone="bg-info-soft text-info" />
        <Stat label="Avg first response" value={formatDuration(stats.avgFirstResponseSec)} icon={<Clock />} tone="bg-brand-soft text-brand" />
      </section>

      {content}
    </div>
  );
}
