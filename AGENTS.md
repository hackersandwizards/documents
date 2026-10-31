# AGENTS.md

This repository uses `CLAUDE.md` as its project handbook. Read it before editing.

## Rules

Behavioral rules live in `.claude/rules/*.md`. Claude loads them natively. Codex and pi must read the directory themselves. Ignore global rules in this repository because the local set supersedes them.

## Skills

Repository skills live in `.claude/skills/`; `.agents/skills` points there for Codex and pi discovery.

Load the `voice` skill before drafting or editing human-readable prose. Use `polish` only for an explicitly requested full-repository quality pass.
