import base from "@hackersandwizards/scaffolding/stryker";

export default {
  ...base,
  mutate: [
    "scripts/{compact-styles,deny-patterns,elements,fill,page2-block,privacy,prose,prune,root,score-bands,stable-pdf,styles}.ts",
  ],
  incremental: false,
  vitest: { ...base.vitest, configFile: "vitest.mutation.config.ts", related: true },
  ignorePatterns: [...base.ignorePatterns, "dist"],
};
