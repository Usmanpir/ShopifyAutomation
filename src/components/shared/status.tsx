import { cn } from "cn";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { titleCase } from "@/lib/format";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "ai" | "brand";

const TONE_CLASSES: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-soft text-success", dot: "bg-success" },
  warning: { pill: "bg-warning-soft text-warning", dot: "bg-warning" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  neutral: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  ai: { pill: "bg-ai-soft text-ai", dot: "bg-ai" },
  brand: { pill: "bg-brand-soft text-brand", dot: "bg-brand" },
};

/** Status pill: always text + (optional) dot — never color alone. */
export function StatusPill({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", t.pill, className)}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}

export function toneDot(tone: Tone) {
  return TONE_CLASSES[tone].dot;
}

// ───── Domain → tone/label maps (single source for every table and detail page) ─────

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "info" },
  PENDING_CONFIRMATION: { label: "Pending confirmation", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "brand" },
  PROCESSING: { label: "Processing", tone: "info" },
  SHIPPED: { label: "Shipped", tone: "ai" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  RETURNED: { label: "Returned", tone: "danger" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "info" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  VOIDED: { label: "Voided", tone: "neutral" },
};

export const PAYMENT_METHOD: Record<string, string> = { COD: "COD", CARD: "Card", BANK_TRANSFER: "Bank transfer", WALLET: "Wallet" };

export const FULFILLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  UNFULFILLED: { label: "Unfulfilled", tone: "warning" },
  PARTIAL: { label: "Partial", tone: "info" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
};

export const CONFIRMATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: "Not required", tone: "neutral" },
  PENDING: { label: "Awaiting reply", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  NO_RESPONSE: { label: "No response", tone: "danger" },
};

export const SHIPMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  BOOKED: { label: "Booked", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "info" },
  IN_TRANSIT: { label: "In transit", tone: "ai" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "warning" },
  DELIVERED: { label: "Delivered", tone: "success" },
  FAILED_ATTEMPT: { label: "Failed attempt", tone: "danger" },
  RETURNED: { label: "Returned", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  WAITING_ON_CUSTOMER: { label: "Waiting on customer", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

export const DECISION_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "brand" },
  EXECUTED: { label: "Executed", tone: "success" },
  AUTO_EXECUTED: { label: "Auto-executed", tone: "ai" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  RUNNING: { label: "Running", tone: "info" },
  WAITING: { label: "Waiting", tone: "warning" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "ai" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function Pill({ map, value, className }: { map: Record<string, { label: string; tone: Tone }>; value: string; className?: string }) {
  const m = map[value] ?? { label: titleCase(value), tone: "neutral" as Tone };
  return (
    <StatusPill tone={m.tone} className={className}>
      {m.label}
    </StatusPill>
  );
}

/** Risk is shown with icon + label + score, never color alone. */
export function RiskBadge({ level, score, compact }: { level: string; score?: number | null; compact?: boolean }) {
  const meta =
    level === "HIGH"
      ? { tone: "danger" as Tone, Icon: ShieldAlert, label: "High" }
      : level === "MEDIUM"
        ? { tone: "warning" as Tone, Icon: AlertTriangle, label: "Medium" }
        : { tone: "success" as Tone, Icon: ShieldCheck, label: "Low" };
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", TONE_CLASSES[meta.tone].pill)}>
      <meta.Icon className="size-3.5" aria-hidden />
      {meta.label}
      {!compact && typeof score === "number" && <span className="tabular opacity-75">· {score}</span>}
    </span>
  );
}

export const SEGMENT_COLORS: Record<string, string> = {
  indigo: "bg-brand-soft text-brand",
  violet: "bg-ai-soft text-ai",
  fuchsia: "bg-ai-soft text-ai",
  sky: "bg-info-soft text-info",
  blue: "bg-info-soft text-info",
  teal: "bg-success-soft text-success",
  emerald: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  orange: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  slate: "bg-muted text-muted-foreground",
};

export function SegmentBadge({ name, color }: { name: string; color: string }) {
  return <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", SEGMENT_COLORS[color] ?? SEGMENT_COLORS.slate)}>{name}</span>;
}
