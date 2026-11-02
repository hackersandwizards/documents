# Git hooks

`bun install` points `core.hooksPath` here for this clone, never in user-global git config.

| Hook            | Trigger                                                     | Runs                                                                                                            |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pre-commit`    | every commit                                                | `bun run check:staged`: scaffolding's `check-staged`, below                                                     |
| `commit-msg`    | every commit                                                | `check-confidential` on the message                                                                             |
| `pre-push`      | every push                                                  | `check-confidential prepush`: refuses commits purged from history                                               |
| `post-merge`    | a merge that changed `bun.lock` or `package.json`           | `bun install --frozen-lockfile`, quiet; a failure never fails the merge and shows as the gate's first step      |
| `post-checkout` | a branch checkout that changed `bun.lock` or `package.json` | the same install                                                                                                |

`check:staged` runs `check-staged` from `@hackersandwizards/scaffolding`: `gitleaks` on the index, `check-coupling` and `check-confidential`, then `prettier --check` and `eslint` on the staged files. A missing `bun`, `gitleaks`, `prettier` or `eslint` fails the commit closed: `brew install gitleaks`, `bun install`.
