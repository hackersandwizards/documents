# Git hooks

`bun install` points `core.hooksPath` here for this clone, never in user-global git config.

| Hook         | Trigger      | Runs                                                                                                            |
| ------------ | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | every commit | `bun run check:staged`: `gitleaks` over the staged changes, `prettier --check` and `eslint` on the staged files |

`check:staged` runs `.claude/skills/engineering/check-staged.ts`, which every repository shares. A missing `bun`, `gitleaks`, `prettier` or `eslint` fails the commit closed: `brew install gitleaks`, `bun install`.
