# Deployment

Recommended: **Vercel** (web + API) · managed **PostgreSQL** (Neon, Supabase, RDS) · **Upstash Redis**
(or any Redis) · a small container for the **worker** (Railway, Fly.io, Render, ECS).

## 1. Database

Create a Postgres database and set `DATABASE_URL`. Migrations run during the Vercel build
(`vercel.json` → `prisma migrate deploy && next build`). Optionally seed a demo store once with
`npm run db:seed` (don't seed real production stores).

## 2. Environment variables

Set these in Vercel (Production + Preview) and on the worker — see `.env.example`:

```
DATABASE_URL   REDIS_URL   APP_URL   NEXT_PUBLIC_APP_NAME
AUTH_SECRET    ENCRYPTION_KEY   CRON_SECRET
SHOPIFY_CLIENT_ID   SHOPIFY_CLIENT_SECRET   SHOPIFY_WEBHOOK_SECRET   SHOPIFY_API_VERSION   SHOPIFY_SCOPES
META_APP_ID   META_APP_SECRET   META_WEBHOOK_VERIFY_TOKEN   META_GRAPH_VERSION
WHATSAPP_ACCESS_TOKEN   WHATSAPP_PHONE_NUMBER_ID   WHATSAPP_BUSINESS_ACCOUNT_ID
AI_PROVIDER   OPENAI_API_KEY   ANTHROPIC_API_KEY   GEMINI_API_KEY
```

`ENCRYPTION_KEY` must be a base64-encoded 32-byte key and must **never change** without re-encrypting
stored credentials. Never commit `.env`.

## 3. Web (Vercel)

Import the repo; framework preset Next.js. `vercel.json` registers a cron hitting `/api/cron/tick`
every minute (Vercel sends `Authorization: Bearer $CRON_SECRET`). Per-minute crons need a paid Vercel
plan; on Hobby, use `*/5 * * * *` or an external pinger.

## 4. Worker

The worker processes the queue (webhooks, automations, WhatsApp AI replies, reports) and registers its
own every-minute scheduler tick.

```bash
docker build -f Dockerfile.worker -t commerceai-worker .
docker run --env-file .env commerceai-worker
```

Without a worker, set `INLINE_JOBS=true`: jobs execute inside the request, and the Vercel cron drives
scheduled work. This is fine for small stores; use the worker for production volume (webhook bursts,
retries with backoff).

## 5. After deploy

1. `GET /api/health` → `{ status: "ok" }` (database + redis checks).
2. Register the first account at `/register` → onboarding wizard.
3. Configure webhook URLs (see [INTEGRATIONS.md](INTEGRATIONS.md)) using your production `APP_URL`.
4. Turn off demo mode in Settings → General once integrations are connected.

## Local development

```bash
npm run setup     # docker compose (Postgres :5434, Redis :6379), migrate, seed
npm run dev       # web + worker
npm test          # unit + integration (uses <db>_test, created automatically)
```
