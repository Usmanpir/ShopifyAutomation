import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "@/lib/redis";
import type { JobName, JobPayloads } from "./jobs";

export const QUEUE_NAME = "commerceai";

const globalForQueue = globalThis as unknown as { queue?: Queue | null };

function inlineMode(): boolean {
  return process.env.INLINE_JOBS === "true" || !process.env.REDIS_URL;
}

function getQueue(): Queue | null {
  if (globalForQueue.queue !== undefined) return globalForQueue.queue;
  const connection = getRedis();
  globalForQueue.queue = connection
    ? new Queue(QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 2000, age: 7 * 24 * 3600 },
          removeOnFail: { count: 5000 },
        },
      })
    : null;
  return globalForQueue.queue;
}

async function runInline<N extends JobName>(name: N, data: JobPayloads[N]) {
  const { jobHandlers } = await import("./handlers");
  try {
    await jobHandlers[name](data);
  } catch (err) {
    console.error(`[queue:inline] job ${name} failed`, err);
    throw err;
  }
}

export type EnqueueOptions = { delayMs?: number; jobId?: string; priority?: number };

/**
 * Enqueue a background job. Uses BullMQ when Redis is configured, otherwise
 * executes the job in-process so the app works without infrastructure (demo,
 * serverless). Delayed work is modelled in the DB (e.g. AutomationRun.resumeAt)
 * and picked up by the scheduler tick, so inline mode never loses it.
 */
export async function enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts: EnqueueOptions = {}) {
  if (inlineMode()) {
    await runInline(name, data);
    return;
  }
  const queue = getQueue();
  if (!queue) {
    await runInline(name, data);
    return;
  }
  const jobOpts: JobsOptions = {};
  if (opts.delayMs) jobOpts.delay = opts.delayMs;
  // BullMQ reserves ":" in custom ids.
  if (opts.jobId) jobOpts.jobId = opts.jobId.replace(/:/g, "_");
  if (opts.priority) jobOpts.priority = opts.priority;
  try {
    await queue.add(name, data, jobOpts);
  } catch (err) {
    // Redis unavailable: degrade gracefully rather than dropping the job.
    console.warn(`[queue] enqueue failed for ${name}, running inline`, (err as Error).message);
    await runInline(name, data);
  }
}

export { type JobName, type JobPayloads } from "./jobs";
