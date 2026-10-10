# Database

PostgreSQL via Prisma 7 (`prisma/schema.prisma`, driver adapter `@prisma/adapter-pg`, client generated
to `src/generated/prisma`). Configuration lives in `prisma.config.ts`.

## Conventions

- **Multi-tenant**: every tenant row has `storeId` (indexed, `onDelete: Cascade`). Users join stores via `Membership(role)`.
- **Money** is stored as **integer minor units** (paisa for PKR). No floats, no Decimal serialization issues.
  Currency, locale and timezone are per store. Format with `src/lib/money.ts` / `makeFormatter`.
- `externalId` = id in the upstream system (Shopify, Meta). Unique per store → idempotent upserts.
- Soft deletes (`deletedAt`) on User, Customer, Product, Automation.
- Flexible-but-typed JSON: `Store.settings` (validated by `src/schemas/store-settings.ts` with defaults),
  `Order.riskSignals`, `AIDecision.evidence`, `Customer.aiSummary`, `CreativeAsset.analysis`.
- Secrets are stored **encrypted** (`ShopifyConnection.accessTokenEnc`, `Integration.credentialsEnc`, `User.twoFactorSecret`).

## Model groups

| Group | Models |
|---|---|
| Identity | User, Session, Membership (Role enum), Store |
| Integrations | ShopifyConnection, Integration, WebhookEvent (unique `provider+externalId` for idempotency) |
| Customers | Customer, CustomerSegment, CustomerSegmentMember, CustomerEvent |
| Catalog | ProductCategory, Product, ProductVariant, InventorySnapshot |
| Orders | Order, OrderItem, OrderEvent (timeline), Shipment, TrackingEvent |
| Conversations | Conversation (unique `storeId+channel+externalThreadId`), Message, ConversationTag, MessageTemplate, SupportTicket |
| Meta | MetaAccount, Campaign, AdSet, Ad, AdInsight (daily, `level+entityId+date`), CreativeAsset, MetaLead, SocialComment |
| Marketing | MarketingCampaign, Promotion |
| Automations | Automation, AutomationNode, AutomationEdge, AutomationRun (unique `automationId+dedupeKey`) |
| AI | AIAgent, AITask, AIDecision (approvals), AIInsight, KnowledgeArticle, AIChatThread, AIChatMessage |
| System | Notification (per recipient), AuditLog, DomainEvent, Report, StoreDailyMetric, FileBlob |

Why `Role` is an enum + code matrix rather than a table: permissions are enforced in code
(`src/lib/rbac.ts`) where they're type-checked and reviewed; a DB-driven custom-role editor can be
layered on later without changing call sites (`can(role, permission)`).

## Key indexes

Orders by `(storeId, placedAt)`, `(storeId, status)`, `(storeId, riskLevel)`, `(storeId, phone)`;
messages by `(conversationId, createdAt)`; runs by `(status, resumeAt)` for the scheduler; insights by
`(storeId, level, date)`; audit by `(storeId, createdAt)` and `(storeId, resourceType, resourceId)`.

## Commands

```bash
npm run db:migrate     # create/apply a migration in development
npm run db:deploy      # apply migrations in production
npm run db:seed        # (re)create the demo store — idempotent
npm run db:reset       # drop, migrate and seed
npm run db:studio      # browse data
```

Analytics aggregate with timezone-aware SQL (`AT TIME ZONE <store tz>`) in `analytics.service.ts`;
date-only tables (`AdInsight.date`, `StoreDailyMetric.date`) store the store-local calendar day.
