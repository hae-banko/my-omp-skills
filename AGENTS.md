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
- `src/` — **TypeScript extension engine** organized by domain:
  - `src/core/` — `workspace.ts` (unified context), `completions.ts`, `markdown-lint.ts`, `locators.ts`, `bootstrap.ts`, `api.ts`.
  - `src/knowledge/` — `knowledge.ts`, `knowledge-tool.ts`, `policy.ts`, `kb-guard-status.ts`, `kb-index-injector.ts`.
  - `src/research/` — `research-dag.ts` (dependency engine), `research-report.ts` (zero-dep TS report generator), `research-store.ts`, `research-renderer.ts`, `research-format.ts`.
  - `src/protocol/` — `iap.ts` (`OMP-IAP/v1` envelopes, performatives, pointer offloading), `iap-hub.ts` (message bus adapter).
  - `src/features/` — `timeline.ts`, `tilt.ts` (14-tier swear jar), `references.ts`, `recent-command.ts`, `clarify.ts`, `hindsight.ts`, `herdr-tools.ts`, `routines.ts`, `subagent-contract.ts`.
  - `src/index.ts` — extension entry point registering tools, commands, and message renderers.
- `tests/` — **domain-grouped test suites** aggregated by `scripts/selftest.ts` (`npm test`):
  - `test-utils.ts` — mock ExtensionApi harness and failure collectors.
  - `commands.test.ts` — command registrations, companion disclosures, frontmatter linter.
  - `knowledge.test.ts` — policy guards, `knowledge_read`, `/record --recent` rendering.
  - `research.test.ts` — DAG resolution, Kahn's cycle detection, report generator.
  - `features.test.ts` — timeline, tilt meter, clarify, hindsight, herdr output, routines.
  - `protocol.test.ts` — OMP-IAP/v1 envelopes, hash integrity, reactive DAG ingestion.

## Adding a command

1. Write the workflow body: `commands/<name>.md` (or a directory with companion files).
2. Add a `CommandSpec` entry in `src/index.ts` — name, description, bodyPath, and companions if any.
3. For zero-token local commands (like `/timeline`, `/tilt`, `/reference`), implement a local TS handler returning `{ handled: true }` so no LLM prompt is sent.
4. Add a one-line entry to the README reference table.
5. Add unit tests in `tests/commands.test.ts` or `tests/features.test.ts`.
6. Run `npm test` and `npm run typecheck`.
7. Bump `package.json` version and add a `CHANGELOG.md` entry.

## Adding a skill

1. Write `skills/<name>/SKILL.md` with `name` + `description` frontmatter (description is required for discovery). Model-invoked = omit `disable-model-invocation`. Put companion files in the same directory — they resolve via `skill://<name>/<file>`.
2. Add a one-line entry to the README reference table.
3. Run `npm test` to verify frontmatter syntax via `src/core/markdown-lint.ts`.
4. Bump `package.json` version and add a `CHANGELOG.md` entry.

## Architectural conventions

### 1. Unified Workspace Context (`src/core/workspace.ts`)
All directory paths (`knowledge`, `routines`, `scratch`, `adr`, `audits`, `references`) resolve through `getWorkspaceContext(startDir)`. Never hardcode relative path joining (`../../.omp/...`); rely on the immutable, memoized workspace context.

### 2. Zero-Token Local TS Execution
Commands that merely inspect local state, format cards, or toggle features (`/timeline`, `/reference`, `/tilt`, `/record --recent`, `/pitfall --recent`, `/clarify debug`) run entirely in local TypeScript handlers. They bypass the LLM workflow body, avoiding token burn and turn latency.

### 3. Inter-Agent Communication Protocol (OMP-IAP/v1)
Subagents communicating over `hub` or asynchronous file blackboards use `src/protocol/iap.ts`:
- Typed performatives: `INFORM`, `QUERY`, `PROPOSE`, `BLOCKED`, `COMPLETED`, `FAILED`.
- Envelopes with payloads $>2\text{ KB}$ automatically offload to pointer envelopes with cryptographic SHA-256 digests (`computeSha256`).
- Reactive DAG engine (`src/research/research-dag.ts`) consumes incoming `COMPLETED` envelopes to unblock downstream child tasks.

### 4. Zero-Dependency Research Engine
- Outline dependencies: `depends_on: [parent_item]` in `outline.yaml` resolved via Kahn's algorithm cycle detection and topological frontier selection.
- Research report generation (`src/research/research-report.ts`): compiles `results/*.json`, `fields.yaml`, and `outline.yaml` directly in pure TypeScript with zero host Python dependencies.

### 5. Markdown Frontmatter Integrity
All markdown files across `commands/` and `skills/` are validated on every `npm test` via `src/core/markdown-lint.ts`. Checks verify unclosed frontmatter delimiters, duplicate keys, quote balances, and boolean scalar types.

### 6. Knowledge Base & Append-Only Policy
`/record`, `/pitfall`, and `/research*` write to `<target-repo>/.omp/knowledge/`:
- **Append-only** — existing records/pitfalls/INDEX are protected by `src/knowledge/policy.ts` against `edit`, overwriting `write`, and destructive shell operations.
- **Timestamped names** — `YYYY-MM-DD_<slug>.md`.
- **Indexed** — every entry appends one line to `INDEX.md` (newest first).

### 7. TUI Card Rendering (76-Column ANSI Invariant)
Custom message renderers (`pi.registerMessageRenderer`) must calculate display width via `displayWidth` (which strips ANSI escape sequences before measuring character width) to ensure colored borders (`BORDER_COLORS`) strictly respect 76-column box boundaries.

## Rules

- Every user-visible change bumps `package.json` **and** adds a `CHANGELOG.md` entry.
- `main` moves via reviewed PRs, never direct pushes.
- A user-invoked command must never invoke another user-invoked command — delegate to model-invoked skills instead.
- `commands/` and `skills/` are both promoted: everything in them ships.
- `/omp-setup` must run once per target repo before tracker-dependent commands (`/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, `code-review`) work.

## Attribution

Derived from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Bodies are adapted, not copied verbatim; slash references were normalized, and subagent wording was mapped to omp's task agents.
