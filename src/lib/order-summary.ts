/**
 * Plain-language order summary and next step, built only from the order's
 * own records (no generation, so nothing can be invented).
 */
export type SummaryInput = {
  status: string;
  confirmationStatus: string;
  paymentMethod: string;
  riskLevel: string;
  riskScore: number;
  placedAt: Date;
  customerName: string;
  customer: { totalOrders: number; deliveredCount: number; cancelledCount: number; returnedCount: number; totalSpent: number } | null;
  topSignal: string | null;
  confirmationSentAt: Date | null;
  shipment: { status: string; courier: string | null; trackingNumber: string | null } | null;
  openTicket: string | null;
  lastInbound: { text: string; at: Date } | null;
};

export type SummaryPoint = { tone: "success" | "warning" | "danger" | "info" | "neutral"; text: string };
/** `action` names the order action that carries out the step, when there is one. */
export type OrderSummary = { points: SummaryPoint[]; next: { label: string; why: string; tone: "action" | "wait" | "done"; action?: "request_confirmation" | "confirm" | "ship" } };

const HOUR = 3_600_000;
const ago = (ms: number) => (ms < HOUR ? `${Math.max(1, Math.round(ms / 60_000))} min ago` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)} h ago` : `${Math.round(ms / (24 * HOUR))} days ago`);

export function summarizeOrder(o: SummaryInput, money: (n: number) => string, now = Date.now()): OrderSummary {
  const points: SummaryPoint[] = [];
  const first = o.customerName.split(" ")[0];
  const c = o.customer;

  if (!c || c.totalOrders <= 1) points.push({ tone: "info", text: `First order from ${first}.` });
  else {
    const bad = c.cancelledCount + c.returnedCount;
    points.push({
      tone: bad > c.deliveredCount ? "danger" : bad ? "warning" : "success",
      text: `${first} has ordered ${c.totalOrders} times (${money(c.totalSpent)}): ${c.deliveredCount} delivered${c.cancelledCount ? `, ${c.cancelledCount} cancelled` : ""}${c.returnedCount ? `, ${c.returnedCount} returned` : ""}.`,
    });
  }

  if (o.riskLevel === "HIGH") points.push({ tone: "danger", text: `High risk (${o.riskScore}/100)${o.topSignal ? ` — mainly ${o.topSignal}` : ""}.` });
  else if (o.riskLevel === "MEDIUM") points.push({ tone: "warning", text: `Medium risk (${o.riskScore}/100)${o.topSignal ? ` — ${o.topSignal}` : ""}.` });
  else points.push({ tone: "success", text: `Low risk (${o.riskScore}/100).` });

  const waited = o.confirmationSentAt ? now - o.confirmationSentAt.getTime() : null;
  if (o.confirmationStatus === "PENDING") points.push({ tone: "warning", text: `WhatsApp confirmation sent${waited !== null ? ` ${ago(waited)}` : ""} — no reply yet.` });
  else if (o.confirmationStatus === "CONFIRMED") points.push({ tone: "success", text: "Customer confirmed on WhatsApp." });
  else if (o.confirmationStatus === "DECLINED") points.push({ tone: "danger", text: "Customer declined on WhatsApp." });
  else if (o.confirmationStatus === "NO_RESPONSE") points.push({ tone: "danger", text: "Customer never answered the confirmation." });

  if (o.shipment) points.push({ tone: "info", text: `Shipment ${o.shipment.status.replace(/_/g, " ").toLowerCase()}${o.shipment.courier ? ` with ${o.shipment.courier}` : ""}${o.shipment.trackingNumber ? ` (${o.shipment.trackingNumber})` : ""}.` });
  if (o.openTicket) points.push({ tone: "warning", text: `Open support ticket: ${o.openTicket}.` });
  if (o.lastInbound && now - o.lastInbound.at.getTime() < 48 * HOUR) points.push({ tone: "neutral", text: `Last message from ${first}: “${o.lastInbound.text.slice(0, 120)}${o.lastInbound.text.length > 120 ? "…" : ""}”` });

  return { points, next: nextStep(o, waited) };
}

function nextStep(o: SummaryInput, waited: number | null): OrderSummary["next"] {
  const open = o.status === "NEW" || o.status === "PENDING_CONFIRMATION";
  if (open && o.riskLevel === "HIGH")
    return { tone: "action", label: "Call or message the customer before dispatch", why: "High-risk orders are refused at the door more often. AI never cancels them — that's your call." };
  if (open && o.paymentMethod === "COD" && o.confirmationStatus !== "PENDING" && o.confirmationStatus !== "CONFIRMED")
    return { tone: "action", label: "Request WhatsApp confirmation", why: "COD orders are confirmed before booking a courier.", action: "request_confirmation" };
  if (open && o.confirmationStatus === "PENDING")
    return waited !== null && waited > 24 * HOUR
      ? { tone: "action", label: "Send a reminder or call", why: "No reply for over a day — a reminder usually gets an answer.", action: "request_confirmation" }
      : { tone: "wait", label: "Wait for the customer's reply", why: "A “yes” on WhatsApp confirms the order automatically." };
  if (open) return { tone: "action", label: "Confirm the order", why: "Prepaid or already-verified orders can be confirmed straight away.", action: "confirm" };
  if (o.status === "CONFIRMED" || o.status === "PROCESSING") return { tone: "action", label: "Book the shipment", why: "The customer has confirmed — dispatch keeps delivery times short.", action: "ship" };
  if (o.status === "SHIPPED") return { tone: "wait", label: "Nothing to do", why: "Tracking updates arrive automatically and the customer gets delivery messages." };
  if (o.status === "DELIVERED") return { tone: "done", label: "Completed", why: o.openTicket ? "Delivered, but there's an open ticket to resolve." : "Delivered successfully." };
  return { tone: "done", label: "Closed", why: `This order is ${o.status.toLowerCase()}.` };
}
