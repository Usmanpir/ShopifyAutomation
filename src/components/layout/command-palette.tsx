"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bot, Filter, Inbox, Lightbulb, Loader2, Megaphone, MessagesSquare, Package, Plus, ShoppingBag, Sparkles, User, Workflow, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { useCan } from "@/components/store-context";
import { api } from "@/lib/client/api";
import { looksLikeOrderFilter, parseOrderQuery } from "@/lib/nl-filters";
import type { SearchResult } from "@/services/search.service";
import { ASSISTANT_ITEM, NAV, navVisible } from "./nav";

const TYPE_META: Record<SearchResult["type"], { label: string; icon: typeof ShoppingBag }> = {
  order: { label: "Orders", icon: ShoppingBag },
  customer: { label: "Customers", icon: User },
  product: { label: "Products", icon: Package },
  conversation: { label: "Conversations", icon: MessagesSquare },
  campaign: { label: "Campaigns", icon: Megaphone },
  automation: { label: "Automations", icon: Workflow },
  insight: { label: "AI insights", icon: Lightbulb },
};

type Scope = "customer" | "product" | null;

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * ⌘K / Ctrl K — search everything, ask AI, jump anywhere and run quick
 * actions. Order-like sentences ("high-risk COD orders from Lahore") become
 * an Orders filter.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const can = useCan();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>(null);
  const q = useDebounced(query.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: ({ signal }) => api<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: open && q.length >= 2,
    staleTime: 10_000,
  });

  const close = () => {
    onOpenChange(false);
    setQuery("");
    setScope(null);
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const results = (data ?? []).filter((r) => !scope || r.type === scope);
  const groups = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});
  const pages = NAV.flatMap((s) => s.items).filter((i) => navVisible(i, can));
  const orderFilter = !scope && can("orders.view") && q.length >= 6 && looksLikeOrderFilter(q) ? parseOrderQuery(q) : null;
  const filterHref = orderFilter ? `/orders?${new URLSearchParams({ tab: "all", ...orderFilter.params } as Record<string, string>).toString()}` : null;

  // Keep the highlight on the most useful result as the list changes (Enter runs it).
  const topValue = orderFilter ? `filter:${q}` : q.length >= 2 ? (can("ai.use") && !scope ? `ask:${q}` : results[0] ? `${results[0].type}:${results[0].id}` : "") : scope ? "" : can("ai.use") ? "ask" : "inbox";
  const [highlight, setHighlight] = useState("");
  const [lastTop, setLastTop] = useState("");
  if (topValue !== lastTop) {
    setLastTop(topValue);
    setHighlight(topValue);
  }

  const actions = [
    { key: "ask", label: "Ask AI", icon: Sparkles, tone: "text-ai", run: () => go("/assistant"), show: can("ai.use"), shortcut: "⌘J" },
    { key: "order", label: "Create order", icon: Plus, run: () => go("/orders?create=1"), show: can("orders.update") },
    { key: "find-customer", label: "Find customer", icon: User, run: () => setScope("customer"), show: can("customers.view") },
    { key: "find-product", label: "Find product", icon: Package, run: () => setScope("product"), show: can("products.view") },
    { key: "inbox", label: "Open inbox", icon: Inbox, run: () => go("/conversations"), show: can("conversations.view") },
    { key: "automation", label: "Create automation", icon: Workflow, run: () => go("/automations?create=1"), show: can("automations.manage") },
    { key: "reports", label: "View reports", icon: BarChart3, run: () => go("/reports/daily"), show: can("reports.view") },
    { key: "approvals", label: "Review AI approvals", icon: Bot, run: () => go("/approvals"), show: can("approvals.view") },
  ].filter((a) => a.show);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Search"
      description="Search, ask AI or run an action"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} className="rounded-xl">
        {scope && (
          <div className="flex items-center gap-2 border-b px-3 pt-2.5 pb-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
              {scope === "customer" ? "Customers" : "Products"}
              <button type="button" onClick={() => setScope(null)} aria-label="Search everything" className="rounded-full hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
            <span className="text-muted-foreground">Type a name{scope === "customer" ? ", phone or city" : " or SKU"}</span>
          </div>
        )}
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={scope === "customer" ? "Find a customer…" : scope === "product" ? "Find a product…" : "Search, ask AI, or try “high-risk COD orders in Lahore”"}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && scope) setScope(null);
          }}
        />
        <CommandList className="max-h-[min(60vh,460px)]">
          {q.length >= 2 && !isFetching && !results.length && !orderFilter && <CommandEmpty>No results for “{q}”.</CommandEmpty>}
          {orderFilter && filterHref && (
            <CommandGroup heading="Filter orders">
              <CommandItem value={`filter:${q}`} onSelect={() => go(filterHref)}>
                <Filter className="text-primary" />
                <span className="flex min-w-0 flex-wrap gap-1">
                  {orderFilter.chips.map((c) => (
                    <span key={c.param} className="rounded-full border px-1.5 text-[11.5px]">
                      {c.label}
                    </span>
                  ))}
                </span>
              </CommandItem>
            </CommandGroup>
          )}
          {q.length >= 2 && !scope && can("ai.use") && (
            <CommandGroup heading="Ask AI">
              <CommandItem value={`ask:${q}`} onSelect={() => go(`/assistant?q=${encodeURIComponent(q)}`)}>
                <Sparkles className="text-ai" />
                <span className="truncate">
                  Ask: <span className="font-medium">{q}</span>
                </span>
                {isFetching && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
              </CommandItem>
            </CommandGroup>
          )}
          {Object.entries(groups).map(([type, rows]) => {
            const meta = TYPE_META[type as SearchResult["type"]];
            return (
              <CommandGroup key={type} heading={meta.label}>
                {rows.map((r) => (
                  <CommandItem key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`} onSelect={() => go(r.href)}>
                    <meta.icon className="text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          {q.length < 2 && !scope && (
            <>
              <CommandGroup heading="Quick actions">
                {actions.map((a) => (
                  <CommandItem key={a.key} value={a.key} onSelect={a.run}>
                    <a.icon className={a.tone ?? "text-muted-foreground"} />
                    {a.label}
                    {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Go to">
                {pages.map((p) => (
                  <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                    <p.icon className="text-muted-foreground" />
                    {p.label}
                  </CommandItem>
                ))}
                {can("ai.use") && (
                  <CommandItem value={ASSISTANT_ITEM.href} onSelect={() => go(ASSISTANT_ITEM.href)}>
                    <Sparkles className="text-ai" />
                    AI Assistant
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
