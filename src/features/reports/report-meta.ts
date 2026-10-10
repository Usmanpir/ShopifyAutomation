import { BadgeDollarSign, BarChart3, Boxes, CalendarDays, CalendarRange, HandCoins, Megaphone, type LucideIcon, Package, RotateCcw, Target, Users } from "lucide-react";

/** Presentation metadata for report types (icons, category order). Keys mirror REPORT_TYPES. */
export const REPORT_ICONS: Record<string, LucideIcon> = {
  daily_sales: CalendarDays,
  weekly_sales: CalendarRange,
  monthly_sales: BarChart3,
  product_performance: Package,
  customer_performance: Users,
  marketing_performance: Megaphone,
  ad_performance: Target,
  inventory: Boxes,
  returns: RotateCcw,
  cod: HandCoins,
};

export const REPORT_CATEGORIES: { key: string; description: string; tone: string }[] = [
  { key: "Sales", description: "Revenue, orders and profit over time", tone: "bg-primary/10 text-primary" },
  { key: "Catalog", description: "What sells, what's left on the shelf", tone: "bg-info-soft text-info" },
  { key: "Customers", description: "Who buys and how often", tone: "bg-success-soft text-success" },
  { key: "Marketing", description: "WhatsApp campaigns and Meta ads", tone: "bg-ai-soft text-ai" },
  { key: "Operations", description: "COD, confirmations and returns", tone: "bg-warning-soft text-warning" },
];

export const FALLBACK_ICON = BadgeDollarSign;
