/**
 * Server-rendered presentational sections for the order detail page.
 * No hooks — import only from server components.
 */
import { cn } from "cn";
import {
  ArrowRight,
  Banknote,
  Bot,
  CheckCircle2,
  Circle,
  CircleCheckBig,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  PackageOpen,
  PackagePlus,
  ShieldCheck,
  ShoppingBag,
  StickyNote,
  Tag,
  TriangleAlert,
  Truck,
  Undo2,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { SHIPMENT_STATUS, Pill, type Tone } from "@/components/shared/status";
import { titleCase } from "@/lib/format";
import type { Formatter } from "@/lib/formatter";
import { TimeAgo } from "@/components/shared/time-ago";

type ActorType = "USER" | "AI" | "SYSTEM" | "CUSTOMER" | "WEBHOOK";

const TONE_ICON: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
  ai: "bg-ai-soft text-ai",
  brand: "bg-brand-soft text-brand",
};

const EVENT_META: Record<string, { icon: typeof Circle; tone: Tone }> = {
  placed: { icon: ShoppingBag, tone: "brand" },
  risk_analyzed: { icon: ShieldCheck, tone: "ai" },
  confirmation_sent: { icon: MessageCircle, tone: "info" },
  confirmation_reminder: { icon: MessageCircle, tone: "info" },
  customer_confirmed: { icon: UserCheck, tone: "success" },
  customer_declined: { icon: UserX, tone: "danger" },
  confirmed: { icon: CheckCircle2, tone: "success" },
  processing: { icon: PackageOpen, tone: "info" },
  shipment_created: { icon: PackagePlus, tone: "info" },
  shipped: { icon: Truck, tone: "ai" },
  out_for_delivery: { icon: Navigation, tone: "warning" },
  delivered: { icon: CircleCheckBig, tone: "success" },
  cancelled: { icon: XCircle, tone: "danger" },
  returned: { icon: Undo2, tone: "danger" },
  note: { icon: StickyNote, tone: "neutral" },
  tagged: { icon: Tag, tone: "neutral" },
  refunded: { icon: Banknote, tone: "warning" },
  sync_failed: { icon: TriangleAlert, tone: "danger" },
};

export function ActorBadge({ type, name }: { type: string; name?: string | null }) {
  const t = type as ActorType;
  const meta =
    t === "AI"
      ? { label: "AI", cls: "bg-ai-soft text-ai", icon: true }
      : t === "CUSTOMER"
        ? { label: "Customer", cls: "bg-brand-soft text-brand", icon: false }
        : t === "USER"
          ? { label: "Team", cls: "bg-info-soft text-info", icon: false }
          : t === "WEBHOOK"
            ? { label: "Webhook", cls: "bg-muted text-muted-foreground", icon: false }
            : { label: "System", cls: "bg-muted text-muted-foreground", icon: false };
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("inline-flex h-[18px] shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-semibold tracking-wide uppercase", meta.cls)}>
        {meta.icon && <Bot className="size-3" aria-hidden />}
        {meta.label}
      </span>
      {name && <span className="truncate">{name}</span>}
    </span>
  );
}

// ───────────── Timeline ─────────────

export type TimelineEvent = { id: string; type: string; title: string; description: string | null; actorType: string; actorName: string | null; createdAt: string | Date };

const MILESTONES: { type: string; title: string; rank: number }[] = [
  { type: "confirmed", title: "Order confirmed", rank: 1 },
  { type: "processing", title: "Processing", rank: 2 },
  { type: "shipped", title: "Shipped", rank: 3 },
  { type: "out_for_delivery", title: "Out for delivery", rank: 4 },
  { type: "delivered", title: "Delivered", rank: 5 },
];
const STATUS_RANK: Record<string, number> = { NEW: 0, PENDING_CONFIRMATION: 0, CONFIRMED: 1, PROCESSING: 2, SHIPPED: 3, DELIVERED: 5 };

/** Remaining happy-path steps for an open order (none for cancelled/returned). */
export function expectedSteps(status: string, shipmentStatus: string | null, eventTypes: Set<string>) {
  if (!(status in STATUS_RANK)) return [];
  let rank = STATUS_RANK[status]!;
  if (shipmentStatus === "OUT_FOR_DELIVERY") rank = Math.max(rank, 4);
  return MILESTONES.filter((m) => m.rank > rank && !eventTypes.has(m.type));
}

export function OrderTimeline({ events, expected, f }: { events: TimelineEvent[]; expected: { type: string; title: string }[]; f: Formatter }) {
  const total = events.length + expected.length;
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const meta = EVENT_META[e.type] ?? { icon: Circle, tone: "neutral" as Tone };
        const last = i === total - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />}
            <span className={cn("relative z-[1] grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card", TONE_ICON[meta.tone])}>
              <meta.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="text-sm font-medium">{e.title}</p>
                <time dateTime={new Date(e.createdAt).toISOString()} className="shrink-0 text-xs text-muted-foreground" title={f.dateTime(e.createdAt)}>
                  {f.dateTime(e.createdAt)}
                </time>
              </div>
              {e.description && (
                <p className={cn("mt-0.5 text-[13px] text-muted-foreground", e.type === "note" && "mt-1.5 rounded-lg border bg-surface-2 px-3 py-2 text-foreground")}>{e.description}</p>
              )}
              <div className="mt-1.5">
                <ActorBadge type={e.actorType} name={e.actorName} />
              </div>
            </div>
          </li>
        );
      })}
      {expected.map((m, i) => {
        const meta = EVENT_META[m.type] ?? { icon: Circle };
        const last = events.length + i === total - 1;
        return (
          <li key={m.type} className="relative flex gap-3 pb-5 last:pb-0" aria-label={`${m.title} (expected)`}>
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px border-l border-dashed border-border" />}
            <span className="relative z-[1] grid size-8 shrink-0 place-items-center rounded-full border border-dashed bg-card text-muted-foreground/60 ring-4 ring-card">
              <meta.icon className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-1.5">
              <p className="text-sm text-muted-foreground">{m.title}</p>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80">
                <Clock className="size-3" aria-hidden /> Expected
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────── WhatsApp conversation ─────────────

export type ChatMessage = { id: string; direction: string; sender: string; body: string; templateName: string | null; status: string; createdAt: string | Date };

export function ChatThread({ messages, f }: { messages: ChatMessage[]; f: Formatter }) {
  return (
    <ul className="space-y-2.5 rounded-lg bg-surface-2 p-3 sm:p-4">
      {messages.map((m) => {
        const out = m.direction === "OUTBOUND";
        const who = m.sender === "AI" ? "AI agent" : m.sender === "AGENT" ? "Team" : m.sender === "SYSTEM" ? (m.templateName ? "Template" : "System") : "Customer";
        return (
          <li key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_1px_rgba(16,24,40,0.06)] sm:max-w-[75%]",
                out ? "rounded-br-md bg-success-soft text-foreground" : "rounded-bl-md border bg-card",
              )}
            >
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <p className={cn("mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground", out && "justify-end")}>
                {m.sender === "AI" && <Bot className="size-3 text-ai" aria-hidden />}
                <span>{who}</span>
                <span aria-hidden>·</span>
                <span>{f.time(m.createdAt)}</span>
                {out && m.status === "READ" && <span className="text-info">· Read</span>}
                {out && m.status === "FAILED" && <span className="text-danger">· Failed</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────── Shipment ─────────────

export type ShipmentView = {
  id: string;
  courier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  codAmount: number;
  estimatedDelivery: string | Date | null;
  lastSyncedAt: string | Date | null;
  events: { id: string; status: string; description: string; location: string | null; occurredAt: string | Date }[];
};

const COURIERS: Record<string, string> = { demo: "Demo Express", manual: "Manual", tcs: "TCS", leopards: "Leopards", postex: "PostEx", trax: "Trax", mnp: "M&P" };

export function ShipmentPanel({ shipment, f }: { shipment: ShipmentView; f: Formatter }) {
  const events = [...shipment.events].reverse();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-surface-2/60 p-3.5 text-sm sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Courier</p>
          <p className="truncate font-medium">{COURIERS[shipment.courier] ?? titleCase(shipment.courier)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Tracking #</p>
          {shipment.trackingUrl ? (
            <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] font-medium text-primary hover:underline">
              {shipment.trackingNumber} <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="truncate font-mono text-[13px] font-medium">{shipment.trackingNumber ?? "—"}</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Est. delivery</p>
          <p className="font-medium">{f.date(shipment.estimatedDelivery)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">COD to collect</p>
          <p className="tabular font-medium">{shipment.codAmount ? f.money(shipment.codAmount) : "—"}</p>
        </div>
      </div>
      {events.length > 0 && (
        <ol className="space-y-3">
          {events.map((e, i) => (
            <li key={e.id} className="flex gap-3">
              <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", i === 0 ? "bg-primary ring-4 ring-primary/15" : "bg-muted-foreground/40")} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className={cn("text-sm", i === 0 ? "font-medium" : "text-muted-foreground")}>{e.description}</p>
                  {e.location && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden /> {e.location}
                    </p>
                  )}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{f.dateTime(e.occurredAt)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
      {shipment.lastSyncedAt && <p className="text-xs text-muted-foreground">Tracking synced <TimeAgo date={shipment.lastSyncedAt} /></p>}
    </div>
  );
}

export function ShipmentStatusPill({ status }: { status: string }) {
  return <Pill map={SHIPMENT_STATUS} value={status} />;
}

// ───────────── Audit log ─────────────

export type AuditEntry = {
  id: string;
  actorType: string;
  actorName: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string | Date;
};

const ACTION_LABEL: Record<string, string> = {
  "order.confirm": "Confirmed the order",
  "order.process": "Marked as processing",
  "order.ship": "Marked as shipped",
  "order.deliver": "Marked as delivered",
  "order.cancel": "Cancelled the order",
  "order.return": "Marked as returned",
  "order.request_confirmation": "Requested WhatsApp confirmation",
  "order.confirmation_reminder": "Sent a confirmation reminder",
  "order.tag": "Added a tag",
  "order.note": "Added a note",
  "order.refund": "Recorded a refund",
  "shipment.create": "Booked a shipment",
};

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return /^[A-Z_]+$/.test(v) ? titleCase(v) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function diffRows(oldValue: unknown, newValue: unknown) {
  const o = (oldValue && typeof oldValue === "object" ? oldValue : {}) as Record<string, unknown>;
  const n = (newValue && typeof newValue === "object" ? newValue : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => k !== "note");
  return keys.map((k) => ({ key: k, from: k in o ? fmtValue(o[k]) : null, to: fmtValue(n[k]) }));
}

export function AuditLogList({ entries, f }: { entries: AuditEntry[]; f: Formatter }) {
  return (
    <ul className="divide-y">
      {entries.map((a) => {
        const rows = diffRows(a.oldValue, a.newValue);
        return (
          <li key={a.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ActorBadge type={a.actorType} name={a.actorName} />
                <span className="text-sm">{ACTION_LABEL[a.action] ?? titleCase(a.action.split(".").pop() ?? a.action)}</span>
              </div>
              {rows.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((r) => (
                    <span key={r.key} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-surface-2 px-2 py-0.5 text-xs">
                      <span className="text-muted-foreground">{titleCase(r.key.replace(/([a-z])([A-Z])/g, "$1_$2"))}:</span>
                      {r.from !== null && (
                        <>
                          <span className="truncate text-muted-foreground line-through decoration-muted-foreground/50">{r.from}</span>
                          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-label="changed to" />
                        </>
                      )}
                      <span className="truncate font-medium">{r.to}</span>
                    </span>
                  ))}
                </div>
              )}
              {a.reason && <p className="text-xs text-muted-foreground">Reason: {a.reason}</p>}
            </div>
            <time className="shrink-0 text-xs text-muted-foreground" title={f.dateTime(a.createdAt)}>
              <TimeAgo date={a.createdAt} />
            </time>
          </li>
        );
      })}
    </ul>
  );
}

