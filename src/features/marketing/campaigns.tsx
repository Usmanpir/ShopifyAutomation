"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { Loader2, MessageCircle, Plus, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { Pill } from "@/components/shared/status";
import { useCan, useFormat, useStore } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { MARKETING_STATUS } from "./labels";


export type SegmentOption = { id: string; key: string; name: string; color: string; customerCount: number };
export type MarketingCampaignRow = {
  id: string;
  name: string;
  status: string;
  message: string;
  audienceSize: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  conversions: number;
  revenue: number;
  sentAt: string | null;
  createdAt: string;
  segment: { name: string } | null;
  segmentId: string | null;
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Funnel({ c }: { c: MarketingCampaignRow }) {
  const f = useFormat();
  if (c.status !== "SENT" && c.status !== "SENDING") return <span className="text-xs text-muted-foreground">Not sent yet</span>;
  const steps = [
    { label: "Sent", value: c.sentCount, pct: 100 },
    { label: "Delivered", value: c.deliveredCount, pct: c.sentCount ? (c.deliveredCount / c.sentCount) * 100 : 0 },
    { label: "Read", value: c.readCount, pct: c.sentCount ? (c.readCount / c.sentCount) * 100 : 0 },
  ];
  return (
    <div className="flex items-end gap-3" aria-label={`Sent ${c.sentCount}, delivered ${c.deliveredCount}, read ${c.readCount}`}>
      {steps.map((s) => (
        <div key={s.label} className="w-14">
          <p className="tabular text-[13px] font-semibold">{f.number(s.value)}</p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${s.pct}%` }} />
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function SendButton({ c }: { c: MarketingCampaignRow }) {
  const router = useRouter();
  const send = useMutation({
    mutationFn: () => api<{ sentCount: number; deliveredCount: number }>(`/api/marketing/campaigns/${c.id}/send`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`“${c.name}” sent`, { description: `${r.sentCount} messages sent · ${r.deliveredCount} delivered so far` });
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't send campaign", { description: errorMessage(e) }),
  });
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" disabled={send.isPending}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send
        </Button>
      }
      title={`Send “${c.name}” now?`}
      description={`This sends a WhatsApp message to up to ${c.audienceSize} opted-in customers in ${c.segment?.name ?? "the segment"}. Messages can't be recalled once sent.`}
      confirmLabel="Send broadcast"
      onConfirm={() => send.mutateAsync()}
    />
  );
}

export function MarketingCampaignsTable({ rows, segments }: { rows: MarketingCampaignRow[]; segments: SegmentOption[] }) {
  const f = useFormat();
  const can = useCan();
  const canSend = can("marketing.send");
  const columns: Column<MarketingCampaignRow>[] = [
    {
      key: "name",
      header: "Campaign",
      cell: (c) => (
        <div className="min-w-0">
          <p className="max-w-64 truncate font-medium">{c.name}</p>
          <p className="max-w-64 truncate text-xs text-muted-foreground" title={c.message}>
            {c.message}
          </p>
        </div>
      ),
    },
    { key: "segment", header: "Segment", hideBelow: "lg", cell: (c) => <span className="text-[13px] whitespace-nowrap">{c.segment?.name ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <div className="space-y-1">
          <Pill map={MARKETING_STATUS} value={c.status} />
          <p className="text-[11px] whitespace-nowrap text-muted-foreground">{c.sentAt ? `Sent ${timeAgo(c.sentAt)}` : `Created ${timeAgo(c.createdAt)}`}</p>
        </div>
      ),
    },
    { key: "audience", header: "Audience", align: "right", cell: (c) => <span className="tabular">{f.number(c.audienceSize)}</span> },
    { key: "funnel", header: "Sent · Delivered · Read", hideBelow: "xl", cell: (c) => <Funnel c={c} /> },
    { key: "conversions", header: "Conversions", align: "right", hideBelow: "lg", cell: (c) => <span className="tabular">{c.status === "SENT" ? `${c.conversions} · ${pct(c.conversions, c.sentCount)}` : "—"}</span> },
    { key: "revenue", header: "Revenue", align: "right", cell: (c) => <span className="tabular font-medium">{c.status === "SENT" ? f.money(c.revenue) : "—"}</span> },
    {
      key: "action",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) =>
        c.status === "DRAFT" && canSend ? (
          <SendButton c={c} />
        ) : c.status === "PENDING_APPROVAL" ? (
          <Link href="/approvals" className="text-[13px] font-medium text-primary hover:underline">
            Review
          </Link>
        ) : null,
    },
  ];
  return (
    <DataTable
      caption="WhatsApp broadcasts"
      columns={columns}
      rows={rows}
      empty={
        <EmptyState
          icon={<MessageCircle />}
          title="No broadcasts yet"
          description="Send a personalised WhatsApp message to a customer segment — VIPs, inactive buyers, or anyone you define."
          action={can("marketing.manage") ? <NewCampaignButton segments={segments} label="Create your first campaign" /> : undefined}
        />
      }
      mobileCard={(c) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.segment?.name ?? "—"} · {f.number(c.audienceSize)} customers
              </p>
            </div>
            <Pill map={MARKETING_STATUS} value={c.status} />
          </div>
          {c.status === "SENT" ? (
            <p className="text-xs text-muted-foreground">
              {pct(c.readCount, c.sentCount)} read · {c.conversions} conversions · <span className="font-medium text-foreground">{f.money(c.revenue)}</span>
            </p>
          ) : (
            c.status === "DRAFT" && canSend && <SendButton c={c} />
          )}
        </div>
      )}
    />
  );
}

/** "New campaign" — creates a WhatsApp broadcast; large audiences route to the Approval Center. */
export function NewCampaignButton({ segments, label = "New campaign", defaultSegmentId, variant = "default" }: { segments: SegmentOption[]; label?: string; defaultSegmentId?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const can = useCan();
  const { store } = useStore();
  const id = useId();
  // Opens straight away for /marketing?tab=campaigns&new=1 (quick-create menu).
  const [open, setOpen] = useState(useSearchParams().get("new") === "1");
  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState(defaultSegmentId ?? "");
  const [message, setMessage] = useState("");
  const [sendNow, setSendNow] = useState(false);
  const canSend = can("marketing.send");
  const segment = segments.find((s) => s.id === segmentId);
  const valid = name.trim().length >= 3 && !!segmentId && message.trim().length >= 10;

  const create = useMutation({
    mutationFn: () => api<{ id: string; status: string; sentCount: number; audienceSize: number }>("/api/marketing/campaigns", { body: { name: name.trim(), segmentId, message: message.trim(), sendNow: canSend && sendNow } }),
    onSuccess: (c) => {
      if (c.status === "PENDING_APPROVAL") toast.success("Sent to the Approval Center", { description: `${c.audienceSize} recipients is above your mass-messaging threshold — an owner or admin must approve it.` });
      else if (c.status === "SENT") toast.success("Broadcast sent", { description: `${c.sentCount} WhatsApp messages sent.` });
      else toast.success("Draft saved", { description: "Send it from the Campaigns tab when you're ready." });
      setOpen(false);
      setName("");
      setMessage("");
      setSendNow(false);
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't create campaign", { description: errorMessage(e) }),
  });

  const insertName = () => setMessage((m) => (m.includes("{{name}}") ? m : `Hi {{name}}! ${m}`.trim()));
  const preview = message.replace(/\{\{\s*name\s*\}\}/g, "Ali") || "Your message preview appears here…";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} className={cn("h-9", variant === "outline" && "bg-card")} onClick={() => setOpen(true)} disabled={!segments.length}>
        <Plus /> {label}
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New WhatsApp campaign</DialogTitle>
          <DialogDescription>Broadcast a personalised message to opted-in customers in a segment.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <form
            id={`${id}-form`}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-name`}>Campaign name</Label>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP early access — Eid drop" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-segment`}>Segment</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger id={`${id}-segment`} className="w-full">
                  <SelectValue placeholder="Choose who receives it" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        {s.name}
                        <span className="tabular text-xs text-muted-foreground">{s.customerCount}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segment && <p className="text-xs text-muted-foreground">{segment.customerCount} customers in segment — only those opted in with a WhatsApp number receive it.</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${id}-message`}>Message</Label>
                <Button type="button" size="xs" variant="ghost" onClick={insertName}>
                  Insert {"{{name}}"}
                </Button>
              </div>
              <Textarea id={`${id}-message`} value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={1000} placeholder="Hi {{name}}! Our winter collection just dropped ❄️ Reply SHOP to see it." />
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Use <code className="rounded bg-muted px-1">{"{{name}}"}</code> for the customer&apos;s first name.
                </span>
                <span className="tabular">{message.length}/1000</span>
              </p>
            </div>
            {canSend && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label htmlFor={`${id}-now`}>Send now</Label>
                  <p className="text-xs text-muted-foreground">Off saves a draft you can send later.</p>
                </div>
                <Switch id={`${id}-now`} checked={sendNow} onCheckedChange={setSendNow} />
              </div>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
              Large audiences are routed to the Approval Center unless an owner or admin sends them.
            </p>
          </form>
          <div className="hidden md:block">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="mb-2 text-center text-[10.5px] text-muted-foreground">{store.name} · WhatsApp</p>
              <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-sm bg-success-soft px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground shadow-sm">{preview}</div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!valid || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : sendNow && canSend ? <Send /> : null}
            {sendNow && canSend ? "Create & send" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
