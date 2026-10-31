// The pre-commit check every repository runs as `bun run check:staged`: the staged secret scan, then
// `prettier --check` and `eslint` on the staged files. Check, never write: re-staging a rewritten
// file would sweep another session's unstaged lines in that file into this commit. A file whose
// working tree differs from the index is checked from the index on stdin, so those unstaged lines
// neither pass nor block this commit.
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
const unstaged = spawnSync("git", ["diff", "--name-only", "-z"], { encoding: "utf8" });
if (unstaged.status !== 0) refuseCommit("git diff failed");
const differs = new Set(unstaged.stdout.split("\0"));
const partial = staged.filter((path) => differs.has(path));
const whole = staged.filter((path) => !differs.has(path));

// Both tools get every staged path and skip what their own config ignores, so this and
// `bun run check` judge the same files.
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
const stdinFlags: Record<string, (path: string) => string[]> = {
  prettier: (path) => [
    "--check",
    "--ignore-unknown",
    "--log-level",
    "warn",
    "--stdin-filepath",
    path,
  ],
  eslint: (path) => ["--cache", "--no-warn-ignored", "--stdin", "--stdin-filename", path],
};
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = { ...pkg.dependencies, ...pkg.devDependencies };

// Chunked: a commit touching most of a repository passes more path bytes than ARG_MAX holds.
const chunks: string[][] = [[]];
let bytes = 0;
for (const path of whole) {
  if (bytes + path.length > 100_000) {
    chunks.push([]);
    bytes = 0;
  }
  chunks[chunks.length - 1].push(path);
  bytes += path.length + 1;
}

function runStagedTool(
  bin: string,
  args: string[],
  stdin?: Buffer,
): Promise<{ out: string; code: number }> {
  return new Promise((done) => {
    const child = spawn(bin, args, { stdio: "pipe" });
    child.stdin.end(stdin);
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
    return [
      ...chunks
        .filter((paths) => paths.length)
        .map((paths) => runStagedTool(bin, [...flags, ...paths])),
      // Prettier prints a parser notice for an unknown file even when it passes: report failures only.
      ...partial.map((path) =>
        runStagedTool(
          bin,
          stdinFlags[tool](path),
          spawnSync("git", ["show", `:${path}`]).stdout,
        ).then((r) =>
          r.code
            ? { out: `[check:staged] ${tool}: ${path} as staged\n${r.out}`, code: r.code }
            : { out: "", code: 0 },
        ),
      ),
    ];
  });

// Concurrent for speed, reported in a fixed order so the output reads the same on every run.
let failed = false;
for (const { out, code } of await Promise.all(runs)) {
  process.stderr.write(out);
  failed ||= code !== 0;
}
process.exit(failed ? 1 : 0);
