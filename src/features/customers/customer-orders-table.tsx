"use client";

import { ShoppingBag } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { ORDER_STATUS, PAYMENT_METHOD, Pill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";

export type CustomerOrderRow = {
  id: string;
  name: string;
  status: string;
  total: number;
  paymentMethod: string;
  placedAt: string;
  items: { title: string; quantity: number; imageUrl: string | null }[];
};

export function CustomerOrdersTable({ rows }: { rows: CustomerOrderRow[] }) {
  const f = useFormat();
  const summary = (o: CustomerOrderRow) => {
    const n = o.items.reduce((s, i) => s + i.quantity, 0);
    return `${o.items[0]?.title ?? "—"}${o.items.length > 1 ? ` +${o.items.length - 1} more` : ""} · ${n} item${n === 1 ? "" : "s"}`;
  };
  const columns: Column<CustomerOrderRow>[] = [
    {
      key: "order",
      header: "Order",
      cell: (o) => (
        <div>
          <p className="font-semibold">{o.name}</p>
          <p className="text-xs whitespace-nowrap text-muted-foreground">{f.date(o.placedAt)}</p>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (o) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex -space-x-2">
            {o.items.slice(0, 3).map((it, i) => (
              <ProductImage key={i} src={it.imageUrl} alt={it.title} className="size-8 ring-2 ring-card" rounded="rounded-md" />
            ))}
          </div>
          <span className="max-w-56 truncate text-xs text-muted-foreground">{summary(o)}</span>
        </div>
      ),
    },
    { key: "payment", header: "Payment", hideBelow: "xl", cell: (o) => <span className="text-xs font-medium">{PAYMENT_METHOD[o.paymentMethod] ?? o.paymentMethod}</span> },
    { key: "status", header: "Status", cell: (o) => <Pill map={ORDER_STATUS} value={o.status} /> },
    { key: "total", header: "Total", align: "right", cell: (o) => <span className="tabular font-semibold">{f.money(o.total)}</span> },
  ];
  return (
    <DataTable
      caption="Order history"
      columns={columns}
      rows={rows}
      rowHref={(o) => `/orders/${o.id}`}
      className="rounded-none border-0 border-t shadow-none"
      empty={<EmptyState compact icon={<ShoppingBag />} title="No orders yet" description="This customer hasn't placed an order." />}
      mobileCard={(o) => (
        <div className="flex items-center gap-3">
          <ProductImage src={o.items[0]?.imageUrl} alt={o.items[0]?.title ?? "Order"} className="size-10" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">
                {o.name} <span className="text-xs font-normal text-muted-foreground">· {f.date(o.placedAt)}</span>
              </p>
              <span className="tabular text-sm font-semibold">{f.money(o.total)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Pill map={ORDER_STATUS} value={o.status} />
              <span className="truncate text-xs text-muted-foreground">{summary(o)}</span>
            </div>
          </div>
        </div>
      )}
    />
  );
}
