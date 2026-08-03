# my-omp-skills — repo conventions

Personal omp extension package: **slash commands** (user-invoked) and **skills**
(model-invoked), adapted from [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT). This file is auto-loaded by omp sessions working in this repo — it is the
authoring contract.

## Bucket taxonomy

- `commands/` — **user-invoked** slash commands. Each is a markdown workflow body
  (`commands/<name>.md`, or `commands/<name>/command.md` when the command has
  companion reference files beside it). Reachable only by typing `/name` — never
  model-invoked.
- `skills/` — **model-invoked** skills (`skills/<name>/SKILL.md`). Discovered from
  the package by omp, listed in the system prompt, reachable on demand. A
  user-invoked command may invoke a model-invoked skill, but never another
  user-invoked command.
- `src/index.ts` — the extension entry. It registers every command in `commands/`
  (name + description + body + companion pointers). The `omp` field in
  `package.json` points at it.

## Adding a command

1. Write the workflow body: `commands/<name>.md` (or a directory with
   companion files).
2. Add a `CommandSpec` entry in `src/index.ts` — name, description, bodyPath,
   and companions if any.
3. Add a one-line entry to the README reference table.
4. Bump `package.json` version. Users update via `omp plugin install` again.

## Adding a skill

1. Write `skills/<name>/SKILL.md` with `name` + `description` frontmatter
   (description is required for discovery). Model-invoked = omit
   `disable-model-invocation`. Put companion files in the same directory —
   they resolve via `skill://<name>/<file>`.
2. Add a one-line entry to the README reference table.
3. Bump `package.json` version.

## Rules

- A user-invoked command must never invoke another user-invoked command —
  delegate to model-invoked skills instead.
- `commands/` and `skills/` are both promoted: everything in them ships.
  There is no non-promoted bucket; put drafts outside the repo.
- Command bodies and skills are plain markdown — edit content without touching
  code. Keep companion files referenced by the names the body uses.
- `/setup` must run once per target repo before the tracker-dependent commands
  (`/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, `code-review`) work.
  It writes `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`
  and an `## Agent skills` block into the target repo's `AGENTS.md`/`CLAUDE.md`.

## Attribution

Derived from [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT). Bodies are adapted, not copied verbatim: `/setup` replaces
`/setup-matt-pocock-skills`, slash references to model-invoked skills were
normalized, and subagent wording was mapped to omp's task agents.
