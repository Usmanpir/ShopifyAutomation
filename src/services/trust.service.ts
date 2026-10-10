import { AGENT_DEFINITIONS } from "@/lib/ai/agents";
import { TOOLS } from "@/lib/ai/tools/registry";
import { formatMoney } from "@/lib/money";
import { getStore } from "./store.service";

/**
 * Trust Center, generated from the real tool registry and approval rules —
 * so the page can't drift from what the AI is actually allowed to do.
 */
export async function trustCenter(storeId: string) {
  const store = await getStore(storeId);
  const rules = store.settings.approvals;
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });

  // Conditions under which an otherwise-allowed action waits for a person (mirrors each tool's requiresApproval).
  const CONDITIONAL: Record<string, string> = {
    updateOrderStatus: "Cancelling any order",
    changeCampaignBudget: `Changing an ad budget by more than ${rules.adBudgetChangePercent}%`,
    pauseCampaign: "Pausing an ad campaign",
    sendMarketingCampaign: `Messaging ${rules.massMessageThreshold} or more customers at once`,
    ...(rules.priceChangeRequiresApproval ? { changeProductPrice: "Changing any product price" } : {}),
  };
  const ALWAYS: Record<string, string> = {
    refundOrder: rules.refundAutoApproveLimit > 0 ? `Refunds above ${money(rules.refundAutoApproveLimit)}` : "Any refund",
    bulkCancelOrders: "Cancelling several orders at once",
  };

  const reads = TOOLS.filter((t) => t.kind === "read").map((t) => t.description);
  const onItsOwn = TOOLS.filter((t) => t.kind === "write" && !CONDITIONAL[t.name]).map((t) => t.description);
  const withApproval = [...Object.entries(ALWAYS), ...Object.entries(CONDITIONAL)].map(([tool, label]) => ({ tool, label }));
  // Store-wide guarantees. (Per-assistant limits — e.g. the Customer Assistant can't refund at all — are on each assistant's page.)
  const never = [
    "Cancel orders on its own",
    "Delete orders, customers or products",
    "Change an order's total",
    "Make up prices, stock or policies — they're always looked up live",
    "Promise discounts that aren't in an active promotion",
    "Act outside the tools its assistant is allowed to use",
  ];
  return {
    reads,
    onItsOwn,
    withApproval,
    never,
    assistants: AGENT_DEFINITIONS.length,
    expiryHours: rules.decisionExpiryHours,
    autoReplyTopics: store.settings.ai.autoReplyIntents,
    provider: store.settings.ai.provider,
  };
}
