# Changelog

All user-visible changes to my-omp-skills. Releases are tagged `vX.Y.Z`;
## v0.28.0 — Research dashboard UX overhaul (research-driven, 21 findings)

Implemented from the deep-research project `.omp/knowledge/research/2026-08-07_research-dashboard-ux/` (21 items, 378/378 fields, report.md). All changes are extension-side; payload additions are optional and backward-compatible (old transcript cards replay identically).

- **Canonical status vocabulary** (`src/research-status.ts`): one set of pipeline states — `OUTLINE / RUNNING / CONVERGED / REPORT_READY / PAUSED / CANCELLED / ERROR / STALE` — mapped to the AG-UI run lifecycle, replacing three inconsistent vocabularies (documented-but-never-emitted words, phase-arrow display strings, dead `RUNNING` review status). Dashboard/wave/help cards render the status badge + a phase stepper (`1. Outline ✓ → [2. OODA] → 3. Report`).
- **Width-aware rendering** (`src/research-format.ts`): all card lines now measure display cells (CJK/emoji = 2, combining = 0) instead of UTF-16 `slice`/`padEnd` — fixes broken borders on wide glyphs and the pi-tui hard-width crash class. Header badges are never truncated (slug middle-truncated to fit).
- **Freshness & timestamps** (`src/research-freshness.ts`): dashboard and wave cards carry absolute ISO `as_of`; `freshness` (fresh/warn/stale, WARN >1× / STALE >2× expected interval) is derived at emit time and frozen — deterministic transcript replays. OUTLINE/REPORT_READY are never stale.
- **Honest wave card**: no more fabricated `Uncertainty Reduction (ΔU): -0.15` — ΔU renders only when a real reduction is reported; operational metrics (`total_items`, `completed_items`, `pending_items`, `wave_items`, `failed_*`, `per_item_status`, `unresolved_fields_count`, `preset`) are now rendered as Landed/In-flight/Failed/Pending; monotonic `elapsed`/`eta` + indeterminate fallback (`RUNNING…`) replace the fake 0% bar.
- **Dashboard**: `topic` in the payload, action-first layout (`Next:` concrete command with slug), capped fields ratio (no more >100% coverage), `pending_items`, `unresolved_fields_count`, `waves_run`, explicit `errors` section, `--compact` detail flag.
- **Review card**: `detail: compact|full` (`--full`/`--compact`), ★/★★/★★★ detail-level glyphs, real copy-pasteable `Next Commands` (the fake `[1] Launch Deep Waves` affordances are gone), "…and N more" now tells you the exact command to see the rest.
- **Report preview**: renders `toc`, `summary_fields`, `total_items`, `resolved_items`, `unresolved_fields_count`, `preview_content` (previously ignored); honest empty state ("No results yet — run /research-deep") instead of misleading "None (all fields resolved)".
- **New cards**: `my-omp-research-help` (`/research help` — commands/shortcuts/next step; `envcheck` adds TERM/COLORTERM/NO_COLOR/CI diagnostics) and `my-omp-research-error` (explicit error card on project-not-found instead of a toast-only path). `/research` completions now read one shared `RESEARCH_SUBCOMMANDS` registry (anti-drift).
- **Plain-text fallback**: dashboard/review/help/envcheck emits carry `content` one-liners for non-TTY/CI/print mode; workflow bodies now include them for wave and report-preview emits.
- **Workflow bodies**: canonical status vocabulary documented; front-matter upkeep steps added (phases 2/3 update `status`/`counts`/`waves_run`/`updated` — no more permanently stale `status: outline`); dashboard auto-emit at wave start (RUNNING) and after convergence (CONVERGED) and report generation (REPORT_READY), max one card per wave with byte-dedupe; real stop path on user interrupt (PAUSED/CANCELLED front-matter write + one terminal card) and resume announces "skips N completed item(s)".
- **Tooling**: `validate_json.py` now supports both `field_categories:` (legacy) and `categories:` schemas with real coverage semantics (`[uncertain]` values and `uncertain`-array names count as present-but-unresolved); selftest extended with renderer unit checks (all lines ≤76 display cells incl. CJK slugs, badge/no-ΔU/no-fake-affordance assertions, help/error renderers, `/research help`+`envcheck` handlers).

## v0.27.0 — Hardened security, resilience & usability (11 bug fixes)

- **Critical Security Fixes**:
  - `policy.ts`: Fixed `getPathList` to extract paths from `edit` tool header tags (`[<path>#<tag>]`), enforcing append-only rules for `.omp/knowledge/` and `.omp/audits/` during `edit` operations.
  - `routines.ts`: Path traversal hardening in `run_routine` tool using normalized path checks (`resolve` & `relative`) to prevent running scripts outside `scripts/routines/`.
- **High-Severity Reliability Fixes**:
  - `telemetry-renderer.ts` & `research-renderer.ts`: Added defensive array, string, and null guards across all 7 card renderers to prevent uncaught `TypeError` crashes on sparse or malformed details payloads.
  - `policy.ts`: Hardened `refersToProtected` path tokenization and extended `isDestructiveShell` to detect interpreter inline scripts (`python3 -c`, `node -e`), `git rm`, and `find -delete`.
  - `knowledge-tool.ts`: Added `"audits"` to `knowledge_read` Zod parameter enum schema.
- **Medium & Low Usability Polish**:
  - `index.ts`: Stopped silent fallback to `entries[0]` on nonexistent slugs in `/research` and `/audit`, notifying users of missing slugs instead.
  - `routines.ts`: Filtered out null/non-object array entries in `manifest.json` routines parsing.
  - `knowledge.ts`: Added `statSync().isDirectory()` and `isFile()` guards to prevent `EISDIR` / `ENOTDIR` crashes.
  - `index.ts`: Updated YAML parsing regex to exclude commented outline lines (`# - name:`).
  - `index.ts`: Excluded directories named `spec.md` from `/to-spec` completions, and non-git directories from `/reference update` completions.

## v0.26.0 — Local TUI view subcommands (no LLM agent turn invocations)

- **Local TUI View Subcommands**: Running view-only / status commands (`/research dashboard`, `/research review`, `/research status`, `/research off`, `/audit status`, `/audit view`, `/audit list`, `/triage status`) now renders their TUI telemetry cards and toasts locally from disk artifacts without sending a user message to the AI agent or wasting LLM turns.
- **Performance & Token Savings**: Pure interface state queries and dashboard views resolve instantly at zero token cost.
- **Selftest Assertions**: Added unit test assertions verifying `sent.length === 0` and custom card delivery for local view commands.

## v0.25.2 — Git hygiene: untrack .omp/ runtime directory
## v0.25.2 — Git hygiene: untrack .omp/ runtime directory

- **Untrack `.omp/` from git index**: removed `git ls-files .omp` content from the index (`git rm -r --cached .omp/`) so local runtime session knowledge, audits, research files, and reference clones never leak into the remote repository. Local files on disk are preserved.
- **Updated `.gitignore`**: now also excludes `.omp/` and `.scratch/` from tracking, alongside the existing `node_modules/`, `dist/`, and `*.log` entries.

## v0.25.0 — TUI Telemetry Cards & Autocomplete Overhaul
## v0.25.1 — Developer-focused README overhaul

- **Developer-Focused Documentation Overhaul**: Complete rewrite of `README.md` targeted at developers building with `oh-my-pi` plugins and agentic workflows.
- **Architecture & System Diagrams**: Added Mermaid sequence/architecture diagrams covering extension API hooks, silent workflow prompt execution, TUI telemetry widgets, policy guardrails, and persistent storage (`.omp/`).
- **Comprehensive Technical Breakdown**: Documented all 26 user-invoked slash commands, 12 model-invoked skills, 7 TUI telemetry renderers, SemVer auditing (`.omp/audits/`), routine scripts (`scripts/routines/`), append-only knowledge base (`.omp/knowledge/`), and LaTeX math typesetting.


- **New TUI Telemetry Cards (`src/telemetry-renderer.ts`)**:
  - `AuditCard` (`audit-card`): Displays audit title, slug, version (`v0.1.0`), status (`active`), root report path (`overview.md`), subtopics count, and latest revision.
  - `TicketBreakdownCard` (`ticket-breakdown`): Emitted by `/to-tickets` / `/to-spec`. Displays ticket count, tracker path, blocking dependencies ($\text{Ticket 1} \rightarrow \text{Ticket 2}$), and readiness status.
  - `TriageStatusCard` (`triage-status`): Emitted by `/triage`. Displays total backlog items, breakdown (`unlabeled`, `needs-triage`, `agent-ready`), and recommended next action.
- **Autocomplete Overhaul**:
  - Added rich argument completions for `/implement` (pending ticket files under `.scratch/` & `docs/`), `/to-spec` (spec files), `/wayfinder` (`status`, `map`, `list`, `resolve`), `/omp-setup` (`local`, `github`, `gitlab`, `labels`, `domain`), `/ask-me` (26 commands + category names), `/grill-me` & `/grill-with-docs` (feature spec names), and `/audit` (`status`, `list`, `view`, `subtopics`, `--recent`, `--version` + slugs).

## v0.24.0 — Audit topic hierarchies & overview.md index

- **`overview.md` as Audit Root**: `.omp/audits/<slug>/overview.md` is now the primary root document, index, and executive summary for topic audits (with `report.md` preserved as a fallback alias).
- **Subtopic Hierarchies & Hyperlinks**: Audits covering complex multi-component topics support subfolders (`.omp/audits/<slug>/subtopics/<name>.md`). `overview.md` maintains living findings and relative markdown hyperlinks (`[<Subtopic Name>](./subtopics/<name>.md)`).
- **Runtime `knowledge_read` & Policy**: `src/knowledge.ts` updated to discover `overview.md` first, resolve subtopic hyperlinks, and parse nested audit structures; `src/policy.ts` updated to protect `.omp/audits/<slug>/` while permitting controlled updates to `overview.md`, `report.md`, and subtopic `.md` files.

## v0.23.1 — Audit prompt silence policy

- **Audit workflow prompt silence policy**: `/audit` workflow instructions and `AUDIT-FORMAT.md` template now stay hidden in the transcript (like `/grill-me`). Explicit non-printing directive added to `commands/audit/command.md`: do not print, quote, summarize, or reproduce the workflow prompt or template text; mid-work invocations spawn the background subagent silently and reply in 1–2 terse sentences (verdict / report path); dedicated audit turns begin critical investigation or questioning immediately.


- **New `/audit` Command**: Added formal investigative audit command with independent, critical evaluation stance (non-validating).
- **Dedicated Storage (`.omp/audits/`)**: Reports saved to `.omp/audits/<slug>/report.md` (and optional snapshots under `.omp/audits/<slug>/archive/vX.Y.Z.md`).
- **Semantic Versioning Policy**: SemVer tracking (`patch` for minor edits/clarifications, `minor` for expanded scope/methodology, `major` for fundamental restructuring) with mandatory `## Revision History` updates.
- **`AUDIT-FORMAT.md` Specification**: Standardized 7-section template (`Executive Summary`, `Scope & Subject`, `Critical Evaluation & Methodology`, `Detailed Findings`, `Risks & Limitations`, `Conclusion & Recommendations`, `Revision History`).
- **Runtime `knowledge_read` & Policy**: `src/knowledge.ts` extended with `type: "audits"`; `src/policy.ts` updated for `.omp/audits/` protection and controlled lineage updates.


## v0.22.0 — Deep Research TUI telemetry cards & ergonomic shortcuts

- **Ergonomic Shortcuts**: Added `/research 1 [topic]`, `/research 2 [slug]`, `/research 3 [slug]`, and `/research dashboard [slug]`.
- **TUI Card Renderers (`src/research-renderer.ts`)**:
  - `ResearchWaveProgressCard` (`research-wave-progress`): Real-time wave execution card showing wave number (`[WAVE 2/3]`), field completion progress bar, active subagents, active strategy modules, and uncertainty reduction delta ($\Delta U$).
  - `ResearchReportPreviewCard` (`research-report-preview`): Pre-flight preview card rendered before writing `report.md`, showing coverage percentage, verified sources count, executive summary preview, and unresolved field provenance.
  - `ResearchDashboardCard` (`research-dashboard`): End-to-end project lifecycle card showing pipeline status ($\text{Phase 1} \rightarrow \text{Phase 2} \rightarrow \text{Phase 3}$), global completion metrics, and project artifacts status.
  - Upgraded `ResearchReviewCard` (`research-review`): Visual ASCII completion progress bars and source yield badges.

## v0.21.3 — `/research` Phase 1 emits a draft Research Review window immediately

- **`/research` Phase 1 draft window**: invoking `/research` (bare) or `/research 1 [topic]` now opens the TUI Research Review Window with `status: "DRAFT REVIEW"` and a placeholder `${YYYY-MM-DD}_${topic-slug}` slug, so the user sees the planned project before the workflow body reaches the model. The agent then replaces the draft with the real outline payload via the same `research-review` custom message. Subcommands (`review`, `add-items`, `add-fields`, `status`, `run`, `2`, `3`, `dashboard`) fall through to the default body-send + user-prompt flow unchanged.
- **Custom handler pattern**: the `research` command spec now carries a `handler` field; the default body-send flow is factored into a `runDefaultHandler` helper so custom handlers can share the hidden-workflow + user-prompt logic. The `CommandSpec.handler` type now receives `{ body, companionPaths }` so handlers can re-use the default flow. Selftest green.

## v0.21.2 — hindsight state shown in the bare-command autocomplete

- **`/hindsight` completion header**: typing `/hindsight` (no argument) now surfaces a dim header item at the top of the autocomplete list showing the live sta…[+437]

## v0.21.1 — don't-look-for-claude-md rule

- **New always-apply rule** `rules/dont-look-for-claude-md.md`: tells the model not to proactively grep/glob/`read` for `CLAUDE.md` / `AGENTS.md` / `.cursorrules` at session start, on entering a new directory, or "just to check". The runtime already loads the relevant agent-context files into the system prompt; anything else is noise and the user has not asked for it. Workflow bodies that explicitly direct a read still take precedence.

## v0.21.0 — deep research performance optimizations

- **Subagent Prompt Token Reduction**: Streamlined `commands/research/WEB-SEARCH-AGENT.md` from 173 lines to 52 concise lines, eliminating 120+ lines of dead prompt templates while preserving mandatory module loading and output format.
- **Search Query Deduplication**: Added explicit knowledge deduplication check in `WEB-SEARCH-AGENT.md` and `commands/research-deep/command.md` to prevent re-querying identical URLs or search phrases across subagent OODA waves.
- **Exact Operator Query Templates**: Added exact, non-redundant search operator patterns across all 5 strategy modules in `commands/research/modules/` (`arxiv:`, `site:scholar.google.com`, `site:github.com`, `site:zhihu.com`, `site:stackoverflow.com`).
- **JSON Validation & Report Generation Speed**: Precomputed `_NESTED_KEYS` set in `validate_json.py` for single-pass field extraction; optimized `generate_report.py` template specifications in `commands/research-report/command.md` for single-pass JSON processing and O(1) dictionary lookups.

## v0.20.0 — performance optimizations

- **Hindsight Config mtime Caching**: `reloadHindsightConfig()` in `src/hindsight.ts` now uses `statSync` `mtimeMs` caching, skipping redundant disk reads and JSON parsing when `~/.omp/hindsight.json` is untouched.
- **Directory & Root Resolution Memoization**: `findRepoRoot()`, `findRoutinesRepoRoot()`, and `findKnowledgeRoot()` memoize directory hierarchy lookups with `Map` caches, eliminating repetitive `existsSync`/`statSync` walks.
- **Completion & Directory Scanning**: `readdirSync` in `getArgumentCompletions` now uses `{ withFileTypes: true }` and early argument-prefix filtering, eliminating redundant filesystem queries on completion keystrokes.
- **Pre-compiled Module-Level Regexes**: Static regular expressions across `src/index.ts`, `src/policy.ts`, `src/routines.ts`, `src/herdr-tools.ts` pre-compiled at load time.
## v0.19.1 — README documentation overhaul

- **README Overhaul**: Updated `README.md` to document all features through v0.19.0 while preserving the top banner header image (`assets/banner.png`).
- **Documented Features**: TUI Research Review Window (`ResearchReviewCard`), living `research.md` outline, `/research` subcommands, deep research OODA waves, execution scale presets (`small`/`medium`/`high`), `_attempts` provenance notes, `/routinize` `manifest.json` & `run_routine` tool, and dynamic completions table.

## v0.19.0 — Plan-inspired TUI Research Review Window & living research.md outline

- **Plan-inspired TUI Research Review Window (`src/research-renderer.ts`)**:

  - Custom message renderer `research-review` that renders a framed,
    76-column Unicode TUI review card displaying header status, Living Outline
    preview (`research.md`), field framework definitions, strategy modules, and
    execution scale settings, with interactive action options.
- **Living Outline (`research.md`) & Command Bodies**:

  - `commands/research/command.md`: writes living outline `research.md`
    alongside `outline.yaml` and `fields.yaml`, and emits `research-review`
    custom message.
  - Subcommands: `/research review [slug]`, `/research add-items [slug]`,
    `/research add-fields [slug]`, `/research status [slug]`,
    `/research run [slug]`.
  - `commands/research-add-items/` & `commands/research-add-fields/`:
    update `research.md` and re-emit `research-review` custom message to
    refresh the TUI draft review window preview.
- **Autocomplete & TUI**:

  - `/research` argument completions for `review`, `add-items`,
    `add-fields`, `status`, `run`, `off`, and live research project
    directory slugs.

## v0.18.0 — hidden workflow prompt execution for clean TUI transcripts

- **Hidden Workflow Prompts**: Slash commands now dispatch heavy workflow
  markdown bodies, argument substitutions, and companion file pointers as
  hidden context messages (`display: false`, `attribution: "user"`). The
  full workflow guidance reaches the model without polluting the visible
  chat history.
- **Clean TUI Transcript**: The visible user-attributed message in the TUI
  transcript now shows only the clean command prompt (e.g.
  `/grill-me my idea`), eliminating 100+ lines of prompt template bloat
  while preserving full workflow guidance for the model. Every TUI
  transcript now reads as the user typed it.
- **Selftest Updates**: Updated `scripts/selftest.ts` assertions to verify
  clean visible user prompts (`/${name}` exactly) and hidden workflow body
  payloads (`display: false`). Companion-pointer, arg-passthrough, and
  frontmatter-stripping checks now key off the hidden custom message.

## v0.17.0 — routinize OMFG-inspired enhancements & run_routine tool

- **OMFG-inspired `/routinize` enhancements**:

  - `scripts/routines/manifest.json`: JSON metadata index (`id`, `name`, `file`,
    `description`, `parameters`, `tags`) — every routine script has a
    matching manifest entry.
  - Subcommands: `/routinize scan` (pattern scan & proposal flow),
    `/routinize run <id>` (execute routine by ID or file), `/routinize list`
    (display indexed routines).
  - Automated pre-flight validation: `ROUTINIZE-BRIEF.md` now runs
    `bash -n` syntax check before offering routine proposals.
- **`run_routine` Tool (`src/routines.ts`)**:
  - Model-invoked tool to execute parameterized routine scripts using
    `manifest.json` parameter schemas.
  - Custom TUI card renderer displaying execution exit codes and outputs.
- **Autocomplete & TUI**:
  - `/routinize` argument completions for `scan`, `run <id>`, `list`, and
    live routine ID suggestions from `manifest.json` and `scripts/routines/`.

## v0.16.0 — dynamic completions, actionable policy hints, docs overhaul

- **Dynamic argument completions** across the user-invoked surface:
  - `/reference` offers the four subcommands (`add`, `update`, `remove`,
    `list`) when the prefix is empty, then narrowed subcommand-specific
    arguments — `add` keeps the cursor for the URL, `update <name>` and
    `remove <name>` enumerate the cloned reference names under
    `.omp/references/`, `list` stays plain.
  - `/research-deep` and `/research-report` offer dated research project
    slugs from `.omp/knowledge/research/`. `/research-deep` additionally
    lists the `small` / `medium` / `high` execution presets and accepts
    `preset slug` (e.g. `small 2026-08-02_demo`); dated-name filter keeps
    stray directories out of the picker. `/research-report` shows every
    project, dated or not.
  - `/record` and `/pitfall` offer `--recent` as the sole completion —
    discoverable, terse, mirrors the existing option.
  - `/triage` offers `--unlabeled` and `--needs-triage`.
  - `/to-tickets` offers tracked markdown spec files under `.scratch/specs/`
    and `docs/specs/`.
  - The runtime contract `api.ts` gains `getArgumentCompletions?`; the
    selftest exercises every picker (subcommand shape, prefix filtering,
    `add` cursor, dated vs undated slugs, single-arg no-past-end).
- **Actionable policy hints** (`src/policy.ts`): the blocked-edit reason
  text now points the model at `/record <title>` (save a finding),
  `/pitfall <description>` (capture the failure), the `knowledge_read` tool
  (or `/record --recent`) to query past entries, and the add-a-correcting-
  one rule for overwrites. Previously it only named `/record` and
  `/pitfall`.
- **Documentation overhaul** (`README.md`): prose counts updated to 25 slash
  commands / 12 skills (matching the registered inventory); the `/hindsight`
  configuration table documents every field in `~/.omp/hindsight.json`
  (`name`, `nudge`, `leadIn`, `onMessage`, `offMessage`) with types, purpose,
  and a worked example; a new "Deep Research internals" section documents
  the `commands/research/modules/` strategy modules directory and how to
  extend coverage without touching workflow code.

## v0.15.0 — deep research: OODA waves, presets, no batch approval

Implements GitHub issues #2, #3, #4 — workflow-body changes (no code).

- **No batch approval (#2)**: `/research-deep` no longer asks before each
  batch. Waves dispatch automatically; `--approve-each` restores the ask-tool
  gate.
- **Presets (#3)**: `/research-deep [small|medium|high]` (or
  `execution.preset` in `outline.yaml`) sets the per-wave scale — small
  (1–2 parallel agents, items_per_agent 1), medium (3–5, 2), high (as many as
  pending items, 1). Explicit `batch_size`/`items_per_agent` in the outline
  override presets; default medium.
- **OODA waves (#4)**: phase 2 runs repeated Orient → Decide → Act → Observe
  waves. Each wave's results feed the next: per-item JSON gains internal
  `_attempts` (`{wave, angles, modules, outcome}`) and `_wave`; `[uncertain]`
  values resolve in place and the `uncertain` array prunes as later waves
  confirm fields; follow-up waves reroute modules/angles instead of repeating
  them. Convergence: zero new uncertain/empty items, two consecutive
  non-improving waves, `max_waves` (default 3, `--max-waves N` overrides), or
  user stop.
- **Report provenance (#4)**: `/research-report` now documents what was tried
  for unresolved fields — per-item provenance note listing the unresolved
  field names and the `_attempts` (wave/angles/modules/outcome); falls back
  to names-only for pre-OODA results. Underscore internal fields stay out of
  the report body.
- Docs: README row updated; `commands/research/command.md` documents the
  `preset` execution field.

## v0.14.4 — hindsight state in the TUI options

- Typing `/hindsight ` in the input box now shows the subcommands (`on`,
  `off`, `status`) as completions with the **live state** in their
  descriptions — "Enable the reflection pass (currently on/off)" — the
  advisor-style intuitive on/off affordance, with nothing persistent on
  screen. The dim one-shot footer line (toggle toast) and receipt card stay
  as before.
- Selftest: completion items, prefix filtering, and state-bearing
  descriptions asserted; `getArgumentCompletions` added to the `api.ts`
  command contract.

## v0.14.3 — hindsight feedback is one-shot, not persistent

- The persistent footer status line (`Hindsight: on/off`) from v0.14.0 is
  removed — the user wanted the state shown once after each toggle, then
  saved silently, not a permanent on-screen indicator. `/hindsight` now
  toasts the configurable `onMessage`/`offMessage` and emits the receipt
  card; nothing stays on screen.
- `ui.setStatus` contract removed from `api.ts` and the selftest.

## v0.14.2 — configurable hindsight toggle messages

- `onMessage` / `offMessage` are back in `~/.omp/hindsight.json` — they were
  removed in v0.13.2 because they only fed the model reply that silent
  toggles deleted. Now they drive the **toast** (the visible feedback):
  `/hindsight on|off|status` toasts your text instead of the fixed
  "hindsight enabled/disabled". The footer status line and receipt card keep
  their fixed `Hindsight: on/off` / `HINDSIGHT — ON/OFF` glyphs. Existing
  configs that still carry the old keys start using them immediately.
- Selftest: custom `onMessage` reaches the toast; status test no longer
  asserts exact default text (it would depend on the machine's config).

## v0.14.1 — hindsight once per yield

- The reflection pass now fires **at most once per user message** — the
  "one nudge until yielding" rule. Previously it was once per turn: internal
  turns within the same yield (advisor cards, todo reminders, follow-up
  drains) could each re-trigger the nudge and stack reflection passes.
  The handler counts user-role messages in the `session_stop` payload; a
  nudge is spent until a new user prompt changes that count. The
  `stop_hook_active` continuation guard is unchanged.
- Selftest: same-yield second session_stop does not re-nudge; a new user
  message re-arms the pass.

## v0.14.0 — hindsight feedback like /advisor

- `/hindsight` now gives advisor-style feedback: a persistent footer status
  line (`Hindsight: on` / `Hindsight: off`) via `ui.setStatus`, set on every
  invocation (toggle, `on`/`off`, or `status`), plus the existing toast. The
  footer indicator is synchronous UI, so it appears even when the session is
  mid-stream — where the receipt card was queued invisibly and the toggle
  looked like nothing happened. The toggle itself stays silent (no user
  message, no model reply).
- The `hindsight` receipt renderer's state detection is now exact
  (`content` ends in " on") instead of a substring check.
- Selftest: status asserts the footer status-line call; `api.ts` documents
  `ui.setStatus`.

## v0.13.3 — hindsight status + clearer card

- `/hindsight status` (or `state`) reports the current state without toggling
  and without a model reply — no more guessing whether the pass is on.
- The `hindsight` receipt card now carries a subtitle: "reflection pass runs
  after real-work turns" (on) / "turns settle after the first pass" (off).
- Selftest: status emits no user message, reports the state, and does not
  flip it.

## v0.13.2 — silent hindsight toggle

- `/hindsight on|off` no longer sends a user message, so the model never
  replies to a toggle — just a `hindsight` receipt card (`HINDSIGHT — ON/OFF`,
  new renderer) and a `ui.notify`. The `onMessage`/`offMessage` config fields
  are removed (they existed only to feed that reply); `name`/`nudge`/`leadIn`
  remain. Selftest: silent commands are marked in EXPECTED and asserted to
  emit no user message; renderer asserted.

## v0.13.1 — herdr read parsing fix

- `herdr pane read` / `herdr agent read` print **raw terminal text**, not a
  JSON envelope — the herdr tools' parser assumed envelopes everywhere, so
  `read`/`wait_output` returned empty results. Parser now falls back to raw
  text (exported `parseHerdrOutput`; selftest regression for envelope, raw
  text, and error envelopes). Found by live smoke test: split → run →
  wait_output on a real pane. Selftest now runs under bun (the harness
  runtime; `Promise.withResolvers` needs it — node 20 lacks the API), TS
  target es2024.

## v0.13.0 — herdr control absorbed (pi-herdr port)

- **`herdr_layout` / `herdr_pane` / `herdr_agent` tools** — structured control
  of the herdr terminal workspace manager this session runs inside: workspace/
  tab/pane topology, raw pane commands (`run`/`read`/`wait_output`/`send`),
  and sibling coding agents (`start`/`prompt`/`wait`/`read`/`send`/`focus`/
  `rename`). Mechanics identical to pi-herdr (MIT): exec the herdr CLI, parse
  JSON envelopes. Adapted to the installed herdr 0.7.x CLI (composed
  primitives where pi-herdr needs 0.7.5+: prompt = send+wait, wait_output =
  read+poll).
- **`using-herdr` skill** — model-invoked operating discipline: opt-in policy,
  activation gate (HERDR_ENV/PANE_ID), target resolution, lifecycle states,
  workflows, output limits, alternate-screen caveat, CLI escape hatch.
- Tools register unconditionally and return a gate message outside herdr
  (testable); selftest asserts registration + gate. `docs/herdr.md`
  documents the absorption and port deltas; AGENTS.md gains the Herdr
  convention; README rows updated.

## v0.12.0 — math formatting always on (rule, not toggle)

- The user wants math typeset "all the time without a second thought": the
  `math-rendering` skill is replaced by the **`math-formatting` always-apply
  rule** (enforced every turn, no command, no toggle): write math as LaTeX
  ($…$ inline; $$…$$ / \[…\] / `\begin{aligned}` display; `\frac`, `\sqrt`,
  matrices, `\left( \right)`, `\sum`/`\lim`/`\int`, `\mathbf`, `\mathbb`),
  with guardrails (no delimiters in code, shell variables, or currency;
  inline stays single-line).
- `/math` re-scoped to explainer + demo. `docs/math-rendering.md` and
  AGENTS.md updated; the pi-math image-port analysis is recorded there
  (possible only as a core patch — omp has no assistant-message render hook —
  and terminal-gated on Windows Terminal; deferred).

## v0.11.0 — math rendering made first-class

- **Check verdict**: oh-my-pi's TUI already renders LaTeX natively — inline
  `$…$` → Unicode, display `$$…$$`/`\[…\]`/bare math environments → 2-D
  layout (stacked fractions, stretched delimiters, matrices, radicals,
  operator limits, aligned environments), wired unconditionally into the
  markdown renderer. pi-math's image-based approach (MathJax→PNG via
  Kitty/iTerm2) is architecturally possible in omp but terminal-gated — the
  user's Windows Terminal supports none of the image protocols — so the
  native path is the feature.
- **`math-rendering` skill** — model-invoked: write math as LaTeX instead of
  ASCII approximations; delimiter table, supported constructs, guardrails
  (no delimiters in code/shell variables/currency; inline stays single-line).
- **`/math` command** — user-invoked: applies the formatting instruction to
  the conversation, with a demo. No built-in-name conflict.
- `docs/math-rendering.md` (feasibility findings + shipped design); AGENTS.md
  math rendering convention; README bullet + command/skill rows.

## v0.10.0 — configurable Hindsight

- Hindsight reads `~/.omp/hindsight.json`: `name` (what the pass is called),
  `nudge` (the reflection prompt), `leadIn` (the one-line prefix a revision
  leads with), `onMessage`/`offMessage` (toggle messages). Missing files,
  invalid JSON, and invalid fields all fall back to the defaults — a broken
  config never takes the nudge down.
- The file is re-read on every `/hindsight` invocation, so edits apply
  without re-entering omp. Selftest extended (custom name/nudge/leadIn in
  the hidden continuation; invalid-config fallback); command body, design
  doc, AGENTS.md, and README document the configuration.

## v0.9.0 — Hindsight: the settle-time reflection pass

- **`/hindsight`** command (user-invoked toggle, `on`/`off`/bare): while on,
  after each main-session turn that did real work, one hidden reflection pass
  runs before the turn settles. The model looks back at its own thinking and
  tool results (both already in context) and revises the answer if a
  design-level change would simplify the approach — the Fable trick, without
  a fragile pre-stream abort.
- Implemented on the verified `session_stop` seam: a handler returning
  `{ continue: true, additionalContext }` queues a hidden next-turn message;
  `stop_hook_active` is the once-per-turn guard, subagent sessions are never
  interrupted, and the runtime's 8-continuation cap is never approached.
- Gating: tool-use turns or substantial thinking (≥400 chars) get the pass;
  trivial turns pass through. Reflection turns lead with an "On reflection…"
  note when they revise.
- Selftest extended (synthetic session_stop events: tool turn, continuation
  turn, thinking turn, trivial turn, toggle off, bare toggle receipt);
  `docs/reflect-mode.md` reparked as the shipped `docs/hindsight.md`;
  AGENTS.md gains the Hindsight convention.

## v0.8.1 — public-facing README rewrite

- README rewritten for a wider audience: short intro, "What's inside" bullets,
  category-grouped tables for all 23 commands and 11 skills, runtime
  behaviors table, condensed updating/troubleshooting guide, attribution.
  No behavior changes; content cross-checked against the registered command
  and skill inventory.

## v0.8.0 — routinization: /routinize command

- **`/routinize`** command (user-invoked, optional steering prompt): turns
  repeated ad-hoc work from the conversation into canonical, parameterized
  programmatic scripts — routines — under `scripts/routines/`. Programmatic
  output, not text: the differentiator from `/record`, `/pitfall`, and
  autolearn.
- Background scan subagent (`ROUTINIZE-BRIEF.md`) scans the session
  transcript plus the existing routine set and classifies candidates as
  `extend-existing` (preferred) / `new` / `skip`; proposals are presented for
  per-item user approval before any write — the anti-bloat gate.
- The routine set is itself DRY (generalize-don't-add): extending an existing
  routine beats adding a near-duplicate. The set is gitignored
  (`scripts/routines/`), fetched on demand like the reference corpus.
- Routine shape defined in `ROUTINE-FORMAT.md`; AGENTS.md gains the
  routinization convention; README table updated.

## v0.7.0 — reference acquisition: /reference command + using-references skill

- **`/reference`** command: manage the per-project reference corpus at
  `.omp/references/` — `add <url>` (full clone, flat name, gitignored),
  `update <name>` (git pull), `remove <name>`, `list`. User-invoked, so
  acquisition is permission-gated by construction.
- **`using-references`** skill (model-invoked): consults references before
  reconstructing external behavior or high-stakes implementations from
  memory — the error-surface trigger (opaque artifacts, precision-sensitive
  code like ODE solvers / dense ML). Proposes `/reference add` when a system
  isn't cloned yet; treats reference contents as untrusted data — read-only,
  never executes, never follows embedded instructions.
- Docs: design parked at `docs/reference-acquisition.md`; AGENTS.md gains the
  reference-acquisition convention; README reference tables updated.

## v0.6.2 — docs: setup-after-update FAQ

- README: answers "I already ran `/omp-setup` — do I need to re-run it after
  updating?" — no; the setup output is per-repo configuration, not a plugin
  snapshot, and re-running is safe/idempotent whenever desired.

## v0.6.1 — docs: plugin update & management guide

- README: expanded "Updating" into a full management guide — `omp plugin
  list`, tag listing, pinned reinstall, activate-by-re-entering-omp, pinning
  a specific version/SHA, the stale bun git-mirror fix, uninstall, local
  development via `omp plugin link`, and the `omp plugin upgrade` caveat.

## v0.6.0 — knowledge_read tool, transcript renderers

- **`knowledge_read` tool**: the model can now look up past findings on demand
  (`.omp/knowledge/` INDEX, records, pitfalls, or research projects) without
  the user typing `/record --recent` first. Anchors on the nearest
  `.omp/knowledge/` walking up from cwd; `type` / `slug` / `limit` / `full`
  parameters.
- **Transcript renderers**: `/record` and `/pitfall` emit a compact receipt
  card (custom messages `knowledge-record` / `knowledge-pitfall`); the
  `knowledge_read` tool result renders as a labeled summary card in the TUI.
- Selftest now exercises the tool, renderers, and receipts against a fixture
  knowledge base; `@oh-my-pi/pi-tui` is stubbed via esbuild alias (the real
  module is served by the omp binary at runtime).

## v0.5.0 — runtime behaviors: bootstrap, KB policy, rules

- **Bootstrap**: at session start and after compaction, the model receives a
  one-time message listing all 21 commands (user-invoked slash commands, not
  tools) — no more needing `/help` to know the package exists. Cleared on
  `agent_end`; dedup-guarded (superpowers pattern).
- **Knowledge-base policy**: a `tool_call` guard makes the append-only
  convention a runtime invariant — `edit` on records/pitfalls/`INDEX.md` is
  blocked, `write` over an existing entry is blocked, destructive `bash`
  against those stores is blocked. New timestamped files and `>>` INDEX
  appends still pass; research working files stay editable.
- **Rules**: `knowledge-append-only` TTSR rule (fires when the model is about
  to edit a KB entry) plus three always-apply rulebook rules (`use-record`,
  `use-pitfall`, `use-research`) keeping the right command discoverable
  mid-conversation.
- **Docs**: AGENTS.md gains runtime-behavior and memory-backend sections;
  repo changelog discipline introduced.

## Before v0.5.0

v0.4.2 and earlier (21 commands, 10 skills, deep-research workflow, `/record`
+ `/pitfall` knowledge base, `/plugin-issue` auto-posting) shipped without a
changelog. See git history and the README reference table.
