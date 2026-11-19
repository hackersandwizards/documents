import { execFileSync } from "node:child_process";

export { strykerPlugins, strykerValidationSchema } from "@stryker-mutator/vitest-runner";

// Stryker forks its runner using process.execPath. The tests need Bun's HTMLRewriter.
if (!process.versions.bun) {
  process.execPath = execFileSync("bun", ["--print", "process.execPath"], {
    encoding: "utf8",
  }).trim();
}
