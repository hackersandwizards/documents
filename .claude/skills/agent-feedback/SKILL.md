---
name: agent-feedback
description: >-
  Improve the skill, rule, agent definition or memory that owns a behaviour, when authoring, reviewing,
  trimming or splitting one, or after a user corrects, refines or externally edits agent work or answers
  what the system should have resolved, never for feedback on people.
---

# Agent Feedback

Feedback and review never authorize an external action: detecting, reading or comparing an edited
draft is not approval to act on it.

## After a correction

Change an artifact only where, with the information the initial run had, a general change would have produced the corrected result.

Output blamed on an existing rule is measured against that rule's stated threshold. Output that
passes means the rule is missing, not violated: author the missing one instead of enforcing the
one that already held.

Before citing a rule against a proposed run, name the artifact the run produces in one noun and
check that the rule takes that noun as its object: a read run that emits material fires no
write-time formula. A rule that does not fire is a boundary to propose, not one to enforce.

Exactly one owner, and only for a reusable gap: a skill or rule for behaviour shared across tasks
or agents, `CLAUDE.md` for what binds every task in one repository, an agent definition in
`.claude/agents/` for one colleague, agent memory in `.claude/agent-memory/` for context to carry
forward rather than a rule. Where the project's instructions, its rules or an agent file name
an owner for the skill, rule or agent file other than the role this run acts for, and grant this
role no repair there, the edit is theirs, in a scheduled review too: report the gap to them instead.

- An agent definition governs only the runs that load it. Where the top-level session, or an agent
  file you do not own, reaches the same hazard, the owner is an always-on rule.
- Where an agent skipped a check the rule demands, read that agent's own memory for the line that
  licensed the skip and repair that line. Where an agent file restates the rule in a narrower scope,
  that narrowing is the defect: widen the clause where it stands rather than adding a second one.
- One agent failing under a fleet rule earns a bound in that agent's own file. A second agent
  failing the same way is the signal to promote the bound into the rule.

Edit the canonical artifact, never a generated mirror, plugin cache or customer-specific copy. Add
only a new reusable invariant. Never add the concrete customer, work product, wording, answer, or
outcome. Forward-test only when it cannot
mutate live systems or require new approval.

## Write for a literal reader

- Cut the history that produced the rule: version changes, vendor incidents, and the date it was
  decided. Keep a measured number, a verbatim phrasing, and the observed failure mode.
- An artifact may state a rule or a measurement. It may not state a status.
- A terminal phrase stops everything rather than the half it was scoped to. Name the half it
  governs, or a run parks its finding in whatever escape hatch sits beside it.
- Where one meaning is spelled out at several sites, name it with one existing word and repeat the
  word, never the description.

## Shape

- A section-scoped rule already misread once earns a file of its own. Check what the first gate in
  a body does to each occasion the description names: the mode that gate locks out is the cut.
- An invariant goes in the file where it fires, never in the router. A caller stating a caveat about another file's behaviour that
  the other file does not state itself means the owner is wrong, not the caller.
- Finish a split by having an agent with no context walk one whole job through the new files,
  given the skill directory rather than one file: a walker confined to one file reports as missing
  what sits next door by design.
- A rule that fires on a minority of turns gets `paths:` frontmatter or becomes a skill. Reference
  material is never always-on. A `paths:` rule loads on a Read, `cat` or Write of a matching file,
  never on a grep or the Skill tool, so a clause that must fire before any Read stays always-on.
- A rule rising into a router is re-scoped per mode as a list of what each mode may write, never
  universalized into one sentence. A surface several operations share (reading a profile) is its
  own file, and a step whose mechanics contradict the shared ones is a surface, not an operation.
  Pair a prohibition with a route to the owner of the excluded work. Freeze the text before
  dispatching a cold walker.

## Adding or cutting a line

A line obliging an agent to report a value is incomplete until it names the field the consumer
joins on. Open the consuming artifact and carry its key back into the line.

A gate deciding whether to produce an artifact answers two questions separately: what makes this
possible, and what makes it wanted. Every suppressing condition ships with its trace, naming the
item it dropped and the reason in the run report, or a wrong suppression leaves no evidence
anywhere.

Cutting a skill's reference to another artifact is a deletion, never a substitution: a description
in place of the name ("the skill that owns the page mechanics") is the same reference, and a shorter
file is the success criterion. Inline the fact only where that pointer was its sole carrier and the
skill cannot run without it. Check the target's frontmatter: an always-on rule is already in the
reader's context, so the citation goes. A `paths:`-scoped rule loads only after the skill has
fired, so its clause is inlined. A name appearing as data, a field value, a channel, an area, is not
a reference and stays.

## Mirrors and sync

The sync script's own `GLOBAL_RULES` and `GLOBAL_SKILLS` arrays say which files are mirrors, and
`FORKS` names the repo-and-skill pairs the hub does not own. Check the file you are about to edit
against all three, per file rather than once per task, and edit the hub copy. The next sync replaces a mirrored directory whole, so a repo-local file
inside a mirrored skill directory goes too, and no check reports either loss.

Before syncing, diff every mirror against the hub, not only the one you touched. Where a mirror
that is not a declared fork carries edits the hub lacks, copy it to the hub first, or the sync
deletes those lines in every repo at once. A declared fork drifting from the hub is the fork
working: leave it, and never lift it into the hub. Build that loop over a shell array: an unquoted
parameter does not word-split in zsh, so the loop runs once against the whole list and reports no
drift. Count the comparisons it made and check that number against repos x artifacts less the
declared forks before believing a green result.

The hub is a git repository of its own: commit the hub copy there with its paths named, then run
the sync script, which commits and pushes the mirrors in every configured repository itself. It first commits every dirty hub path, so read the hub's `git status --porcelain` before running it. A dirty path you did not write defers the sync: copy the files you committed from hub `HEAD` into the current repository's mirror and report the other repositories as pending.
