# my-omp-skills

<p align="center">
  <img src="https://img.shields.io/badge/version-0.58.0-8A2BE2" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/platform-oh--my--pi-4B8BBE" alt="platform" />
  <img src="https://img.shields.io/badge/commands-28-orange" alt="28 slash commands" />
  <img src="https://img.shields.io/badge/skills-14-teal" alt="14 model-invoked skills" />
</p>

An extension package for the [oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`) AI coding agent harness. It provides **28 user-invoked slash commands**, **14 model-invoked skills**, multi-agent research workflows, custom TUI card renderers, and an append-only repo-local knowledge base.

---

## Installation

Install directly into `omp` via the public repository URL:

```bash
omp plugin install "git+https://github.com/hae-banko/my-omp-skills.git#v0.58.0"
```

Or via SSH:

```bash
omp plugin install "git@github.com:hae-banko/my-omp-skills.git#v0.58.0"
```

> **Note**: After installing or upgrading, exit and restart `omp`. Commands, skills, and tools load at session startup.

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

### 2. Multi-Agent Deep Research
- **/research**: Phase 1 — Generates a research outline (with optional `depends_on` DAG dependency edges), field framework, and review dashboard.
- **/research-deep**: Phase 2 — Spawns parallel background subagents operating in topological OODA waves with upstream context injection (`<upstream-context>`) to gather evidence into validated JSON outputs.
- **/research-report**: Phase 3 — Compiles JSON results into a summary-first markdown report (`report.md` and `summary.md`) with a table of contents, execution provenance, and cited source links.
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

## Slash Commands (28 User-Invoked Commands)

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
| `/research` | Research | Phase 1 of deep research: generates research outline, field framework, and dashboard. |
| `/research-add-items` | Research | Appends research items to an existing `outline.yaml`. |
| `/research-add-fields` | Research | Appends field definitions to an existing `fields.yaml`. |
| `/research-deep` | Research | Phase 2 of deep research: gathers evidence via parallel background agents in OODA waves. |
| `/research-report` | Research | Phase 3 of deep research: compiles JSON results into a summary-first markdown report. |
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
| `/writing-great-skills` | Knowledge & Upkeep | Reference guide for writing and editing agent skills. |

---

## Model-Invoked Skills (14 Skills)

Omp automatically loads model-invoked skills when conversation or codebase context matches the skill condition.

| Skill | Description | Trigger Condition |
| --- | --- | --- |
| `grilling` | Relentless one-question-at-a-time interview until decisions resolve. | Plan or design worth stress-testing before building. |
| `tdd` | Red-green-refactor test-first loop at pre-agreed seams. | Building a feature or fixing a bug covered by tests. |
| `code-review` | Two-axis review (Standards + Spec) via parallel subagents. | User asks to review a branch, PR, or changes. |
| `diagnosing-bugs` | Reproduction, minimization, hypothesis testing, and fix verification loop. | Broken functionality, exceptions, or performance regressions. |
| `research` | Fact-finding against primary sources using subagents (`librarian`/`scout`). | Questions requiring evidence from docs, source, or APIs. |
| `prototype` | Throwaway code answering a specific design or UI question. | Sanity-checking state models or user interfaces. |
| `domain-modeling` | Builds project domain model; maintains `CONTEXT.md` and ADRs. | Fuzzy terminology or architectural decisions needing recording. |
| `codebase-design` | Deep module design: hiding complex behavior behind clean interfaces. | Designing module interfaces or establishing seams. |
| `resolving-merge-conflicts` | Resolves git merge/rebase conflicts hunk-by-hunk by intent. | Active git merge or rebase conflict in progress. |
| `using-references` | Consults cloned reference corpus before reconstructing external algorithms. | Implementing complex algorithms with available reference source. |
| `using-herdr` | Controls herdr terminal workspace manager (`herdr_layout`/`herdr_pane`/`herdr_agent`). | User mentions herdr or asks to manage panes/workspaces. |
| `using-git-worktrees` | Isolates feature work in a dedicated git worktree (`.worktrees/`). | **User-invoked only**: explicitly requested by user. |
| `show-me` | Visual explanations via sketches, call trees, file layouts, Mermaid, or HTML. | Explaining structure, control flow, UI hierarchy, or architecture. |
| `design-control-loop` | Cybernetic control loop design (sensor, controller, actuator) for codebase workflows. | Designing scheduled feedback loops, PR workflows, or quality gates. |

---

## Extension Architecture & Guardrails

- **Append-Only Knowledge Base (`.omp/knowledge/`)**: Records, pitfalls, and index files are protected from overwrites and in-place edits. Two status-bar widgets track session blocks and new file ingest counts.
- **KV Cache Prefix Stability**: Dynamic system prompt extensions (`clarify`, `kb-index-injector`) strictly append to `evt.systemPrompt` tail, preserving base prompt prefix hashing to maintain high LLM prompt cache hit rates (>90%).
- **ANSI Card Layout Engine (`src/research/research-format.ts`)**: TUI transcript cards use width-aware layout primitives with ANSI escape sequence stripping, preserving 76-column box alignment across CJK text, emoji, and colored borders.

---

## License & Attribution

Distributed under the [MIT License](LICENSE).

Adapted from open-source extension suites (all MIT licensed):
- [mattpocock/skills](https://github.com/mattpocock/skills) — Command and skill structure patterns.
- [obra/superpowers](https://github.com/obra/superpowers) — Bootstrap injection pattern.
- [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) — Deep research workflow architecture.
- [humanlayer/skills](https://github.com/humanlayer/humanlayer) — `show-me` and `design-control-loop` skills.
- [dkmnx/pi-clarify](https://github.com/dkmnx/pi-clarify) — Prompt clarification pattern.
