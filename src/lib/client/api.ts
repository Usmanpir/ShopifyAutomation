"use client";

/** Typed fetch wrapper for our JSON API. Errors carry the server's friendly message. */
export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiClientError";
  }
}

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: opts.body !== undefined && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      body: opts.body instanceof FormData ? opts.body : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiClientError("Can't reach the server. Check your connection and try again.", 0, "network");
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message: string; code?: string; details?: unknown } } | null;
  if (!res.ok || json?.error) {
    // Session expired: hard navigation to clear all client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.status === 401 && typeof window !== "undefined") window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    throw new ApiClientError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, json?.error?.details);
  }
  return json?.data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
