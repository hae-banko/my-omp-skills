# my-omp-skills

An extension package for the oh-my-pi (omp) agent harness that turns a plain
repo into a workflow engine: 23 user-invoked slash commands and 11
model-invoked skills covering planning, research, review, and learning. Ideas
get grilled before they get built, specs become tracer-bullet tickets, and
tickets get implemented test-first with a two-axis code review before commit.
Everything the package learns about your repo — knowledge entries, reference
clones, routine scripts — accumulates locally under `.omp/` so it persists
across sessions. Adapted from open-source suites (mattpocock/skills,
obra/superpowers, Weizhena/deep-research-skills), all MIT.

## What's inside

- **Grill before building** — `/grill-me` and `/grill-with-docs` interview
  your plan relentlessly, one question at a time, until every branch of the
  decision tree is resolved.
- **Specs, tickets, TDD, review** — `/to-spec` synthesizes the conversation
  into a spec, `/to-tickets` breaks it into tracer-bullet tickets with
  declared blocking edges, and `/implement` builds them test-first and closes
  with code review before committing.
- **Triage** — `/triage` moves issues and external PRs through a state
  machine of roles — categorise, verify, grill if needed, and write
  agent-ready briefs.
- **Deep research** — the `/research` family runs a three-phase flow: outline,
  parallel background-agent research with validated JSON, and a report with
  table of contents.
- **Knowledge base** — `/record` and `/pitfall` capture lessons and failures
  into an append-only, timestamped, indexed store at `.omp/knowledge/`,
  queryable by the model mid-session.
- **Reference corpus** — `/reference` manages clones of external sources at
  `.omp/references/` so the model consults them instead of reconstructing
  behavior from memory.
- **Routines** — `/routinize` turns repeated ad-hoc work into canonical,
  parameterized scripts under `scripts/routines/`, with a proposal you
  approve before each write.
- **Hindsight** — `/hindsight` adds a settle-time reflection pass: before a
  turn settles, the model gets one hidden look back at its own reasoning and
  tool results to catch design-level changes that would simplify the
  approach.
- **Math rendering** — the TUI typesets LaTeX natively, always on: an
  always-apply rule makes the model write real formulas ($…$, $$…$$,
  `\begin{aligned}`, matrices, radicals) instead of ASCII approximations;
  `/math` explains and demos it.

## Install

Requires an SSH key with access to the private repo. Latest release: v0.13.0.

1. Install pinned to the latest release:

   ```
   omp plugin install git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.13.0
   ```

2. Prefer maximum immutability? Pin to a full commit SHA instead:

   ```
   omp plugin install git@github.com:hae-banko/my-omp-skills.git#<full-sha>
   ```

3. Exit and re-enter omp. Commands, skills, rules, and tools are discovered
   at session start, so the new session is what picks them up.
4. On your first session in a repo, run `/omp-setup` to configure the issue
   tracker (local `.scratch/` by default; GitHub/GitLab available), triage
   label vocabulary, and domain doc layout. Run it once per repo — it does
   not need re-running after plugin updates, and re-running is safe.

For development only, you may install unpinned
(`git@github.com:hae-banko/my-omp-skills.git`), which tracks `main`.

## Commands

All commands are user-invoked. The model knows them at session start and will
suggest the right one when your situation fits.

| Command | What it does | When to use |
| --- | --- | --- |
| **Plan & decide** | | |
| `/ask-me` | Router over this package; suggests the command or flow that fits | Unsure which command to use |
| `/grill-me` | Relentless one-question interview that sharpens a plan or design | Stress-test an idea before building |
| `/grill-with-docs` | Grilling session that also records domain docs (glossary, ADRs) as it goes | Sharpen a plan and capture decisions |
| `/wayfinder` | Maps a multi-session project into decision tickets, resolved one at a time | Plan work bigger than one session |
| `/improve-codebase-architecture` | Scans for deepening opportunities, shows an HTML report, then grills the chosen one | Find and evaluate architecture improvements |
| **Ship** | | |
| `/to-spec` | Synthesizes the conversation into a spec, published to the issue tracker | Formalize what you already discussed |
| `/to-tickets` | Breaks a spec or plan into tracer-bullet tickets with blocking edges | Split work into actionable tickets |
| `/implement` | Builds from spec or tickets with TDD and a final code review | Deliver work described by tickets |
| `/triage` | Moves issues and PRs through triage roles into agent-ready briefs | Process an incoming issue backlog |
| **Research** | | |
| `/research` | Phase 1: drafts a research outline (items + fields) for a topic | Start a deep research project |
| `/research-add-items` | Adds research items to an existing outline | Expand your research outline |
| `/research-add-fields` | Adds field definitions to an existing outline | Extend the field framework |
| `/research-deep` | Phase 2: researches each item with parallel agents into validated JSON | Gather evidence per outline item |
| `/research-report` | Phase 3: turns research JSON into a markdown report with a table of contents | Compile findings into a report |
| **Knowledge & memory** | | |
| `/record` | Saves a durable lesson, audit, or note to the local knowledge base | Persist a finding worth keeping |
| `/pitfall` | Captures a fresh mistake into the knowledge base before context fades | Something just went wrong |
| `/routinize` | Turns repeated ad-hoc work into parameterized scripts under `scripts/routines/` | You keep doing the same thing |
| `/reference` | Manages cloned reference material in `.omp/references/` (add, update, remove, list) | Acquire external docs for the repo |
| **Session & support** | | |
| `/omp-setup` | Configures the repo: issue tracker, triage labels, domain doc layout | First run in a new repo |
| `/hindsight` | Toggle the settle-time reflection pass: after turns that did real work, one hidden pass reconsiders design-level changes before the turn settles | You want answers reconsidered before they settle |
| `/math` | Explains and demos native LaTeX math rendering ($…$, $$…$$, `\begin{aligned}`) — always on, no toggle | You want to see what math rendering supports |
| `/omp-handoff` | Compacts the conversation into a handoff document for another agent | Pass work to a fresh session |
| `/plugin-issue` | Files a bug or feature request on this plugin's GitHub repo | The plugin misbehaves or lacks something |
| `/teach` | Teaches a skill or concept over multiple sessions in a stateful workspace | Learn something over time |
| `/writing-great-skills` | Reference for the vocabulary and principles of well-written skills | Write or edit a skill |

## Skills

The 11 skills are model-invoked: omp loads one automatically when the
situation fits, so you don't type anything. Exception: `using-git-worktrees`
runs only when you ask.

| Skill | What it does | When the model reaches for it |
|---|---|---|
| `grilling` | Relentless one-question-at-a-time interview until every decision branch resolves. | You have a plan or design worth stress-testing before building. |
| `tdd` | Red-green-refactor test-first loop at pre-agreed seams. | Building a feature or fixing a bug where tests guard the contract. |
| `code-review` | Two-axis review (Standards + Spec) of a diff via parallel subagents. | You ask for a review of a branch, PR, or work-in-progress. |
| `diagnosing-bugs` | Disciplined loop: reproduce, minimise, hypothesise, instrument, fix, regression-test. | Something is broken, throwing, failing, or slow. |
| `research` | Background agent investigates high-trust primary sources; findings as cited markdown. | A question needs facts from docs or papers, not guesses. |
| `prototype` | Throwaway code that answers one design question (logic or UI). | Sanity-checking whether a state model or interface feels right. |
| `domain-modeling` | Builds and sharpens the project domain model; maintains CONTEXT.md and ADRs. | Terminology is fuzzy or an architectural decision needs recording. |
| `codebase-design` | Vocabulary for deep modules: lots of behaviour behind a small interface at a clean seam. | Designing a module's interface or deciding where a seam goes. |
| `resolving-merge-conflicts` | Resolves in-progress merges/rebase by intent, hunk by hunk — never `--abort`. | A merge or rebase is in progress with conflicts. |
| `using-references` | Consults the cloned reference corpus before reconstructing external behavior from scratch. | Reimplementing something with a reference available (ODE solvers, dense ML). |
| `using-herdr` | Operates herdr (the terminal workspace manager this session runs inside) via the `herdr_layout`/`herdr_pane`/`herdr_agent` tools or the CLI. | The user mentions herdr, or asks to control workspaces, panes, or sibling agents. |
| `using-git-worktrees` | Isolates feature work in a git worktree (`.worktrees/` convention). User-invoked only. | You ask for it — never auto-triggers. |

## Runtime behaviors

A few behaviors kick in without you invoking anything:

| Behavior | What it does |
|---|---|
| Bootstrap | At session start the model gets a one-time message listing every command, so it knows the package exists without `/help`. |
| Knowledge-base policy | An append-only guard on `.omp/knowledge/`: records, pitfalls, and `INDEX.md` are never rewritten in place. New timestamped entries and index appends pass; research working files stay editable. |
| Rules | A TTSR rule (a mid-conversation interrupt that stops the model just before it acts) blocks edits to knowledge-base entries; always-apply rules keep the right command discoverable during a conversation. |
| `knowledge_read` tool | The model can look up past findings on demand — the index, records, pitfalls, and research projects. |
| Herdr tools | `herdr_layout`/`herdr_pane`/`herdr_agent` wrap the herdr CLI for structured workspace/pane/agent control when the session runs inside a herdr pane (opt-in; gate message outside). |
| Transcript renderers | How results show up in the terminal: `/record` and `/pitfall` print a compact receipt card; `knowledge_read` results render as labeled cards. |

The append-only guard exists because the knowledge base is a durable,
append-only memory: entries are timestamped records of what happened, and
later edits would silently rewrite history. If a finding is wrong, add a
correcting entry rather than editing the old one.

## Configuration

`/hindsight` is configurable via `~/.omp/hindsight.json` — set the mode name,
the reflection prompt, and the revision lead-in phrase. Any invocation of
`/hindsight` re-reads the file; missing or invalid fields fall back to the
defaults. The toggle itself is silent — a receipt card and notification
appear, the model does not reply.

## Updating & troubleshooting

Installed plugins live in `~/.omp/plugins/` and are pinned to a version. All
management goes through `omp plugin <action>` (`install | uninstall | list |
link | doctor | upgrade | …`); add `--dry-run` to preview any action without
applying it.

1. **See what's installed** — `omp plugin list` shows `my-omp-skills@<version>`.
2. **List available releases** —
   `git ls-remote git@github.com:hae-banko/my-omp-skills.git --tags`.
3. **Update to a new release** — reinstall pinned to the new tag, e.g.
   `omp plugin install git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.13.0`.
   Installs are immutable copies, so the old version keeps working until the
   reinstall succeeds.
4. **Activate** — exit and re-enter omp. Commands, skills, rules, and tools
   are discovered at session start, so a running session won't see the new
   version.
5. **Pin a different version (downgrade / specific SHA)** — same command with
   an older tag, or the most immutable form, a full commit SHA.
6. **Stale bun git mirror** — if install fails with
   `no commit matching "<tag>" found`, bun's cached git mirror predates the
   tag. Refresh it, then retry:

   ```
   git -C ~/.bun/install/cache/958cddb050b6f945.git fetch origin +refs/tags/*:refs/tags/* +refs/heads/main:refs/heads/main
   ```

7. **Uninstall** — `omp plugin uninstall my-omp-skills`.
8. **Local development** — `omp plugin link /path/to/my-omp-skills` replaces
   the installed copy with a live directory: edit, re-link, and re-enter omp
   to pick up changes. No tagging needed.
9. **`omp plugin upgrade`** — for unpinned (tracks-`main`) installs only.
   This package's installs are pinned by design, so updating means step 3.

**Do I need to re-run `/omp-setup` after updating?** No. `/omp-setup` writes
per-repo configuration (which issue tracker, triage labels, domain-doc
layout), not a snapshot of the package version, and its output does not
change between releases. New runtime behaviors (bootstrap, knowledge-base
policy, rules, `knowledge_read` tool) activate on their own once you re-enter
omp; the knowledge base is created on demand by the first `/record` or
`/pitfall`. Re-running `/omp-setup` is always safe and idempotent — do it only
to switch issue trackers or start from scratch.

## Attribution

The commands and skills here are adapted from three MIT-licensed open-source
suites:

- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) — base for
  the command and skill structure.
- [obra/superpowers](https://github.com/obra/superpowers) (MIT) — source of
  the `using-git-worktrees` skill.
- [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills)
  (MIT) — source of the research command family (`/research`,
  `/research-add-items`, `/research-add-fields`, `/research-deep`,
  `/research-report`).

`/research-deep` validates its JSON output, which requires Python with
`pyyaml` installed.
