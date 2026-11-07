# my-omp-skills

<p align="center">
  <img src="https://img.shields.io/badge/version-0.79.0-8A2BE2" alt="version" />
  <img src="https://img.shields.io/badge/platform-oh--my--pi-4B8BBE" alt="platform" />
  <img src="https://img.shields.io/badge/commands-34-orange" alt="34 slash commands" />
</p>

An extension package for the [oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`) AI coding agent harness. It provides **34 user-invoked slash commands**, **15 model-invoked skills** (5 of them routers over 24 playbooks), multi-agent research workflows, custom TUI card renderers, and an append-only repo-local knowledge base.

---

## Installation

Install directly into `omp` via the public repository URL:

```bash
omp plugin install "git+https://github.com/hae-banko/my-omp-skills.git#v0.79.0"
```

Or via SSH:

```bash
omp plugin install "git@github.com:hae-banko/my-omp-skills.git#v0.79.0"
```

> **Note**: After installing or upgrading, exit and restart `omp`. Commands, skills, and tools load at session startup.

### Updating

Git-sourced plugins are not covered by `omp plugin upgrade` (that verb only handles `name@marketplace` plugins and rejects a git URL with `Invalid plugin ID`). To move to a newer release, re-install with `--force`:

```bash
omp plugin install "git+https://github.com/hae-banko/my-omp-skills.git#v0.79.0" --force
```

`--force` re-resolves the ref and replaces the existing install cleanly (no uninstall needed). Confirm the version that actually landed, then restart `omp`:

```bash
omp plugin list
```

Installed plugins live under `~/.omp/plugins/node_modules/<name>`, so `omp plugin list` (or reading `<that path>/package.json`) is the source of truth for what's live. Commands, skills, and tools are loaded at session startup — an already-running `omp` session keeps the old version until you exit and restart.

#### Knowledge-search upgrade and recovery

No knowledge migration is required. After restarting, the first text search builds
`.omp/cache/kb-index.sqlite` from existing Markdown; older cache schemas rebuild
automatically. Records, pitfalls, research files, audits, and `INDEX.md` are not
rewritten. Continue using the same Markdown-writing workflows.

Search uses tokenized OR/prefix matching, porter stemming, and BM25 ranking with
stable path tie-breaking, rather than matching the entire query as a substring.
Freshness checks read and hash corpus files, including replacements that preserve
their old modification time. The cache avoids repeated FTS construction, not
source-file reads.

If the disk cache is corrupt, locked, or unwritable, search builds the same FTS
index in memory instead. Markdown read errors still surface. No database/WAL
files are removed while other sessions might be using them.

For persistent cache repair, close all `omp` sessions using that repository, then
remove only `.omp/cache/kb-index.sqlite`, `.omp/cache/kb-index.sqlite-wal`,
`.omp/cache/kb-index.sqlite-shm`, and `.omp/cache/kb-index.stamp`, if present.
The next search rebuilds them. **Never remove `.omp/knowledge/` for cache repair.**

---

## Repository Initialization

Run setup once per repository to configure issue tracking, label vocabulary, and domain doc layouts:

```bash
/omp-setup
```

By default, `/omp-setup` initializes a local markdown issue tracker under `.omp/scratch/` (legacy `.scratch/` supported). GitHub and GitLab tracker integrations are also supported.

---

## Subsystem Overview

### 1. Planning & Feature Delivery
- **/ask-me**: Suggests the exact slash command or workflow for your objective.
- **/grill-me** & **/grill-with-docs**: Interview loops to stress-test designs and extract ADRs/glossary entries before writing code.
- **/to-spec**, **/to-tickets**, **/implement**: Workflow chain for synthesizing context into specs, decomposing specs into tracer-bullet tickets with dependency edges, and building features via TDD.
- **/wayfinder**: Maps multi-session epics into decision tickets on the issue tracker.
- **/triage**: Filters and processes incoming issues/PRs into agent-ready execution briefs.
- **/council**: Summons a multi-perspective panel (Minimalist, Systems Architect, Security Auditor) to deliberate on architectures and partition consensus invariants with Ed25519 signatures.

### 2. Multi-Agent Deep Research
- **/research**: Scaffolds a structured research plan (`outline.yaml`, comparison `fields.yaml`, and DAG dependencies) with live review dashboard.
- **/research-deep**: Executes parallel background search waves in topological OODA loops with `<upstream-context>` prompt injection to collect verified JSON evidence.
- **/research-report**: Compiles verified JSON results into a comparative markdown report (`report.md`) with tradeoff matrices, execution provenance, and cited source links.
- **/research-add-items** & **/research-add-fields**: Extends existing research outlines and field frameworks.

### 3. Knowledge Base & History
- **/record**: Permanently appends engineering lessons, audits, or notes into `.omp/knowledge/records/`.
- **/pitfall**: Captures runtime mistakes and debugging discoveries into `.omp/knowledge/pitfalls/`.
- **/timeline**: Generates a zero-turn unified project digest (git log, knowledge base, research projects, decision tickets) rendered in a TUI card.
- **/reference**: Manages a local reference code corpus under `.omp/references/` with zero agent turn overhead.
- **/routinize**: Converts repeated ad-hoc actions into parameterized scripts under `scripts/routines/`.
- **Zero-turn Knowledge Surfacing**: `before_agent_start` automatically matches prompt keywords against `.omp/knowledge/` and injects relevant findings into system context.

### 4. Quality & Controls
- **/audit**: Conducts independent audits of a codebase area or architecture under `.omp/audits/<slug>/` with SemVer lineage.
- **/hindsight**: Toggles a settle-time reflection pass that prompts the model to simplify design choices before completing a turn.
- **/clarify**: Interactively resolves vague user prompts via TUI choice dialogs.
- **/math**: Demos native LaTeX math rendering ($...$, $$...$$) supported in the `omp` TUI.
- **/plugin-issue**: Submits a bug report or feature request directly to this repository.

---


## Slash Commands (34 User-Invoked Commands)

| Command | Category | Description |
| --- | --- | --- |
| `/ask-me` | Planning | Router over package commands; suggests the exact workflow for your objective. |
| `/grill-me` | Planning | Interactive interview loop to stress-test a plan or design before building. |
| `/grill-with-docs` | Planning | Interview loop that creates domain docs (ADRs, glossary) as decisions resolve. |
| `/wayfinder` | Planning | Maps large multi-session projects into decision tickets resolved step-by-step. |
| `/improve-codebase-architecture` | Planning | Scans codebase for refactoring targets, presents an HTML report, and grills the chosen target. |
| `/to-spec` | Shipping | Synthesizes current conversation context into a formal spec on the tracker. |
| `/to-tickets` | Shipping | Breaks a plan or spec into tracer-bullet tickets with explicit blocking edges. |
| `/implement` | Shipping | Builds work described by tickets/specs, driving TDD and closing with code review. |
| `/triage` | Shipping | Processes issues and PRs through specialized triage roles into execution briefs. |
| `/audit` | Audit | Conducts an independent audit of a codebase area under `.omp/audits/<slug>/`. |
| `/research` | Research | Creates a structured research plan (scaffold outline topics, comparison dimensions & dependencies). |
| `/research-add-items` | Research | Appends research items to an existing `outline.yaml`. |
| `/research-add-fields` | Research | Appends field definitions to an existing `fields.yaml`. |
| `/research-deep` | Research | Executes parallel web research waves to gather facts, citations & codebase evidence into JSON. |
| `/research-report` | Research | Compiles research into a comparative report with tradeoff tables, provenance & source links. |
| `/timeline` | Knowledge & Upkeep | Generates a zero-turn unified project digest (git log, KB, research, tickets) in a TUI card. |
| `/record` | Knowledge & Upkeep | Saves a durable lesson, audit, or note to `.omp/knowledge/`. `--recent` resolves instantly in TS. |
| `/pitfall` | Knowledge & Upkeep | Captures a runtime mistake into `.omp/knowledge/`. `--recent` resolves instantly in TS. |
| `/routinize` | Knowledge & Upkeep | Converts repeated ad-hoc work into parameterized scripts under `scripts/routines/`. |
| `/reference` | Knowledge & Upkeep | Local reference code corpus manager (`add`, `update`, `remove`, `list`) with zero LLM overhead. |
| `/omp-setup` | Knowledge & Upkeep | Configures issue tracker, triage labels, and domain layout for a repository. |
| `/hindsight` | Knowledge & Upkeep | Toggles settle-time reflection pass (`on`, `off`, `status`) before turns settle. |
| `/clarify` | Knowledge & Upkeep | Toggles prompt clarification mode (`on`, `off`, `debug`, `status`) for vague prompts. |
| `/math` | Knowledge & Upkeep | Explains and demonstrates native LaTeX math rendering in the TUI. |
| `/omp-handoff` | Knowledge & Upkeep | Compacts current conversation into a handoff document for another agent session. |
| `/plugin-issue` | Knowledge & Upkeep | Submits a bug report or feature request on this repository. |
| `/teach` | Knowledge & Upkeep | Teaches a skill or concept over multiple sessions using current directory as a workspace. |
| `/tilt` | Quality & Controls | Inspects user tilt level, swear jar balance, and global rage leaderboard in a zero-token TUI card. |
| `/writing-great-skills` | Knowledge & Upkeep | Reference guide for writing and editing agent skills. |
| `/ponytail` | Quality & Controls | Lazy senior dev mode: YAGNI, stdlib & native first, shortest working diff (/ponytail [lite|full|ultra]). |
| `/ponytail-review` | Quality & Controls | Reviews diffs exclusively for over-engineering, unneeded abstractions, and complexity. |
| `/ponytail-debt` | Knowledge & Upkeep | Scans codebase for deliberate shortcut comments and compiles a tracked debt ledger. |
| `/ponytail-audit` | Audit | Whole-repo audit for over-engineering and dependencies replaceable by stdlib/native features. |
| `/council` | Planning | Multi-perspective deliberation panel (Minimalist, Architect, Security) with Star Chamber consensus partitioning. |

---

## Model-Invoked Skills (15 Skills)

Omp automatically loads model-invoked skills when conversation or codebase context matches the skill condition. A **router** skill lists every task its family covers and reads exactly one **playbook** for the task at hand, so only that procedure enters the context.

### Routers

| Skill | Playbooks | Side effects |
| --- | --- | --- |
| `review` | `code-review` (Standards + Spec), `blast-radius`, `adversarial` (findings survive only with a run), `overengineering-diff`, `overengineering-audit`, `ponytail-debt` | Report only. |
| `investigate` | `diagnose` (bugs, flakes, perf regressions), `how` (trace the real code path), `why` (recover design rationale from history) | `how`/`why` read-only; `diagnose` instruments and fixes. |
| `verify` | `runtime-skill` (project-local skill that drives the real app) + `runtime-skill-maintain`, `formal` (model checking, mutant check, models kept local in `.omp/specs/`) + `formal-maintain`, `benchmark` (vet a perf claim) | Writes `.omp/skills/`, `.omp/specs/`, tests and docs as each playbook states. |
| `design` | `interface` (deep modules, seams, design it twice), `domain-model` (`CONTEXT.md`, ADRs), `prototype` (throwaway logic/UI), `control-loop` (agentic sensor/controller/actuator loops), `figure-it-out` (plan and run a large change with a decision log) | Proposals by default; `domain-model` writes docs; `prototype` writes throwaway code; `figure-it-out` edits per the agreed plan and asks before paid or long runs. |
| `improve-skills` | `author` (house style, router/playbook layout), `eval` (old vs new skills in real `omp` runs, blinded judging), `reflect` (session → skill edits), `correct` (repeated mistakes → enforced checks), `from-sessions` (durable preferences from past sessions) | Skill edits only after approval. |

### Standalone

| Skill | Description | Trigger Condition |
| --- | --- | --- |
| `grilling` | Relentless one-question-at-a-time interview until decisions resolve. | Plan or design worth stress-testing before building. |
| `tdd` | Red-green-refactor test-first loop at pre-agreed seams. | Building a feature or fixing a bug covered by tests. |
| `research` | Fact-finding against primary sources using subagents (`librarian`/`scout`). | Questions requiring evidence from docs, source, or APIs. |
| `resolving-merge-conflicts` | Resolves git merge/rebase conflicts hunk-by-hunk by intent. | Active git merge or rebase conflict in progress. |
| `using-references` | Consults cloned reference corpus before reconstructing external algorithms. | Implementing complex algorithms with available reference source. |
| `using-herdr` | Controls herdr terminal workspace manager (`herdr_layout`/`herdr_pane`/`herdr_agent`). | User mentions herdr or asks to manage panes/workspaces. |
| `using-git-worktrees` | Isolates feature work in a dedicated git worktree (`.worktrees/`). | **User-invoked only**: explicitly requested by user. |
| `show-me` | Visual explanations via sketches, call trees, file layouts, Mermaid, or HTML. | Explaining structure, control flow, UI hierarchy, or architecture. |
| `ponytail` | Enforces the Ladder: YAGNI → reuse in codebase → stdlib → native platform → shortest diff. | Any coding, refactoring, fixing, or designing task. |
| `council` | Autonomous multi-perspective deliberation on architectures, refactors, and trade-offs. | High-stakes architectural forks, breaking refactors, or second opinion requests. |

---

## Extension Architecture & Guardrails

- **Append-Only Knowledge Base (`.omp/knowledge/`)**: Records, pitfalls, and index files are protected from overwrites and in-place edits. Two status-bar widgets track session blocks and new file ingest counts. Search is driven by a SQLite FTS5 index with content SHA-256 fingerprint freshness checking, stable BM25/path tie-breaking, in-place schema recovery on corruption, and in-memory FTS fallback when the on-disk cache cannot be opened or written.
- **KV Cache Prefix Stability**: Dynamic system prompt extensions (`clarify`, `kb-index-injector`) strictly append to `evt.systemPrompt` tail, preserving base prompt prefix hashing to maintain high LLM prompt cache hit rates (>90%).
- **ANSI Card Layout Engine (`src/research/research-format.ts`)**: TUI transcript cards use width-aware layout primitives with ANSI escape sequence stripping, preserving 76-column box alignment across CJK text, emoji, and colored borders.

---

## License & Attribution

Distributed under the [MIT License](LICENSE).

Adapted from open-source extension suites (all MIT licensed):
- [mattpocock/skills](https://github.com/mattpocock/skills) — Command and skill structure patterns.
- [obra/superpowers](https://github.com/obra/superpowers) — Bootstrap injection pattern.
- [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) — Deep research workflow architecture.
- [humanlayer/skills](https://github.com/humanlayer/humanlayer) — `show-me` skill and the `design` control-loop playbook.
- [dkmnx/pi-clarify](https://github.com/dkmnx/pi-clarify) — Prompt clarification pattern.
- [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) — Ponytail lazy senior dev skill and over-engineering audit/review suite.
- [cursor/plugins](https://github.com/cursor/plugins) — `pstack` (Copyright (c) 2026 Lauren Tan) and `cursor-team-kit` (Copyright (c) 2026 Cursor) skills, adapted into the `review` (blast-radius, adversarial), `investigate` (how, why), `verify`, `design` principles and `improve-skills` (eval, reflect, correct, from-sessions) playbooks.
