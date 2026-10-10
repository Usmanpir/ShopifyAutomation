# UI Conventions

How pages and components are built in CommerceAI. Reference implementations:
`src/app/(app)/dashboard/page.tsx`, `src/app/(app)/orders/page.tsx`, `src/features/orders/orders-table.tsx`.

## Stack & framework rules (Next.js 16)

- App Router. `params` and `searchParams` are **Promises** — `await` them. Type pages with the global helpers:
  `export default async function Page({ params, searchParams }: PageProps<"/orders/[id]">)`.
  Route handlers: `RouteContext<"/api/x/[id]">`. Run `npx next typegen` after adding routes.
- `proxy.ts` (formerly middleware) does optimistic auth + CSRF origin checks only.
- Tailwind CSS v4, shadcn/ui (Radix, "nova" style) in `src/components/ui/*`, icons from `lucide-react`.

## Page anatomy (server components by default)

```tsx
export const metadata = { title: "Customers" };
export default async function Page({ searchParams }: PageProps<"/customers">) {
  const auth = await requireAuth("customers.view");          // RBAC + redirect
  const q = customerListQuery.parse(await searchParams);       // Zod-parse URL state
  const data = await listCustomers(auth.store.id, q);          // call SERVICES directly
  return (
    <PageContainer>
      <PageHeader title="Customers" description="…" actions={…} />
      …
      <CustomersTable rows={JSON.parse(JSON.stringify(data.items))} />  {/* serialize Dates for client */}
    </PageContainer>
  );
}
```

- Every route folder gets a `loading.tsx` using skeletons from `@/components/shared/skeletons`
  (`ListPageSkeleton`, `KpiSkeleton`, `ChartSkeleton`, `CardSkeleton`, `TableSkeleton`, `Bone`).
- Use `notFound()` from `next/navigation` when a service throws a 404 for detail pages (catch `AppError` with status 404).
- Hide actions the role can't perform: server side `can(auth.role, "perm")`, client side `useCan()`.
  The server re-checks every mutation — UI hiding is only UX.
- Money/dates on the server: `const f = makeFormatter(auth.store)` → `f.money(minor)`, `f.date(d)`, `f.dateTime(d)`.
  On the client: `const f = useFormat()`. **Never** hard-code "Rs." or a currency — amounts are integer minor units.

## Client components

- Put interactive pieces in `src/features/<feature>/*.tsx` with `"use client"`.
- **Never import `@/lib/db`, services, or anything server-only into a client file.** `import type` from services is fine.
  Shared Zod schemas live in `src/schemas/*`.
- Mutations: `api(path, { method, body })` from `@/lib/client/api`, then `toast.success/error` (sonner) and `router.refresh()`.
  Use TanStack Query `useMutation` for pending state; `useQuery` for polling/live data.
- URL state controls (`@/components/shared/url-controls`): `FilterTabs`, `SearchInput`, `RangeSelect`, `SelectFilter`,
  `Pagination`, `useUrlState()`.
- Tables: `DataTable` (`@/components/shared/data-table`) — columns with `cell`, `sortKey`, `align`, `hideBelow`;
  `rowHref`, `mobileCard`, optional selection. Always provide `empty` and `mobileCard`.

## Shared components

| Import | Use |
|---|---|
| `@/components/shared/page` | `PageContainer`, `PageHeader` (title, description, actions, crumbs), `SectionCard` (titled card), `DefinitionList` |
| `@/components/shared/kpi-card` | `KpiCard` (label, value string, change %, comparison, spark[], invert) |
| `@/components/shared/status` | `StatusPill tone=…`, `Pill map={ORDER_STATUS…} value`, `RiskBadge`, `SegmentBadge`, maps: ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHOD, FULFILLMENT_STATUS, CONFIRMATION_STATUS, SHIPMENT_STATUS, CAMPAIGN_STATUS, TICKET_STATUS, PRIORITY, DECISION_STATUS, RUN_STATUS |
| `@/components/shared/states` | `EmptyState` (icon, title, description, action), `ErrorState` (onRetry, lastSuccess, reassure — "Your data is safe") |
| `@/components/shared/insight-card` | `InsightCard` — AI recommendation: what happened + action up front, why/evidence behind "Why?" |
| `@/components/shared/explain` | `WhyButton explain={{what, why, todo, evidence, method}}` (the "Why?" reveal used on every AI item), `ExplainBody`, `ConfidenceBadge value` (renders nothing unless confidence is real) |
| `@/components/shared/attention-card` | `AttentionCard item={PriorityItem}` — one ranked thing to act on (impact, urgency, one primary action, Why?) |
| `@/components/shared/drawer` | `Drawer` — side panel (bottom sheet on phones) for previews and quick edits; footer = actions, primary on the right |
| `@/components/shared/data-table` | add `columnsKey` (Columns menu, remembered), `defaultHidden` on columns, `stickyHeader`, `rowActions`, `toolbar` |
| `@/components/layout/area-tabs` | `AreaTabs area="products" | "marketing" | "ai" | "analytics"` — second-level nav that folds older pages under one sidebar item |
| `@/components/shared/product-image` | `ProductImage src alt className` — handles demo `swatch:` URLs |
| `@/components/shared/confirm-dialog` | `ConfirmDialog` — consequential actions, optional required reason |
| `@/components/shared/notification-icon` | `NotificationIcon type severity` |
| `@/components/charts/charts` | `TrendChart`, `HBarChart`, `ColumnChart`, `DonutChart`, `ChartLegend`, `SERIES_COLORS` |
| `@/components/store-context` | `useStore()`, `useCan()`, `useFormat()` |
| `@/features/agents/activity-timeline` | `ActivityTimeline` — live AI activity feed |
| `@/features/approvals/use-decision` | `useDecisionActions()` approve/reject |

shadcn/ui available: accordion, alert, alert-dialog, avatar, badge, breadcrumb, button (variants default/outline/secondary/ghost/destructive/link; sizes xs/sm/default/lg/icon/icon-sm…), calendar, card, checkbox, collapsible, command, dialog, dropdown-menu, hover-card, input, input-group, label, pagination, popover, progress, radio-group, scroll-area, select (SelectTrigger has `size="sm"`), separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

## Action hierarchy & AI rules

- **One primary action per screen or card.** Secondary actions are outline/ghost; dangerous ones (cancel, delete, block) are
  ghost + danger colour, separated by a divider or tucked into a menu, and always confirmed (`ConfirmDialog`).
- **Preview before any mass action.** Bulk actions open a `Drawer` listing exactly which records change and what happens;
  ineligible rows are named, not silently skipped.
- **Every AI item answers What / Why / What should I do**, with the data behind it, via `WhyButton`.
- **Confidence only when it's real** (from a model or a measured rate). Rule outputs and counted facts never get a percentage —
  `AIDecision.confidence` is nullable for this reason.
- **Owner language.** Agents appear as the AI Team (`friendlyAgentName` / `friendlyNameFromLabel` in `@/lib/ai/team`):
  Order Assistant, Customer Assistant, Inventory Assistant, Marketing Assistant, Business Analyst.
- **Ranked attention.** Lists of "things to do" come from the Priority Engine (`priorityQueue`), never ad-hoc counts.

## Visual language

- Tokens only — no raw hex/Tailwind palette colors in components. Surfaces: `bg-background`, `bg-card`, `bg-surface-2`, `bg-muted`.
  Text: `text-foreground`, `text-muted-foreground`. Roles: `primary`, `brand`, `electric`, `success`, `warning`, `danger`, `info`, `ai`
  each with a `-soft` background (e.g. `bg-success-soft text-success`). AI surfaces: `bg-ai-gradient`, `text-ai`.
- Cards: `rounded-xl border bg-card` (use `SectionCard`). Gaps `gap-4` between cards, `space-y-6` between page sections.
- Type scale: page title `text-[22px] sm:text-2xl font-semibold tracking-tight`; section title `text-[15px] font-semibold`;
  body `text-sm`; meta `text-xs text-muted-foreground`. Numbers in tables: `tabular`.
- Status is never color-only: pills have text (+dot), risk has icon + label.
- Charts: one y-axis per chart; fixed series colors from `SERIES_COLORS` in order; legend for ≥2 series; tooltips on.
- Motion: subtle only (`animate-fade-in`, `animate-slide-in`). Respect reduced motion (global CSS handles it).

## Responsive & accessibility

- Design mobile first: stack columns (`grid gap-4 lg:grid-cols-3`), tables become cards (`mobileCard`),
  filters scroll horizontally, primary actions remain reachable. Bottom nav occupies 64px on mobile (`main` already has `pb-20`).
- Semantic headings, `aria-label` on icon-only buttons, labels for inputs, `role="alert"` for errors, keyboard-reachable everything.
- Dark mode is automatic via tokens — verify both themes.

## Visual QA

With the dev server running: `node scripts/screenshot.mjs http://localhost:3001 <outDir> /route1 /route2` captures desktop
light/dark + mobile screenshots (logged in as the demo owner) and prints browser console errors.
