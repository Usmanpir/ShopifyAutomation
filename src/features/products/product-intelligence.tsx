import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/shared/product-image";
import { WhyButton } from "@/components/shared/explain";

type Intel = {
  trend: { recent: number; previous: number; change: number | null };
  ordersWithProduct: number;
  crossSell: { id: string; title: string; imageUrl: string | null; orders: number; share: number }[];
  minOrders: number;
};

/** Sales trend + "bought together" — each figure is a count of real orders. */
export function ProductIntelligence({ title, intel, canAsk }: { title: string; intel: Intel; canAsk: boolean }) {
  const { trend } = intel;
  const up = trend.change !== null && trend.change >= 5;
  const down = trend.change !== null && trend.change <= -5;
  const TrendIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const top = intel.crossSell[0];
  return (
    <section aria-labelledby="product-intel" className="overflow-hidden rounded-xl border bg-card">
      <div className="space-y-4 px-5 py-4">
        <p id="product-intel" className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ai uppercase">
          <Sparkles className="size-3.5" aria-hidden /> Product intelligence
        </p>
        <div>
          <p className="text-xs text-muted-foreground">Sales trend · last 14 days</p>
          <p className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold">
            <span className="tabular">{trend.recent} units</span>
            <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1 text-xs", up ? "bg-success-soft text-success" : down ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")}>
              <TrendIcon className="size-3.5" aria-hidden />
              {trend.change === null ? "new" : `${Math.abs(trend.change)}%`}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">vs {trend.previous} units in the 14 days before</p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Often bought together</p>
            {top && (
              <WhyButton
                explain={{
                  what: `${top.share}% of orders with ${title} also included ${top.title}.`,
                  why: "Products bought together are natural bundle and cross-sell candidates — customers already pair them.",
                  todo: "Show them side by side, offer a small bundle discount, or recommend the pair in WhatsApp replies.",
                  evidence: [{ label: `Orders with ${title} (90 days)`, value: String(intel.ordersWithProduct) }, ...intel.crossSell.map((c) => ({ label: `Also had ${c.title}`, value: `${c.orders} orders · ${c.share}%` }))],
                }}
              />
            )}
          </div>
          {intel.crossSell.length ? (
            <ul className="mt-1.5 space-y-2">
              {intel.crossSell.map((c) => (
                <li key={c.id}>
                  <Link href={`/products/${c.id}`} className="group flex items-center gap-2.5">
                    <ProductImage src={c.imageUrl} alt={c.title} className="size-9" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">{c.title}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{c.share}% of orders</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {intel.ordersWithProduct < intel.minOrders ? `Needs at least ${intel.minOrders} orders in 90 days to spot patterns (${intel.ordersWithProduct} so far).` : "Usually bought on its own."}
            </p>
          )}
          {top && canAsk && (
            <Link
              href={`/assistant?q=${encodeURIComponent(`Draft a bundle offer for ${title} and ${top.title}. ${top.share}% of orders with the first include the second.`)}`}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Draft a bundle offer with AI
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
