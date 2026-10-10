# AI agents, tools & guardrails

## Providers

`AIProvider` (`src/lib/ai/types.ts`) has two capabilities:

- `generateObject({ system, prompt, schema, fallback, images? })` — structured output validated by Zod
  (OpenAI `response_format: json_schema`, Anthropic `output_config.format`, Gemini `responseJsonSchema`).
- `runTools({ system, messages, tools, executeTool, localPlanner })` — a tool-use loop where **we**
  execute every tool call (so permissions, approvals and audit apply).

Implementations: `OpenAIProvider`, `AnthropicProvider` (default model `claude-opus-5-5`, server-side
refusal fallbacks enabled), `GeminiProvider`, and `LocalProvider` — a deterministic rules engine used in
demo mode or when no key is configured. Every remote call has a deterministic `fallback`, so a provider
outage degrades to rules instead of failing. Choose the provider/model per store in Settings → AI.

## Agents

Defined in `src/lib/ai/agents.ts`, persisted per store in `AIAgent`:

| Agent | Does | Never |
|---|---|---|
| Order Agent | risk scoring, COD confirmation, status updates | delete orders, refund, cancel without approval |
| WhatsApp Agent | answers customers 24/7 from live data, confirms orders, hands off | invent stock/prices/discounts |
| Customer Support Agent | tickets, triage, suggested replies | approve refunds |
| Marketing Agent | segments, win-back recommendations | mass messaging without approval |
| Ads Analyst | evidence-backed budget/pause recommendations, creative analysis | large budget changes without approval |
| Inventory Agent | velocity & coverage, low-stock analysis | price changes without approval |
| Business Analyst | assistant answers, daily report | write actions |

Each agent has an **allow-list of tools**, an **autonomy** level (`SUGGEST_ONLY`, `APPROVAL_REQUIRED`,
`AUTONOMOUS`), instructions and a confidence threshold — editable on the agent page.

## Tools

`src/lib/ai/tools/registry.ts` — each tool declares a Zod input schema, the RBAC permission a human
would need, a kind (`read` / `write` / `sensitive`) and optionally a dynamic approval rule:

`getOrder, listOrders, getOrderStatusByPhone, getCustomer, searchCustomers, searchProducts, getInventory,
getLowStock, getSalesSummary, compareRevenue, getTopProducts, getInactiveCustomers, getAdPerformance,
getCampaign, searchKnowledge, sendWhatsAppMessage, requestOrderConfirmation, updateOrderStatus,
bulkCancelOrders*, refundOrder*, addOrderTag, createShipment, createNotification, createSupportTicket,
changeCampaignBudget†, pauseCampaign†, sendMarketingCampaign†, changeProductPrice†`
(* always approval, † approval above configurable thresholds or when AI-initiated).

## Guardrails

`runTool()` (`src/lib/ai/tools/executor.ts`) is the single path for AI actions:

```
validate input (Zod) → authorize (agent allow-list / user RBAC) → approval gate → execute service → audit log
```

Sensitive actions create an `AIDecision` (what happened, why it matters, evidence, expected impact,
risk, confidence, expiry) in the **Approval Center**. A human approves → the action runs through the same
executor → result + audit log; rejection or expiry never runs it (and resumes waiting automations down
their "rejected" branch). Approval thresholds live in Settings → AI → Approval rules.

The WhatsApp agent drafts replies only from facts gathered by tools (catalog search with live stock,
order lookup, knowledge base). LLM polishing is constrained to those facts; low confidence, complaints,
human requests and policy exceptions trigger a **human handoff** (`needsAttention` + reason + ticket).

## AI assistant

`POST /api/ai/chat` — the assistant gets only the tools the user's role allows, runs as an AI actor in
`SUGGEST_ONLY` mode (so any write becomes an approval), and returns text plus structured blocks
(`metrics`, `table`, `list`, `approval`) rendered by the UI. With the local provider a planner maps
questions ("Why did revenue drop yesterday?") to tools (`compareRevenue`) and narrates the numbers.

## Insights & reports

`insight.service.ts` computes evidence-backed insights (top product growth, coverage alerts, category
purchase affinity, COD cancellation trend, repeat-customer share) and the Ads Analyst adds campaign
insights and budget recommendations. `report.service.ts` produces the daily AI business report.
