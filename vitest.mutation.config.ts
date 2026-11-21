import base from "@hackersandwizards/scaffolding/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(base, {
  test: {
    include: [
      "test/{elements,fill,page2-block,privacy,prose,prune,styles,tokens}.test.ts",
      "test/*.prop.test.ts",
    ],
    pool: "forks",
    fileParallelism: false,
  },
});
