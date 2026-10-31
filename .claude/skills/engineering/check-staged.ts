// The pre-commit check every repository runs as `bun run check:staged`: the staged secret scan, then
// `prettier --check` and `eslint` on the staged files. Check, never write: re-staging a rewritten
// file would sweep another session's unstaged lines in that file into this commit.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function refuseCommit(message: string): never {
  console.error(`[check:staged] ${message}`);
  process.exit(1);
}

// Fail closed: a missing scanner would let every secret through without a word.
const scan = spawnSync(
  "gitleaks",
  ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "--log-level", "warn"],
  { stdio: "inherit" },
);
if (scan.error) refuseCommit("gitleaks not found: brew install gitleaks");
if (scan.status !== 0) process.exit(1);

const listed = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  encoding: "utf8",
});
if (listed.status !== 0) refuseCommit("git diff --cached failed");
const staged = listed.stdout.split("\0").filter(Boolean);
if (staged.length === 0) process.exit(0);

// Both tools get every staged path and skip what their own config ignores, so this and
// `bun run check` judge the same files. A staged path gone from the working tree is no finding.
const tools: Record<string, string[]> = {
  prettier: [
    "--check",
    "--ignore-unknown",
    "--no-error-on-unmatched-pattern",
    "--log-level",
    "warn",
  ],
  eslint: ["--cache", "--no-warn-ignored", "--no-error-on-unmatched-pattern"],
};
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = { ...pkg.dependencies, ...pkg.devDependencies };

// Chunked: a commit touching most of a repository passes more path bytes than ARG_MAX holds.
const chunks: string[][] = [[]];
let bytes = 0;
for (const path of staged) {
  if (bytes + path.length > 100_000) {
    chunks.push([]);
    bytes = 0;
  }
  chunks[chunks.length - 1].push(path);
  bytes += path.length + 1;
}

function runStagedTool(bin: string, args: string[]): Promise<{ out: string; code: number }> {
  return new Promise((done) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => (out += data));
    child.on("error", (error) => done({ out: `${String(error)}\n`, code: 1 }));
    child.on("close", (code) => done({ out, code: code ?? 1 }));
  });
}

const runs = Object.entries(tools)
  .filter(([tool]) => tool in declared)
  .flatMap(([tool, flags]) => {
    const bin = `node_modules/.bin/${tool}`;
    // Fail closed: a checkout without `bun install`, such as a fresh worktree, would pass every file.
    if (!existsSync(bin)) refuseCommit(`${tool} not installed: bun install`);
    return chunks.map((paths) => runStagedTool(bin, [...flags, ...paths]));
  });

// Concurrent for speed, reported in a fixed order so the output reads the same on every run.
let failed = false;
for (const { out, code } of await Promise.all(runs)) {
  process.stderr.write(out);
  failed ||= code !== 0;
}
process.exit(failed ? 1 : 0);
