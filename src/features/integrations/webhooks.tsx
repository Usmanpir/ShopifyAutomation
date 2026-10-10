"use client";

import { Webhook } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { Pill, type Tone } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { CopyField } from "@/features/settings/form-bits";
import { TimeAgo } from "@/components/shared/time-ago";

export type WebhookEventRow = { id: string; provider: string; topic: string; status: string; attempts: number; error: string | null; receivedAt: string; processedAt: string | null };

const WEBHOOK_STATUS: Record<string, { label: string; tone: Tone }> = {
  RECEIVED: { label: "Received", tone: "info" },
  QUEUED: { label: "Queued", tone: "info" },
  PROCESSING: { label: "Processing", tone: "ai" },
  PROCESSED: { label: "Processed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  IGNORED: { label: "Ignored", tone: "neutral" },
};

const PROVIDER_LABEL: Record<string, string> = { SHOPIFY: "Shopify", WHATSAPP: "WhatsApp", META: "Meta", COURIER: "Courier" };

export function WebhookEndpoints({ appUrl }: { appUrl: string }) {
  const base = appUrl.replace(/\/$/, "");
  const endpoints = [
    { name: "Shopify", url: `${base}/api/shopify/webhooks`, note: "Registered automatically when you install via OAuth. Topics: orders, products, customers, inventory, app/uninstalled." },
    { name: "WhatsApp Cloud API", url: `${base}/api/whatsapp/webhook`, note: "Meta App → WhatsApp → Configuration. Use META_WEBHOOK_VERIFY_TOKEN as the verify token and subscribe to messages." },
    { name: "Meta (Pages & Instagram)", url: `${base}/api/meta/webhook`, note: "Meta App → Webhooks → Page / Instagram. Subscribe to messages, feed and leadgen." },
  ];
  return (
    <SectionCard title="Webhook endpoints" description="Point each provider at these URLs so events reach CommerceAI in real time. Every request is signature-verified." icon={<Webhook className="size-4 text-muted-foreground" aria-hidden />}>
      <ul className="grid gap-4 lg:grid-cols-3">
        {endpoints.map((e) => (
          <li key={e.name} className="space-y-2">
            <p className="text-sm font-medium">{e.name}</p>
            <CopyField value={e.url} label={`${e.name} webhook URL`} />
            <p className="text-xs text-muted-foreground">{e.note}</p>
          </li>
        ))}
      </ul>
      {/^https?:\/\/(localhost|127\.)/.test(base) && (
        <p className="mt-4 rounded-lg bg-info-soft/60 px-3 py-2 text-xs text-info">Providers can&apos;t reach localhost. Use a tunnel (e.g. ngrok or Cloudflare Tunnel) and set APP_URL to the public URL.</p>
      )}
    </SectionCard>
  );
}

export function WebhookEvents({ rows }: { rows: WebhookEventRow[] }) {
  const f = useFormat();
  const columns: Column<WebhookEventRow>[] = [
    { key: "provider", header: "Provider", cell: (r) => <span className="font-medium">{PROVIDER_LABEL[r.provider] ?? r.provider}</span> },
    { key: "topic", header: "Topic", cell: (r) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{r.topic}</code> },
    { key: "status", header: "Status", cell: (r) => <Pill map={WEBHOOK_STATUS} value={r.status} /> },
    { key: "attempts", header: "Attempts", align: "right", cell: (r) => <span className="tabular">{r.attempts}</span>, hideBelow: "lg" },
    { key: "error", header: "Error", cell: (r) => (r.error ? <span className="line-clamp-1 max-w-64 text-xs text-danger" title={r.error}>{r.error}</span> : <span className="text-muted-foreground">—</span>), hideBelow: "xl" },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (r) => (
        <span className="text-[13px] text-muted-foreground" title={f.dateTime(r.receivedAt)}>
          <TimeAgo date={r.receivedAt} />
        </span>
      ),
    },
  ];
  return (
    <SectionCard title="Recent webhook events" description="The last 30 deliveries from your providers. Failed events are retried automatically." contentClassName="px-0 pb-0">
      <DataTable
        caption="Recent webhook events"
        columns={columns}
        rows={rows}
        className="rounded-none border-x-0 border-b-0 shadow-none"
        empty={<EmptyState compact icon={<Webhook />} title="No webhook events yet" description="Once a provider is connected, incoming events (new orders, messages, comments) show up here." />}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{PROVIDER_LABEL[r.provider] ?? r.provider}</span>
              <Pill map={WEBHOOK_STATUS} value={r.status} />
            </div>
            <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{r.topic}</code>
            <p className="text-xs text-muted-foreground">
              <TimeAgo date={r.receivedAt} /> · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
            </p>
            {r.error && <p className="text-xs text-danger">{r.error}</p>}
          </div>
        )}
      />
    </SectionCard>
  );
}
