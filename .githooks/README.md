# Git hooks

`bun install` points `core.hooksPath` here for this clone, never in user-global git config.

| Hook            | Trigger                                                     | Runs                                                                                                            |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pre-commit`    | every commit                                                | `bun run check:staged`: scaffolding's `check-staged`, below                                                     |
| `commit-msg`    | every commit                                                | `check-confidential` on the message                                                                             |
| `pre-push`      | every push                                                  | `check-confidential prepush`: refuses commits purged from history                                               |
| `post-merge`    | a merge that changed `bun.lock` or `package.json`           | `install`: `bun install --frozen-lockfile` under `check-lock`, silent; a held lock or a failure is named on stderr |
| `post-checkout` | a branch checkout that changed `bun.lock` or `package.json` | the same `install`                                                                                                 |

`session-start` is the SessionStart hook in `.claude/settings.json`: it fetches `origin main` within 20 s (`SCAFFOLDING_FETCH_WAIT_S`), says how far `origin/main` is ahead and moves no branch. `.mcp.json`'s chrome-devtools server runs `install` before it starts. Both files are scaffolding's skeleton, which `check-structure --fix` writes.

`check:staged` runs `check-staged` from `@hackersandwizards/scaffolding`: `gitleaks` on the index, `check-coupling` and `check-confidential`, then `prettier --check` and `eslint` on the staged files. A missing `bun`, `gitleaks`, `prettier` or `eslint` fails the commit closed: `brew install gitleaks`, `bun install`.
