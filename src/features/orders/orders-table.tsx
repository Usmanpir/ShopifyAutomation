"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, MoreHorizontal, PackageCheck, ShoppingBag, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Drawer } from "@/components/shared/drawer";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { CONFIRMATION_STATUS, FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, Pill, RiskBadge } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import { TimeAgo } from "@/components/shared/time-ago";

export type OrderRow = {
  id: string;
  name: string;
  customerName: string;
  phone: string | null;
  city: string | null;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  fulfillmentStatus: string;
  confirmationStatus: string;
  riskLevel: string;
  riskScore: number;
  placedAt: string;
  items: { title: string; quantity: number; imageUrl: string | null; variantTitle: string | null }[];
};

type BulkAction = "request_confirmation" | "confirm" | "process";

/** What each bulk action does, in plain words, and which orders it can apply to. */
const BULK: Record<BulkAction, { label: string; verb: string; icon: typeof MessageCircle; eligible: (o: OrderRow) => boolean; effect: (n: number) => string }> = {
  request_confirmation: {
    label: "Request confirmation",
    verb: "Send WhatsApp confirmation",
    icon: MessageCircle,
    eligible: (o) => o.status === "NEW" || o.status === "PENDING_CONFIRMATION",
    effect: (n) => `${n} customer${n === 1 ? "" : "s"} will receive the WhatsApp confirmation template. Replies confirm or cancel the order automatically.`,
  },
  confirm: {
    label: "Confirm",
    verb: "Confirm orders",
    icon: CheckCircle2,
    eligible: (o) => o.status === "NEW" || o.status === "PENDING_CONFIRMATION",
    effect: (n) => `${n} order${n === 1 ? "" : "s"} will be marked confirmed without waiting for a customer reply, and tagged in Shopify.`,
  },
  process: {
    label: "Mark processing",
    verb: "Mark processing",
    icon: PackageCheck,
    eligible: (o) => o.status === "CONFIRMED",
    effect: (n) => `${n} order${n === 1 ? "" : "s"} will move to processing (being packed).`,
  },
};

export function OrdersTable({
  rows,
  canUpdate,
  canCancel,
  filtered,
  total,
}: {
  rows: OrderRow[];
  canUpdate: boolean;
  canCancel: boolean;
  filtered: boolean;
  total?: number;
}) {
  const f = useFormat();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<BulkAction | null>(null);

  const bulk = useMutation({
    mutationFn: (v: { action: string; reason?: string; ids?: string[] }) =>
      api<{ succeeded: number; failed: { id: string; error: string }[] }>("/api/orders/bulk", { body: { ids: v.ids ?? [...selected], action: v.action, reason: v.reason } }),
    onSuccess: (r) => {
      if (r.failed.length) toast.warning(`${r.succeeded} updated · ${r.failed.length} skipped`, { description: r.failed[0]?.error });
      else toast.success(`${r.succeeded} order${r.succeeded === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      setPreview(null);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const single = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/api/orders/${v.id}/actions`, { body: { action: v.action } }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "request_confirmation" ? "WhatsApp confirmation sent" : "Order updated");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<OrderRow>[] = [
    {
      key: "order",
      header: "Order",
      sortKey: "orderNumber",
      cell: (o) => (
        <div>
          <p className="font-semibold">{o.name}</p>
          <p className="text-xs text-muted-foreground" title={new Date(o.placedAt).toLocaleString()}>
            <TimeAgo date={o.placedAt} />
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{o.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">{o.city ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "products",
      header: "Products",
      defaultHidden: true,
      cell: (o) => (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {o.items.slice(0, 3).map((it, i) => (
              <ProductImage key={i} src={it.imageUrl} alt={it.title} className="size-8 ring-2 ring-card" rounded="rounded-md" />
            ))}
          </div>
          <span className="max-w-40 truncate text-xs text-muted-foreground">
            {o.items[0]?.title}
            {o.items.length > 1 && ` +${o.items.length - 1}`}
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      sortKey: "total",
      align: "right",
      cell: (o) => (
        <div>
          <p className="tabular font-semibold">{f.money(o.total)}</p>
          <p className="text-[11px] text-muted-foreground">{PAYMENT_METHOD[o.paymentMethod]}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <div className="space-y-1">
          <Pill map={ORDER_STATUS} value={o.status} />
          {o.confirmationStatus === "PENDING" && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageCircle className="size-3" /> {CONFIRMATION_STATUS.PENDING.label}
            </p>
          )}
        </div>
      ),
    },
    { key: "risk", header: "Risk", sortKey: "riskScore", cell: (o) => <RiskBadge level={o.riskLevel} score={o.riskScore} /> },
    { key: "payment", header: "Payment status", defaultHidden: true, cell: (o) => <Pill map={PAYMENT_STATUS} value={o.paymentStatus} /> },
    { key: "fulfillment", header: "Fulfillment", defaultHidden: true, cell: (o) => <Pill map={FULFILLMENT_STATUS} value={o.fulfillmentStatus} /> },
  ];

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const busy = bulk.isPending;
  const p = preview ? BULK[preview] : null;
  const eligible = p ? selectedRows.filter(p.eligible) : [];
  const skipped = p ? selectedRows.filter((o) => !p.eligible(o)) : [];

  return (
    <div className="space-y-3">
      {selected.size > 0 && canUpdate && (
        <div role="toolbar" aria-label="Bulk actions" className="sticky top-16 z-20 flex animate-slide-in flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="mx-1 h-5 w-px bg-border" />
          {(Object.keys(BULK) as BulkAction[]).map((a) => {
            const B = BULK[a];
            return (
              <Button key={a} size="sm" variant="ghost" disabled={busy} onClick={() => setPreview(a)}>
                <B.icon /> {B.label}
              </Button>
            );
          })}
          <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X />
          </Button>
          {canCancel && (
            <>
              <div className="h-5 w-px bg-border" />
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={busy}>
                    <XCircle /> Cancel orders
                  </Button>
                }
                title={`Cancel ${selected.size} order${selected.size === 1 ? "" : "s"}?`}
                description="Cancellations sync to Shopify and can't be undone. Customers are not messaged automatically."
                confirmLabel="Cancel orders"
                destructive
                reason={{ label: "Reason", placeholder: "e.g. Customer unreachable", required: true }}
                onConfirm={(reason) => bulk.mutateAsync({ action: "cancel", reason })}
              />
            </>
          )}
        </div>
      )}
      <DataTable
        caption="Orders"
        columns={columns}
        rows={rows}
        rowHref={(o) => `/orders/${o.id}`}
        selectable={canUpdate}
        selected={selected}
        onSelectedChange={setSelected}
        columnsKey="orders"
        stickyHeader
        toolbar={typeof total === "number" ? <p className="text-[13px] text-muted-foreground">{total.toLocaleString()} order{total === 1 ? "" : "s"}</p> : null}
        rowActions={(o) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${o.name}`} className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={`/orders/${o.id}`}>
                  <ExternalLink /> Open order
                </Link>
              </DropdownMenuItem>
              {canUpdate && BULK.request_confirmation.eligible(o) && (
                <DropdownMenuItem onSelect={() => single.mutate({ id: o.id, action: "request_confirmation" })}>
                  <MessageCircle /> {o.confirmationStatus === "PENDING" ? "Send again" : "Request confirmation"}
                </DropdownMenuItem>
              )}
              {canUpdate && BULK.confirm.eligible(o) && (
                <DropdownMenuItem onSelect={() => single.mutate({ id: o.id, action: "confirm" })}>
                  <CheckCircle2 /> Confirm now
                </DropdownMenuItem>
              )}
              {o.phone && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void navigator.clipboard?.writeText(o.phone!);
                      toast.success("Phone number copied");
                    }}
                  >
                    <Copy /> Copy phone
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        empty={
          <EmptyState
            icon={<ShoppingBag />}
            title={filtered ? "No orders match these filters" : "No orders yet"}
            description={filtered ? "Remove a filter chip above, or describe what you're looking for in a different way." : "Orders from Shopify will appear here as soon as they're placed."}
          />
        }
        mobileCard={(o) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                {o.name} <span className="font-normal text-muted-foreground">· {o.customerName}</span>
              </p>
              <span className="tabular text-sm font-semibold">{f.money(o.total)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill map={ORDER_STATUS} value={o.status} />
              <RiskBadge level={o.riskLevel} score={o.riskScore} compact />
              <span className="text-xs text-muted-foreground">
                {PAYMENT_METHOD[o.paymentMethod]} · {o.city} · <TimeAgo date={o.placedAt} />
              </span>
            </div>
          </div>
        )}
      />

      {/* Action preview: nothing runs until the user sees exactly what will change. */}
      <Drawer
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={p ? `${p.verb} · ${eligible.length} order${eligible.length === 1 ? "" : "s"}` : ""}
        description={p ? p.effect(eligible.length) : undefined}
        icon={p ? <p.icon /> : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => preview && bulk.mutate({ action: preview, ids: eligible.map((o) => o.id) })} disabled={!eligible.length || busy}>
              {p?.verb} ({eligible.length})
            </Button>
          </>
        }
      >
        <ul className="divide-y rounded-xl border">
          {eligible.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">
                  {o.name} <span className="font-normal text-muted-foreground">· {o.customerName}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.city ?? "—"} · {PAYMENT_METHOD[o.paymentMethod]}
                </p>
              </div>
              <RiskBadge level={o.riskLevel} compact />
              <span className="tabular w-20 text-right text-[13px] font-semibold">{f.money(o.total)}</span>
            </li>
          ))}
        </ul>
        {skipped.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {skipped.length} selected order{skipped.length === 1 ? " is" : "s are"} skipped because {skipped.length === 1 ? "its" : "their"} status doesn&apos;t allow this: {skipped.map((o) => o.name).join(", ")}.
          </p>
        )}
      </Drawer>
    </div>
  );
}
