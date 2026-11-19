import base from "@hackersandwizards/scaffolding/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(base, {
  test: {
    include: ["test/**/*.test.ts"],
    // Chrome and Astro's composer share the machine and the composer's Vite cache.
    fileParallelism: false,
  },
});
