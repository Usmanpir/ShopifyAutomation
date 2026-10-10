"use client";

import { cn } from "cn";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Loader2,
  LogOut,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field } from "@/features/settings/form-bits";
import { api, errorMessage } from "@/lib/client/api";

type FieldDef = { key: string; label: string; secret?: boolean; placeholder?: string; help?: string; required?: boolean };
type ProviderKey = "local" | "anthropic" | "openai" | "gemini";

export type OnboardingData = {
  userName: string;
  storeName: string;
  canManageIntegrations: boolean;
  canManageSettings: boolean;
  canManageAutomations: boolean;
  shopify: { configured: boolean; connected: boolean; shop: string | null };
  whatsapp: { connected: boolean; fields: FieldDef[] };
  metaAds: { connected: boolean; fields: FieldDef[] };
  aiProviders: { key: ProviderKey; name: string; defaultModel: string; integration: string | null; configured: boolean }[];
  ai: { provider: ProviderKey; model: string; temperature: number; handoffConfidence: number; replyLanguage: string; brandVoice: string };
  templates: { key: string; name: string; description: string; category: string; recommended: boolean }[];
  installed: Record<string, { id: string; status: string }>;
};

const STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "shopify", label: "Shopify" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "meta", label: "Meta Ads" },
  { key: "ai", label: "AI" },
  { key: "automation", label: "AI tasks" },
  { key: "ready", label: "Ready" },
] as const;

const STORAGE_KEY = "cai:onboarding-step";

type Outcome = "connected" | "demo" | "skipped";

export function OnboardingWizard({ data }: { data: OnboardingData }) {
  const [step, setStep] = useState(0);
  const [launch, setLaunch] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({
    shopify: data.shopify.connected ? "connected" : "demo",
    whatsapp: data.whatsapp.connected ? "connected" : "demo",
    meta: data.metaAds.connected ? "connected" : "demo",
  });
  const [aiChoice, setAiChoice] = useState<ProviderKey>(data.ai.provider);
  const [tasksOn, setTasksOn] = useState(Object.values(data.installed).filter((a) => a.status === "ACTIVE").length);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Resume where the user left off (e.g. after the Shopify OAuth round-trip).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved > 0 && saved < STEPS.length) setStep(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(step));
    } catch {}
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const mark = (k: string, o: Outcome) => setOutcomes((p) => ({ ...p, [k]: o }));

  if (launch) return <LaunchScreen storeName={data.storeName} />;

  const progress = (step / (STEPS.length - 1)) * 100;
  const h = (text: React.ReactNode) => (
    <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none sm:text-[28px] sm:leading-tight">
      {text}
    </h1>
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <Backdrop />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-5 pb-10 sm:px-6 sm:pt-8">
        <header className="flex items-center justify-between">
          <BrandMark />
          <SignOutLink />
        </header>

        <nav aria-label="Setup progress" className="mt-8 sm:mt-10">
          <p className="mb-3 text-xs font-medium text-muted-foreground sm:hidden">
            Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-muted sm:hidden" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
          <ol className="hidden grid-cols-7 sm:grid">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <li key={s.key} className="relative flex justify-center">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    aria-current={current ? "step" : undefined}
                    className="group flex flex-col items-center gap-1.5 outline-none disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full text-xs font-semibold ring-4 ring-background transition-colors group-focus-visible:ring-ring/40",
                        done ? "bg-primary text-primary-foreground" : current ? "bg-foreground text-background" : "border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn("text-[11px] font-medium whitespace-nowrap", current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && <span aria-hidden className={cn("absolute top-3.5 right-[calc(-50%+20px)] left-[calc(50%+20px)] h-px", i < step ? "bg-primary" : "bg-border")} />}
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="mt-6 flex-1 sm:mt-8">
          <div key={step} className="animate-slide-in rounded-2xl border bg-card p-5 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.18)] sm:p-8">
            {step === 0 && <WelcomeStep h={h} data={data} onNext={next} />}
            {step === 1 && <ShopifyStep h={h} data={data} onBack={back} onDone={(o) => (mark("shopify", o), next())} />}
            {step === 2 && (
              <CredentialStep
                h={h}
                provider="WHATSAPP"
                title="Connect WhatsApp Business"
                description="CommerceAI confirms COD orders, sends tracking updates and answers customers on WhatsApp — in English, Urdu or Roman Urdu."
                icon={<MessageCircle />}
                tint="bg-success-soft text-success"
                connected={data.whatsapp.connected}
                fields={data.whatsapp.fields}
                canManage={data.canManageIntegrations}
                bullets={["Automatic COD confirmations", "AI replies with human handoff", "Tracking & delivery updates"]}
                onBack={back}
                onDone={(o) => (mark("whatsapp", o), next())}
              />
            )}
            {step === 3 && (
              <CredentialStep
                h={h}
                provider="META_ADS"
                title="Connect Meta Ads"
                description="Pull campaign performance daily so the Marketing Agent can spot wasted spend and scale winners — always with your approval."
                icon={<Target />}
                tint="bg-brand-soft text-brand"
                connected={data.metaAds.connected}
                fields={data.metaAds.fields}
                canManage={data.canManageIntegrations}
                bullets={["ROAS & CPA by campaign", "Budget recommendations", "Creative fatigue alerts"]}
                onBack={back}
                onDone={(o) => (mark("meta", o), next())}
              />
            )}
            {step === 4 && <AIStep h={h} data={data} choice={aiChoice} setChoice={setAiChoice} onBack={back} onDone={next} />}
            {step === 5 && <AiTasksStep h={h} data={data} onBack={back} onDone={(n) => (setTasksOn(n), next())} />}
            {step === 6 && (
              <ReadyStep
                h={h}
                data={data}
                outcomes={outcomes}
                aiName={data.aiProviders.find((p) => p.key === aiChoice)?.name ?? "Built-in"}
                automations={tasksOn}
                onBack={back}
                onLaunch={() => {
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {}
                  setLaunch(true);
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ───────────────────────── Shared bits ─────────────────────────

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute top-1/3 -right-40 size-[420px] rounded-full bg-ai/10 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  );
}

function SignOutLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } finally {
          router.replace("/login");
          router.refresh();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground"
    >
      <LogOut className="size-3.5" /> Sign out
    </button>
  );
}

function StepIcon({ children, tint = "bg-primary/10 text-primary" }: { children: React.ReactNode; tint?: string }) {
  return <div className={cn("mb-5 grid size-12 place-items-center rounded-2xl ring-1 ring-foreground/5 [&_svg]:size-6", tint)}>{children}</div>;
}

function Footer({ onBack, children, hint }: { onBack?: () => void; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} className="h-10 px-3 max-sm:w-full">
            <ArrowLeft /> Back
          </Button>
        )}
        {hint && <p className="text-xs text-muted-foreground max-sm:hidden">{hint}</p>}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{children}</div>
    </div>
  );
}

function ConnectedBanner({ text }: { text: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-soft/60 px-4 py-3 text-sm">
      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
      {text}
    </div>
  );
}

type H = (t: React.ReactNode) => React.ReactNode;

// ───────────────────────── 1. Welcome ─────────────────────────

const PILLARS = [
  { icon: ShoppingBag, title: "Orders on autopilot", text: "Every order risk-scored and COD-confirmed on WhatsApp." },
  { icon: MessageCircle, title: "24/7 customer replies", text: "AI answers order, size and delivery questions instantly." },
  { icon: Boxes, title: "Inventory foresight", text: "Know what sells out before it does." },
  { icon: Megaphone, title: "Smarter marketing", text: "Segments, campaigns and Meta Ads insights in one place." },
];

function WelcomeStep({ h, data, onNext }: { h: H; data: OnboardingData; onNext: () => void }) {
  return (
    <div>
      <StepIcon tint="bg-[linear-gradient(135deg,var(--brand),var(--ai))] text-white shadow-md shadow-ai/25">
        <Sparkles />
      </StepIcon>
      <p className="mb-1 text-sm font-medium text-primary">Welcome, {data.userName} 👋</p>
      {h("Let's set up your AI command center")}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
        CommerceAI runs the busywork of {data.storeName} — orders, customers, WhatsApp, inventory and ads — with AI agents that always ask before doing anything sensitive.
        Setup takes about 3 minutes, and you can skip anything and use demo data.
      </p>
      <ul className="mt-7 grid gap-3 sm:grid-cols-2">
        {PILLARS.map((p, i) => (
          <li key={p.title} className="flex animate-fade-in gap-3 rounded-xl border bg-surface-2/50 p-4" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-primary ring-1 ring-border">
              <p.icon className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">{p.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden /> Credentials are encrypted at rest · Sensitive AI actions need your approval
      </p>
      <Footer>
        <Button onClick={onNext} className="h-10 px-5" autoFocus>
          Get started <ArrowRight />
        </Button>
      </Footer>
    </div>
  );
}

// ───────────────────────── 2. Shopify ─────────────────────────

function ShopifyStep({ h, data, onBack, onDone }: { h: H; data: OnboardingData; onBack: () => void; onDone: (o: Outcome) => void }) {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { configured, connected } = data.shopify;

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const domain = s.includes(".") ? s : `${s}.myshopify.com`;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
      setError("Enter your store's .myshopify.com domain, e.g. jadeed-wear.myshopify.com");
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(STORAGE_KEY, "2");
    } catch {}
    // Full navigation: the API route redirects to Shopify's OAuth consent screen (client routing can't follow it).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${window.location.origin}/api/shopify/install?shop=${encodeURIComponent(domain)}`);
  };

  return (
    <div>
      <StepIcon tint="bg-success-soft text-success">
        <ShoppingBag />
      </StepIcon>
      {h("Connect your Shopify store")}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">We sync products, inventory, customers and orders in real time through Shopify webhooks. Nothing in your store changes without your say-so.</p>

      <div className="mt-7 space-y-4">
        {connected ? (
          <ConnectedBanner text={`Connected to ${data.shopify.shop ?? "Shopify"}.`} />
        ) : !configured ? (
          <div className="rounded-xl border border-warning/30 bg-warning-soft/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-warning" aria-hidden /> Shopify app credentials aren&apos;t configured yet
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              A server admin needs to set <code className="font-mono text-foreground">SHOPIFY_CLIENT_ID</code> and <code className="font-mono text-foreground">SHOPIFY_CLIENT_SECRET</code>. You can connect later from
              Integrations — meanwhile, explore everything with realistic demo data.
            </p>
          </div>
        ) : (
          <form onSubmit={connect} noValidate className="space-y-3">
            <Field id="shop" label="Shopify store domain" error={error ?? undefined} hint="You'll approve access on Shopify and come right back.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="shop"
                  autoFocus
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  className="h-10 flex-1"
                  aria-invalid={!!error}
                  disabled={!data.canManageIntegrations}
                />
                <Button type="submit" className="h-10" disabled={busy || !shop.trim() || !data.canManageIntegrations}>
                  {busy ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
                  Connect Shopify
                </Button>
              </div>
            </Field>
          </form>
        )}
      </div>

      <Footer onBack={onBack} hint={!connected ? "You can connect Shopify any time from Integrations." : undefined}>
        {connected ? (
          <Button onClick={() => onDone("connected")} className="h-10 px-5">
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button variant={configured ? "outline" : "default"} onClick={() => onDone("demo")} className="h-10 px-5" autoFocus={!configured}>
            <FlaskConical /> Continue with demo data
          </Button>
        )}
      </Footer>
    </div>
  );
}

// ───────────────────────── 3/4. Credential steps ─────────────────────────

function CredentialStep({
  h,
  provider,
  title,
  description,
  icon,
  tint,
  connected,
  fields,
  canManage,
  bullets,
  onBack,
  onDone,
}: {
  h: H;
  provider: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tint: string;
  connected: boolean;
  fields: FieldDef[];
  canManage: boolean;
  bullets: string[];
  onBack: () => void;
  onDone: (o: Outcome) => void;
}) {
  const [isConnected, setConnected] = useState(connected);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Record<string, string>>({ defaultValues: Object.fromEntries(fields.map((f) => [f.key, ""])) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api(`/api/integrations/${provider}`, { body: { values } });
      toast.success(`${title.replace("Connect ", "")} connected`);
      setConnected(true);
      setShowForm(false);
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  return (
    <div>
      <StepIcon tint={tint}>{icon}</StepIcon>
      {h(title)}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">{description}</p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {bullets.map((b) => (
          <li key={b} className="inline-flex items-center gap-1.5 rounded-full border bg-surface-2/60 px-3 py-1 text-xs font-medium">
            <Check className="size-3 text-success" aria-hidden /> {b}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isConnected ? (
          <ConnectedBanner text="Connected and verified. Credentials are encrypted." />
        ) : showForm ? (
          <form onSubmit={onSubmit} noValidate className="animate-fade-in space-y-4 rounded-xl border bg-surface-2/40 p-4 sm:p-5">
            {serverError && (
              <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="break-words">{serverError}</span>
              </p>
            )}
            {fields.map((f, i) => (
              <Field key={f.key} id={`${provider}-${f.key}`} label={<>{f.label}{!f.required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}</>} hint={f.help} error={errors[f.key]?.message}>
                <Input
                  id={`${provider}-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete={f.secret ? "new-password" : "off"}
                  spellCheck={false}
                  autoFocus={i === 0}
                  placeholder={f.placeholder}
                  className="h-10 bg-card"
                  aria-invalid={!!errors[f.key]}
                  {...form.register(f.key, { validate: (v) => (f.required && !v.trim() ? `${f.label} is required` : true) })}
                />
              </Field>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                {isSubmitting ? "Verifying…" : "Verify & connect"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={!canManage}
              className="flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition outline-none hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
            >
              <span className="text-sm font-semibold">I have my credentials</span>
              <span className="text-[13px] text-muted-foreground">Paste your API token and IDs — we&apos;ll verify them instantly.</span>
            </button>
            <button
              type="button"
              onClick={() => onDone("demo")}
              className="flex flex-col items-start gap-1 rounded-xl border border-dashed p-4 text-left transition outline-none hover:border-warning/50 hover:bg-warning-soft/30 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <FlaskConical className="size-4 text-warning" aria-hidden /> Use demo for now
              </span>
              <span className="text-[13px] text-muted-foreground">Simulated conversations and data. Connect later from Integrations.</span>
            </button>
          </div>
        )}
      </div>

      <Footer onBack={onBack}>
        {isConnected ? (
          <Button onClick={() => onDone("connected")} className="h-10 px-5">
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => onDone("skipped")} className="h-10 text-muted-foreground">
            Skip — use demo
          </Button>
        )}
      </Footer>
    </div>
  );
}

// ───────────────────────── 5. AI ─────────────────────────

const AI_BLURB: Record<ProviderKey, string> = {
  local: "Fast, free and private. Rules tuned for Pakistani ecommerce. Recommended to start.",
  anthropic: "Claude — careful reasoning and natural, on-brand customer replies.",
  openai: "GPT — broad knowledge and strong tool use.",
  gemini: "Gemini — fast and cost-efficient at high volume.",
};

function AIStep({ h, data, choice, setChoice, onBack, onDone }: { h: H; data: OnboardingData; choice: ProviderKey; setChoice: (k: ProviderKey) => void; onBack: () => void; onDone: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<Record<string, boolean>>(Object.fromEntries(data.aiProviders.map((p) => [p.key, p.configured])));
  const provider = data.aiProviders.find((p) => p.key === choice)!;
  const needsKey = choice !== "local" && !configured[choice];

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      if (needsKey && apiKey.trim()) {
        await api(`/api/integrations/${provider.integration}`, { body: { values: { apiKey: apiKey.trim() } } });
        setConfigured((c) => ({ ...c, [choice]: true }));
      }
      if (data.canManageSettings && (choice !== data.ai.provider || needsKey)) {
        await api("/api/settings/ai", { method: "PATCH", body: { ...data.ai, provider: choice, model: choice === data.ai.provider ? data.ai.model : "" } });
      }
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepIcon tint="bg-ai-soft text-ai">
        <Bot />
      </StepIcon>
      {h("Choose your AI engine")}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">This powers your assistant, agents and WhatsApp replies. You can switch at any time in Settings → AI.</p>

      <div role="radiogroup" aria-label="AI provider" className="mt-7 grid gap-3 sm:grid-cols-2">
        {data.aiProviders.map((p) => {
          const active = choice === p.key;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setChoice(p.key);
                setApiKey("");
                setError(null);
              }}
              className={cn(
                "relative flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                active ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/20 hover:bg-muted/30",
              )}
            >
              <span className="flex w-full items-center gap-2.5">
                <span className={cn("grid size-8 place-items-center rounded-lg", p.key === "local" ? "bg-brand-soft text-brand" : "bg-ai-soft text-ai")}>
                  {p.key === "local" ? <Cpu className="size-4" /> : <Sparkles className="size-4" />}
                </span>
                <span className="text-sm font-semibold">{p.key === "local" ? "Built-in rules" : p.name}</span>
                <span className={cn("ml-auto grid size-5 place-items-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{active && <Check className="size-3" />}</span>
              </span>
              <span className="text-[13px] text-muted-foreground">{AI_BLURB[p.key]}</span>
              {p.key === "local" ? (
                <span className="mt-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Recommended to start</span>
              ) : configured[p.key] ? (
                <span className="mt-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Key configured</span>
              ) : (
                <span className="mt-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Needs API key</span>
              )}
            </button>
          );
        })}
      </div>

      {needsKey && (
        <div className="mt-5 animate-fade-in space-y-2 rounded-xl border bg-surface-2/40 p-4">
          <Field id="ai-key" label={`${provider.name} API key`} hint="Optional now — without a key, we'll use the built-in engine until you add one." error={error ?? undefined}>
            <Input id="ai-key" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" className="h-10 bg-card font-mono" />
          </Field>
        </div>
      )}
      {error && !needsKey && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Footer onBack={onBack}>
        <Button onClick={save} className="h-10 px-5" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {needsKey && apiKey.trim() ? "Verify & continue" : "Continue"} {!busy && <ArrowRight />}
        </Button>
      </Footer>
    </div>
  );
}

// ───────────────────────── 6. AI tasks ─────────────────────────

type PopularTask = { key: string; name: string; description: string; safety: string; on: boolean };
const RECOMMENDED = ["cod-confirmation", "whatsapp-auto-reply", "delivery-notification", "low-inventory", "daily-report"];

/** "Which tasks should AI handle?" → Activate AI Team. Same switches as Automations → Popular. */
function AiTasksStep({ h, data, onBack, onDone }: { h: H; data: OnboardingData; onBack: () => void; onDone: (on: number) => void }) {
  const [tasks, setTasks] = useState<PopularTask[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<PopularTask[]>("/api/automations/popular")
      .then((list) => {
        if (!alive) return;
        setTasks(list);
        const on = list.filter((t) => t.on).map((t) => t.key);
        setSelected(new Set(on.length ? on : RECOMMENDED.filter((k) => list.some((t) => t.key === k))));
      })
      .catch((e) => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const activate = async () => {
    setError(null);
    if (!data.canManageAutomations || !tasks) return onDone(selected.size);
    setBusy(true);
    const failures: string[] = [];
    for (const t of tasks.filter((x) => selected.has(x.key) && !x.on)) {
      try {
        await api("/api/automations/popular", { body: { key: t.key, on: true } });
      } catch (e) {
        failures.push(`${t.name}: ${errorMessage(e)}`);
      }
    }
    setBusy(false);
    if (failures.length) return setError(failures.join(" · "));
    toast.success("Your AI team is on", { description: `${selected.size} task${selected.size === 1 ? "" : "s"} handled for you.` });
    onDone(selected.size);
  };

  return (
    <div>
      <StepIcon tint="bg-ai-soft text-ai">
        <Sparkles />
      </StepIcon>
      {h("Which tasks should AI handle?")}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">Pick what your AI team takes off your plate. Anything sensitive — refunds, cancellations, price changes, big broadcasts — always waits for your approval.</p>

      {loadError ? (
        <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          Couldn&apos;t load the task list — {loadError}. You can turn tasks on later under Automations.
        </p>
      ) : !tasks ? (
        <div className="mt-7 space-y-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton-shimmer h-16 rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <fieldset className="mt-7" disabled={busy}>
          <legend className="sr-only">AI tasks</legend>
          <ul className="space-y-2.5">
            {tasks.map((t) => {
              const checked = selected.has(t.key);
              return (
                <li key={t.key}>
                  <label
                    htmlFor={`task-${t.key}`}
                    className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition sm:p-4", checked ? "border-primary/40 bg-primary/[0.03]" : "hover:bg-muted/30")}
                  >
                    <Checkbox id={`task-${t.key}`} checked={checked} onCheckedChange={() => toggle(t.key)} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {t.name}
                        {RECOMMENDED.includes(t.key) && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Recommended</span>}
                        {t.on && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Already on</span>}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.description}</span>
                      <span className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-success" aria-hidden /> {t.safety}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          Some tasks couldn&apos;t be turned on — {error}
        </p>
      )}

      <Footer onBack={onBack} hint={`${selected.size} selected`}>
        <Button variant="ghost" onClick={() => onDone(tasks?.filter((t) => t.on).length ?? 0)} className="h-10 text-muted-foreground" disabled={busy}>
          Skip for now
        </Button>
        <Button onClick={activate} className="h-10 px-5" disabled={busy || !selected.size || !tasks}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Activating…
            </>
          ) : (
            <>
              <Sparkles /> Activate AI Team
            </>
          )}
        </Button>
      </Footer>
    </div>
  );
}

// ───────────────────────── 7. Ready ─────────────────────────

function ReadyStep({
  h,
  data,
  outcomes,
  aiName,
  automations,
  onBack,
  onLaunch,
}: {
  h: H;
  data: OnboardingData;
  outcomes: Record<string, Outcome>;
  aiName: string;
  automations: number;
  onBack: () => void;
  onLaunch: () => void;
}) {
  const label = (o: Outcome) => (o === "connected" ? { text: "Connected", cls: "bg-success-soft text-success" } : { text: "Demo data", cls: "bg-warning-soft text-warning" });
  const rows = [
    { icon: ShoppingBag, name: "Shopify", ...label(outcomes.shopify) },
    { icon: MessageCircle, name: "WhatsApp", ...label(outcomes.whatsapp) },
    { icon: Target, name: "Meta Ads", ...label(outcomes.meta) },
    { icon: Bot, name: "AI engine", text: aiName.replace("CommerceAI Rules (built-in)", "Built-in rules"), cls: "bg-ai-soft text-ai" },
    { icon: Workflow, name: "AI team", text: automations ? `${automations} task${automations === 1 ? "" : "s"} on` : "Off", cls: automations ? "bg-success-soft text-success" : "bg-muted text-muted-foreground" },
  ];
  const anyDemo = Object.values(outcomes).some((o) => o !== "connected");
  return (
    <div>
      <StepIcon tint="bg-[linear-gradient(135deg,var(--brand),var(--ai))] text-white shadow-md shadow-ai/25">
        <Rocket />
      </StepIcon>
      {h("You're ready 🚀")}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">{data.storeName} is set up. Here&apos;s what we configured:</p>
      <ul className="mt-6 divide-y rounded-xl border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 px-4 py-3">
            <r.icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-sm font-medium">{r.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", r.cls)}>{r.text}</span>
          </li>
        ))}
      </ul>
      {anyDemo && (
        <p className="mt-4 flex items-start gap-2 text-[13px] text-muted-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          Demo mode is on, so anything not connected uses realistic sample data. Connect real accounts any time from Integrations.
        </p>
      )}
      <Footer onBack={onBack}>
        <Button onClick={onLaunch} className="h-10 px-5" autoFocus>
          <PartyPopper /> Launch my command center
        </Button>
      </Footer>
    </div>
  );
}

// ───────────────────────── First-login screen ─────────────────────────

const MONITORS = [
  { icon: ShoppingBag, label: "Orders" },
  { icon: Users, label: "Customers" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Boxes, label: "Inventory" },
  { icon: Target, label: "Ads" },
  { icon: Megaphone, label: "Marketing" },
];

function LaunchScreen({ storeName }: { storeName: string }) {
  const router = useRouter();
  const [ticked, setTicked] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ticked >= MONITORS.length) return;
    const t = setTimeout(() => setTicked((n) => n + 1), ticked === 0 ? 500 : 380);
    return () => clearTimeout(t);
  }, [ticked]);

  const finish = async () => {
    setBusy(true);
    try {
      await api("/api/settings/onboarding", { method: "POST" });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  const allDone = ticked >= MONITORS.length;
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-10">
      <Backdrop />
      <div className="relative w-full max-w-lg animate-fade-in text-center">
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-3xl bg-[linear-gradient(135deg,var(--brand),var(--ai))] text-white shadow-md shadow-ai/25 shadow-lg shadow-ai/30">
          <Sparkles className="size-8" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your AI Commerce Command Center is ready.</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">For {storeName}, we&apos;ll monitor:</p>
        <ul aria-live="polite" className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-2.5 text-left sm:grid-cols-3">
          {MONITORS.map((m, i) => {
            const on = i < ticked;
            return (
              <li key={m.label} className={cn("flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 transition-all duration-300", on ? "border-success/30 opacity-100" : "opacity-50")}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300", on ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
                  {on ? <Check className="size-3.5" aria-hidden /> : <m.icon className="size-3" aria-hidden />}
                </span>
                <span className="text-sm font-medium">{m.label}</span>
                <span className="sr-only">{on ? "monitoring" : "starting"}</span>
              </li>
            );
          })}
        </ul>
        <Button onClick={finish} disabled={!allDone || busy} className={cn("mt-9 h-11 px-6 text-[15px] transition-all", allDone ? "opacity-100" : "opacity-60")} autoFocus>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Go to dashboard {!busy && <ArrowRight />}
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">Tip: press ⌘K / Ctrl K anywhere to ask the AI or jump to any page.</p>
      </div>
    </div>
  );
}
