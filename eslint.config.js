import base from "@hackersandwizards/scaffolding/eslint";

// The shared config's rule for test files, kept whole: a second `no-restricted-syntax` replaces it.
const tests = base.find((config) => config.rules?.["no-restricted-syntax"]);

export default [
  { ignores: ["components/**"] },
  ...base,
  {
    // bun's expect().rejects waits in a nested event loop, which breaks the shared browser's
    // DevTools socket, so every later test on that browser fails with "Target closed".
    files: tests.files,
    rules: {
      "no-restricted-syntax": [
        ...tests.rules["no-restricted-syntax"],
        {
          selector:
            "MemberExpression[property.name=/^(rejects|resolves)$/]:matches([object.callee.name='expect'], [object.object.callee.name='expect'])",
          message:
            "bun's expect().rejects and .resolves return nothing and wait in a nested event loop; await the promise, then expect what it settled to.",
        },
      ],
    },
  },
];
