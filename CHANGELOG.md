# Changelog

All user-visible changes to my-omp-skills. Releases are tagged `vX.Y.Z`;
installs pin to a tag (see README). Version history before v0.5.0 predates
this changelog.

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
