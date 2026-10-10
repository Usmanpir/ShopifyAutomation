import { getRedis, isRedisReady } from "@/lib/redis";

/**
 * Fixed-window rate limiter. Uses Redis when available (shared across
 * instances), otherwise an in-memory map (per instance — fine for dev).
 */
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();

  if (isRedisReady()) {
    try {
      const redis = getRedis()!;
      const bucket = `rl:${key}:${Math.floor(now / 1000 / windowSeconds)}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.expire(bucket, windowSeconds);
      const ttl = windowSeconds - (Math.floor(now / 1000) % windowSeconds);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: ttl };
    } catch {
      // fall through to memory limiter
    }
  }

  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { allowed: true, remaining: limit - 1, retryAfter: windowSeconds };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}
