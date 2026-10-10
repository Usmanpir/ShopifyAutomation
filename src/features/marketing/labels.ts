import type { Tone } from "@/components/shared/status";

/** Marketing campaign status → pill (plain module so server pages can use it). */
export const MARKETING_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  SENDING: { label: "Sending", tone: "ai" },
  SENT: { label: "Sent", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
