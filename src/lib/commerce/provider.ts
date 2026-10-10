import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { ORDER_CANCEL, ORDER_TAGS_ADD, gid, shopifyGraphql } from "@/lib/shopify/client";

/**
 * Write-back to the commerce platform (Shopify today). The app's database is
 * the operational source of truth for workflow state; changes that matter to
 * the storefront (tags, cancellations) are mirrored here.
 */
export interface CommerceProvider {
  readonly key: "shopify" | "demo";
  addOrderTags(externalOrderId: string | null, tags: string[]): Promise<void>;
  cancelOrder(externalOrderId: string | null, opts: { reason: string; restock: boolean; notify: boolean }): Promise<void>;
}

class DemoCommerceProvider implements CommerceProvider {
  readonly key = "demo" as const;
  async addOrderTags() {}
  async cancelOrder() {}
}

class ShopifyCommerceProvider implements CommerceProvider {
  readonly key = "shopify" as const;
  constructor(private shop: string, private token: string) {}

  async addOrderTags(externalOrderId: string | null, tags: string[]) {
    if (!externalOrderId || !tags.length) return;
    await shopifyGraphql(this.shop, this.token, ORDER_TAGS_ADD, { id: gid("Order", externalOrderId), tags });
  }

  async cancelOrder(externalOrderId: string | null, opts: { reason: string; restock: boolean; notify: boolean }) {
    if (!externalOrderId) return;
    const reason = /fraud/i.test(opts.reason) ? "FRAUD" : /customer/i.test(opts.reason) ? "CUSTOMER" : "OTHER";
    await shopifyGraphql(this.shop, this.token, ORDER_CANCEL, {
      orderId: gid("Order", externalOrderId),
      reason,
      refund: false,
      restock: opts.restock,
      notifyCustomer: opts.notify,
    });
  }
}

export async function getCommerceProvider(storeId: string): Promise<CommerceProvider> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { demoMode: true, shopifyConnection: true } });
  const conn = store?.shopifyConnection;
  if (!store || store.demoMode || !conn || conn.uninstalledAt) return new DemoCommerceProvider();
  return new ShopifyCommerceProvider(conn.shopDomain, decrypt(conn.accessTokenEnc));
}
