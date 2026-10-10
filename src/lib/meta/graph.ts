import { env } from "@/lib/env";
import { hmacSha256 } from "@/lib/crypto";

export class MetaApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * Meta Graph API client. Adds `appsecret_proof` (HMAC of the token with the
 * app secret) so leaked tokens can't be used from other apps.
 */
export async function graphRequest<T>(
  path: string,
  accessToken: string,
  { method = "GET", params = {}, body }: { method?: "GET" | "POST"; params?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<T> {
  const e = env();
  const url = new URL(`https://graph.facebook.com/${e.META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);
  if (e.META_APP_SECRET) url.searchParams.set("appsecret_proof", hmacSha256(e.META_APP_SECRET, accessToken, "hex"));

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message: string; code?: number } };
  if (!res.ok || (json as { error?: unknown }).error) {
    const err = (json as { error?: { message: string; code?: number } }).error;
    throw new MetaApiError(err?.message ?? `Meta API error (${res.status})`, res.status, err?.code);
  }
  return json;
}

/** Follows `paging.next` cursors up to `maxPages`. */
export async function graphPaginate<T>(path: string, accessToken: string, params: Record<string, string>, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await graphRequest<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, accessToken, {
      params: after ? { ...params, after } : params,
    });
    out.push(...page.data);
    if (!page.paging?.next || !page.paging.cursors?.after) break;
    after = page.paging.cursors.after;
  }
  return out;
}
