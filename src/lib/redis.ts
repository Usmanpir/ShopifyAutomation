import IORedis, { type Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

/**
 * Shared Redis connection, or null when REDIS_URL is not configured.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redis = null;
    return null;
  }
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  client.on("error", (err) => {
    if (process.env.NODE_ENV !== "test") console.warn("[redis]", err.message);
  });
  globalForRedis.redis = client;
  return client;
}

export function isRedisReady(): boolean {
  const r = getRedis();
  return !!r && r.status === "ready";
}
