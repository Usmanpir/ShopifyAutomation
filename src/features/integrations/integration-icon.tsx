import { cn } from "cn";
import { Blocks, ChartCandlestick, MessageCircle, ShoppingBag, Sparkles, Truck, type LucideIcon } from "lucide-react";

/** Minimal brand-neutral glyphs for providers lucide no longer ships. */
function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3Z" />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICONS: Record<string, LucideIcon | ((p: { className?: string }) => React.ReactElement)> = {
  "shopping-bag": ShoppingBag,
  "message-circle": MessageCircle,
  facebook: FacebookGlyph,
  instagram: InstagramGlyph,
  "chart-candlestick": ChartCandlestick,
  truck: Truck,
  sparkles: Sparkles,
};

/** Tinted tile per provider so the marketplace scans quickly (tokens only). */
const TINT: Record<string, string> = {
  SHOPIFY: "bg-success-soft text-success",
  WHATSAPP: "bg-success-soft text-success",
  FACEBOOK: "bg-info-soft text-info",
  INSTAGRAM: "bg-ai-soft text-ai",
  META_ADS: "bg-brand-soft text-brand",
  COURIER: "bg-warning-soft text-warning",
  OPENAI: "bg-muted text-foreground",
  ANTHROPIC: "bg-warning-soft text-warning",
  GEMINI: "bg-info-soft text-info",
};

export function IntegrationIcon({ icon, provider, className }: { icon: string; provider: string; className?: string }) {
  const Icon = ICONS[icon] ?? Blocks;
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-foreground/5", TINT[provider] ?? "bg-muted text-muted-foreground", className)}>
      <Icon className="size-[22px]" />
    </span>
  );
}
