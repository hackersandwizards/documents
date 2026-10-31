---
name: engineering
description: >-
  How to build and change software here (docs over code, when to ask, what never to simplify, comments,
  silent-failure gates), before implementing a feature, refactoring, fixing a bug, reviewing a change or
  planning non-trivial repository work, never for content edits, prose or business records.
---

# Engineering

Architecture docs (CLAUDE.md, rules) outrank existing code where the two disagree. Given a bug
report, fix it on its best reading without asking, and name any other defensible reading with the
fix. Ask first only where no fix can start: the requirement contradicts itself or names a missing
artifact. Fix a bug test-first: a failing test that reproduces it, then the fix. Never simplify away input validation at a trust boundary, error
handling that prevents data loss, security measures, or accessibility basics.

- Cleanup, review and quality passes scan the whole working tree, not only the files this
  conversation touched. Another session's in-flight change sits beside today's work: read it for
  context and leave it to its author. An unstaged change you revert is gone from git for good.
- A parser answering "malformed" with the same value it gives "legitimately empty" turns a loud
  failure into a silent one. Put that gate at the parser, never at each consumer.
- Repairing a record that read as absent does not re-run the jobs that skipped it, and those jobs
  left no trace of the skip. Find the window between the corruption and the repair, then check the
  repaired records against their untouched siblings.
- Write no comment except for a fact neither the code nor a doc file states, such as an ordering constraint, an external quirk or the bug a guard exists for. Keep directive comments.
- Verify each change with the checks that fit it, from the commands the repository's CLAUDE.md
  lists. You choose which; nothing requires the full gate every time, and your run is the only
  full one before the deploy.
- A git hook holds only what is irreversible or takes under about a second: the staged secret scan
  and a staged format and lint check. CI builds, runs the integration tests a deploy needs, deploys
  and applies Terraform after a plan. A schedule runs only to notice an absence no commit reveals,
  such as a new advisory against an unchanged lockfile.
- Start every script and tool through `bun run`: a package.json script where one fits, else the
  project's own binary (`bun run vitest run <file>`), never `bunx`, `npx` or `node_modules/.bin`.
  A hook is one line in `.githooks/` calling a script: `check:staged` runs `check-staged.ts` from
  this folder, `lfs:pre-push` runs `git lfs pre-push` where LFS is used. `check-lock.ts` here
  serialises `bun run check`, and `only-bun.cjs` is the `preinstall` guard.
- Remove or replace a dependency with a known vulnerability before excusing it. An audit
  exception names the advisory ID.
- Module-scope function names are unique per repository, except a framework-dictated name or a
  test-local helper.
- Removing a collection, a skill or an agent also deletes the tests that named it. Port every
  deleted case whose subject still exists: no gate goes red when coverage disappears.
