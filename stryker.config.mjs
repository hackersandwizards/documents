import base from "@hackersandwizards/scaffolding/stryker";

export default {
  ...base,
  plugins: ["./stryker-vitest.mjs"],
  mutate: ["scripts/{elements,privacy,prose,prune,root,styles}.ts"],
  vitest: { ...base.vitest, configFile: "vitest.mutation.config.ts", related: true },
  ignorePatterns: [...base.ignorePatterns, "dist"],
};
