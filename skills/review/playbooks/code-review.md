# Code Review

Use when reviewing changes since a commit, branch, tag, or merge-base along two independent axes: Standards and Spec. Judge readability by what a reader must hold in mind ([skill://principles/minimize-reader-load.md](../../principles/minimize-reader-load.md)).

Scope is what the user named (a commit, branch, tag, or range). If unspecified, ask the user for the fixed point.

## Steps

### 1. Pin the fixed point

Resolve the fixed point supplied by the user (a commit SHA, branch name, tag, `main`, `HEAD~N`, etc.).
Run `git rev-parse <fixed-point>` to confirm it resolves.
Capture the diff with `git diff <fixed-point>...HEAD` (three-dot comparison against merge-base) and the commit list with `git log <fixed-point>..HEAD --oneline`.
Confirm the diff is non-empty before proceeding.
Completion criterion: Fixed point resolves and diff is verified non-empty.

### 2. Identify the spec source

Locate the originating specification in this order:
1. Issue references in commit messages (`#123`, `Closes #45`, etc.) via `.omp/agents/issue-tracker.md` (or legacy `docs/agents/issue-tracker.md`).
2. Explicit path passed in scope or arguments.
3. PRD or spec file under `docs/`, `specs/`, `.omp/scratch/`, or `.scratch/` matching the branch or feature name.
4. User clarification if none found. If the user states no spec exists, mark the Spec axis as skipped.
Completion criterion: Spec source text retrieved or explicitly marked unavailable.

### 3. Identify standards sources and smell baseline

Check the repository for documented coding standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, or architecture guides).
Combine documented repo standards with the Fowler smell baseline below. Documented repo standards always override the baseline, and baseline smells are heuristics/judgement calls:
- **Mysterious Name** — Function, variable, or type name does not reveal purpose.
- **Duplicated Code** — Same logic shape appears across multiple hunks or files.
- **Feature Envy** — Function reaches into another object's data more than its own.
- **Data Clumps** — Same group of fields or parameters travel together.
- **Primitive Obsession** — Primitive type standing in for a domain concept.
- **Repeated Switches** — Same conditional cascade on type recurring across changes.
- **Shotgun Surgery** — Single logical change requires scattered edits across many files.
- **Divergent Change** — Single module modified for multiple unrelated reasons.
- **Speculative Generality** — Hooks, abstractions, or parameters not needed by the spec.
- **Message Chains** — Deep navigation chains coupling caller to intermediate structure.
- **Middle Man** — Class or function primarily delegating onward.
- **Refused Bequest** — Subclass ignoring or overriding inherited interface.
Completion criterion: Applicable repo standards and smell baseline cataloged.

### 4. Spawn subagents in parallel

Spawn both axes in a single batch using the `task` tool:
- **Standards subagent**: Pass the full diff command, commit list, repository standards documents, and the smell baseline in full. The brief: report hard violations of repo standards and judgement-call baseline smells with cited file, hunk, and smell name; omit anything enforced by tooling; keep under 400 words.
- **Spec subagent**: Pass the diff command, commit list, and spec text. The brief: report missing/partial requirements, scope creep, and incorrectly implemented requirements with quoted spec lines; keep under 400 words. (If spec is missing, skip this subagent).
Completion criterion: Subagent responses received or Spec axis explicitly recorded as skipped.

### 5. Aggregate findings

Format findings under separate `## Standards` and `## Spec` sections verbatim or lightly cleaned. Never merge, reorder, or cross-rank findings between axes.
Append a single summary line reporting total findings per axis and the most critical issue within each axis.
Completion criterion: Aggregated report compiled under separate headings with final summary line.

## Reply

Present the two-axis report:
- `## Standards`: Documented standard violations and baseline code smells.
- `## Spec`: Requirements gap, scope creep, and incorrect implementations (or note that spec was unavailable).
- One-line summary: total findings per axis and worst issue within each axis.
