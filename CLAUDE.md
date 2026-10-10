@AGENTS.md

# CommerceAI — project notes

- Read `docs/ARCHITECTURE.md` and `docs/UI_CONVENTIONS.md` before changing code.
- Business logic lives in `src/services/*` (framework-independent, takes `ServiceContext`); API routes stay thin via `route()` in `src/lib/api.ts`.
- Money is integer minor units; format with `makeFormatter` / `useFormat` — never hard-code currency.
- AI actions must go through `runTool()` (`src/lib/ai/tools/executor.ts`); sensitive tools require approval.
- Never import `@/lib/db` or services into `"use client"` files; shared Zod schemas live in `src/schemas/`.
- Local: Postgres on :5434, Redis on :6379 (`docker compose up -d`). Port 3000 may be taken by another project; `next dev` picks the next free port.
- Quality gates: `npm run typecheck`, `npm run lint`, `npm test` (integration tests use the `<db>_test` database), `npm run build`.
- Visual QA: `node scripts/screenshot.mjs http://localhost:<port> <outDir> /route …` (uses local Chrome).
- Reseed demo data: `npm run db:seed` (login usman@demo.commerceai.app / Demo@12345).
