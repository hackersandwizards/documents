import base from "@hackersandwizards/scaffolding/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(base, {
  test: {
    include: ["test/{elements,privacy,prose,prune,tokens}.test.ts"],
    fileParallelism: false,
  },
});
