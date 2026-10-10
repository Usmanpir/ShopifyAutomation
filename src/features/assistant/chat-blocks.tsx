"use client";

import { cn } from "cn";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Minus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import type { ChatBlock } from "@/services/assistant.service";

export type { ChatBlock };

/** Metrics where "up" is bad (spend, cancellations, CPA…). */
const INVERTED = /spend|cancel|cpa|cost|return|refund|bounce/i;

function parseChange(change?: string) {
  if (!change) return null;
  const n = parseFloat(change.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function ChangeBadge({ label, change }: { label: string; change?: string }) {
  const n = parseChange(change);
  if (n === null || !change) return null;
  const flat = Math.abs(n) < 0.05;
  const up = n > 0;
  const good = flat ? null : INVERTED.test(label) ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 rounded-md px-1 py-px text-[11px] font-semibold",
        good === null ? "bg-muted text-muted-foreground" : good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {change.replace(/^[+-]/, "")}
      <span className="sr-only">{up ? "increase" : "decrease"}</span>
    </span>
  );
}

function BlockTitle({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <h4 className="mb-2 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

function MetricsBlock({ block }: { block: Extract<ChatBlock, { type: "metrics" }> }) {
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="overflow-hidden rounded-xl border bg-card">
      <dl className={cn("-mr-px -mb-px grid", block.items.length <= 2 ? "grid-cols-2" : block.items.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {block.items.map((m, i) => {
          const [main, ...rest] = m.value.split(" vs ");
          return (
            <div key={`${m.label}-${i}`} className="min-w-0 border-r border-b px-3 py-2.5">
              <dt className="truncate text-[11.5px] text-muted-foreground">{m.label}</dt>
              <dd className="mt-0.5">
                <span className="tabular block truncate text-[15px] font-semibold tracking-tight" title={m.value}>
                  {main}
                </span>
                <span className="mt-0.5 flex min-h-4 flex-wrap items-center gap-1.5">
                  <ChangeBadge label={m.label} change={m.change} />
                  {rest.length > 0 && <span className="tabular truncate text-[11px] text-muted-foreground">vs {rest.join(" vs ")}</span>}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      </div>
    </section>
  );
}

const NUMERIC = /^[-+−]?\s*(rs\.?|pkr|\$)?\s*[\d,.]+\s*(%|×|x|days?)?$/i;

function TableBlock({ block }: { block: Extract<ChatBlock, { type: "table" }> }) {
  const router = useRouter();
  const numeric = block.columns.map((_, c) => block.rows.length > 0 && block.rows.every((r) => typeof r[c] === "number" || NUMERIC.test(String(r[c] ?? "").trim()) || r[c] === "—"));
  const hasLinks = !!block.links?.some(Boolean);
  if (!block.rows.length)
    return (
      <section>
        <BlockTitle>{block.title}</BlockTitle>
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No matching rows.</p>
      </section>
    );
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="scrollbar-thin overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="border-b bg-surface-2/60 text-left text-[11.5px] text-muted-foreground">
              {block.columns.map((c, i) => (
                <th key={c} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", numeric[i] && "text-right")}>
                  {c}
                </th>
              ))}
              {hasLinks && (
                <th className="w-8">
                  <span className="sr-only">Open</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {block.rows.map((row, r) => {
              const href = block.links?.[r] ?? null;
              return (
                <tr
                  key={r}
                  className={cn("group", href && "cursor-pointer hover:bg-muted/50")}
                  onClick={href ? (e) => !(e.target as HTMLElement).closest("a") && router.push(href) : undefined}
                >
                  {row.map((cell, c) => (
                    <td key={c} className={cn("px-3 py-2 whitespace-nowrap", numeric[c] && "tabular text-right", c === 0 && "max-w-[280px] truncate font-medium")}>
                      {c === 0 && href ? (
                        <Link href={href} className="hover:text-primary hover:underline focus-visible:outline-2">
                          {String(cell)}
                        </Link>
                      ) : typeof cell === "number" ? (
                        cell.toLocaleString()
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                  {hasLinks && <td className="pr-2 text-muted-foreground">{href && <ChevronRight className="size-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ListBlock({ block }: { block: Extract<ChatBlock, { type: "list" }> }) {
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <ul className="space-y-1.5 rounded-xl border bg-card px-3.5 py-3">
        {block.items.map((it, i) => {
          const [head, ...tail] = it.split(": ");
          return (
            <li key={i} className="flex gap-2.5 text-[13px] leading-5">
              <span className="tabular mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
              <span className="min-w-0">
                {tail.length ? (
                  <>
                    <span className="font-medium">{head}</span>
                    <span className="text-muted-foreground">: {tail.join(": ")}</span>
                  </>
                ) : (
                  it
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ApprovalBlock({ block }: { block: Extract<ChatBlock, { type: "approval" }> }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-3.5 sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-warning ring-1 ring-warning/20">
        <ShieldCheck className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">Waiting for approval</p>
        <p className="text-[13px] leading-5 text-foreground/80">{block.message}</p>
      </div>
      <Link
        href={`/approvals?focus=${block.decisionId}`}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background transition hover:bg-foreground/85 sm:self-auto"
      >
        Review <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

export function ChatBlocks({ blocks }: { blocks: ChatBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.type === "metrics" ? <MetricsBlock block={b} /> : b.type === "table" ? <TableBlock block={b} /> : b.type === "list" ? <ListBlock block={b} /> : b.type === "approval" ? <ApprovalBlock block={b} /> : null}
        </Fragment>
      ))}
    </div>
  );
}

/** Minimal, safe rich text: paragraphs, "- " bullet lists and **bold**. */
export function RichText({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  return (
    <div className="space-y-2.5 text-[14.5px] leading-[1.65]">
      {paragraphs.map((p, i) => {
        const lines = p.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(p)}
          </p>
        );
      })}
    </div>
  );
}
