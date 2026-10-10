# Architecture

## Layers

```
src/
  app/                 Next.js routes — pages (server components) and API route handlers (thin)
  components/          ui/ (shadcn), shared/ (design-system pieces), layout/ (shell), charts/
  features/<area>/     client components per feature (tables, forms, inbox, builder…)
  services/            business logic — framework-independent, used by routes, workers, AI tools
  lib/
    ai/                provider abstraction, tool registry + guarded executor, intents, agents
    automation/        pure workflow engine, catalog, validation, templates
    shopify/ whatsapp/ meta/ courier/ commerce/   provider adapters (real + demo)
    events/            domain event catalogue + publish
    queue/             BullMQ queue, typed jobs, handlers (inline fallback)
    auth/ rbac.ts crypto.ts rate-limit.ts audit.ts api.ts …
  schemas/             Zod schemas shared by client and server
  workers/             worker entry (BullMQ)
prisma/                schema, migrations, seed
tests/                 unit + integration (Vitest)
```

**Rules**

- Route handlers only do auth/RBAC/validation via `route()` (`src/lib/api.ts`) and call a service.
- Services take a `ServiceContext { storeId, actor }` so the same code runs for a human, an AI agent,
  an automation, or a webhook — and every mutation is audit-logged with the right actor.
- Pages are server components that call services directly (fast SSR, no client waterfalls);
  interactive islands are client components that mutate through the API and `router.refresh()`.
- Providers (Shopify, WhatsApp, Meta Ads, courier, AI) sit behind interfaces with demo implementations,
  so the UI never depends on a vendor and the app always works.

## Event-driven flow

```
Shopify ──webhook──▶ /api/shopify/webhooks ── verify HMAC ──▶ WebhookEvent (idempotent)
                                                               │ enqueue webhook.process
                                                               ▼
                                                     worker → shopify.service → order.service.ingestOrder
                                                               │
                         ┌─────────────────────────────────────┼───────────────────────────┐
                         ▼                                     ▼                           ▼
              order.analyze (AI risk)              publishEvent(ORDER_CREATED)     inventory decrement /
              → AIDecision if HIGH                 → DomainEvent (activity feed)   INVENTORY_LOW events
                                                   → automation.dispatch
                                                               ▼
                                                  automation engine (per active workflow)
                                                  → actions via services (WhatsApp, tags, tickets…)
                                                  → WAIT persists resumeAt; scheduler tick resumes
                                                  → APPROVAL creates AIDecision; approve/reject resumes
```

Domain events (`src/lib/events/types.ts`): `ORDER_CREATED, ORDER_CONFIRMED, ORDER_DECLINED,
ORDER_CANCELLED, ORDER_FULFILLED, ORDER_DELIVERED, ORDER_RETURNED, ORDER_HIGH_RISK, CUSTOMER_CREATED,
CUSTOMER_INACTIVE, CUSTOMER_MESSAGE_RECEIVED, HUMAN_HANDOFF_REQUESTED, INVENTORY_LOW, INVENTORY_OUT,
SHIPMENT_CREATED, SHIPMENT_UPDATED, META_LEAD_RECEIVED, CAMPAIGN_UPDATED, AUTOMATION_TRIGGERED,
AI_DECISION_CREATED, SCHEDULED`.

## Background jobs

`src/lib/queue/jobs.ts` defines typed jobs; `handlers.ts` maps them to services. `enqueue()` uses
BullMQ when `REDIS_URL` is set (retries with exponential backoff, dedupe via job ids) and falls back to
running the job inline otherwise — or when Redis is unreachable — so nothing is dropped.

Long waits are **not** delayed jobs: an `AutomationRun` stores `status=WAITING` + `resumeAt`, and the
every-minute `scheduler.tick` resumes due runs. That makes waits durable across deploys and works
identically with or without a worker.

`scheduler.tick` also evaluates each store's **configurable cron schedules** (Settings → Automation) in
the store's timezone: daily report, inventory analysis, customer segmentation, analytics sync, courier
tracking, AI insights, stale-confirmation follow-up — plus the demo simulator for demo stores.

## Demo mode

`Store.demoMode` switches providers to demo implementations: WhatsApp sends are recorded and marked
delivered, Shopify write-backs and Meta mutations are no-ops, the courier simulates tracking, and the
AI runs on the built-in rules provider unless a key is configured. The **demo simulator** generates new
orders, customer replies and today's ad spend every few minutes through the *real* pipeline.

## AI architecture

See [AI_AGENTS.md](AI_AGENTS.md). In short: `AIProvider` (OpenAI / Anthropic / Gemini / local rules)
offers `generateObject` (schema-validated JSON) and `runTools` (tool loop). Actions are never parsed
from free text — they are tool calls validated by Zod, authorized against the agent's allow-list and
the user's RBAC, routed to the Approval Center when sensitive, executed by services and audit-logged.

## AI Command Center (owner-facing layer)

Built on the same services, so every figure is a query result:

| Piece | Where | What it does |
|---|---|---|
| Priority Engine | `lib/priority.ts` (pure scoring) + `services/priority.service.ts` | Collects open problems (COD backlog, high-risk orders, approvals, handoffs, late dispatch, tickets, failed runs, stock-outs, ads below break-even), prices them in money at stake vs an average day of revenue, scores `0.5·impact + 0.35·urgency + 0.15·certainty`, filters by role. `GET /api/priorities` |
| Home | `services/home.service.ts` | "Today so far" vs same time yesterday, morning briefing (from `revenueDrivers` + overnight AI work), Store Health (one measured number per area), AI Team status |
| Let AI handle | `services/confirmation-assist.service.ts` | Previews which COD customers get a confirmation (high risk / no phone excluded), then runs each through `runTool` after the user confirms. `GET/POST /api/orders/confirmations` |
| Natural-language filters | `lib/nl-filters.ts` | Deterministic sentence → order filters + chips (Orders page and ⌘K) |
| Marketing advisor | `lib/marketing-advice.ts` + `services/marketing-advisor.service.ts` | Week-over-week campaign advice vs break-even ROAS (1 / gross margin); "grow" only after two profitable weeks with ≥10 purchases |
| Popular automations & wizard | `services/popular-automations.service.ts`, `lib/automation/recipes.ts` | One switch per common automation (templates + built-ins: WhatsApp auto-reply, daily report); wizard recipes compile to normal graphs |
| Trust Center | `services/trust.service.ts` | Generated from the tool registry and approval rules |
| Inbox AI mode | `Conversation.aiMode` (MANUAL/SUGGEST/AUTO) + `lastMessageDirection` | AUTO answers only `settings.ai.autoReplyIntents`; SUGGEST drafts replies for a person |
| Notifications | `notify()` suppresses repeats (6 h); `lib/notification-groups.ts` groups Urgent/Important/Info |

## Charts

Charts use a validated categorical palette (CVD-safe adjacent pairs, separately stepped for dark mode;
tokens `--chart-1…8` in `globals.css`), one y-axis per chart, legends for ≥2 series, and tooltips.
