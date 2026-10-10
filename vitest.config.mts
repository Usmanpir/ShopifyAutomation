import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests run anywhere. Integration tests use a dedicated Postgres database
 * (`commerceai_test` on the same server as DATABASE_URL) which globalSetup
 * creates and migrates. Jobs run inline (no Redis needed).
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: "forks",
  },
});
