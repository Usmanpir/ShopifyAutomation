/**
 * Natural-language order filters → URL params + human chips.
 * "Show high-risk COD orders from Lahore created in the last 3 days"
 *   → { risk: "HIGH", payment: "COD", city: "Lahore", days: "3" }
 * Deterministic (no model): every chip maps to a real filter, and anything
 * not understood is reported back instead of silently guessed.
 */

export type OrderFilterParams = Partial<Record<"tab" | "risk" | "payment" | "city" | "days" | "min" | "max" | "late" | "confirmation" | "q", string>>;
export type FilterChip = { param: keyof OrderFilterParams; label: string };

export const PK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala",
  "Hyderabad", "Bahawalpur", "Sargodha", "Sukkur", "Abbottabad", "Mardan", "Sahiwal", "Okara", "Gujrat", "Jhelum",
  "Larkana", "Sheikhupura", "Rahim Yar Khan", "Dera Ghazi Khan", "Mirpur", "Muzaffarabad", "Kasur", "Chiniot", "Nawabshah", "Mingora",
];

const RISK_WORD: Record<string, string> = { HIGH: "High risk", MEDIUM: "Medium risk", LOW: "Low risk" };
const PAYMENT_WORD: Record<string, string> = { COD: "Cash on delivery", CARD: "Card", BANK_TRANSFER: "Bank transfer", WALLET: "Wallet" };
const TAB_WORD: Record<string, string> = {
  attention: "Needs attention",
  processing: "Processing",
  to_ship: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returns",
  cancelled: "Cancelled",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  new: "New",
  high_risk: "High risk",
};

const WORDS_TO_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14, thirty: 30 };

function amount(raw: string) {
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|lac|lakh)?/i);
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1000;
  if (unit === "lac" || unit === "lakh") n *= 100_000;
  return Math.round(n);
}

export function parseOrderQuery(input: string): { params: OrderFilterParams; chips: FilterChip[]; leftover: string } {
  let text = ` ${input.toLowerCase().replace(/[“”"]/g, " ").replace(/\s+/g, " ")} `;
  const params: OrderFilterParams = {};
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // Risk
  if (take(/\b(high[\s-]?risk|risky|suspicious|fraud(?:ulent)?)\b/)) params.risk = "HIGH";
  else if (take(/\bmedium[\s-]?risk\b/)) params.risk = "MEDIUM";
  else if (take(/\b(low[\s-]?risk|safe)\b/)) params.risk = "LOW";

  // Payment
  if (take(/\b(cod|cash on delivery|cash)\b/)) params.payment = "COD";
  else if (take(/\b(card|credit card|debit card|prepaid|paid online)\b/)) params.payment = "CARD";
  else if (take(/\b(bank transfer|bank)\b/)) params.payment = "BANK_TRANSFER";
  else if (take(/\b(wallet|jazzcash|jazz cash|easypaisa|easy paisa)\b/)) params.payment = "WALLET";

  // Status / task
  if (take(/\b(late|delayed|not (yet )?shipped|stuck)\b/)) {
    params.tab = "to_ship";
    params.late = "1";
  } else if (take(/\b(unconfirmed|not confirmed|pending confirmation|awaiting confirmation|waiting for confirmation|need(?:s)? confirmation)\b/)) {
    params.tab = "attention";
    params.confirmation = "awaiting";
  } else if (take(/\b(need(?:s)? attention|urgent|to review)\b/)) params.tab = "attention";
  else if (take(/\b(returns?|returned)\b/)) params.tab = "returned";
  else if (take(/\b(cancell?ed|cancellations?)\b/)) params.tab = "cancelled";
  else if (take(/\b(shipped|in transit|on the way|dispatched)\b/)) params.tab = "shipped";
  else if (take(/\b(delivered)\b/)) params.tab = "delivered";
  else if (take(/\b(processing|packing|to ship|ready to ship)\b/)) params.tab = "to_ship";
  else if (take(/\b(confirmed)\b/)) params.tab = "confirmed";

  // City (known list first, longest names first so "Rahim Yar Khan" wins)
  for (const c of [...PK_CITIES].sort((a, b) => b.length - a.length)) {
    if (take(new RegExp(`\\b(?:from |in |to )?${c.toLowerCase()}\\b`))) {
      params.city = c;
      break;
    }
  }

  // Time
  let m: RegExpMatchArray | null;
  if (take(/\btoday\b/)) params.days = "1";
  else if (take(/\byesterday\b/)) params.days = "2";
  else if ((m = take(/\b(?:in the |over the |during the )?(?:last|past|previous)\s+(\d+|one|two|three|four|five|six|seven|ten|fourteen|thirty)\s+(day|days|week|weeks|month|months)\b/))) {
    const n = /\d/.test(m[1]!) ? Number(m[1]) : WORDS_TO_NUM[m[1]!]!;
    const unit = m[2]!.startsWith("week") ? 7 : m[2]!.startsWith("month") ? 30 : 1;
    params.days = String(Math.min(365, n * unit));
  } else if (take(/\b(this|last|past) week\b/)) params.days = "7";
  else if (take(/\b(this|last|past) month\b/)) params.days = "30";

  // Amount
  if ((m = take(/\b(?:over|above|more than|greater than|at least|>)\s*(?:rs\.?|pkr)?\s*([\d.,]+\s*(?:k|thousand|lac|lakh)?)/))) {
    const v = amount(m[1]!);
    if (v) params.min = String(v);
  }
  if ((m = take(/\b(?:under|below|less than|at most|<)\s*(?:rs\.?|pkr)?\s*([\d.,]+\s*(?:k|thousand|lac|lakh)?)/))) {
    const v = amount(m[1]!);
    if (v) params.max = String(v);
  }

  // Filler words that carry no filter meaning.
  const leftover = text
    .replace(/\b(show|me|find|list|get|all|the|my|orders?|from|in|placed|created|made|with|and|which|that|are|is|were|of|for|please|customers?|to|only|ones?|a|an)\b/g, " ")
    .replace(/[^\p{L}\p{N}# ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A leftover order number or phone becomes a search term; other words are reported back, not guessed.
  if (/^#?\d{3,}$/.test(leftover)) params.q = leftover;

  return { params, chips: chipsFor(params), leftover: params.q ? "" : leftover };
}

export function chipsFor(p: OrderFilterParams): FilterChip[] {
  const chips: FilterChip[] = [];
  if (p.tab && p.tab !== "all" && TAB_WORD[p.tab]) chips.push({ param: "tab", label: TAB_WORD[p.tab]! });
  if (p.risk && RISK_WORD[p.risk]) chips.push({ param: "risk", label: RISK_WORD[p.risk]! });
  if (p.payment && PAYMENT_WORD[p.payment]) chips.push({ param: "payment", label: PAYMENT_WORD[p.payment]! });
  if (p.city) chips.push({ param: "city", label: p.city });
  if (p.days) chips.push({ param: "days", label: p.days === "1" ? "Today" : p.days === "2" ? "Since yesterday" : `Last ${p.days} days` });
  if (p.min) chips.push({ param: "min", label: `Over ${Number(p.min).toLocaleString("en-PK")}` });
  if (p.max) chips.push({ param: "max", label: `Under ${Number(p.max).toLocaleString("en-PK")}` });
  if (p.late) chips.push({ param: "late", label: "Not shipped after 2 days" });
  if (p.confirmation) chips.push({ param: "confirmation", label: p.confirmation === "awaiting" ? "Awaiting confirmation" : "Not asked yet" });
  if (p.q) chips.push({ param: "q", label: `“${p.q}”` });
  return chips;
}

/** True when a palette query reads like an order filter rather than a lookup. */
export function looksLikeOrderFilter(input: string) {
  const { chips } = parseOrderQuery(input);
  return chips.filter((c) => c.param !== "q").length >= 1 && /\border/i.test(input);
}
