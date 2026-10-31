---
name: parallel-session
description: Track parallel work and the person's decisions in repo files (GOAL.md, docs/tracking/decisions/items.js, dated reports) and the one generated page of what needs the person, so the person can review after being away, and choose between the shared checkout and a worktree per delegate. Use before fanning out a third delegate, before leaving a session running, and for "what is open", "what needs me", "decision list", "Entscheidungsliste", "worktree".
---

# Parallel session

This folder holds tooling only: `hub.ts`. Goal, work and decision data live in the repo the work
belongs to, never here.

## One home per fact

- `GOAL.md` at the repo root: the goal in the person's words, the limits, what done means, and one
  row per open piece of work with owner and evidence (a commit hash, a file, or "not established"),
  in the shape the file already uses. The owner starts with `P1`, `P2` or `P3` (P1 costs most if
  missed), then an ISO deadline where the row has one, then whoever moves next: the person, an
  agent, or anyone else, such as `P1 2026-11-02 Benedikt (Key), then Ray`.
- `docs/tracking/decisions/items.js`: one row per decision, review request or agent assumption the
  person may veto. An `open` row is a question with options, or, without options, a review request
  whose `context` says what to look at. It is only for direction, money, a relationship or anything
  leaving the company. Every other such point an agent settles is an `assumed` row; a minor or
  reversible default is named in the report only. A task, even one phrased as a question ("Who
  fixes the privacy policy?"), is a `GOAL.md` row.
- `docs/tracking/YYYY-MM-DD-<topic>.md`: one report per topic, what was measured, with evidence.
  Its images sit in `docs/tracking/YYYY-MM-DD-<topic>/`, JPEG at most 1600 px wide.

Work that waits on a decision keeps its `GOAL.md` row, which names the `items.js` row's `id`
instead of repeating the question. The open points for the person's return are the open `GOAL.md`
rows plus the `open` and `assumed` rows in `items.js`. No third list exists.

## Steps

1. At start, read `GOAL.md` and `items.js` in every repo the work touches. Where `GOAL.md` is
   missing and the work spans sessions or delegates, create it with the goal quoted from the
   person's message. A `GOAL.md` row outside the session's goal waits for its own session, whoever
   it is assigned to. Check: the first section quotes the person.
2. Every message from the person that adds, decides or changes work gets its row in the same turn.
   A pasted block from the page holds one `repo:id: choice, note` line per answer, `repo:GOAL <start of the row>` for a
   `GOAL.md` row: write each into
   its repo (step 4), commit, rebuild the page, and confirm every id with its commit; report an id
   that is unknown or already decided. Check: `git diff` shows the row.
3. A delegate's brief names the rows it owns by item or `id`, quotes the `items.js` row format, and
   says whether the delegate works in the shared checkout or a worktree. A delegate edits only
   those rows. Each delegate gets one batch with its write paths and a completion check, and ends
   when that batch is committed. Further work goes to a fresh delegate briefed from paths, commits
   and open findings, never to a running one. A delegate messages only a result, a blocker or a
   question.
4. A finished item leaves `GOAL.md` in the commit that finishes it. A row the person decided takes
   `status: "decided"` and the answer in `decision`, then leaves `items.js`: in the commit that
   carries the decision out, or, where work remains, as one `GOAL.md` row naming the `id`.
   `git log -S '<id>'` finds a removed row.
5. Before each commit that touches `items.js`, run `bun ${CLAUDE_SKILL_DIR}/hub.ts --check <repo>`.
   Check: it prints `ok`.
6. A report states the current state only. A later batch on the same topic edits that report and
   deletes what it superseded. Earlier rounds and raw reviews go to the scratchpad.
7. After each commit that changes `items.js` or the person's `GOAL.md` rows, run
   `bun ${CLAUDE_SKILL_DIR}/hub.ts`. It finds every `items.js` under `~/dev` and writes the page
   (`~/Downloads/stand-entscheidungen/index.html`, or `STAND_PAGE`). Check: its output names the
   repo. A batch that changes an asset a row's images show, such as a logo, colour or lockup,
   re-renders those images in that batch.
8. When the person returns, report from the rows, ordered by what each costs if missed. Before
   ending the session, read the transcript from its first message: every item of the first report,
   every question put and its answer, every promise. Check: each unfinished one has a row.

## Shared checkout or worktree

The shared checkout is the default. Give a delegate a worktree only where the shared index costs
more than the worktree: several delegates committing in one repo at once, or a long run changing
app code that the full gate checks. Short record and document edits stay in the shared checkout.

A worktree in os costs about 1.5 GB of disk and 5 s to create, `bun install` about 2 s from a warm
cache, plus cold Astro and Vite caches. The gate's lock serialises runs within one checkout only,
so each worktree's full gate runs beside the others.

- Before the fan-out, commit and push everything the delegates need: a worktree starts from
  `origin/main`.
- `isolation: worktree` creates `.claude/worktrees/<name>/` on a local branch `worktree-<name>`.
  Where `git check-ignore -q .claude/worktrees/x` fails, add `.claude/worktrees/` to the repo's
  `.gitignore` first. A linter run over the whole tree, such as `eslint .`, also lints a worktree
  there unless its config ignores the path.
- A hand-made worktree goes outside the repo with no branch:
  `git worktree add --detach <scratchpad>/<run>-wt origin/main`.
- The delegate installs the repo's dependencies in its worktree (`bun install` in os) before its
  first commit, since the hook needs them. It commits there, then runs `git fetch`, `git rebase origin/main` and
  `git push origin HEAD:main`, repeating on rejection, before its run ends. Check:
  `git log origin/main..HEAD` prints nothing.
- Remove each worktree as soon as its delegate's work is on `main`, while the session goes on, so
  none outlives it: `git worktree remove <path>` once, inside it, `git log origin/main..HEAD` and
  `git status --porcelain` both print nothing. Delete a `worktree-<name>` branch with
  `git branch -D` once `git log origin/main..worktree-<name>` prints nothing. `git worktree remove`
  drops a clean worktree's unpushed commits without a warning.

## items.js

The file assigns `window.DECISION_REPOS["<repo>"] = [ ... ]`, optionally
`window.DECISION_AREAS = { <area>: "<label>" }`. Required per row: a unique `id`, `title`, `area`,
`priority` (1 to 3), `order`, `status` (`open`, `assumed` or `decided`) and `context`. Optional:
`options` (each `key`, `label`, `detail`), `recommended` (an option key), `assumption`, `decision`
(required once `decided`), `detail`, `images` (option key to a repo-relative image path, one per
option at most), `owner` (who answers; without it, Benedikt, so a row for Stefan sets
`owner: "Stefan"`). `decided` means the person's own answer; a choice an agent made is `assumed`.
