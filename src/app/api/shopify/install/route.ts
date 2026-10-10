import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { getAuth } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { badRequest, forbidden, unauthorized } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { buildInstallUrl, isShopifyConfigured, normalizeShopDomain } from "@/lib/shopify/oauth";

/** Starts Shopify OAuth: GET /api/shopify/install?shop=my-store.myshopify.com */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) throw unauthorized();
    if (!can(auth.role, "integrations.manage")) throw forbidden();
    if (!isShopifyConfigured()) throw badRequest("Shopify app credentials are not configured (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET)");
    const shop = normalizeShopDomain(req.nextUrl.searchParams.get("shop") ?? "");
    if (!shop) throw badRequest("Enter a valid *.myshopify.com domain");
    const state = randomToken(24);
    const jar = await cookies();
    // State binds the callback to this user/store and prevents CSRF on the OAuth redirect.
    jar.set("shopify_oauth", JSON.stringify({ state, storeId: auth.store.id, shop }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/shopify", maxAge: 600 });
    return NextResponse.redirect(buildInstallUrl(shop, state));
  } catch (err) {
    return errorResponse(err);
  }
}
