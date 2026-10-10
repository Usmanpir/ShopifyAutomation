import { env } from "@/lib/env";
import { SHOPIFY_WEBHOOK_TOPICS } from "./webhooks";

export class ShopifyApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly errors?: unknown) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal Shopify Admin GraphQL client with throttling-aware retries.
 * Tokens are passed in decrypted by the caller and never logged.
 */
export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  { retries = 4 }: { retries?: number } = {},
): Promise<T> {
  const url = `https://${shop}/admin/api/${env().SHOPIFY_API_VERSION}/graphql.json`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retries) throw new ShopifyApiError(`Shopify API unavailable (${res.status})`, res.status);
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ShopifyApiError("Shopify access token is invalid or lacks scopes", res.status);

    const json = (await res.json()) as GraphqlResponse<T>;
    const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < retries) {
      const s = json.extensions?.cost?.throttleStatus;
      await sleep(s ? Math.ceil((100 / Math.max(1, s.restoreRate)) * 1000) : 1500);
      continue;
    }
    if (json.errors?.length) throw new ShopifyApiError(json.errors.map((e) => e.message).join("; "), res.status, json.errors);
    if (!json.data) throw new ShopifyApiError("Empty Shopify response", res.status);
    return json.data;
  }
}

const WEBHOOK_CREATE = /* GraphQL */ `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

/** Registers all app webhooks pointing to /api/shopify/webhooks. Idempotent: "already taken" errors are ignored. */
export async function registerShopifyWebhooks(shop: string, accessToken: string) {
  const uri = `${env().APP_URL}/api/shopify/webhooks`;
  const failures: string[] = [];
  for (const topic of Object.values(SHOPIFY_WEBHOOK_TOPICS)) {
    const data = await shopifyGraphql<{
      webhookSubscriptionCreate: { userErrors: { message: string }[] };
    }>(shop, accessToken, WEBHOOK_CREATE, { topic, webhookSubscription: { uri, format: "JSON" } });
    const errs = data.webhookSubscriptionCreate.userErrors.filter((e) => !/already been taken/i.test(e.message));
    if (errs.length) failures.push(`${topic}: ${errs.map((e) => e.message).join(", ")}`);
  }
  return { failures };
}

export const ORDER_TAGS_ADD = /* GraphQL */ `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
  }
`;

export const ORDER_CANCEL = /* GraphQL */ `
  mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer) {
      orderCancelUserErrors { field message }
    }
  }
`;

export const PRODUCTS_PAGE = /* GraphQL */ `
  query products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle descriptionHtml productType vendor status tags
        featuredMedia { preview { image { url } } }
        variants(first: 100) {
          nodes {
            id title sku price compareAtPrice inventoryQuantity
            inventoryItem { id unitCost { amount } }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

export const gid = (type: string, id: string | number) => `gid://shopify/${type}/${id}`;
export const fromGid = (g: string) => g.split("/").pop() ?? g;
