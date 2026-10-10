import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["cai_session", "__Host-cai_session"];

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

/** Endpoints called by external systems: authenticated by signatures/secrets, not cookies. */
const MACHINE_PATHS = [
  "/api/shopify/webhooks",
  "/api/shopify/callback",
  "/api/whatsapp/webhook",
  "/api/meta/webhook",
  "/api/courier/webhook",
  "/api/cron",
  "/api/health",
];

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Optimistic checks only (cookie presence + CSRF origin check). Real session
 * validation and authorization happen server-side in getAuth()/route().
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (startsWithAny(pathname, MACHINE_PATHS)) return NextResponse.next();

  // CSRF defence-in-depth (cookies are SameSite=Lax): mutating API calls must be same-origin.
  if (pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return NextResponse.json({ error: { message: "Cross-origin request blocked", code: "csrf" } }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: { message: "Invalid origin", code: "csrf" } }, { status: 403 });
      }
    }
  }

  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  const isPublic = startsWithAny(pathname, PUBLIC_PATHS);

  if (!hasSession && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { message: "Please sign in to continue", code: "unauthorized" } }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
