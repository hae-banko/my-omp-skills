Routinize repeated ad-hoc work from this conversation into canonical,
parameterized programmatic scripts — routines — under `scripts/routines/`.
Not a text record: a routine is a script that captures the pattern once, with
the variance between occurrences expressed as parameters.

## When to use

The user invokes `/routinize`, optionally with a steering prompt, after work
that produced repeated patterns — several near-identical slurm job scripts,
recurring build/test incantations, repeated config or launch shapes. The goal
is DRY for programmatic work: future sessions fetch the routine instead of
rewriting it.

## The flow

### 1. Ground the routine set

Read `scripts/routines/` at the repo root (walk up from cwd). If it does not
exist, the set is empty — every candidate will be a new routine. The set is
gitignored: agent-side working material, fetched on demand, not repo assets.

### 2. Spawn the background scan subagent

Delegate the scan to a background subagent (task agent). The brief is
`ROUTINIZE-BRIEF.md` — read it and compose the subagent task from it, adding
the user's steering prompt when one was given. The subagent scans the session
transcript plus the existing routine set and returns structured proposals,
classifying each as `extend-existing` (preferred), `new`, or `skip`.

### 3. Present proposals

When the results arrive, present every proposal to the user, each with:
type, target routine (the file to extend, or the proposed name for a new
one), the repeated occurrences you found (cite them), the draft content, and
the parameters capturing the variance. No proposal is written yet.

### 4. Per-item approval

For each proposal, get the user's decision: **approve**, **edit-then-write**
(apply their changes to the draft), or **reject**. The approval gate is what
keeps the routine set free of bloat — never write without it.

### 5. Write approved routines

- `mkdir -p scripts/routines/`
- `new`: write the file following `ROUTINE-FORMAT.md`.
- `extend-existing`: modify the existing routine in place — add the
  parameter/mode/step, preserving existing behavior via defaults. Never fork
  a copy for a special case.
- Ensure `.gitignore` contains the relative entry `scripts/routines/`; add it
  if missing.

### 6. Report

Summarize what was written or extended, and note that future sessions fetch
routines from `scripts/routines/` (the routine set is gitignored, so routine
search is explicit, like the reference corpus).
