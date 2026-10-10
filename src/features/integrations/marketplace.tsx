"use client";

import { cn } from "cn";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ExternalLink, FlaskConical, Info, Loader2, Plug, RefreshCw, Settings2, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { Field } from "@/features/settings/form-bits";
import { IntegrationIcon } from "./integration-icon";

export type IntegrationField = { key: string; label: string; secret?: boolean; placeholder?: string; help?: string; required?: boolean; options?: { value: string; label: string }[] };
export type IntegrationItem = {
  provider: string;
  name: string;
  category: "Commerce" | "Messaging" | "Social" | "Advertising" | "Shipping" | "AI";
  description: string;
  icon: string;
  docs: string;
  oauth?: boolean;
  fields: IntegrationField[];
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "DEMO";
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  display: Record<string, string>;
  envConfigured: boolean;
  demoMode: boolean;
};

const CATEGORIES = ["Commerce", "Messaging", "Social", "Advertising", "Shipping", "AI"] as const;
const CATEGORY_BLURB: Record<(typeof CATEGORIES)[number], string> = {
  Commerce: "Your storefront — the source of products, customers and orders.",
  Messaging: "Customer conversations, confirmations and notifications.",
  Social: "Inbox, comments and leads from your social pages.",
  Advertising: "Campaign performance and budget recommendations.",
  Shipping: "Book shipments and track every parcel.",
  AI: "Bring your own model. Keys are encrypted and never shown again.",
};

/** Where to find credentials — official provider docs. */
const GUIDES: Record<string, { href: string; steps: string }> = {
  SHOPIFY: { href: "https://shopify.dev/docs/apps/build/authentication-authorization", steps: "Create a custom app in your Shopify Partner dashboard, then set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on the server." },
  WHATSAPP: { href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", steps: "Meta Business Suite → WhatsApp Manager → API setup. Create a System User with a permanent token." },
  FACEBOOK: { href: "https://developers.facebook.com/docs/pages-api/getting-started", steps: "Generate a long-lived Page access token from Graph API Explorer for the page you manage." },
  INSTAGRAM: { href: "https://developers.facebook.com/docs/instagram-platform", steps: "Link the Instagram business account to your Facebook Page and use the Page access token." },
  META_ADS: { href: "https://developers.facebook.com/docs/marketing-api/get-started", steps: "Business Settings → System users → Generate token with ads_read and ads_management." },
  COURIER: { href: "#", steps: "Request API access from your courier's merchant portal (Leopards, TCS, PostEx, Trax…)." },
  OPENAI: { href: "https://platform.openai.com/api-keys", steps: "Create a secret key in the OpenAI dashboard." },
  ANTHROPIC: { href: "https://console.anthropic.com/settings/keys", steps: "Create an API key in the Anthropic Console." },
  GEMINI: { href: "https://aistudio.google.com/app/apikey", steps: "Create an API key in Google AI Studio." },
};

const FIELD_LABELS: Record<string, string> = { shop: "Store", accessToken: "Token", phoneNumberId: "Phone ID", businessAccountId: "WABA ID", pageAccessToken: "Token", pageId: "Page ID", adAccountId: "Ad account", provider: "Courier", apiKey: "API key" };

function StatusBadge({ item }: { item: IntegrationItem }) {
  if (item.status === "CONNECTED")
    return (
      <StatusPill tone="success" dot={false}>
        <CheckCircle2 className="size-3" aria-hidden /> Connected
      </StatusPill>
    );
  if (item.status === "ERROR")
    return (
      <StatusPill tone="danger" dot={false}>
        <AlertTriangle className="size-3" aria-hidden /> Error
      </StatusPill>
    );
  if (item.status === "DEMO")
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <StatusPill tone="warning" dot={false}>
              <FlaskConical className="size-3" aria-hidden /> Demo
            </StatusPill>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">Demo mode is simulating {item.name} with sample data. Connect your account to go live.</TooltipContent>
      </Tooltip>
    );
  if (item.category === "AI" && item.envConfigured) return <StatusPill tone="info">Server key</StatusPill>;
  return <StatusPill tone="neutral">Not connected</StatusPill>;
}

function IntegrationCard({ item, canManage, onConnect }: { item: IntegrationItem; canManage: boolean; onConnect: (i: IntegrationItem) => void }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const live = item.status === "CONNECTED" || item.status === "ERROR";
  const display = Object.entries(item.display).filter(([, v]) => !!v);
  const shopifyBlocked = item.provider === "SHOPIFY" && !item.envConfigured;
  const guide = GUIDES[item.provider];

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api<{ products: number }>("/api/shopify/sync", { method: "POST" });
      toast.success("Shopify sync complete", { description: `${r?.products ?? 0} products synced.` });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    try {
      await api(`/api/integrations/${item.provider}`, { method: "DELETE" });
      toast.success(`${item.name} disconnected`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <article
      className={cn(
        "group flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:shadow-[0_4px_16px_-6px_rgba(16,24,40,0.12)]",
        item.status === "CONNECTED" && "border-success/25",
        item.status === "ERROR" && "border-danger/30",
      )}
    >
      <div className="flex-1 space-y-3 p-5">
        <div className="flex items-start gap-3">
          <IntegrationIcon icon={item.icon} provider={item.provider} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-[15px] font-semibold tracking-tight">{item.name}</h3>
              <StatusBadge item={item} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.status === "CONNECTED" ? (item.lastSyncAt ? `Synced ${timeAgo(item.lastSyncAt)}` : item.connectedAt ? `Connected ${timeAgo(item.connectedAt)}` : "Connected") : item.oauth ? "OAuth app install" : "API credentials"}
            </p>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
        {item.status === "ERROR" && item.lastError && (
          <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-3 break-words">{item.lastError}</span>
          </p>
        )}
        {shopifyBlocked && item.status !== "CONNECTED" && (
          <p className="flex gap-2 rounded-lg bg-warning-soft/70 px-3 py-2 text-xs">
            <Info className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              Set <code className="font-mono">SHOPIFY_CLIENT_ID</code> and <code className="font-mono">SHOPIFY_CLIENT_SECRET</code> on the server first.{" "}
              <a href={guide.href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                Setup guide
              </a>
            </span>
          </p>
        )}
        {live && display.length > 0 && (
          <dl className="grid gap-1 rounded-lg bg-surface-2/70 px-3 py-2 text-xs">
            {display.slice(0, 3).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{FIELD_LABELS[k] ?? k}</dt>
                <dd className="truncate font-mono text-[11.5px]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t px-3 py-2.5">
        {canManage ? (
          <>
            {item.status === "CONNECTED" ? (
              item.provider === "SHOPIFY" ? (
                <Button size="sm" variant="outline" className="h-8" onClick={sync} disabled={syncing}>
                  {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Sync now
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8" onClick={() => onConnect(item)}>
                  <Settings2 /> Update
                </Button>
              )
            ) : (
              <Button size="sm" className="h-8" onClick={() => onConnect(item)} disabled={shopifyBlocked}>
                <Plug /> {item.status === "ERROR" ? "Reconnect" : "Connect"}
              </Button>
            )}
            {live && (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-danger">
                    <Unplug /> Disconnect
                  </Button>
                }
                title={`Disconnect ${item.name}?`}
                description={`Stored credentials are deleted immediately. Features that rely on ${item.name} will ${item.demoMode ? "fall back to demo data" : "stop working"} until you reconnect.`}
                confirmLabel="Disconnect"
                destructive
                onConfirm={disconnect}
              />
            )}
          </>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">View only</span>
        )}
        {guide && guide.href !== "#" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={guide.href} target="_blank" rel="noreferrer" aria-label={`${item.name} documentation`} className="ml-auto grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <ExternalLink className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Provider docs</TooltipContent>
          </Tooltip>
        )}
      </div>
    </article>
  );
}

function ConnectDialog({ item, onClose }: { item: IntegrationItem | null; onClose: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = useMemo(() => Object.fromEntries((item?.fields ?? []).map((f) => [f.key, f.secret ? "" : (item?.display[f.key] ?? "")])), [item]);
  const form = useForm<Record<string, string>>({ values: defaults });
  const { errors, isSubmitting } = form.formState;

  if (!item) return null;
  const guide = GUIDES[item.provider];
  const updating = item.status === "CONNECTED";

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    if (item.oauth) {
      const shop = values.shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const domain = shop.includes(".") ? shop : `${shop}.myshopify.com`;
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
        form.setError("shop", { message: "Enter your *.myshopify.com domain" });
        return;
      }
      // Full navigation: the API route redirects to Shopify's OAuth consent screen (client routing can't follow it).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${window.location.origin}/api/shopify/install?shop=${encodeURIComponent(domain)}`);
      await new Promise(() => {}); // keep the pending state while the browser navigates
      return;
    }
    try {
      await api(`/api/integrations/${item.provider}`, { body: { values } });
      toast.success(`${item.name} connected`, { description: "Credentials verified and encrypted." });
      onClose();
      router.refresh();
    } catch (e) {
      setServerError(errorMessage(e));
      router.refresh();
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <IntegrationIcon icon={item.icon} provider={item.provider} className="size-10" />
              <div>
                <DialogTitle>
                  {updating ? "Update" : "Connect"} {item.name}
                </DialogTitle>
                <DialogDescription>{item.oauth ? "You'll be redirected to Shopify to approve access." : "We verify the credentials with the provider, then encrypt them."}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {serverError && (
            <div role="alert" className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="break-words">{serverError}</span>
            </div>
          )}
          <div className="space-y-4">
            {item.fields.map((f) => {
              const id = `int-${item.provider}-${f.key}`;
              const err = errors[f.key]?.message;
              const masked = f.secret ? item.display[f.key] : undefined;
              return (
                <Field key={f.key} id={id} label={<>{f.label}{!f.required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}</>} hint={f.help ?? (masked ? `Currently ${masked}. Enter a new value to replace it.` : undefined)} error={err}>
                  {f.options ? (
                    <Controller
                      control={form.control}
                      name={f.key}
                      rules={{ validate: (v) => (f.required && !v ? `Choose a ${f.label.toLowerCase()}` : true) }}
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id={id} className="w-full" aria-invalid={!!err}>
                            <SelectValue placeholder={`Choose ${f.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {f.options!.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={f.secret ? "password" : "text"}
                      autoComplete={f.secret ? "new-password" : "off"}
                      spellCheck={false}
                      placeholder={f.placeholder ?? (masked ? "••••••••" : undefined)}
                      className={cn(f.secret && "font-mono")}
                      aria-invalid={!!err}
                      {...form.register(f.key, { validate: (v) => (f.required && !v?.trim() ? `${f.label} is required` : true) })}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          {guide && (
            <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Where to find this: </span>
                {guide.steps}
              </p>
              {guide.href !== "#" && (
                <a href={guide.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Open {item.name} docs <ArrowUpRight className="size-3" />
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? (item.oauth ? "Redirecting…" : "Verifying…") : item.oauth ? "Continue to Shopify" : updating ? "Save & verify" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsMarketplace({ items, canManage }: { items: IntegrationItem[]; canManage: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [connecting, setConnecting] = useState<IntegrationItem | null>(null);
  const [filter, setFilter] = useState<"All" | (typeof CATEGORIES)[number]>("All");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    handled.current = true;
    if (connected === "shopify") toast.success("Shopify connected", { description: "We're syncing your catalog in the background." });
    if (error) toast.error("Couldn't connect", { description: error });
    router.replace("/integrations", { scroll: false });
  }, [params, router]);

  const counts = {
    connected: items.filter((i) => i.status === "CONNECTED").length,
    demo: items.filter((i) => i.status === "DEMO").length,
    error: items.filter((i) => i.status === "ERROR").length,
  };
  const demoMode = items[0]?.demoMode;
  const visible = CATEGORIES.filter((c) => filter === "All" || filter === c);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Connected", value: counts.connected, tone: "text-success" },
          { label: "Simulated (demo)", value: counts.demo, tone: "text-warning" },
          { label: "Need attention", value: counts.error, tone: counts.error ? "text-danger" : "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
            <p className={cn("tabular text-2xl font-semibold tracking-tight", s.tone)}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {demoMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-[13px]">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-medium">Demo mode is on.</span> Integrations marked <em>Demo</em> run on simulated data so you can try everything safely. Connected integrations always use live data.
            </span>
          </p>
          <Link href="/settings/general#demo" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            Demo settings <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      )}

      <div role="tablist" aria-label="Category" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(["All", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={filter === c}
            onClick={() => setFilter(c)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition",
              filter === c ? "border-foreground/10 bg-foreground text-background" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {c}
            <span className={cn("tabular rounded-full px-1.5 text-[11px]", filter === c ? "bg-background/20" : "bg-muted")}>{c === "All" ? items.length : items.filter((i) => i.category === c).length}</span>
          </button>
        ))}
      </div>

      {visible.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} id={cat.toLowerCase()} aria-labelledby={`cat-${cat}`} className="scroll-mt-24 space-y-3 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:space-y-0 lg:border-t lg:pt-6 lg:first-of-type:border-t-0 lg:first-of-type:pt-0">
            <div className="lg:pt-1">
              <h2 id={`cat-${cat}`} className="text-[15px] font-semibold tracking-tight">
                {cat}
              </h2>
              <p className="text-[13px] text-muted-foreground">{CATEGORY_BLURB[cat]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {list.map((i) => (
                <IntegrationCard key={i.provider} item={i} canManage={canManage} onConnect={setConnecting} />
              ))}
            </div>
          </section>
        );
      })}

      <ConnectDialog key={connecting?.provider ?? "none"} item={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}
