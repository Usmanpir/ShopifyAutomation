import { env } from "@/lib/env";
import { hmacSha256, safeEqual } from "@/lib/crypto";

export function isShopifyConfigured(): boolean {
  const e = env();
  return !!(e.SHOPIFY_CLIENT_ID && e.SHOPIFY_CLIENT_SECRET);
}

/** Only accept canonical *.myshopify.com domains (prevents open redirects / SSRF). */
export function normalizeShopDomain(input: string): string | null {
  const shop = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const withSuffix = shop.includes(".") ? shop : `${shop}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(withSuffix) ? withSuffix : null;
}

export function buildInstallUrl(shop: string, state: string): string {
  const e = env();
  const params = new URLSearchParams({
    client_id: e.SHOPIFY_CLIENT_ID!,
    scope: e.SHOPIFY_SCOPES,
    redirect_uri: `${e.APP_URL}/api/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verifies the `hmac` query parameter Shopify appends to OAuth redirects:
 * HMAC-SHA256 (hex) of the remaining params sorted lexicographically.
 */
export function verifyOAuthHmac(query: URLSearchParams, secret = env().SHOPIFY_CLIENT_SECRET): boolean {
  if (!secret) return false;
  const hmac = query.get("hmac");
  if (!hmac) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return safeEqual(hmacSha256(secret, message, "hex"), hmac);
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<{ accessToken: string; scope: string }> {
  const e = env();
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: e.SHOPIFY_CLIENT_ID, client_secret: e.SHOPIFY_CLIENT_SECRET, code }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: json.access_token, scope: json.scope };
}
