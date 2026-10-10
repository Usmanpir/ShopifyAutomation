# CommerceAI — AI Command Center upgrade

This document records the UX audit of the v1 application and the plan used
to turn it into an AI-first command center for a non-technical store owner.
Principle: **the user should not have to figure out what to do — the AI says
what is happening and which action is available.**

## 1. Audit (v1)

| Area | Problem |
| --- | --- |
| Navigation | 16 primary items in 4 sections (Dashboard, Orders, Customers, Products, Inventory, Conversations, WhatsApp, Marketing, Meta Ads, Automations, AI Agents, Approvals, Analytics, Reports, Integrations, Settings). Inventory/Products, Conversations/WhatsApp, Marketing/Meta Ads, Analytics/Reports and AI Agents/Approvals are split concepts the owner has to know about. |
| Dashboard | 8 KPI tiles of equal weight, then a chart, an un-ranked "needs attention" count list, 4 insight cards, live activity, approvals, top products and recent orders — 9 sections, no single "do this first". |
| Needs attention | Counts only (no value at stake, no age, no reason). Every item has the same weight — a failed automation looks as important as Rs 400k of unconfirmed COD orders. |
| AI explanations | Insight cards show What/Why but approvals created by the tool gate carry a hard-coded 75 % confidence that is shown to the user as if it were real. |
| Orders | 10 status tabs; the owner must know that "pending confirmation" + "high risk" + "confirmed but not shipped" are the things to work on. No "today" view, no natural-language filtering, no summary on the order page. |
| Inbox | Filters are system concepts (AI / Human / Mine / Unread). The owner thinks in "needs reply / waiting / resolved". No order number in the list; no per-conversation control over what the AI may do. |
| Customers | Profile shows data but no "what should I do with this customer". No offer creation. |
| Products / inventory | Stock coverage exists on the inventory page, but product pages lack sales trend, forecast and cross-sell. |
| Marketing | Two places (Marketing, Meta Ads) with 4 + 4 tabs. No single "is advertising working?" answer. |
| Automations | Builder-first. Templates exist but turning a common automation on takes 3 screens. |
| AI | Agents use internal names ("WhatsApp Agent", "Ads Agent"). No explanation of what AI may and may not do on its own. Knowledge base is buried in agent settings. |
| Notifications | Flat list; repeated notifications (e.g. 12 × "Low stock") are listed one by one. |
| Shell | No global "create" action; command palette has search + Ask AI only. |
| Onboarding | Connect-first; never asks which work the owner wants the AI to take over. |

## 2. Plan

1. **Design system** — `AttentionCard`, `WhyExplainer` (What / Why / What should I do + evidence), `ConfidenceBadge` (renders nothing unless confidence is real), `ActivityTimeline`, `Drawer`, `ApprovalCard`, `StoreHealth`, `FilterChips`. Existing `PageHeader`, `KpiCard` (StatCard), `StatusPill`, `RiskBadge`, `EmptyState`, `ErrorState`, skeletons and `DataTable` are reused.
2. **Navigation** — Home · Orders · Customers · Inbox · Products · Marketing · Automations · AI, then Analytics · Settings, then AI Assistant. Old routes stay live and highlight their parent (Inventory → Products, WhatsApp → Inbox, Meta Ads → Marketing, Reports → Analytics, Agents/Approvals → AI, Integrations → Settings). Secondary areas are reached through in-page tabs.
3. **Priority engine** (`src/services/priority.service.ts`) — every attention item is computed from live data with an **impact** (money at stake, minor units), **urgency** (age / deadline), optional **confidence** (only when it comes from a model or a measured rate) and a **required action**. Score = 0.5·impact + 0.35·urgency + 0.15·confidence. Each item carries its own explanation and evidence.
4. **Home** — greeting + one-sentence "Today" summary, AI morning briefing (Review now / Read more / Ask AI / Dismiss), 5 KPIs (Revenue, Orders, Ad Spend, ROAS, Profit), ranked Needs Attention with one-click actions, Store Health, AI Team activity, revenue trend, top products.
5. **Let AI handle** — safe bulk work (sending COD confirmation requests to low-risk orders) shows a preview of exactly which orders/customers are affected before running; high-risk orders are excluded and routed to review.
6. **Orders** — task tabs (Needs attention · All · Processing · Shipped · Delivered · Returns), today strip, natural-language filter → chips, column visibility, AI order summary on the order page.
7. **Inbox** — Needs reply · Waiting · AI handling · Human handling · Resolved; order number per conversation; per-conversation AI mode (Manual / Suggestions / Automatic); reply suggestions with Send / Edit.
8. **Customers** — Customer intelligence (value, habits, risk, next best action) with Message · View orders · Create offer.
9. **Products** — sales trend, stock forecast with days of cover, cross-sell from real co-purchases.
10. **Marketing** — one overview: revenue from ads, spend, ROAS, best campaign, needs attention; evidence-based recommendations (never "spend more" without stable ROAS above target); Marketing Copilot. Meta Ads becomes a tab.
11. **Automations** — Popular automations with on/off switches (including the daily business report), a 5-step wizard, builder kept as the Advanced editor.
12. **AI Team** (`/ai`) — friendly assistants with status/tasks/last activity, approvals, activity feed, Trust Center (generated from the tool registry), Knowledge Base.
13. **Approval Center** — impact, value at stake and real confidence only.
14. **Notifications** — grouped Urgent / Important / Info, repeats aggregated.
15. **Shell** — "+" quick-create menu; command palette actions (Create order, Find customer/product, Open inbox, Create automation, View reports).
16. **Onboarding 2.0** — "Which tasks should AI handle?" → Activate AI Team.

Guardrails kept: sensitive tools still go through `runTool()` and approvals; no
automatic cancellation; no invented numbers (every figure on screen comes from
a query); no routes or APIs removed.

## 3. What changed (delivered)

| Area | Change |
| --- | --- |
| Navigation | 16 items → 8 + Analytics/Settings + AI Assistant. `AreaTabs` connect the folded pages; `/agents` redirects to `/ai`. Global “+” quick-create; ⌘K has quick actions, Find customer/product scopes and plain-language order filters. |
| Home | Briefing card, 5 KPIs, Priority-Engine “Needs attention”, Store Health, AI Team, revenue, best sellers, de-duplicated AI insights. |
| Orders | Task tabs (Needs attention default when there is work), today strip, plain-language filter → chips, Columns menu + sticky header + row actions, preview drawer for every bulk action, “Let AI confirm COD orders”, AI order summary whose next step drives the one primary button. |
| Inbox | Needs reply / Waiting / AI handling / Human handling / Resolved with counts, order number on every row, per-chat AI mode, drafts that load by themselves with Send / Edit; taking over keeps a chat in Needs reply until someone answers. |
| Customers | Message · View orders · Create offer (single-use code, optionally sent on WhatsApp); insight generated on first view. |
| Products | Catalog + Inventory under one area, product intelligence (14-day trend, bought-together ≥10 % of orders), forecast drawer per variant, trend arrows. |
| Marketing | One overview (ad revenue, spend, ROAS vs break-even, best campaign, needs attention, evidence-based advice, Copilot); Meta Ads as a tab. |
| Automations | Popular (8 one-switch automations incl. daily report and WhatsApp auto-reply), 5-step wizard, Advanced editor kept. |
| AI | AI Team, Approvals (with money/people at stake), Activity, Knowledge Base (CRUD + custom instructions), Trust Center. |
| Notifications | Repeats suppressed for 6 h; popover grouped Urgent / Important / Info with similar alerts collapsed. |
| Onboarding | “Which tasks should AI handle?” → Activate AI Team. |
| Trust | `AIDecision.confidence` nullable — placeholder percentages removed everywhere; awareness campaigns no longer judged on ROAS. |

Schema changes (additive, with backfill): `Conversation.aiMode`, `Conversation.lastMessageDirection`, nullable `AIDecision.confidence`, knowledge category `RETURNS`.

### Scenarios verified in a real browser

1. Morning check — briefing, ranked attention, “Why?” shows the data and the ranking formula.
2. “high-risk COD orders from Karachi in the last 30 days” → filters + chips.
3. ⌘K → “cod orders in lahore” → Enter opens the filtered Orders list.
4. Inbox → Needs reply → switch AI mode to Suggestions → drafts appear with Send / Edit.
5. Inventory → View forecast → 30-day sales, days left, run-out date, reorder size.
6. Automations → wizard → review shows plain-language steps and the safety note.
7. AI → approvals → each card shows what's at stake.
8. Customer → Create offer drawer.
9. Notifications grouped by priority.

Plus: 99 automated tests (unit + integration against `commerceai_test`), typecheck, lint, production build, and
66 screenshots (22 routes × desktop light/dark + mobile) with no console errors.
