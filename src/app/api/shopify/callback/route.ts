import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeCodeForToken, normalizeShopDomain, verifyOAuthHmac } from "@/lib/shopify/oauth";
import { completeShopifyInstall, syncShopifyProducts } from "@/services/shopify.service";
import { audit } from "@/lib/audit";

/** Shopify OAuth callback: verify HMAC + state, exchange code, store encrypted token, register webhooks. */
export async function GET(req: NextRequest) {
  const appUrl = env().APP_URL;
  const fail = (reason: string) => NextResponse.redirect(`${appUrl}/integrations?error=${encodeURIComponent(reason)}`);
  const q = req.nextUrl.searchParams;
  const jar = await cookies();
  const raw = jar.get("shopify_oauth")?.value;
  jar.delete("shopify_oauth");
  if (!raw) return fail("Installation session expired. Please try again.");
  const saved = JSON.parse(raw) as { state: string; storeId: string; shop: string };
  const shop = normalizeShopDomain(q.get("shop") ?? "");
  if (!verifyOAuthHmac(q)) return fail("Invalid Shopify signature");
  if (!q.get("state") || !safeEqual(q.get("state")!, saved.state)) return fail("Invalid OAuth state");
  if (!shop || shop !== saved.shop) return fail("Shop mismatch");
  const code = q.get("code");
  if (!code) return fail("Missing authorization code");
  try {
    const { accessToken, scope } = await exchangeCodeForToken(shop, code);
    await completeShopifyInstall(saved.storeId, shop, accessToken, scope);
    await audit({ storeId: saved.storeId, actor: { type: "SYSTEM", name: "Shopify OAuth" } }, { action: "integration.shopify_install", resourceType: "integration", resourceLabel: shop });
    // Kick off the catalog backfill without blocking the redirect.
    void syncShopifyProducts(saved.storeId).catch((err) => console.error("[shopify] initial sync failed", err));
    return NextResponse.redirect(`${appUrl}/integrations?connected=shopify`);
  } catch (err) {
    console.error("[shopify] install failed", err);
    return fail("Couldn't complete the Shopify installation");
  }
}
