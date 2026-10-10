"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, CheckCheck, Inbox, Loader2, MessageSquareText, Reply, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { StatusPill, toneDot, type Tone } from "@/components/shared/status";
import { useCan, useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorMessage } from "@/lib/client/api";
import { initials } from "@/lib/format";

export type SocialAccount = { pageId: string | null; pageName: string | null; instagramId: string | null; instagramHandle: string | null; name: string } | null;
export type CommentRow = {
  id: string;
  platform: string;
  postCaption: string | null;
  authorName: string;
  body: string;
  sentiment: string | null;
  intent: string | null;
  replied: boolean;
  replyBody: string | null;
  createdAt: string;
};
export type LeadRow = { id: string; platform: string; formName: string; name: string; phone: string | null; email: string | null; city: string | null; status: string; createdAt: string };
type ConvGroup = { channel: string; _count: { _all: number }; _sum: { unreadCount: number | null } };

const SENTIMENT: Record<string, { label: string; tone: Tone }> = {
  POSITIVE: { label: "Positive", tone: "success" },
  NEUTRAL: { label: "Neutral", tone: "neutral" },
  NEGATIVE: { label: "Negative", tone: "danger" },
};
const INTENT: Record<string, string> = { PRICE_QUESTION: "Price question", AVAILABILITY: "Availability", COMPLAINT: "Complaint", PRAISE: "Praise", OTHER: "Other" };
const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "brand" },
  CONVERTED: { label: "Converted", tone: "success" },
  LOST: { label: "Lost", tone: "neutral" },
};

function PlatformMark({ platform, className }: { platform: string; className?: string }) {
  const ig = platform === "INSTAGRAM";
  return (
    <span
      aria-label={ig ? "Instagram" : "Facebook"}
      role="img"
      className={cn("grid size-5 shrink-0 place-items-center rounded-md text-[9.5px] font-bold", ig ? "bg-ai-soft text-ai" : "bg-info-soft text-info", className)}
    >
      {ig ? "IG" : "f"}
    </span>
  );
}

function AccountCard({ platform, title, handle, conv, extra }: { platform: string; title: string; handle: string; conv?: ConvGroup; extra: { label: string; value: number; href?: string }[] }) {
  const unread = conv?._sum.unreadCount ?? 0;
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <PlatformMark platform={platform} className="size-10 rounded-xl text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{handle}</p>
        </div>
        <StatusPill tone="success">Connected</StatusPill>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3">
        <div>
          <dt className="text-[11px] text-muted-foreground">Conversations</dt>
          <dd className="tabular text-lg font-semibold">{conv?._count._all ?? 0}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Unread</dt>
          <dd className={cn("tabular text-lg font-semibold", unread > 0 && "text-warning")}>{unread}</dd>
        </div>
        {extra.map((e) => (
          <div key={e.label}>
            <dt className="text-[11px] text-muted-foreground">{e.label}</dt>
            <dd className="tabular text-lg font-semibold">{e.value}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/conversations?channel=${platform}`} className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-primary hover:underline">
        Open inbox <ArrowRight className="size-3.5" />
      </Link>
    </article>
  );
}

function CommentItem({ c, canReply }: { c: CommentRow; canReply: boolean }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [local, setLocal] = useState<{ replied: boolean; replyBody: string | null }>({ replied: c.replied, replyBody: c.replyBody });
  const reply = useMutation({
    mutationFn: () => api(`/api/meta/comments/${c.id}/reply`, { body: { text: text.trim() } }),
    onSuccess: () => {
      toast.success(`Replied to ${c.authorName}`);
      setLocal({ replied: true, replyBody: text.trim() });
      setOpen(false);
      setText("");
      router.refresh();
    },
    onError: (e) => toast.error("Reply failed", { description: errorMessage(e) }),
  });
  const s = c.sentiment ? SENTIMENT[c.sentiment] : null;
  return (
    <li className="flex gap-3 px-5 py-4">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {initials(c.authorName)}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold">{c.authorName}</p>
          <PlatformMark platform={c.platform} />
          <span className="text-xs text-muted-foreground"><TimeAgo date={c.createdAt} /></span>
          {c.postCaption && <span className="truncate text-xs text-muted-foreground">on “{c.postCaption}”</span>}
        </div>
        <p className="text-sm leading-relaxed">{c.body}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {s && <StatusPill tone={s.tone}>{s.label}</StatusPill>}
          {c.intent && (
            <StatusPill tone={c.intent === "COMPLAINT" ? "warning" : "neutral"} dot={false}>
              {INTENT[c.intent] ?? c.intent}
            </StatusPill>
          )}
          {local.replied ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <CheckCheck className="size-3.5" aria-hidden /> Replied
            </span>
          ) : (
            canReply &&
            !open && (
              <Button size="xs" variant="ghost" onClick={() => setOpen(true)} className="text-primary">
                <Reply /> Reply
              </Button>
            )
          )}
        </div>
        {local.replyBody && <p className="rounded-lg border-l-2 border-primary/40 bg-surface-2 px-3 py-2 text-[13px] text-muted-foreground">{local.replyBody}</p>}
        {open && (
          <form
            className="space-y-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) reply.mutate();
            }}
          >
            <label htmlFor={`${id}-reply`} className="sr-only">
              Reply to {c.authorName}
            </label>
            <Textarea id={`${id}-reply`} autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder={`Reply publicly to ${c.authorName.split(" ")[0]}…`} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={reply.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!text.trim() || reply.isPending}>
                {reply.isPending && <Loader2 className="animate-spin" />} Post reply
              </Button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

function CommentsList({ comments, canReply }: { comments: CommentRow[]; canReply: boolean }) {
  const [filter, setFilter] = useState("all");
  const rows = comments.filter((c) => (filter === "unreplied" ? !c.replied : filter === "negative" ? c.sentiment === "NEGATIVE" : true));
  return (
    <SectionCard
      title="Comments"
      className="2xl:col-span-2"
      description="Latest comments across your Facebook Page and Instagram posts"
      contentClassName="px-0 pb-0"
      action={
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v)} variant="outline" size="sm" aria-label="Filter comments">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="unreplied">Unreplied</ToggleGroupItem>
          <ToggleGroupItem value="negative">Negative</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {rows.length ? (
        <ul className="max-h-[640px] divide-y overflow-y-auto border-t">
          {rows.map((c) => (
            <CommentItem key={c.id} c={c} canReply={canReply} />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<MessageSquareText />} title={filter === "all" ? "No comments yet" : "Nothing here"} description={filter === "all" ? "Comments on your posts and ads will appear here." : "You're all caught up on this filter."} />
      )}
    </SectionCard>
  );
}

function LeadStatusSelect({ lead, disabled }: { lead: LeadRow; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(lead.status);
  const update = useMutation({
    mutationFn: (status: string) => api(`/api/meta/leads/${lead.id}`, { method: "PATCH", body: { status } }),
    onSuccess: (_d, status) => {
      toast.success(`${lead.name} marked ${LEAD_STATUS[status]?.label.toLowerCase()}`);
      router.refresh();
    },
    onError: (e) => {
      setValue(lead.status);
      toast.error("Couldn't update lead", { description: errorMessage(e) });
    },
  });
  if (disabled) return <StatusPill tone={LEAD_STATUS[value]?.tone}>{LEAD_STATUS[value]?.label ?? value}</StatusPill>;
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v);
        update.mutate(v);
      }}
      disabled={update.isPending}
    >
      <SelectTrigger size="sm" className="h-8 w-[132px]" aria-label={`Status for ${lead.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LEAD_STATUS).map(([k, m]) => (
          <SelectItem key={k} value={k}>
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn("size-1.5 rounded-full", toneDot(m.tone))} />
              {m.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadsTable({ leads, canManage }: { leads: LeadRow[]; canManage: boolean }) {
  const f = useFormat();
  const columns: Column<LeadRow>[] = [
    {
      key: "name",
      header: "Lead",
      cell: (l) => (
        <div className="min-w-0">
          <p className="font-medium">{l.name}</p>
          {l.email && <p className="truncate text-xs text-muted-foreground">{l.email}</p>}
        </div>
      ),
    },
    { key: "phone", header: "Phone", cell: (l) => <span className="tabular text-[13px]">{l.phone ?? "—"}</span> },
    { key: "city", header: "City", hideBelow: "lg", cell: (l) => l.city ?? "—" },
    { key: "form", header: "Form", hideBelow: "xl", cell: (l) => <span className="block max-w-56 truncate text-[13px] text-muted-foreground">{l.formName}</span> },
    {
      key: "platform",
      header: "Platform",
      cell: (l) => (
        <span className="flex items-center gap-1.5 text-[13px]">
          <PlatformMark platform={l.platform} /> {l.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
        </span>
      ),
    },
    { key: "created", header: "Created", hideBelow: "lg", cell: (l) => <span className="text-[13px] text-muted-foreground" title={f.dateTime(l.createdAt)}><TimeAgo date={l.createdAt} /></span> },
    { key: "status", header: "Status", cell: (l) => <LeadStatusSelect lead={l} disabled={!canManage} /> },
  ];
  return (
    <DataTable
      caption="Lead form submissions"
      columns={columns}
      rows={leads}
      className="rounded-none border-0 border-t shadow-none"
      empty={<EmptyState compact icon={<UserPlus />} title="No leads yet" description="Submissions from your Facebook & Instagram lead forms will appear here." />}
      mobileCard={(l) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                <PlatformMark platform={l.platform} /> {l.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {l.phone ?? "No phone"} · {l.city ?? "—"} · <TimeAgo date={l.createdAt} />
              </p>
              <p className="truncate text-xs text-muted-foreground">{l.formName}</p>
            </div>
          </div>
          <LeadStatusSelect lead={l} disabled={!canManage} />
        </div>
      )}
    />
  );
}

export function SocialPanel({
  account,
  conversations,
  comments,
  leads,
  leadCount7d,
  unansweredComments,
}: {
  account: SocialAccount;
  conversations: ConvGroup[];
  comments: CommentRow[];
  leads: LeadRow[];
  leadCount7d: number;
  unansweredComments: number;
}) {
  const can = useCan();
  const canManage = can("marketing.manage");
  const fb = conversations.find((c) => c.channel === "FACEBOOK");
  const ig = conversations.find((c) => c.channel === "INSTAGRAM");
  const fbComments = comments.filter((c) => c.platform === "FACEBOOK" && !c.replied).length;
  const igComments = comments.filter((c) => c.platform === "INSTAGRAM" && !c.replied).length;
  const newLeads = leads.filter((l) => l.status === "NEW").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {account?.pageId || account?.pageName ? (
          <AccountCard platform="FACEBOOK" title={account.pageName ?? "Facebook Page"} handle={`Facebook Page · ID ${account.pageId ?? "—"}`} conv={fb} extra={[{ label: "To reply", value: fbComments }]} />
        ) : (
          <div className="rounded-xl border border-dashed bg-card">
            <EmptyState compact icon={<Inbox />} title="Facebook Page not connected" description="Connect your Page in Integrations to manage messages and comments." />
          </div>
        )}
        {account?.instagramHandle ? (
          <AccountCard platform="INSTAGRAM" title={`@${account.instagramHandle}`} handle="Instagram business account" conv={ig} extra={[{ label: "To reply", value: igComments }]} />
        ) : (
          <div className="rounded-xl border border-dashed bg-card">
            <EmptyState compact icon={<Inbox />} title="Instagram not connected" description="Link an Instagram business account to your Facebook Page." />
          </div>
        )}
        <article className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:col-span-2 xl:col-span-1">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Social at a glance</p>
            <p className="mt-1 text-sm text-muted-foreground">What needs a response across Meta.</p>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-[11px] text-muted-foreground">Leads · 7d</dt>
              <dd className="tabular text-lg font-semibold">{leadCount7d}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-[11px] text-muted-foreground">New leads</dt>
              <dd className={cn("tabular text-lg font-semibold", newLeads > 0 && "text-info")}>{newLeads}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-[11px] text-muted-foreground">Unanswered</dt>
              <dd className={cn("tabular text-lg font-semibold", unansweredComments > 0 && "text-warning")}>{unansweredComments}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="grid gap-4 2xl:grid-cols-5">
        <CommentsList comments={comments} canReply={canManage} />
        <SectionCard title="Leads" description={`${leads.length} most recent lead form submissions`} contentClassName="px-0 pb-0" className="2xl:col-span-3">
          <LeadsTable leads={leads} canManage={canManage} />
        </SectionCard>
      </div>
    </div>
  );
}
