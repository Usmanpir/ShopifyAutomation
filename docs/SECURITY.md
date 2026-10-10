# Security

## Authentication & sessions

- Email/password with bcrypt (cost 12); constant-time behaviour for unknown emails; login and
  registration are rate limited (Redis-backed, in-memory fallback).
- Sessions are random 256-bit tokens; only their SHA-256 hash is stored. Cookies are `HttpOnly`,
  `SameSite=Lax`, `Secure` + `__Host-` prefix in production; 30-day sliding expiry; users can list and
  revoke sessions; changing the password revokes other sessions.
- Optional TOTP 2FA (RFC 6238, ±1 step drift) with encrypted secrets.

## Authorization

- Six roles (Owner, Admin, Manager, Support Agent, Marketing Manager, Viewer) mapped to fine-grained
  permissions in `src/lib/rbac.ts`. Every API route declares its permission in `route({ permission })`
  and server components call `requireAuth(permission)`. UI hiding is cosmetic only.
- Role changes prevent privilege escalation (`canAssignRole`) and the last owner can't be removed.
- All data access is scoped by `storeId` from the session — never from client input.

## AI guardrails

AI never performs actions directly: tool calls are schema-validated, checked against the agent's
allow-list and the user's role, and sensitive actions (refunds, cancellations, bulk actions, large
budget changes, mass messaging, price changes) require human approval. There is no AI tool for deleting
data. Every AI and human action is written to the **audit log** (who, what, when, resource, old → new,
AI or human, reason, IP/user agent).

## Secrets & data

- Integration credentials and OAuth tokens are encrypted with AES-256-GCM (`ENCRYPTION_KEY`), never
  logged, and never returned to the browser (masked display only). Provider keys never reach client bundles.
- Meta Graph requests include `appsecret_proof`.
- Shopify GDPR webhooks: customer redaction anonymizes PII and deletes conversations.

## Web security

- CSRF: SameSite cookies + same-origin check on every mutating `/api` request (`src/proxy.ts`).
- Webhooks: Shopify `X-Shopify-Hmac-Sha256` and Meta `X-Hub-Signature-256` are verified over the raw
  body with constant-time comparison; deliveries are idempotent; webhook endpoints are rate limited.
- OAuth: Shopify callback verifies the HMAC, a signed `state` cookie and the shop domain (strict
  `*.myshopify.com` validation prevents open redirects/SSRF).
- Input validation with Zod on every route; uploads are size-limited and type-checked by magic bytes;
  uploaded files are served only to members of the owning store with `nosniff`.
- Security headers (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy);
  errors never expose stack traces (500s return a reference id; details go to server logs).
- Cron endpoints require `CRON_SECRET`.

## Reporting

Report vulnerabilities to the address in `src/config/brand.ts`.
