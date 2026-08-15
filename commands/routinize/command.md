Routinize repeated ad-hoc work from this conversation into canonical,
parameterized programmatic scripts — routines — stored under `scripts/routines/`.
Not a text record: a routine is a script that captures the pattern once, with
the variance between occurrences expressed as parameters. Routine storage consists
of script files and `scripts/routines/manifest.json`.

## Subcommands

- `/routinize [steering prompt]` — Scan conversation and existing routines, generate proposals with manifest updates, and write approved routines to `scripts/routines/`.
- `/routinize run <routine-id> [args]` — Look up `<routine-id>` in `scripts/routines/manifest.json` and execute its script with optional arguments or parameter environment overrides.
- `/routinize list` — Read `scripts/routines/manifest.json` and list all registered routines with their ID, name, description, parameters, and tags.
## When to use

The user invokes `/routinize`, optionally with a steering prompt, after work
that produced repeated patterns — several near-identical slurm job scripts,
recurring build/test incantations, repeated config or launch shapes. The goal
is DRY for programmatic work: future sessions fetch the routine instead of
rewriting it.


## Routine Storage (`scripts/routines/`)

Routines and their index live under `scripts/routines/`:
- **Routine Scripts**: Individual script files (e.g. `launch_slurm_job.sh`) with parameter default overrides (e.g. `VAR="${VAR:-default}"`).
- **Manifest (`scripts/routines/manifest.json`)**: An index containing metadata for every routine (`id`, `name`, `file`, `description`, `parameters`, `tags`).
## The flow

### 1. Ground the routine set

Read `scripts/routines/` and `scripts/routines/manifest.json` at the repo root (walk up from cwd). If they do not
exist, the set is empty — every candidate will be a new routine. The set is
gitignored: agent-side working material, fetched on demand, not repo assets.

### 2. Spawn the background scan subagent

Delegate the scan to a background subagent (task agent). The brief is
`ROUTINIZE-BRIEF.md` — read it and compose the subagent task from it, adding
the user's steering prompt when one was given. The subagent scans the session
transcript, the existing routine set (`manifest.json` and script files), local extensions (`.omp/extensions/`), and existing skills (`skills/`, `.omp/skills/`). It returns structured proposals classified into three tiers: `routine`, `extension`, or `prune-skill`.
### 3. Present proposals

When the results arrive, present every proposal to the user, each with:
type, target routine (the file to extend, or the proposed name for a new
one), the repeated occurrences you found (cite them), the draft content,
the parameters capturing the variance, and the proposed `manifest.json` entry. No proposal is written yet.


### 4. Per-item approval

For each proposal, get the user's decision: **approve**, **edit-then-write**
(apply their changes to the draft), or **reject**. The approval gate is what
keeps the routine set free of bloat — never write without it.

### 5. Write approved items

- **`routine`**:
  - `mkdir -p scripts/routines/`
  - `new`: write script following `ROUTINE-FORMAT.md`.
  - `extend-existing`: modify the existing routine in place, preserving existing behavior via defaults.
  - Create or update `scripts/routines/manifest.json`.
  - Ensure `.gitignore` contains `scripts/routines/`.
- **`extension`**:
  - `mkdir -p .omp/extensions/`
  - Write or update `.omp/extensions/<slug>.ts` following the modular extension skeleton.
- **`prune-skill` (Skill Graduation)**:
  - Generate the replacement routine or extension.
  - Upon explicit user approval, delete the mechanical markdown skill file (`.omp/skills/<name>/` or `skills/<name>/`).

Summarize what was written or extended, including manifest entries, and note that future sessions fetch
routines from `scripts/routines/` (the routine set is gitignored, so routine
search is explicit, like the reference corpus).
