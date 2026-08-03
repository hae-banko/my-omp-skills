# my-omp-skills

Personal oh-my-pi extension package: slash commands and skills adapted from
[Matt Pocock's engineering workflow suite](https://github.com/mattpocock/skills)
(MIT). Small, composable workflows for real engineering — grilling before you
build, specs and tracer-bullet tickets, TDD, two-axis code review, triage,
wayfinding, handoff. Not vibe coding.

## Install

```bash
omp plugin install git@github.com:hae-banko/my-omp-skills.git
```

(Private repo — your SSH key must have access. Local development instead:
`omp plugin link /path/to/my-omp-skills`.)

Then run **`/omp-setup`** once per repo. It configures the issue tracker
(local `.scratch/` markdown by default, GitHub/GitLab available), triage
labels, and domain doc layout that the other commands assume. (`/setup` and
`/handoff` are omp built-ins; this package's versions are `/omp-setup` and
`/omp-handoff`.)

## Reference

Two axes, like the source: **user-invoked** commands fire only when you type
them; **model-invoked** skills are reachable by the agent when the task fits.

### User-invoked commands

- **[/ask-me](./commands/ask-me.md)** — Ask which command or flow fits your situation. A router over this package.
- **[/grill-me](./commands/grill-me.md)** — A relentless interview to sharpen a plan or design.
- **[/grill-with-docs](./commands/grill-with-docs.md)** — A grilling session that also builds your project's domain model, sharpening terminology and updating `CONTEXT.md` and ADRs inline.
- **[/omp-setup](./commands/setup/command.md)** — Configure this repo for the workflow commands (issue tracker, triage labels, domain doc layout). Run once per repo.
- **[/to-spec](./commands/to-spec.md)** — Turn the current conversation into a spec and publish it to the issue tracker — no interview, just synthesis.
- **[/to-tickets](./commands/to-tickets.md)** — Break a plan, spec, or conversation into tracer-bullet tickets, each declaring its blocking edges.
- **[/implement](./commands/implement.md)** — Build the work described by a spec or tickets, driving TDD at pre-agreed seams and closing out with code review.
- **[/triage](./commands/triage/command.md)** — Move issues and external PRs through a state machine of triage roles and write agent-ready briefs.
- **[/wayfinder](./commands/wayfinder.md)** — Plan a huge chunk of work as a shared map of decision tickets on the issue tracker, resolved one at a time.
- **[/improve-codebase-architecture](./commands/improve-codebase-architecture/command.md)** — Scan for deepening opportunities, present an HTML report, then grill through whichever you pick.
- **[/omp-handoff](./commands/handoff.md)** — Compact the current conversation into a handoff document so another agent can continue.
- **[/research](./commands/research/command.md)** — Phase 1 of deep research: outline generation (items + field framework) for academic/technical/market research, human-in-the-loop, web-supplemented. Projects land in `.omp/knowledge/research/<date>_<topic_slug>/`, indexed like `/record` entries.
- **[/research-add-items](./commands/research-add-items/command.md)** — Add research items to an existing outline.
- **[/research-add-fields](./commands/research-add-fields/command.md)** — Add field definitions to an existing outline.
- **[/research-deep](./commands/research-deep/command.md)** — Phase 2: research each item with parallel background agents, outputting validated JSON per item.
- **[/research-report](./commands/research-report/command.md)** — Phase 3: convert JSON results into a markdown report with table of contents.
- **[/plugin-issue](./commands/plugin-issue/command.md)** — Report a bug or missing feature in this plugin as a GitHub issue on `hae-banko/my-omp-skills`. Auto-posts after a duplicate check.
- **[/record](./commands/record/command.md)** — Record a durable finding (lesson, audit, note) into the repo's local knowledge base at `.omp/knowledge/records/`. Deliberate end-of-work capture; `--recent` lists entries.
- **[/pitfall](./commands/pitfall/command.md)** — Something just went wrong — instantly capture the pitfall into `.omp/knowledge/pitfalls/` before the context fades. Reactive capture; `--recent` lists entries.
- **[/teach](./commands/teach/command.md)** — Teach a new skill or concept over multiple sessions, using the current directory as a stateful workspace.
- **[/writing-great-skills](./commands/writing-great-skills/command.md)** — Reference for writing and editing skills well.

### Model-invoked skills

- **[grilling](./skills/grilling/SKILL.md)** — Interview the user relentlessly, one question at a time, until every branch of the decision tree is resolved. The reusable loop behind `grill-me` and `grill-with-docs`.
- **[tdd](./skills/tdd/SKILL.md)** — Test-driven development with a red-green-refactor loop, at pre-agreed seams.
- **[code-review](./skills/code-review/SKILL.md)** — Two-axis review (Standards + Spec) of a diff, run as parallel subagents.
- **[diagnosing-bugs](./skills/diagnosing-bugs/SKILL.md)** — Disciplined diagnosis loop: reproduce → minimise → hypothesise → instrument → fix → regression-test.
- **[research](./skills/research/SKILL.md)** — Investigate a question against high-trust primary sources via a background agent; capture findings as cited markdown.
- **[prototype](./skills/prototype/SKILL.md)** — Throwaway code that answers one design question (logic or UI).
- **[domain-modeling](./skills/domain-modeling/SKILL.md)** — Build and sharpen the project's domain model; maintain `CONTEXT.md` and ADRs inline.
- **[codebase-design](./skills/codebase-design/SKILL.md)** — Shared vocabulary for designing deep modules: a lot of behaviour behind a small interface at a clean seam.
- **[resolving-merge-conflicts](./skills/resolving-merge-conflicts/SKILL.md)** — Resolve an in-progress merge/rebase by intent, hunk by hunk; never `--abort`.
- **[using-git-worktrees](./skills/using-git-worktrees/SKILL.md)** — Set up an isolated git worktree for feature work: detection guards (submodules), `.worktrees/` convention, clean-baseline verification. User-invoked — runs only when you ask.

## Attribution

Derived from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
Adaptations: `/omp-setup` replaces `/setup-matt-pocock-skills` (local-first
tracker default; renamed because `/setup` is an omp built-in); `/omp-handoff`
because `/handoff` is an omp built-in; slash references to model-invoked skills
were normalized to skill names; subagent wording was mapped to omp task agents;
commands ship as markdown bodies registered by a TS extension entry.

`using-git-worktrees` is adapted from
[obra/superpowers](https://github.com/obra/superpowers) (MIT).

The deep-research commands (`/research`, `/research-add-items`,
`/research-add-fields`, `/research-deep`, `/research-report`) are adapted from
[Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills)
(MIT), inspired by the RhinoInsight paper (arXiv:2511.18743). Adaptation notes:
Claude/Codex-specific surfaces (`~/.claude/agents/…`, `AskUserQuestion`,
`WebSearch`/`WebFetch`, `model: opus`) mapped to omp equivalents — task
subagents, the `ask` tool, the `web_search` tool, companion-file disclosure of
the agent brief, strategy modules, and `validate_json.py`. Requires Python +
`pyyaml` for validation.
