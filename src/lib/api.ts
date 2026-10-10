import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { getAuth, type AuthContext } from "@/lib/auth/session";
import { AppError, forbidden, tooManyRequests, unauthorized } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { can, type Permission } from "@/lib/rbac";
import { contextFromAuth, type ServiceContext } from "@/lib/service-context";

type HandlerArgs<P> = {
  req: NextRequest;
  params: P;
  auth: AuthContext;
  ctx: ServiceContext;
};

type RouteOptions = {
  permission?: Permission;
  /** Requests per minute per user for this route. */
  rateLimit?: number;
};

export function clientIp(req: NextRequest): string | null {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || null;
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const res = NextResponse.json({ error: { message: err.message, code: err.code, details: err.details } }, { status: err.status });
    if (err.status === 429 && err.details && typeof err.details === "object" && "retryAfter" in err.details) {
      res.headers.set("Retry-After", String((err.details as { retryAfter: number }).retryAfter));
    }
    return res;
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Please check the highlighted fields",
          code: "validation_error",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  const id = crypto.randomUUID().slice(0, 8);
  console.error(`[api] unhandled error ${id}`, err);
  return NextResponse.json(
    { error: { message: "Something went wrong on our side. Please try again.", code: "internal_error", requestId: id } },
    { status: 500 },
  );
}

/**
 * Wraps an authenticated route handler: resolves the session, enforces RBAC
 * and rate limits, and maps thrown errors to consistent JSON responses.
 * Handlers stay thin — business logic lives in services.
 */
export function route<P = Record<string, string>>(
  options: RouteOptions,
  handler: (args: HandlerArgs<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const auth = await getAuth();
      if (!auth) throw unauthorized();
      if (options.permission && !can(auth.role, options.permission)) throw forbidden();
      if (options.rateLimit) {
        const rl = await rateLimit(`${auth.user.id}:${req.nextUrl.pathname}`, options.rateLimit, 60);
        if (!rl.allowed) throw tooManyRequests(rl.retryAfter);
      }
      const ctx = contextFromAuth(auth, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      const params = (await context.params) ?? ({} as P);
      const result = await handler({ req, params, auth, ctx });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "invalid_json");
  }
  return schema.parse(body);
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string | string[]> = {};
  for (const key of new Set(req.nextUrl.searchParams.keys())) {
    const all = req.nextUrl.searchParams.getAll(key);
    obj[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(obj);
}
