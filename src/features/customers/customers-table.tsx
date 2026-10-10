"use client";

import { Users } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { RiskBadge, SegmentBadge, StatusPill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { initials, timeAgo } from "@/lib/format";

export type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  riskLevel: string;
  riskScore: number;
  primarySegment: { key: string; name: string; color: string } | null;
  segmentCount: number;
};

export function CustomerAvatar({ name, className = "size-9 text-xs" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand ${className}`}>
      {initials(name)}
    </span>
  );
}

function Segment({ c }: { c: CustomerRow }) {
  if (!c.primarySegment) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <SegmentBadge name={c.primarySegment.name} color={c.primarySegment.color} />
      {c.segmentCount > 1 && <span className="tabular text-[11px] text-muted-foreground">+{c.segmentCount - 1}</span>}
    </span>
  );
}

export function CustomersTable({ rows, filtered }: { rows: CustomerRow[]; filtered: boolean }) {
  const f = useFormat();
  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      sortKey: "name",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar name={c.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{c.name}</p>
            <p className="max-w-56 truncate text-xs text-muted-foreground">{c.email ?? c.city ?? "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", hideBelow: "xl", cell: (c) => <span className="tabular text-[13px] whitespace-nowrap text-muted-foreground">{c.phone ? `+${c.phone}` : "—"}</span> },
    { key: "orders", header: "Orders", sortKey: "totalOrders", align: "right", cell: (c) => <span className="tabular">{f.number(c.totalOrders)}</span> },
    { key: "revenue", header: "Revenue", sortKey: "totalSpent", align: "right", cell: (c) => <span className="tabular font-semibold">{f.money(c.totalSpent)}</span> },
    { key: "aov", header: "AOV", sortKey: "avgOrderValue", align: "right", hideBelow: "lg", cell: (c) => <span className="tabular text-muted-foreground">{f.money(c.avgOrderValue)}</span> },
    {
      key: "last",
      header: "Last purchase",
      sortKey: "lastOrderAt",
      cell: (c) => (
        <span className="text-[13px] whitespace-nowrap" title={c.lastOrderAt ? f.dateTime(c.lastOrderAt) : undefined}>
          {c.lastOrderAt ? timeAgo(c.lastOrderAt) : <span className="text-muted-foreground">Never</span>}
        </span>
      ),
    },
    { key: "segment", header: "Segment", cell: (c) => <Segment c={c} /> },
    { key: "risk", header: "Risk", hideBelow: "lg", cell: (c) => <RiskBadge level={c.riskLevel} compact /> },
    {
      key: "status",
      header: "Status",
      hideBelow: "2xl",
      cell: (c) => (c.status === "BLOCKED" ? <StatusPill tone="danger">Blocked</StatusPill> : <StatusPill tone="success">Active</StatusPill>),
    },
  ];

  return (
    <DataTable
      caption="Customers"
      columns={columns}
      rows={rows}
      rowHref={(c) => `/customers/${c.id}`}
      empty={
        <EmptyState
          icon={<Users />}
          title={filtered ? "No customers match these filters" : "No customers yet"}
          description={filtered ? "Try another segment, risk level or search term." : "Customers are created automatically from Shopify orders and WhatsApp chats."}
        />
      }
      mobileCard={(c) => (
        <div className="flex items-start gap-3">
          <CustomerAvatar name={c.name} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-medium">{c.name}</p>
              <span className="tabular shrink-0 text-sm font-semibold">{f.money(c.totalSpent)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.totalOrders} order{c.totalOrders === 1 ? "" : "s"} · {c.city ?? "—"} · {c.lastOrderAt ? `last ${timeAgo(c.lastOrderAt)}` : "no purchases"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
              {c.primarySegment && <Segment c={c} />}
              {c.riskLevel !== "LOW" && <RiskBadge level={c.riskLevel} compact />}
              {c.status === "BLOCKED" && <StatusPill tone="danger">Blocked</StatusPill>}
            </div>
          </div>
        </div>
      )}
    />
  );
}
