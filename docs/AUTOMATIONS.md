# Automations

Workflows are graphs of nodes and edges (`AutomationNode`, `AutomationEdge`) started by a domain event.

## Nodes

| Type | Config | Outgoing handles |
|---|---|---|
| TRIGGER | `event` (e.g. `ORDER_CREATED`), optional `filters` | `next` |
| CONDITION | `match: all|any`, `rules: [{field, operator, value}]` | `true`, `false` |
| ACTION | `action` (catalog key) + `params` | `next` |
| WAIT | `amount`, `unit: minutes|hours|days` | `next` |
| AI_DECISION | `question`, `outcomes[]`, `defaultOutcome` | one per outcome |
| APPROVAL | `title`, `summary`, `risk` | `approved`, `rejected` |
| NOTIFICATION | `title`, `body`, `severity`, `roles` | `next` |

Fields available to conditions (`CONDITION_FIELDS`): order payment method/status/confirmation/risk/total/
city, customer orders/days since last order/risk/tags, variant stock, shipment status. Text supports
`{{order.name}}`, `{{customer.firstName}}`, `{{variant.displayName}}` placeholders.

Actions (`src/lib/automation/catalog.ts`): request order confirmation, confirmation reminder, send
WhatsApp message, send tracking update, request review, update order status (cancellation is always
routed to approval), tag order, create manual review, book shipment, create support ticket, add
customer to segment, recommend win-back campaign, AI inventory analysis.

## Engine

`src/lib/automation/engine.ts` is pure and dependency-injected (`EngineDeps`), so it is fully unit
tested. `automation.service.ts` supplies real dependencies:

- Conditions re-load **fresh** entity state (an order confirmed during a 2-hour wait is seen as confirmed).
- WAIT stores `status=WAITING` + `resumeAt`; the minute scheduler resumes due runs (durable, worker-optional).
- APPROVAL creates an `AIDecision` linked to the run; approve/reject/expiry resumes the right branch.
- AI_DECISION asks the configured AI provider for a structured outcome with reasoning (rules fallback).
- Runs are idempotent per event (`dedupeKey`), capped by `maxRunsPerHour`, and protected from loops (validation + step limit).
- Failures stop the run with a readable error, notify admins and appear in the run history.

## Templates

COD order confirmation (WhatsApp → wait 2h → reminder → wait 12h → manual review), shipment tracking
notification, post-delivery review request (wait 3 days), low inventory alert (AI analysis + admin
notification), inactive customer win-back (segment + campaign recommendation), high-risk order review
(AI decision + manager approval). Install from Automations → Templates.

## Validation

`validateGraph` checks: exactly one trigger connected to a step, valid node configs, known actions,
edges to existing nodes, no self-links or cycles, reachability warnings. Active workflows can't be
saved or activated with errors.

## Manual & test runs

`POST /api/automations/[id]/run` runs a workflow against a chosen entity (or the most recent matching
one) and returns its steps — used by the builder's **Test run** button.
