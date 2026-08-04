# Changelog

All user-visible changes to my-omp-skills. Releases are tagged `vX.Y.Z`;
installs pin to a tag (see README). Version history before v0.5.0 predates
this changelog.

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
