import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAIProvider } from "@/lib/ai/factory";
import { toStrictJsonSchema } from "@/lib/ai/json-schema";
import { runTool } from "@/lib/ai/tools/executor";
import { TOOLS, TOOLS_BY_NAME } from "@/lib/ai/tools/registry";
import type { ChatTurn, ToolCallRecord } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { can } from "@/lib/rbac";
import type { ServiceContext } from "@/lib/service-context";
import { recordAITask } from "./agent.service";
import { getStore } from "./store.service";

export type ChatBlock =
  | { type: "metrics"; title?: string; items: { label: string; value: string; change?: string }[] }
  | { type: "table"; title?: string; columns: string[]; rows: (string | number)[][]; links?: (string | null)[] }
  | { type: "list"; title?: string; items: string[] }
  | { type: "approval"; decisionId: string; message: string };

export const chatInputSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().trim().min(1).max(2000),
});

// ───────────────────────── Local planner ─────────────────────────

type Plan = { tool: string; input: Record<string, unknown> }[];

function rangeFrom(text: string): "today" | "7d" | "30d" | "90d" {
  if (/\btoday\b|\baaj\b/i.test(text)) return "today";
  if (/\b(month|30 days|mahine)\b/i.test(text)) return "30d";
  if (/\b(quarter|90 days|3 months)\b/i.test(text)) return "90d";
  return "7d";
}

/** Maps a business question to tool calls. Deterministic and grounded — no invented numbers. */
export function planQuestion(q: string): Plan {
  const text = q.toLowerCase();
  const order = text.match(/#\s?(\d{3,7})|order\s+(?:number\s+)?(\d{4,7})/);
  if (order) return [{ tool: "getOrder", input: { reference: order[1] ?? order[2] } }];
  if (/(why|reason).*(revenue|sales).*(drop|fall|fell|down|decrease|low)|revenue (drop|fall)|(drop|fall|fell|down).*(revenue|sales)/.test(text)) {
    const daysAgo = /today/.test(text) ? 0 : 1;
    return [{ tool: "compareRevenue", input: { daysAgo } }];
  }
  if (/(sold the most|best[- ]?sell|top (selling )?products?|most popular|highest selling)/.test(text)) return [{ tool: "getTopProducts", input: { range: rangeFrom(text), limit: 5 } }];
  if (/(pending|awaiting|unconfirmed).*(cod|confirm|order)|cod.*pending/.test(text)) return [{ tool: "listOrders", input: { tab: "pending_confirmation", limit: 15 } }];
  if (/high[- ]risk|fake order|fraud/.test(text)) return [{ tool: "listOrders", input: { tab: "high_risk", limit: 15 } }];
  if (/(low|running out|out of) (in )?stock|low inventory|restock|stock out/.test(text)) return [{ tool: "getLowStock", input: { limit: 12 } }];
  const inactive = text.match(/(?:haven'?t|have not|not|no) (?:purchased|bought|ordered).*?(\d+)\s*days|inactive.*?(\d+)?\s*days?|inactive customers/);
  if (inactive) return [{ tool: "getInactiveCustomers", input: { days: Number(inactive[1] ?? inactive[2] ?? 60), limit: 15 } }];
  if (/(campaign).*(highest|best|most|top)|(highest|best|most|top).*(campaign)/.test(text)) return [{ tool: "getAdPerformance", input: { range: rangeFrom(text) } }];
  if (/meta|ads?\b|ad spend|roas|facebook ads|instagram ads|cpa|ctr/.test(text)) {
    if (/yesterday/.test(text)) return [{ tool: "compareRevenue", input: { daysAgo: 1 } }, { tool: "getAdPerformance", input: { range: "7d" } }];
    return [{ tool: "getAdPerformance", input: { range: rangeFrom(text) } }];
  }
  if (/(available|in stock|stock of|availability)/.test(text)) {
    const query = text.replace(/\b(is|are|do we have|available|in stock|stock of|availability|the|any|\?)\b/g, " ").replace(/\s+/g, " ").trim();
    return [{ tool: "searchProducts", input: { query: query || text } }];
  }
  if (/customer|who is|buyer/.test(text)) {
    const name = q.replace(/.*(customer|who is|buyer)\s*/i, "").replace(/\?/g, "").trim();
    if (name.length >= 2) return [{ tool: "searchCustomers", input: { query: name } }];
  }
  if (/yesterday/.test(text)) return [{ tool: "compareRevenue", input: { daysAgo: 1 } }];
  if (/revenue|sales|orders|profit|how (are|is) (we|the store|business)|summary|performance|conversion|returns/.test(text)) return [{ tool: "getSalesSummary", input: { range: rangeFrom(text) } }];
  return [];
}

type Obj = Record<string, unknown>;

/** Builds rich UI blocks + a short narrative from tool output. Used by both local and LLM paths. */
export function blocksFromToolCalls(calls: ToolCallRecord[]): { blocks: ChatBlock[]; narrative: string[] } {
  const blocks: ChatBlock[] = [];
  const narrative: string[] = [];
  for (const call of calls) {
    if (call.isError) {
      narrative.push(`I couldn't complete ${call.name}: ${call.output}`);
      continue;
    }
    let out: unknown;
    try {
      out = JSON.parse(call.output);
    } catch {
      continue;
    }
    if (out && typeof out === "object" && (out as Obj).status === "approval_required") {
      blocks.push({ type: "approval", decisionId: String((out as Obj).decisionId), message: String((out as Obj).message) });
      continue;
    }
    const o = out as Obj;
    switch (call.name) {
      case "getSalesSummary": {
        const metrics = o.metrics as { metric: string; value: string | number; change: string }[];
        blocks.push({ type: "metrics", title: `${o.period} · ${o.comparison}`, items: metrics.map((m) => ({ label: m.metric, value: String(m.value), change: m.change })) });
        const rev = metrics.find((m) => m.metric === "Revenue");
        const ord = metrics.find((m) => m.metric === "Orders");
        if (rev && ord) narrative.push(`${o.period}: revenue was ${rev.value} (${rev.change}) from ${ord.value} orders (${ord.change}) ${String(o.comparison)}.`);
        break;
      }
      case "compareRevenue": {
        const drops = o.productDrops as string[];
        const gains = o.productGains as string[];
        const cities = o.cityDrops as string[];
        blocks.push({
          type: "metrics",
          title: `Revenue on ${o.date}`,
          items: [
            { label: "Revenue", value: String(o.revenue), change: String(o.change) },
            { label: "Previous day", value: String(o.previousDayRevenue) },
            { label: "Same day last week", value: String(o.sameDayLastWeek) },
            { label: "Orders", value: String(o.orders) },
            { label: "Avg order value", value: String(o.averageOrderValue) },
            { label: "Cancellations", value: String(o.cancellations) },
            { label: "Ad spend", value: String(o.adSpend) },
            { label: "Sessions", value: String(o.sessions) },
          ],
        });
        const changeNum = parseFloat(String(o.change));
        narrative.push(
          `Revenue ${changeNum < 0 ? "decreased" : "increased"} ${Math.abs(changeNum).toFixed(1)}% (${o.revenue} vs ${o.previousDayRevenue}).`,
        );
        const [ordersNow, ordersBefore] = String(o.orders).split(" vs ").map(Number);
        if (ordersNow !== ordersBefore) narrative.push(`Orders went from ${ordersBefore} to ${ordersNow}.`);
        if (changeNum < 0 && drops.length) narrative.push(`Main contributor: ${drops[0]}.`);
        if (changeNum >= 0 && gains.length) narrative.push(`Biggest lift: ${gains[0]}.`);
        if (cities.length && changeNum < 0) narrative.push(`Biggest city decline: ${cities[0]}.`);
        const [sessNow, sessBefore] = String(o.sessions).split(" vs ").map(Number);
        if (sessBefore && Math.abs(sessNow - sessBefore) / sessBefore > 0.1) narrative.push(`Store traffic also moved: ${sessNow} sessions vs ${sessBefore}.`);
        if (drops.length > 1) blocks.push({ type: "list", title: "Products with the biggest drop", items: drops });
        break;
      }
      case "getTopProducts": {
        const rows = out as { product: string; units: number; revenue: string; growth: string; link: string }[];
        blocks.push({ type: "table", title: "Top products", columns: ["Product", "Units", "Revenue", "Growth"], rows: rows.map((r) => [r.product, r.units, r.revenue, r.growth]), links: rows.map((r) => r.link) });
        if (rows[0]) narrative.push(`${rows[0].product} sold the most: ${rows[0].units} units for ${rows[0].revenue} (${rows[0].growth} vs the previous period).`);
        break;
      }
      case "listOrders": {
        const orders = (o.orders as { id: string; name: string; customer: string; status: string; total: string; payment: string; risk: string }[]) ?? [];
        blocks.push({ type: "table", title: `${o.total} orders`, columns: ["Order", "Customer", "Total", "Payment", "Status", "Risk"], rows: orders.map((r) => [r.name, r.customer, r.total, r.payment, r.status.replace(/_/g, " ").toLowerCase(), r.risk]), links: orders.map((r) => `/orders/${r.id}`) });
        narrative.push(`There ${Number(o.total) === 1 ? "is" : "are"} ${o.total} matching order${Number(o.total) === 1 ? "" : "s"}${orders.length < Number(o.total) ? ` — showing the latest ${orders.length}` : ""}.`);
        break;
      }
      case "getLowStock": {
        const rows = out as { product: string; variant: string; stock: number; coverageDays: number | null; avgDailySales: number; link: string }[];
        blocks.push({ type: "table", title: "Low stock", columns: ["Product", "Variant", "Stock", "Avg daily sales", "Coverage"], rows: rows.map((r) => [r.product, r.variant, r.stock, r.avgDailySales, r.coverageDays === null ? "—" : `${r.coverageDays} days`]), links: rows.map((r) => r.link) });
        narrative.push(rows.length ? `${rows.length} variants are low or out of stock. Most urgent: ${rows[0].product} ${rows[0].variant} with ${rows[0].stock} left.` : "Nothing is low on stock right now.");
        break;
      }
      case "getInactiveCustomers": {
        const customers = o.customers as { id: string; name: string; lastPurchase: string; orders: number; spent: string }[];
        blocks.push({ type: "table", title: `${o.total} inactive customers`, columns: ["Customer", "Last purchase", "Orders", "Lifetime spend"], rows: customers.map((c) => [c.name, c.lastPurchase, c.orders, c.spent]), links: customers.map((c) => `/customers/${c.id}`) });
        narrative.push(`${o.total} customers haven't purchased in that period. The most valuable is ${customers[0]?.name ?? "—"} (${customers[0]?.spent ?? "—"} lifetime).`);
        break;
      }
      case "getAdPerformance": {
        const camps = o.campaigns as { id: string; name: string; spend: string; revenue: string; roas: string; purchases: number }[];
        blocks.push({ type: "metrics", title: `Meta ads · ${o.period}`, items: [{ label: "Spend", value: String(o.spend), change: String(o.spendChange) }, { label: "Revenue", value: String(o.revenue) }, { label: "ROAS", value: String(o.roas) }, { label: "Purchases", value: String(o.purchases) }, { label: "CPA", value: String(o.cpa) }, { label: "CTR", value: String(o.ctr) }] });
        const sorted = [...camps].sort((a, b) => parseFloat(b.revenue.replace(/[^\d.]/g, "")) - parseFloat(a.revenue.replace(/[^\d.]/g, "")));
        blocks.push({ type: "table", title: "Campaigns", columns: ["Campaign", "Spend", "Revenue", "ROAS", "Purchases"], rows: sorted.map((c) => [c.name, c.spend, c.revenue, c.roas, c.purchases]), links: sorted.map((c) => `/ads/campaigns/${c.id}`) });
        narrative.push(`Meta ads spent ${o.spend} and drove ${o.revenue} (${o.roas} ROAS).${sorted[0] ? ` ${sorted[0].name} generated the most revenue (${sorted[0].revenue}).` : ""}`);
        break;
      }
      case "getOrder": {
        blocks.push({ type: "metrics", title: `Order ${o.name}`, items: [{ label: "Customer", value: String(o.customer) }, { label: "Status", value: String(o.status) }, { label: "Total", value: String(o.total) }, { label: "Payment", value: String(o.payment) }, { label: "Risk", value: String(o.risk) }] });
        blocks.push({ type: "list", title: "Items", items: o.items as string[] });
        narrative.push(`Order ${o.name} for ${o.customer} is ${String(o.status).replace(/_/g, " ").toLowerCase()} (${o.total}, ${o.payment}).`);
        break;
      }
      case "searchProducts": {
        const rows = out as { id: string; title: string; price: string; totalStock: number; variants: { title: string; stock: number }[]; link: string }[];
        blocks.push({ type: "table", title: "Matching products", columns: ["Product", "Price", "In stock", "Variants"], rows: rows.map((r) => [r.title, r.price, r.totalStock, r.variants.filter((v) => v.stock > 0).map((v) => `${v.title} (${v.stock})`).join(", ") || "Out of stock"]), links: rows.map((r) => r.link) });
        narrative.push(rows.length ? `${rows[0].title} has ${rows[0].totalStock} units in stock at ${rows[0].price}.` : "I couldn't find a matching product.");
        break;
      }
      case "searchCustomers": {
        const rows = out as { id: string; name: string; city: string; orders: number; spent: string }[];
        blocks.push({ type: "table", title: "Customers", columns: ["Name", "City", "Orders", "Spent"], rows: rows.map((r) => [r.name, r.city ?? "—", r.orders, r.spent]), links: rows.map((r) => `/customers/${r.id}`) });
        narrative.push(rows.length ? `Found ${rows.length} customer${rows.length === 1 ? "" : "s"}.` : "No matching customers.");
        break;
      }
      default:
        break;
    }
  }
  return { blocks, narrative };
}

async function localPlanner(question: string, execute: (name: string, input: unknown) => Promise<{ output: string; isError?: boolean }>) {
  const plan = planQuestion(question);
  if (!plan.length) {
    return {
      text:
        "I can answer questions about sales, orders, customers, inventory and Meta ads. Try: “Which products sold the most this month?”, “Show pending COD orders” or “Why did revenue drop yesterday?”.",
      toolCalls: [] as ToolCallRecord[],
    };
  }
  const toolCalls: ToolCallRecord[] = [];
  for (const step of plan) {
    const r = await execute(step.tool, step.input);
    toolCalls.push({ name: step.tool, input: step.input, output: r.output, isError: r.isError });
  }
  return { text: blocksFromToolCalls(toolCalls).narrative.join(" "), toolCalls };
}

// ───────────────────────── Chat ─────────────────────────

/**
 * Natural-language business assistant. The user's RBAC decides which tools
 * are available; write actions are always routed to the Approval Center.
 */
export async function chat(ctx: ServiceContext, input: z.infer<typeof chatInputSchema>) {
  const started = Date.now();
  const store = await getStore(ctx.storeId);
  const role = ctx.actor.role;

  let thread = input.threadId
    ? await db.aIChatThread.findFirst({ where: { id: input.threadId, storeId: ctx.storeId, userId: ctx.actor.id! }, include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } } })
    : null;
  if (input.threadId && !thread) throw notFound("Conversation");
  if (!thread) {
    thread = await db.aIChatThread.create({
      data: { storeId: ctx.storeId, userId: ctx.actor.id!, title: input.message.slice(0, 80) },
      include: { messages: true },
    });
  }
  await db.aIChatMessage.create({ data: { threadId: thread.id, role: "user", content: input.message } });

  const allowed = TOOLS.filter((t) => can(role, t.permission));
  const assistantAgent = {
    id: "assistant",
    key: "BUSINESS" as const,
    name: `AI Assistant (for ${ctx.actor.name})`,
    enabled: true,
    tools: allowed.map((t) => t.name),
    autonomy: "SUGGEST_ONLY" as const,
  };
  const aiCtx: ServiceContext = { storeId: ctx.storeId, actor: { type: "AI", name: assistantAgent.name, id: ctx.actor.id } };

  const execute = async (name: string, toolInput: unknown) => {
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool || !can(role, tool.permission)) return { output: `Not permitted: ${name}`, isError: true };
    const res = await runTool(aiCtx, name, toolInput, { agent: assistantAgent });
    if (!res.ok) return { output: res.error, isError: true };
    if (res.status === "approval_required") return { output: JSON.stringify(res) };
    return { output: JSON.stringify(res.output) };
  };

  const ai = await getAIProvider(ctx.storeId);
  const history: ChatTurn[] = [
    ...thread.messages.slice(-10).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content })),
    { role: "user", content: input.message },
  ];
  const result = await ai.runTools({
    system:
      `You are the AI business assistant for ${store.name}, a fashion ecommerce store (currency ${store.currency}, timezone ${store.timezone}). ` +
      `Today is ${new Date().toISOString().slice(0, 10)}. Answer ONLY with numbers returned by tools — never estimate or invent data. ` +
      "Be concise: lead with the answer, then the 2-3 most important drivers. When explaining a change, cite the specific numbers. " +
      "Write actions are routed to the Approval Center automatically; tell the user when an action awaits approval.",
    messages: history,
    tools: allowed.map((t) => ({ name: t.name, description: t.description, inputSchema: toStrictJsonSchema(t.input) })),
    executeTool: execute,
    localPlanner: async (_msgs, exec) => localPlanner(input.message, exec),
    maxIterations: 6,
  });

  const { blocks, narrative } = blocksFromToolCalls(result.toolCalls);
  const text = result.text?.trim() || narrative.join(" ") || "I couldn't find an answer to that.";
  const saved = await db.aIChatMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: text,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      toolCalls: result.toolCalls.map((c) => ({ name: c.name, input: c.input, isError: !!c.isError })) as unknown as Prisma.InputJsonValue,
    },
  });
  await db.aIChatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  await recordAITask(ctx.storeId, "BUSINESS", {
    type: "assistant.answer",
    title: `Answered: “${input.message.slice(0, 80)}”`,
    input: { question: input.message },
    output: { tools: result.toolCalls.map((c) => c.name) },
    provider: result.provider,
    model: result.model,
    durationMs: Date.now() - started,
  });
  return {
    threadId: thread.id,
    message: { id: saved.id, role: "assistant", content: text, blocks, toolCalls: result.toolCalls.map((c) => c.name), createdAt: saved.createdAt },
    provider: result.provider,
  };
}

export async function listThreads(ctx: ServiceContext) {
  return db.aIChatThread.findMany({ where: { storeId: ctx.storeId, userId: ctx.actor.id! }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true } });
}

export async function getThread(ctx: ServiceContext, id: string) {
  const t = await db.aIChatThread.findFirst({ where: { id, storeId: ctx.storeId, userId: ctx.actor.id! }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("Conversation");
  return t;
}
