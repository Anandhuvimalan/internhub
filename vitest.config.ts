import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/internhub_test?schema=internship";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server bundle; services are plain Node in tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DB,
      SESSION_SECRET: "test-secret-test-secret-test-secret-0123456789",
      MFA_ENCRYPTION_KEY: "11".repeat(32),
      APP_URL: "http://localhost:3000",
      REDIS_URL: "", // rate-limit tests use the in-memory path deterministically
    },
    fileParallelism: false, // one shared test database
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
