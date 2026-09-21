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
  - `src/council/` — `council.ts` (deliberation engine, Star Chamber partitioner, domain presets, Ed25519 signer), `council-overlay.ts` (interactive TUI modal inspector).
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

### 8. KV Cache Prefix Stability & Token Economics Invariants
To maintain maximum LLM performance, low turn latency, and high KV cache hit rates ($>90\%$):
- **Prefix Stability**: Dynamic system prompt additions (like `<relevant-knowledge>`) MUST be appended strictly to the tail (`evt.systemPrompt = sysPrompt + ...`). Never prepend or mutate prefix text.
- **Deterministic Formats**: Use static, deterministic formats (e.g. `YYYY-MM-DD` mtime dates, deterministic list sorting) rather than volatile timestamps like `Date.now()`.
### 9. Command UX Invariant — No Think, No Echo, No `--` (ADR-0008)

Every slash command and every handler in `src/**` MUST respect the user-facing UX contract below. Violations are an `AGENTS.md` rule violation, not a style nit:

1. **Pure-display commands MUST NOT trigger an LLM turn.** Set `skipAgentTurn: true` on the `CommandSpec`. The default handler in `src/index.ts:runDefaultHandler` MUST honor that flag and MUST NOT call `pi.sendUserMessage`.
2. **No `--` prefix in user-facing flag/keyword syntax.** Document flags as bare keywords (`quick`, `deep`, `save`, `ml`, `overlay`, `verbose`). The parser MUST still accept `--quick` as a tolerant synonym for muscle memory, but the prose examples in `commands/<name>.md` and `skills/<name>/SKILL.md` show bare form only.
3. **No editor echo. No input mutation.** NEVER call `ctx.ui.setEditorText` or `ctx.ui.pasteToEditor` from a command handler. NEVER call `pi.sendUserMessage` with `/<command> <args>` text after the user typed it (the input box gets repainted with the command echo — this is the `(QUICK)` / `(RAW)` / `(EMBEDDED)` problem on `/council`).
4. **Status-bar text is for the user.** No sub-mode stamps like `(QUICK)` in `ctx.ui.setStatus` — that's routing metadata, not user-readable progress.
5. **Autocomplete every flag and subcommand.** `getArgumentCompletions` MUST surface every subcommand (`list`, `init`, `edit`, `config`, `status`, `recent`, `show`, `add-items`, `add-fields`, `validate`, `dashboard`, `report`), every keyword, and every named preset. When the user types the first token of a subcommand (`/council e`), narrow to matching subcommand heads only.
6. **Default verbosity = silent card.** Single visually rich card in chat; no wall of reasoning prose. `verbose` keyword (no `--`) opts in to multi-stage detail.

7. **Zero Cross-Turn Queue Leaks (Interaction Invariant).**
   - NEVER pass `{ deliverAs: "followUp" }` on receipt cards or display cards. `deliverAs: "followUp"` queues an extra agent turn after completion. Emit cards directly without options while idle.
   - NEVER pass `{ deliverAs: "nextTurn" }` for immediate commands. `deliverAs: "nextTurn"` buffers instructions into `#pendingNextTurnMessages`, polluting whatever prompt the user enters on turn $N+1$. Use `{ triggerTurn: true }` directly.
   - `before_agent_start` handlers MUST return `{ systemPrompt: ... }` rather than mutating `event.systemPrompt` in place (the runtime runner ignores in-place mutations).
   - `input` event handlers MUST return `{ text: ... }` conforming to the active runtime chain contract.

## Rules

- Every user-visible change bumps `package.json` **and** adds a `CHANGELOG.md` entry.
- `main` moves via reviewed PRs, never direct pushes.
- A user-invoked command must never invoke another user-invoked command — delegate to model-invoked skills instead.
- `commands/` and `skills/` are both promoted: everything in them ships.
- `/omp-setup` must run once per target repo before tracker-dependent commands (`/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, `code-review`) work.
- **A pushed tag is not a GitHub Release.** `.github/workflows/release.yml` turns a tag into a Release by extracting that version's notes from `CHANGELOG.md`, so every release needs a heading in one of two accepted styles: `## [X.Y.Z] - <date>` or `## vX.Y.Z — <title>` (the extractor stops at the next `## ` heading). A tag whose `package.json` version or CHANGELOG heading is missing fails the run and publishes nothing — retry without moving the tag via `gh workflow run release.yml -f tag=vX.Y.Z`.

## Attribution

Derived from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Bodies are adapted, not copied verbatim; slash references were normalized, and subagent wording was mapped to omp's task agents.
