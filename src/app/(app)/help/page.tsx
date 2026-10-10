import { cn } from "cn";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Command,
  Keyboard,
  LifeBuoy,
  Mail,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { brand } from "@/config/brand";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata = { title: "Help center" };

type Step = { key: string; title: string; description: string; href: string; cta: string; icon: LucideIcon; done: boolean };

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], mac: ["⌘", "K"], label: "Search orders, customers, products and pages" },
  { keys: ["Ctrl", "J"], mac: ["⌘", "J"], label: "Ask the AI assistant anything" },
  { keys: ["Esc"], mac: ["Esc"], label: "Close dialogs, drawers and the command palette" },
  { keys: ["↑", "↓"], mac: ["↑", "↓"], label: "Move through search results" },
  { keys: ["Enter"], mac: ["Enter"], label: "Open the highlighted result" },
];

const FAQ = [
  {
    q: "What is demo mode?",
    a: "Demo mode fills your workspace with a realistic menswear store — 90 days of orders, customers, ads and traffic — so you can explore every feature safely. WhatsApp messages, Shopify writes and ad changes are simulated, never sent. Turn it off in Settings → General once you connect your real store.",
  },
  {
    q: "How is my data secured?",
    a: "Integration tokens and API keys are encrypted at rest (AES-256-GCM) and never sent to the browser. Every request is authenticated and checked against your role, sensitive actions are written to the audit log, and data is isolated per store.",
  },
  {
    q: "How do I add a courier?",
    a: "Go to Integrations → Courier, pick a provider and paste the API key from your courier portal. Demo Express and Manual / self-delivery are built in; other couriers (TCS, Leopards, PostEx…) plug in through a courier adapter — email support and we'll help you set it up. Once connected, confirmed orders can be booked from the order page and tracking updates flow back automatically.",
  },
  {
    q: "Can I switch the AI provider?",
    a: "Yes. Under Integrations you can connect OpenAI, Anthropic or Google Gemini with your own API key and choose which one powers the assistant, agents and insights. Without a key, the platform uses a built-in deterministic engine so features keep working.",
  },
  {
    q: "How do roles and permissions work?",
    a: "Owners and admins manage everything, including billing and the team. Managers run day-to-day operations and approve AI actions. Agents handle orders and conversations. Viewers get read-only access to dashboards and reports. Buttons a role can't use are hidden, and the server re-checks every action.",
  },
  {
    q: "Why didn't the AI send a message or change a campaign on its own?",
    a: "Anything sensitive — discounts, cancellations, ad budget changes, bulk messages — is proposed as a recommendation and waits in Approvals. You choose what the AI may do automatically in Settings → AI.",
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 bg-surface-2 px-1.5 font-sans text-[11.5px] font-medium text-foreground">{children}</kbd>;
}

export default async function HelpPage() {
  const auth = await requireAuth();
  const storeId = auth.store.id;
  const [integrations, activeAutomations, members] = await Promise.all([
    db.integration.findMany({ where: { storeId, provider: { in: ["SHOPIFY", "WHATSAPP", "META_ADS"] } }, select: { provider: true, status: true } }),
    db.automation.count({ where: { storeId, status: "ACTIVE" } }),
    db.membership.count({ where: { storeId } }),
  ]);
  const connected = (p: string) => integrations.some((i) => i.provider === p && (i.status === "CONNECTED" || i.status === "DEMO"));

  const steps: Step[] = [
    { key: "shopify", title: "Connect Shopify", description: "Sync products, orders and customers in real time.", href: "/integrations", cta: "Connect", icon: ShoppingBag, done: connected("SHOPIFY") },
    { key: "whatsapp", title: "Connect WhatsApp", description: "Confirm COD orders and reply to customers automatically.", href: "/integrations", cta: "Connect", icon: MessageCircle, done: connected("WHATSAPP") },
    { key: "meta", title: "Connect Meta Ads", description: "Track spend, ROAS and let AI flag wasted budget.", href: "/integrations", cta: "Connect", icon: Target, done: connected("META_ADS") },
    { key: "automations", title: "Review automations", description: "Turn on order confirmation, abandoned cart and low-stock flows.", href: "/automations", cta: "Review", icon: Workflow, done: activeAutomations > 0 },
    { key: "team", title: "Invite your team", description: "Give managers and agents their own logins and roles.", href: "/settings/team", cta: "Invite", icon: UserPlus, done: members > 1 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <PageContainer className="max-w-[1100px]">
      <PageHeader
        title="Help center"
        description={`Everything you need to get the most out of ${brand.name} — setup, shortcuts, how the AI works and answers to common questions.`}
        actions={
          <Button asChild variant="outline" className="h-9 bg-card">
            <a href={`mailto:${brand.supportEmail}`}>
              <Mail /> Contact support
            </a>
          </Button>
        }
      />

      {/* Getting started */}
      <SectionCard
        title="Getting started"
        description={doneCount === steps.length ? "All set — your store is fully connected." : `${doneCount} of ${steps.length} steps complete`}
        icon={
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="size-4" />
          </span>
        }
        action={<span className="tabular text-sm font-semibold">{progress}%</span>}
      >
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <ol className="divide-y rounded-lg border">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <span
                className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-success text-white" : "border-2 border-dashed border-muted-foreground/30 text-muted-foreground")}
                aria-hidden
              >
                {s.done ? <Check className="size-4" /> : i + 1}
              </span>
              <s.icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </p>
                <p className="text-[13px] text-muted-foreground">{s.description}</p>
              </div>
              {s.done ? (
                <span className="hidden items-center gap-1 text-xs font-medium text-success sm:inline-flex">
                  <CheckCircle2 className="size-3.5" /> Done
                </span>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={s.href}>
                    {s.cta} <ArrowRight />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Shortcuts */}
        <SectionCard
          title="Keyboard shortcuts"
          description="Use ⌘ on Mac, Ctrl on Windows and Linux"
          icon={
            <span className="grid size-8 place-items-center rounded-lg bg-info-soft text-info">
              <Keyboard className="size-4" />
            </span>
          }
        >
          <ul className="divide-y">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="flex shrink-0 items-center gap-1" aria-label={`${s.keys.join(" + ")} (Mac: ${s.mac.join(" + ")})`}>
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                  {s.keys[0] === "Ctrl" && (
                    <>
                      <span className="px-1 text-xs text-muted-foreground">or</span>
                      {s.mac.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* How the AI works */}
        <SectionCard
          title="How the AI works"
          description="Helpful by default, careful by design"
          icon={
            <span className="grid size-8 place-items-center rounded-lg bg-ai-soft text-ai">
              <Bot className="size-4" />
            </span>
          }
        >
          <ol className="relative space-y-4 border-l border-dashed pl-5">
            {[
              { icon: BookOpen, title: "Reads your store", text: "Orders, stock, conversations and ad results — only for the store you're signed in to." },
              { icon: Sparkles, title: "Recommends with evidence", text: "Each suggestion explains what, why and the numbers behind it." },
              { icon: ShieldCheck, title: "Waits for approval", text: "Sensitive actions (discounts, cancellations, budgets, broadcasts) queue in Approvals until a manager says yes." },
              { icon: ClipboardCheck, title: "Logs everything", text: "Every AI action is recorded in the audit log with who approved it." },
            ].map((x) => (
              <li key={x.title} className="relative">
                <span className="absolute top-0 -left-[33px] grid size-6 place-items-center rounded-full border bg-card text-ai">
                  <x.icon className="size-3.5" />
                </span>
                <p className="text-sm font-medium">{x.title}</p>
                <p className="text-[13px] text-muted-foreground">{x.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/approvals">
                <CheckCircle2 /> Approvals
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/assistant">
                <Sparkles className="text-ai" /> Try the assistant
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* FAQ */}
      <SectionCard
        title="Frequently asked questions"
        icon={
          <span className="grid size-8 place-items-center rounded-lg bg-warning-soft text-warning">
            <LifeBuoy className="size-4" />
          </span>
        }
      >
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">{f.q}</AccordionTrigger>
              <AccordionContent className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>

      {/* Contact */}
      <section className="flex flex-col items-start gap-4 rounded-xl border bg-ai-gradient p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Command className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Still need help?</h2>
          <p className="text-sm text-muted-foreground">
            Our team replies within one business day. Email{" "}
            <a href={`mailto:${brand.supportEmail}`} className="font-medium text-primary hover:underline">
              {brand.supportEmail}
            </a>{" "}
            and include your store name ({auth.store.name}).
          </p>
        </div>
        <Button asChild>
          <a href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`Help with ${auth.store.name}`)}`}>
            <Mail /> Email support
          </a>
        </Button>
      </section>
    </PageContainer>
  );
}
