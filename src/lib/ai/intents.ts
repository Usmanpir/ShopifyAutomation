import { z } from "zod";

/** Customer-message intents handled by the WhatsApp agent. */
export const CUSTOMER_INTENTS = [
  "CONFIRM_ORDER",
  "DECLINE_ORDER",
  "ORDER_STATUS",
  "PRODUCT_AVAILABILITY",
  "PRICE",
  "DELIVERY",
  "EXCHANGE",
  "RETURN",
  "FAQ",
  "GREETING",
  "THANKS",
  "COMPLAINT",
  "HUMAN_REQUEST",
  "OTHER",
] as const;
export type CustomerIntent = (typeof CUSTOMER_INTENTS)[number];

export const intentResultSchema = z.object({
  intent: z.enum(CUSTOMER_INTENTS),
  confidence: z.number().min(0).max(1),
  language: z.enum(["english", "roman_urdu", "urdu"]),
  productQuery: z.string().nullable(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  requiresHuman: z.boolean(),
  reason: z.string().nullable(),
});
export type IntentResult = z.infer<typeof intentResultSchema>;

const ROMAN_URDU = /\b(hai|hain|kya|bhai|bhi|aap|ap|kab|kahan|mera|meri|nahi|nhi|kitne|kitna|chahiye|krna|karna|kar|ho|ga|gi|wala|wali|sahi|theek|thik|jee|ji|han|haan|acha|accha|shukriya|jazakallah|bata|batao|dein|de|do)\b/i;
const URDU_SCRIPT = /[؀-ۿ]/;

const SIZES = ["xxl", "xl", "l", "m", "s", "small", "medium", "large", "extra large", "2xl", "3xl"];
const COLORS = ["black", "white", "navy", "blue", "grey", "gray", "maroon", "olive", "beige", "khaki", "green", "red", "brown", "charcoal", "sky", "pink", "kala", "safed"];
const COLOR_ALIASES: Record<string, string> = { kala: "black", safed: "white", gray: "grey" };
const SIZE_ALIASES: Record<string, string> = { small: "S", medium: "M", large: "L", "extra large": "XL", "2xl": "XXL" };

export function detectLanguage(text: string): IntentResult["language"] {
  if (URDU_SCRIPT.test(text)) return "urdu";
  return ROMAN_URDU.test(text) ? "roman_urdu" : "english";
}

function extractSize(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const s of SIZES) {
    const re = new RegExp(`[\\s,(]${s.replace(" ", "\\s")}[\\s,.?)!]`, "i");
    if (re.test(t)) return SIZE_ALIASES[s] ?? s.toUpperCase();
  }
  return null;
}

function extractColor(text: string): string | null {
  const lower = text.toLowerCase();
  const c = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  return c ? (COLOR_ALIASES[c] ?? c) : null;
}

const PRODUCT_WORDS = /\b(shirt|shirts|polo|oxford|trouser|trousers|pant|pants|chino|chinos|tracksuit|tracksuits|track suit|sweatshirt|sweatshirts|hoodie|hoodies|jacket|jackets|puffer|kurta|tee|t-shirt|jeans)\b/i;

function extractProductQuery(text: string): string | null {
  const m = text.match(PRODUCT_WORDS);
  if (!m) return null;
  const color = extractColor(text);
  const qualifiers = text.match(/\b(premium|oxford|polo|casual|formal|cargo|winter|puffer|fleece|slim|classic)\b/i)?.[0];
  return [qualifiers, color, m[0].toLowerCase().replace(/s$/, "")].filter(Boolean).join(" ");
}

type Rule = { intent: CustomerIntent; re: RegExp; confidence: number };

// Order matters: more specific intents first.
const RULES: Rule[] = [
  { intent: "HUMAN_REQUEST", re: /\b(human|agent|representative|real person|manager|call me|insaan|banda|kisi se baat)\b/i, confidence: 0.9 },
  { intent: "COMPLAINT", re: /\b(worst|fraud|scam|complain|complaint|angry|disappointed|bakwas|bekar|ghatiya|damaged|torn|defect|faulty|wrong item|galat)\b/i, confidence: 0.85 },
  { intent: "DECLINE_ORDER", re: /^(no|nope|nahi|nhi|cancel|cancel it|cancel karo|cancel kar do|mat bhejo|don'?t send|not interested)\b|\b(cancel (my )?order|order cancel)\b/i, confidence: 0.92 },
  { intent: "CONFIRM_ORDER", re: /^(yes|yeah|yep|ok|okay|confirm|confirmed|han|haan|ji|jee|g|done|theek hai|thik hai|sure|bilkul|ji haan|yes confirm)\b|\b(confirm(ed)? (my )?order|order confirm)\b/i, confidence: 0.93 },
  { intent: "EXCHANGE", re: /\b(exchange|change size|size change|badal|badalna|replace|replacement)\b/i, confidence: 0.85 },
  { intent: "RETURN", re: /\b(return|refund|wapis|wapas|paise wapis|money back)\b/i, confidence: 0.85 },
  { intent: "ORDER_STATUS", re: /\b(where is my order|order status|track|tracking|kahan hai|kab (aye|ayega|aayega|milega|ayegi)|parcel|dispatch|shipped|status|mera order)\b/i, confidence: 0.85 },
  { intent: "DELIVERY", re: /\b(delivery|deliver|shipping|charges|kitne din|how many days|cod|cash on delivery)\b/i, confidence: 0.8 },
  { intent: "PRICE", re: /\b(price|cost|kitne ka|kitne ki|kitna|rate|how much|discount|sale|offer)\b/i, confidence: 0.82 },
  { intent: "PRODUCT_AVAILABILITY", re: /\b(available|availability|in stock|stock|milega|mil jayega|hai\?|have|size)\b/i, confidence: 0.8 },
  { intent: "THANKS", re: /\b(thanks|thank you|shukriya|jazakallah|thx|ty)\b/i, confidence: 0.9 },
  { intent: "GREETING", re: /^(hi|hello|hey|salam|assalam|aoa|asalam|salaam)\b/i, confidence: 0.85 },
  { intent: "FAQ", re: /\b(policy|size chart|sizing|fabric|material|wash|branch|outlet|shop address|timing)\b/i, confidence: 0.75 },
];

/** Deterministic classifier (local provider + safety net for LLM providers). */
export function classifyIntentLocally(text: string, ctx: { hasPendingConfirmation: boolean }): IntentResult {
  const clean = text.trim();
  const language = detectLanguage(clean);
  const productQuery = extractProductQuery(clean);
  let match = RULES.find((r) => r.re.test(clean));

  // Yes/no only means confirm/decline when a confirmation is actually pending.
  if (match && (match.intent === "CONFIRM_ORDER" || match.intent === "DECLINE_ORDER") && !ctx.hasPendingConfirmation) {
    match = match.intent === "DECLINE_ORDER" && /\bcancel\b/i.test(clean) ? match : RULES.find((r) => r.intent !== "CONFIRM_ORDER" && r.intent !== "DECLINE_ORDER" && r.re.test(clean));
  }
  // A product mention without another clear intent is an availability question.
  if ((!match || match.intent === "GREETING") && productQuery) match = { intent: "PRODUCT_AVAILABILITY", re: /./, confidence: 0.78 };

  const intent = match?.intent ?? "OTHER";
  const confidence = match?.confidence ?? 0.35;
  const requiresHuman = intent === "HUMAN_REQUEST" || intent === "COMPLAINT" || (intent === "EXCHANGE" && /\b(exception|special|after|late|used|worn|sale item)\b/i.test(clean));
  return {
    intent,
    confidence,
    language,
    productQuery,
    size: extractSize(clean),
    color: extractColor(clean),
    requiresHuman,
    reason: requiresHuman
      ? intent === "COMPLAINT"
        ? "Customer is unhappy — needs a personal response."
        : intent === "HUMAN_REQUEST"
          ? "Customer asked to speak to a person."
          : "Customer requested a special exchange exception."
      : intent === "OTHER"
        ? "Couldn't understand the request with enough confidence."
        : null,
  };
}
