# my-omp-skills

<p align="center">
  <img src="https://img.shields.io/badge/version-0.34.0-8A2BE2" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/platform-oh--my--pi-4B8BBE" alt="platform" />
  <img src="https://img.shields.io/badge/commands-28-orange" alt="28 slash commands" />
  <img src="https://img.shields.io/badge/skills-14-teal" alt="14 model-invoked skills" />
</p>

> Turn your AI pair programmer into a disciplined senior engineer.

Stop vibe coding without structure or context persistence. **my-omp-skills** is an extension package for the [oh-my-pi](https://github.com/can1357/oh-my-pi) (omp) agent harness designed for developers who demand engineering discipline: **plan, spec, build, audit, research, and remember**. It turns loose LLM conversation into structured, test-first, research-backed engineering workflows that persist across sessions and repositories. It equips your agent with 28 user-invoked slash commands, 14 model-invoked skills, custom TUI component renderers, and an append-only knowledge base.

---

## Quick Onboarding (30 Seconds)

### 1. Install Plugin

This is a **private repository**, so plugin installations use SSH (or `git+https` with a PAT). Ensure you have an **SSH key with read access** to `hae-banko/my-omp-skills` on your machine:

```bash
omp plugin install "git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.34.0"

Equivalent scp form:

```bash
omp plugin install "git@github.com:hae-banko/my-omp-skills.git#v0.34.0"

> **Important**: After installing or upgrading, **exit and re-enter `omp`**. Commands, skills, rules, and custom tools are loaded at session startup.

### 2. Initialize Your Repository

Run the setup command once per repository to configure issue tracking, triage label vocabulary, and domain doc layouts:

```bash
/omp-setup
```

It defaults to a local `.omp/scratch/` issue tracker (legacy `.scratch/` supported; GitHub and GitLab issue tracking are also supported). `/omp-setup` is safe and idempotent.

### 3. Take Your First Win

Start experiencing disciplined AI pair programming right away:

- **/ask-me**: Interactive command router — describe what you want to do and `/ask-me` suggests the exact workflow command to execute.
- **/grill-me**: Stress-test your design or implementation plan before writing a single line of code.
- **/clarify on**: Turn on prompt clarification so the agent interactively clarifies vague or ambiguous instructions before acting.

---

## Workflows in Action

### 1. Plan & Stress-Test Before Coding
Before jumping into implementation, turn ambiguous ideas into airtight execution plans:
- **/grill-me**: Runs a relentless, single-question interview loop to uncover edge cases, missing dependencies, and architectural oversights.
- **/wayfinder**: Maps multi-session epics into dependency-linked decision tickets on your tracker, allowing you to resolve them step by step.
- **/improve-codebase-architecture**: Scans your repository for deepening opportunities, renders an interactive HTML report, and grills you on your selected refactoring target.

### 2. Spec, Break Down, and Ship
Transform high-level requirements into shipped, code-reviewed code:
- **/to-spec**: Synthesizes existing conversation context into a structured, trackable specification.
- **/to-tickets**: Decomposes a spec or plan into tracer-bullet tickets with explicit blocking dependencies.
- **/implement**: Executes ticketed work driven by TDD (test-driven development) at pre-agreed seams and finishes with automated two-axis code review before committing.
- **/triage**: Filters and processes incoming issues/PRs through specialized triage roles to produce agent-ready briefs.

### 3. Deep Multi-Agent Research
Execute deep, multi-pass research projects with background agents:
- **/research**: Phase 1 — Drafts a structured research outline and field framework, producing living status cards and interactive HTML dashboards.
- **/research-deep**: Phase 2 — Spawns parallel background research agents operating in OODA waves to gather evidence into validated JSON outputs.
- **/research-report**: Phase 3 — Compiles JSON outputs into a summary-first markdown report complete with table of contents, execution provenance, and a deduplicated sources appendix.

### 4. Persistent Memory & Interactive Clarification
Build long-term repository memory and eliminate guesswork:
- **/record**: Permanently saves durable engineering lessons, audits, and decisions into `.omp/knowledge/`.
- **/pitfall**: Captures runtime mistakes and debugging discoveries mid-task before context fades.
- **Zero-turn pitfall auto-surfacing (`before_agent_start`)**: Automatically matches prompt keywords against `.omp/knowledge/` pitfalls and records, injecting relevant findings directly into system context.
- **Freeform keyword search (`xd://knowledge_read`)**: Added `query` parameter to `readKnowledge` and `knowledge_read` tool schema for relevance-ranked keyword and tag search across records, pitfalls, audits, and research projects.
- **Frontier ticket locator (`findFrontierTicket`)**: Deterministically identifies the earliest unblocked open ticket under `.omp/scratch/` / `.scratch/`.
- **/hindsight**: Toggles a settle-time reflection pass that prompts the model to simplify design choices before completing a turn.
- **/clarify**: Interactively resolves prompt ambiguity with structured TUI choices when user instructions are vague.
---

## Command Directory (28 Commands)

All 28 slash commands are user-invoked. The model recognizes them at session start and will suggest them when appropriate.

| Command | Category | Description |
| --- | --- | --- |
| `/ask-me` | Plan & Decide | Router over this package; suggests the exact command or workflow for your task. |
| `/grill-me` | Plan & Decide | Relentless one-question-at-a-time interview to sharpen a plan or design before building. |
| `/grill-with-docs` | Plan & Decide | Interactive grilling session that also records domain docs (ADRs, glossary) as decisions resolve. |
| `/wayfinder` | Plan & Decide | Maps multi-session projects into decision tickets on the tracker, resolved one at a time. |
| `/improve-codebase-architecture` | Plan & Decide | Scans codebase for deepening opportunities, presents an HTML report, then grills the chosen target. |
| `/to-spec` | Ship & Build | Synthesizes current conversation context into a formal spec published to the configured tracker. |
| `/to-tickets` | Ship & Build | Breaks a spec or plan into tracer-bullet tickets with explicit blocking edges on the tracker. |
| `/implement` | Ship & Build | Builds work described by tickets/specs, driving TDD at pre-agreed seams and closing with code-review. |
| `/triage` | Ship & Build | Moves issues and PRs through triage roles into agent-ready briefs (`--unlabeled`, `--needs-triage`). |
| `/audit` | Audit & Inspect | Independent audit of a codebase area or architecture under `.omp/audits/<slug>/` with SemVer lineage. |
| `/research` | Deep Research | Phase 1 of deep research: generates research outline, field framework, review cards, and HTML dashboards. |
| `/research-add-items` | Deep Research | Adds research items to an existing `outline.yaml` and updates living `research.md`. |
| `/research-add-fields` | Deep Research | Adds field framework definitions to an existing `fields.yaml` and updates living `research.md`. |
| `/research-deep` | Deep Research | Phase 2 of deep research: researches outline items with parallel background agents in OODA waves. |
| `/research-report` | Deep Research | Phase 3 of deep research: converts deep-research JSON results into a summary-first markdown report with TOC. |
| `/record` | Knowledge Base & Upkeep | Saves a durable lesson, audit, or note to the local knowledge base (`.omp/knowledge/`). |
| `/pitfall` | Knowledge Base & Upkeep | Captures a fresh mistake into `.omp/knowledge/` mid-task before context fades. |
| `/routinize` | Knowledge Base & Upkeep | Converts repeated ad-hoc work into parameterized scripts under `scripts/routines/`. |
| `/reference` | Knowledge Base & Upkeep | Local reference corpus manager (`add`, `update`, `remove`, `list`) with zero agent turn overhead. |
| `/omp-setup` | Knowledge Base & Upkeep | Configures repo setup: issue tracker (local `.omp/scratch/`, GitHub, GitLab), triage labels (`.omp/agents/`), domain layout. |
| `/hindsight` | Knowledge Base & Upkeep | Toggles settle-time reflection pass (`on`, `off`, or bare to toggle) before turns settle. |
| `/clarify` | Knowledge Base & Upkeep | Toggles prompt clarification mode (`on`, `off`, or bare to toggle) and injects clarification guidelines. |
| `/math` | Knowledge Base & Upkeep | Explains and demos native LaTeX math rendering ($...$, $$...$$, `\begin{aligned}`). |
| `/omp-handoff` | Knowledge Base & Upkeep | Compacts current conversation into a handoff document for another agent session. |
| `/plugin-issue` | Knowledge Base & Upkeep | Reports a bug or feature request on this plugin's GitHub repository. |
| `/teach` | Knowledge Base & Upkeep | Teaches a skill or concept over multiple sessions using current directory as a stateful workspace. |
| `/writing-great-skills` | Knowledge Base & Upkeep | Reference for skill writing vocabulary, constraints, and principles. |

---

## Model-Invoked Skills (14 Skills)

The 14 skills are model-invoked: omp loads a skill automatically when conversation or codebase context matches (exception: `using-git-worktrees` is user-invoked).

| Skill | Description | Trigger Condition |
| --- | --- | --- |
| `grilling` | Relentless one-question-at-a-time interview until every decision branch resolves. | You have a plan or design worth stress-testing before building. |
| `tdd` | Red-green-refactor test-first loop at pre-agreed seams. | Building a feature or fixing a bug where tests guard the observable contract. |
| `code-review` | Two-axis review (Standards + Spec) of diffs via parallel subagents. | You ask to review a branch, PR, or work-in-progress changes. |
| `diagnosing-bugs` | Disciplined loop: reproduce, minimize, hypothesize, instrument, fix, regression-test. | Something is broken, throwing, failing, or suffering performance regressions. |
| `research` | Background agent investigates high-trust primary sources; findings as cited markdown. | A question needs facts from primary documentation or papers. |
| `prototype` | Throwaway code that answers one design question (logic or UI). | Sanity-checking whether a state model or user interface feels right. |
| `domain-modeling` | Builds and sharpens project domain model; maintains `CONTEXT.md` and ADRs. | Terminology is fuzzy or an architectural decision needs recording. |
| `codebase-design` | Vocabulary for deep modules: hiding complex behavior behind a small interface at a clean seam. | Designing a module's interface or deciding where a seam goes. |
| `resolving-merge-conflicts` | Resolves in-progress merges/rebases by intent, hunk by hunk—never `--abort`. | A merge or rebase is in progress with conflicts. |
| `using-references` | Consults cloned reference corpus before reconstructing external behavior from memory. | Reimplementing algorithms (ODE solvers, dense ML) with an available reference. |
| `using-herdr` | Operates herdr terminal workspace manager (`herdr_layout`/`herdr_pane`/`herdr_agent` tools or CLI). | The user mentions herdr or asks to control workspaces, panes, or sibling agents. |
| `using-git-worktrees` | Isolates feature work in a dedicated git worktree (`.worktrees/` convention). | **User-invoked only**: explicitly requested by user. |
| `show-me` | Visual explanations via code sketches, call trees, file layouts, Mermaid, diffs, or HTML artifacts. | Explaining structure, control flow, UI hierarchy, architecture, or visual concepts. |
| `design-control-loop` | Cybernetic control loop design (sensor, controller, actuator, disturbances) for codebase maintenance & CI workflows. | Designing scheduled or automated codebase feedback loops, automated PR workflows, or quality gates. |

---

## Configuration & Customization

### Hindsight Reflection

`/hindsight` is off by default; `/hindsight on` enables the settle-time reflection pass. Configure options via `~/.omp/hindsight.json`:

```json
{
  "name": "strict",
  "nudge": "Before settling, re-read your last turn and identify any design-level change that would simplify the approach. Prefer deletion over addition.",
  "leadIn": "Reconsider your last turn in light of the tool results.",
  "onMessage": "Hindsight: on (strict)",
  "offMessage": "Hindsight: off"
}
```

### Native LaTeX Math

Native LaTeX math rendering is always active in the omp TUI — no toggle or configuration needed:
- **Inline math**: `$E = mc^2$`
- **Display math**: `$$\frac{d}{dx}\left( \int_{a}^{x} f(t)\,dt \right) = f(x)$$` or multi-line `\begin{aligned} ... \end{aligned}` blocks.

Run `/math` in any omp session for a live demo.

---

## Updating & Troubleshooting

All plugin management goes through `omp plugin`:

1. **View Installed Plugins**:
   ```bash
   omp plugin list
   ```
   Should display `my-omp-skills@v0.34.0`.

2. **Upgrade to `v0.34.0`**:
   ```bash
   omp plugin install "git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.34.0"
   ```

3. **List Available Tag Versions** (requires SSH read access):
   ```bash
   git ls-remote git@github.com:hae-banko/my-omp-skills.git --tags
   ```

4. **Clear & Fix Stale Mirror Cache**:
   If Bun or `omp` caches predate a tag update:
   ```bash
   git -C ~/.bun/install/cache/958cddb050b6f945.git fetch origin +refs/tags/*:refs/tags/* +refs/heads/main:refs/heads/main
   ```

5. **Uninstall**:
   ```bash
   omp plugin uninstall my-omp-skills
   ```

---

## License & Attribution

Distributed under the [MIT License](LICENSE).

Adapted from open-source suites (all MIT licensed):
- [mattpocock/skills](https://github.com/mattpocock/skills) — Base command and skill structure.
- [obra/superpowers](https://github.com/obra/superpowers) — Source of `using-git-worktrees` skill.
- [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) — Source of the `/research` command family.
- [humanlayer/skills](https://github.com/humanlayer/humanlayer) — Source of `show-me` and `design-control-loop` skills.
- [dkmnx/pi-clarify](https://github.com/dkmnx/pi-clarify) — Source of `/clarify` prompt clarification command and tool.
