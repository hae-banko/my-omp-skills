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

- **[/ask-matt](./commands/ask-matt.md)** — Ask which command or flow fits your situation. A router over this package.
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

## Attribution

Derived from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
Adaptations: `/omp-setup` replaces `/setup-matt-pocock-skills` (local-first
tracker default; renamed because `/setup` is an omp built-in); `/omp-handoff`
because `/handoff` is an omp built-in; slash references to model-invoked skills
were normalized to skill names; subagent wording was mapped to omp task agents;
commands ship as markdown bodies registered by a TS extension entry.
