# API

All routes live under `src/app/api/**`. Authenticated routes use the `route()` wrapper
(`src/lib/api.ts`), which resolves the session cookie, enforces the route's RBAC permission and
per-user rate limit, and maps errors to a consistent shape:

```jsonc
// success
{ "data": … }
// error (4xx/5xx) — never a stack trace
{ "error": { "message": "Can't cancel an order that is delivered", "code": "conflict", "details": … } }
```

Validation errors return `422` with `details: [{ path, message }]`. Mutating requests must be
same-origin (checked in `proxy.ts`); machine endpoints (webhooks, cron, health) are exempt and use
signatures/secrets instead.

## Auth & account

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | name, email, password, storeName → creates store (demo mode) + session |
| POST | `/api/auth/login` | email, password, code? → `{ requires2fa }` |
| POST | `/api/auth/logout` | |
| POST | `/api/account/password` | currentPassword, newPassword (signs out other sessions) |
| POST/DELETE | `/api/account/2fa` | start → `{secret, uri}`; `{code}` confirms; DELETE `{password}` disables |
| GET/DELETE | `/api/account/sessions[/id]` | list / revoke sessions |

## Commerce

| Method | Path | Permission |
|---|---|---|
| GET | `/api/orders?tab=&q=&payment=&sort=&dir=&page=` | orders.view |
| GET | `/api/orders/[id]` | orders.view |
| POST | `/api/orders/[id]/actions` `{action, reason?}` | orders.update (+orders.cancel) |
| POST | `/api/orders/[id]/tags`, `/notes`, `/shipment`, `/risk` | orders.update / view |
| POST | `/api/orders/bulk` `{ids, action, reason?}` | orders.update |
| GET/PATCH | `/api/customers[/id]`, POST `/api/customers/[id]/summary` | customers.* |
| GET/PATCH | `/api/products[/id]` | products.* |
| GET | `/api/inventory?status=&q=&category=`; GET/PATCH `/api/inventory/[variantId]` | inventory.* |

## Conversations & WhatsApp

| Method | Path |
|---|---|
| GET | `/api/conversations?channel=&filter=&q=` |
| GET/PATCH | `/api/conversations/[id]` (handler AI/HUMAN, status, assignee, tags, notes) |
| POST | `/api/conversations/[id]/messages` `{text}` · `/read` · GET `/suggestions` |
| POST | `/api/conversations/simulate` (demo mode only) |
| GET/POST/PATCH | `/api/tickets[/id]` |
| GET/POST | `/api/whatsapp/webhook` (Meta verification + signed events) |
| POST | `/api/whatsapp/send` `{customerId|phone, text|template}` · GET `/api/whatsapp/templates` |

## Shopify

| Method | Path |
|---|---|
| GET | `/api/shopify/install?shop=` → OAuth redirect (state cookie) |
| GET | `/api/shopify/callback` → HMAC + state verify, token exchange, webhook registration, catalog sync |
| POST | `/api/shopify/webhooks` (HMAC-verified, idempotent; includes GDPR topics) |
| POST | `/api/shopify/sync` |

## Meta & marketing

`/api/meta/webhook`, `/api/meta/campaigns[/id]` (PATCH status/budget), `/api/meta/insights`,
`/api/meta/sync`, `/api/meta/creatives` (GET performance, POST multipart upload for AI analysis),
`/api/meta/social`, `/api/meta/comments/[id]/reply`, `/api/meta/leads/[id]`,
`/api/marketing`, `/api/marketing/campaigns` (+`/[id]/send`), `/api/marketing/segments` (+`/preview`),
`/api/marketing/promotions[/id]`.

## Automations

`GET/POST /api/automations` (POST `{templateKey}` or `{name, description, graph}`),
`GET/PUT/DELETE /api/automations/[id]`, `POST /api/automations/[id]/status`,
`POST /api/automations/[id]/run` (manual run), `GET /api/automations/runs`, `DELETE /api/automations/runs/[id]`.

## AI

`POST /api/ai/chat {threadId?, message}`, `GET /api/ai/threads[/id]`, `GET/PATCH /api/ai/agents[/key]`,
`GET/POST /api/ai/insights`, `DELETE /api/ai/insights/[id]`, `GET /api/ai/activity`,
`GET /api/approvals?status=`, `POST /api/approvals/[id]/approve|reject {note?}`.

## Reports, notifications, platform

`GET /api/reports?type=&range=`, `GET /api/reports/export?…&format=csv|pdf`, `GET/POST /api/reports/daily`,
`GET /api/notifications`, `POST /api/notifications/read|archive`, `GET /api/search?q=`, `GET /api/activity?after=`,
`GET /api/shell/counts`, `GET/POST/DELETE /api/integrations[/provider]`, `PATCH /api/settings/general|ai|approvals|risk|notifications|schedules|automation|inventory`,
`POST /api/settings/demo|onboarding`, `GET/POST/PATCH/DELETE /api/team[/id]`, `GET /api/audit`, `GET /api/files/[id]`,
`GET /api/cron/tick` (Bearer `CRON_SECRET`), `GET /api/health`, `POST /api/demo/simulate`.
