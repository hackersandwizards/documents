import { defineConfig } from "vitest/config";

const timeout = Number(process.env.SCAFFOLDING_TEST_TIMEOUT_MS || 5000);

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Chrome and Astro's composer share the machine and the composer's Vite cache.
    fileParallelism: false,
    testTimeout: timeout,
    hookTimeout: timeout,
  },
});
