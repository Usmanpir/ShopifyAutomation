# Integrations

Every integration has a provider interface, a real implementation, and a demo implementation. Without
credentials the app keeps working in demo mode. Credentials entered in **Integrations** are tested
against the provider, encrypted (AES-256-GCM) and never sent back to the browser (only masked values).

Webhook endpoints (replace with your `APP_URL`):

| Provider | URL |
|---|---|
| Shopify | `https://<app>/api/shopify/webhooks` (registered automatically on install) |
| WhatsApp Cloud API | `https://<app>/api/whatsapp/webhook` |
| Facebook / Instagram | `https://<app>/api/meta/webhook` |

## Shopify

1. Create an app in the Shopify Partner dashboard. Redirect URL: `https://<app>/api/shopify/callback`.
2. Set `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` (and optionally `SHOPIFY_WEBHOOK_SECRET`), `SHOPIFY_SCOPES`, `SHOPIFY_API_VERSION`.
3. Configure the mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) to the same webhook URL.
4. In CommerceAI → Integrations → Shopify → enter `your-store.myshopify.com`.

Flow: `/api/shopify/install` stores a signed state cookie → Shopify consent → `/api/shopify/callback`
verifies the HMAC and state, exchanges the code for an offline token, encrypts it, registers webhooks
via GraphQL (`webhookSubscriptionCreate`) and backfills the catalog (GraphQL `products`).

Webhooks handled: `orders/create|updated|cancelled|fulfilled|paid`, `refunds/create`,
`fulfillments/create|update`, `products/create|update|delete`, `inventory_levels/update`,
`customers/create|update`, `app/uninstalled`, plus the GDPR topics (customer redaction anonymizes PII).
Each delivery is verified (`X-Shopify-Hmac-Sha256` over the raw body), stored with its
`X-Shopify-Webhook-Id` for idempotency, queued and processed by the worker. Status changes made in
CommerceAI are mirrored back (order tags, cancellations) through `CommerceProvider`.

## WhatsApp (Meta Cloud API)

1. Meta Developer app → WhatsApp product → get a **permanent system-user token** and the **phone number ID**.
2. Webhook: callback `https://<app>/api/whatsapp/webhook`, verify token = `META_WEBHOOK_VERIFY_TOKEN`; subscribe to `messages`. Set `META_APP_SECRET` (used to verify `X-Hub-Signature-256`).
3. Create message templates in WhatsApp Manager matching the ones in Settings (`order_confirmation`, `order_confirmation_reminder`, `shipment_tracking`, `review_request`), or edit `DEFAULT_TEMPLATES`.
4. Connect in Integrations → WhatsApp (token + phone number ID) or set `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`.

`MessagingProvider` (`src/lib/whatsapp/types.ts`) abstracts the vendor; swap in a BSP by implementing
`sendText`, `sendTemplate`, `sendMedia`, `markRead`. Inbound messages, delivery and read statuses are
processed from the webhook; all messages are stored.

## Meta (Facebook Page, Instagram, Meta Ads)

- **Ads**: connect a system-user token with `ads_read` (and `ads_management` for budget/status changes) and the ad account id (`act_…`). `MetaGraphAdsProvider` pulls campaigns, ad sets, ads and daily ad-level insights (purchases & revenue de-duplicated across action types) and rolls them up to ad set and campaign level. Requests include `appsecret_proof`.
- **Page / Instagram**: page access token + page id; subscribe the page to `messages`, `feed` and `leadgen`. Messages land in the unified inbox; comments and leads appear under Meta Ads → Social.

## Courier

`CourierProvider` (`createShipment`, `getTracking`, `getStatus`, `cancelShipment`) with `demo` and
`manual` implementations registered in `src/lib/courier/registry.ts`. To add a courier (TCS, Leopards,
PostEx, Trax…), implement the interface and register it — nothing else changes. Tracking is refreshed
by the `courierTracking` schedule; delivered shipments move orders to Delivered automatically.

## AI providers

Add keys in Integrations (per store, encrypted) or via `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` /
`GEMINI_API_KEY`, then pick the provider and model in Settings → AI. See [AI_AGENTS.md](AI_AGENTS.md).
