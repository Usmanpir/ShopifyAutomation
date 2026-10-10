import { cn } from "cn";
import { Bell, Boxes, Bot, MessageCircle, Settings2, ShoppingBag, Target, User, Workflow } from "lucide-react";

const ICONS: Record<string, typeof Bell> = {
  ORDER: ShoppingBag,
  INVENTORY: Boxes,
  CUSTOMER: User,
  WHATSAPP: MessageCircle,
  ADS: Target,
  AUTOMATION: Workflow,
  AI: Bot,
  SYSTEM: Settings2,
};

const TONES: Record<string, string> = {
  CRITICAL: "bg-danger-soft text-danger",
  WARNING: "bg-warning-soft text-warning",
  SUCCESS: "bg-success-soft text-success",
  INFO: "bg-info-soft text-info",
};

export function NotificationIcon({ type, severity, className }: { type: string; severity: string; className?: string }) {
  const Icon = ICONS[type] ?? Bell;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", type === "AI" ? "bg-ai-soft text-ai" : (TONES[severity] ?? TONES.INFO), className)}>
      <Icon className="size-4" />
    </span>
  );
}
