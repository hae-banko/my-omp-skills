# my-omp-skills

<p align="center">
  <img src="https://img.shields.io/badge/version-0.32.3-8A2BE2" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/platform-oh--my--pi-4B8BBE" alt="platform" />
  <img src="https://img.shields.io/badge/commands-26-orange" alt="26 slash commands" />
  <img src="https://img.shields.io/badge/skills-13-teal" alt="13 model-invoked skills" />
</p>

**my-omp-skills** is an extension package for the [oh-my-pi](https://github.com/can1357/oh-my-pi) (omp) agent harness, for developers who want their AI pair programmer to work with discipline instead of vibes: **plan, build, audit, research, remember** — deterministic workflow on top of the omp harness. It adds 26 user-invoked slash commands and 13 model-invoked skills, plus a persistent local knowledge base, so the same rigor applies across every session and every repo.

## What You Get

Each family is a set of commands that do one job for you — pick the ones you need.

| Family | What it does for you |
| --- | --- |
| **Plan & Decide** | Sharpen ideas before you build. `/grill-me` interviews you one question at a time until a plan has no loose ends; `/wayfinder` maps a multi-session project into decision tickets you resolve one at a time; `/improve-codebase-architecture` scans your codebase for deepening opportunities and grills the one you pick; `/ask-me` routes you to the right command. |
| **Ship & Build** | Turn conversation into tracked work. `/to-spec` synthesizes the discussion into a spec; `/to-tickets` breaks it into dependency-aware tickets on your issue tracker; `/implement` builds them test-first and code-reviews before committing; `/triage` moves issues and PRs into agent-ready briefs. |
| **Audit** | `/audit` produces an independent, evidence-backed critique of a codebase area, architecture, or proposal — stored in `.omp/audits/` with versioned revisions so conclusions can be revisited, not rewritten. |
| **Deep Research** | The `/research` family runs multi-agent investigations for you: draft an outline, launch parallel background agents in OODA waves, and get a summary-first report with a table of contents and a deduped sources appendix. |
| **Knowledge base** | Memory that persists across sessions. `/record` saves lessons and findings, `/pitfall` captures mistakes mid-task before context fades — both stored append-only in `.omp/knowledge/`, and the model reads them back automatically when relevant. |
| **Hindsight reflection** | `/hindsight on` adds a hidden reflection pass after turns that did real work: the model reconsiders design-level choices before the turn settles — no extra typing for you. |
| **Native LaTeX math** | Mathematical formulas render natively in the omp TUI (`$...$`, `$$...$$`, `\begin{aligned}`), always on, no configuration. Run `/math` for a demo. |

## Quick Install

This is a **private repository**, so installs go over SSH (or git+https with a PAT). You need an **SSH key with read access** to `hae-banko/my-omp-skills` on each machine you install on — either `~/.ssh/id_ed25519` listed in your GitHub account, or available through `ssh-agent`.

```bash
omp plugin install "git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.32.3"
```

Equivalent scp form:

```bash
omp plugin install "git@github.com:hae-banko/my-omp-skills.git#v0.32.3"
```

**Alternative — git+https with a PAT** (only on machines where SSH is unavailable): embed a personal access token with `repo` scope in the URL, or configure a credential helper that supplies it. Without a token, git+https to a private repo returns `Repository not found`.

You need [oh-my-pi](https://github.com/can1357/oh-my-pi) installed. After installing, **exit and re-enter `omp`** — commands, skills, rules, and tools are discovered at session start.

## First Run

1. **Run `/omp-setup` once per repository.** It configures the issue tracker (local `.scratch/` by default; GitHub/GitLab supported), triage label vocabulary, and domain document layout. It is safe and idempotent — no need to re-run after plugin updates.
2. **Try a 60-second starter:**
   - `/grill-me` — stress-test a plan you're about to build.
   - `/record` — save a lesson you just learned.
   - `/research` — kick off a structured investigation of a question.
3. **Turn on hindsight:** `/hindsight on` enables a hidden settle-time reflection pass after turns that did real work (see [Configuration](#configuration)).

## Command Directory

All 26 commands are user-invoked slash commands. The model knows them at session start and will suggest the right command when appropriate.

| Command | Description | Workflow Phase |
| --- | --- | --- |
| **Plan & Decide** | | |
| `/ask-me` | Router over this package; suggests the command or flow that fits your situation | Plan & Decide |
| `/grill-me` | Relentless one-question-at-a-time interview to sharpen a plan or design before building | Plan & Decide |
| `/grill-with-docs` | Interactive grilling session that also records domain docs (glossary, ADRs) as decisions resolve | Plan & Decide |
| `/wayfinder` | Maps multi-session projects into decision tickets on the tracker, resolved one at a time | Plan & Decide |
| `/improve-codebase-architecture` | Scans codebase for deepening opportunities, presents an HTML report, then grills the chosen target | Plan & Decide |
| **Ship & Build** | | |
| `/to-spec` | Synthesizes current conversation context into a formal spec published to the configured tracker | Ship & Build |
| `/to-tickets` | Breaks a spec or plan into tracer-bullet tickets with explicit blocking edges on the tracker | Ship & Build |
| `/implement` | Builds work described by tickets/specs, driving TDD at pre-agreed seams and closing with code-review | Ship & Build |
| `/triage` | Moves issues and PRs through triage roles into agent-ready briefs (`--unlabeled`, `--needs-triage`) | Ship & Build |
| **Audit & Inspect** | | |
| `/audit` | Independent audit of a codebase area/architecture written to `.omp/audits/<slug>/` with SemVer lineage | Audit & Inspect |
| **Deep Research** | | |
| `/research` | Phase 1: Drafts research outline, field framework, `research.md`, and emits `ResearchReviewCard`. Subcommands: `1`/`2`/`3`, `dashboard`, `review`, `add-items`, `add-fields`, `status`, `run`, `help`, `envcheck`, `off` (`--full`/`--compact` flags on review/dashboard) | Deep Research |
| `/research-add-items` | Adds research items to existing `outline.yaml` and updates living `research.md` | Deep Research |
| `/research-add-fields` | Adds field framework definitions to existing `fields.yaml` and updates living `research.md` | Deep Research |
| `/research-deep` | Phase 2: Researches outline items with parallel agents in OODA waves into validated JSON (`small`/`medium`/`high`) | Deep Research |
| `/research-report` | Phase 3: Converts research JSON results into a summary-first markdown report with TOC & `_attempts` provenance, plus a `summary.md` digest | Deep Research |
| **Knowledge Base & Upkeep** | | |
| `/record` | Saves a durable lesson, audit, or note to the local knowledge base (`.omp/knowledge/`) | Knowledge & Upkeep |
| `/pitfall` | Captures a fresh mistake into `.omp/knowledge/` mid-task before context fades | Knowledge & Upkeep |
| `/routinize` | Converts repeated ad-hoc work into parameterized scripts (`scripts/routines/manifest.json`) & `run_routine` tool | Knowledge & Upkeep |
| `/reference` | Local, deterministic reference corpus manager — `add <url>` / `update <name>` / `remove <name>` / `list` run git directly with zero agent turns | Knowledge & Upkeep |
| `/omp-setup` | Configures repo setup: issue tracker (local `.scratch/`, GitHub, GitLab), triage labels, domain layout | Knowledge & Upkeep |
| `/hindsight` | Toggles settle-time reflection pass (`on`, `off`, or bare to toggle) | Knowledge & Upkeep |
| `/math` | Explains and demos native LaTeX math rendering ($…$, $$…$$, `\begin{aligned}`) | Knowledge & Upkeep |
| `/omp-handoff` | Compacts current conversation into a handoff document for another agent session | Knowledge & Upkeep |
| `/plugin-issue` | Reports a bug or feature request on this plugin's GitHub repository | Knowledge & Upkeep |
| `/teach` | Teaches a skill or concept over multiple sessions using current directory as a stateful workspace | Knowledge & Upkeep |
| `/writing-great-skills` | Reference for skill writing vocabulary, constraints, and principles | Knowledge & Upkeep |

## Model-Invoked Skills

The 14 skills are model-invoked: omp loads a skill automatically when the context matches. Exception: `using-git-worktrees` is user-invoked only.

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
| `design-control-loop` | Designs agentic control loops (sensor, controller, actuator, disturbances) for codebase maintenance & automated CI runs. | Designing scheduled or automated codebase feedback loops, automated PR workflows, or quality gates. |

## Configuration

### Hindsight

`/hindsight` is off by default; `/hindsight on` enables the settle-time reflection pass. Configure it via `~/.omp/hindsight.json` — all fields are optional: `nudge` is the reflection prompt, `leadIn` prefixes the hidden pass, `name` labels the configuration, and `onMessage`/`offMessage` are the receipt texts (set to `""` to suppress).

```json
{
  "name": "strict",
  "nudge": "Before settling, re-read your last turn and identify any design-level change that would simplify the approach. Prefer deletion over addition.",
  "leadIn": "Reconsider your last turn in light of the tool results.",
  "onMessage": "Hindsight: on (strict)",
  "offMessage": "Hindsight: off"
}
```

### Math

Native LaTeX math rendering is always on in the omp TUI — no configuration. `/math` explains the supported syntax.

## Updating & Troubleshooting

All plugin management goes through `omp plugin`:

1. **View installed plugins**: `omp plugin list` shows `my-omp-skills@v0.32.3`.
2. **Upgrade to a new release**: re-run the SSH install command with the newest tag:
   ```bash
   omp plugin install "git+ssh://git@github.com/hae-banko/my-omp-skills.git#<new-tag>"
   ```
3. **List available versions** (requires SSH access to the private repo):
   ```bash
   git ls-remote git@github.com:hae-banko/my-omp-skills.git --tags
   ```
   Every tag push auto-creates a GitHub Release from the matching CHANGELOG section (`.github/workflows/release.yml`); a guard fails the run if `package.json`'s version doesn't match the tag.
4. **Fix cached mirror mismatches**: if Bun's cache predates a new tag:
   ```bash
   git -C ~/.bun/install/cache/958cddb050b6f945.git fetch origin +refs/tags/*:refs/tags/* +refs/heads/main:refs/heads/main
   ```
5. **Uninstall**: `omp plugin uninstall my-omp-skills`.

For maintainers: architecture notes live in [AGENTS.md](AGENTS.md), release history in [CHANGELOG.md](CHANGELOG.md).

## License & Attribution

[MIT](LICENSE) · [hae-banko/my-omp-skills](https://github.com/hae-banko/my-omp-skills)

Adapted from three open-source suites (all MIT licensed):
- [mattpocock/skills](https://github.com/mattpocock/skills) — Base command and skill structure.
- [obra/superpowers](https://github.com/obra/superpowers) — Source of `using-git-worktrees` skill.
- [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) — Source of the `/research` command family.
