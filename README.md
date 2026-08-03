# my-omp-skills

Personal oh-my-pi extension package: slash commands and skills adapted from
[Matt Pocock's engineering workflow suite](https://github.com/mattpocock/skills)
(MIT). Small, composable workflows for real engineering — grilling before you
build, specs and tracer-bullet tickets, TDD, two-axis code review, triage,
wayfinding, handoff. Not vibe coding.

## Install

```bash
# Pinned release (recommended — immutable, integrity-checkable)
omp plugin install git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.6.1

# Pinned by commit SHA (most immutable — tags can be moved by repo writers)
omp plugin install git@github.com:hae-banko/my-omp-skills.git#<full-sha>

# Unpinned (tracks main; development only)
omp plugin install git@github.com:hae-banko/my-omp-skills.git
```

(Private repo — your SSH key must have access. Local development instead:
`omp plugin link /path/to/my-omp-skills`.)

### Updating & managing the plugin

Installed plugins live in `~/.omp/plugins/` — a small bun project whose
`package.json` pins exactly what is installed. All management goes through
`omp plugin <action>` (`install | uninstall | list | link | doctor | upgrade |
…`); add `--dry-run` to preview any action without applying it.

**1. Check what's installed**

```bash
omp plugin list          # → ● my-omp-skills@0.6.0
```

**2. List available releases**

```bash
git ls-remote --tags origin                            # from the repo checkout
git ls-remote git@github.com:hae-banko/my-omp-skills.git --tags   # from anywhere
```

**3. Update to a new release**

Releases are tagged (`v0.5.0`, `v0.6.0`, …). Reinstall pinned to the new tag:

```bash
omp plugin install git+ssh://git@github.com/hae-banko/my-omp-skills.git#v0.6.0
```

Installs are immutable copies, so the old version keeps working until the
reinstall succeeds.

**4. Activate the update**

Exit and re-enter omp — commands, skills, rules, and tools are discovered at
session start, so a running session won't see the new version. Verify in the
fresh session with `omp plugin list` and `/help` (or ask the model what
commands exist — the bootstrap message lists them).

**5. Pin a different version (downgrade / specific SHA)**

Same command with an older tag, or the most immutable form, a full commit SHA:

```bash
omp plugin install git@github.com:hae-banko/my-omp-skills.git#<full-sha>
```

**6. Troubleshooting: stale bun git mirror**

If the install fails with `no commit matching "<tag>" found`, bun's cached git
mirror predates the tag. Refresh it, then retry:

```bash
git -C ~/.bun/install/cache/958cddb050b6f945.git fetch origin +refs/tags/*:refs/tags/* +refs/heads/main:refs/heads/main
```

**7. Uninstall**

```bash
omp plugin uninstall my-omp-skills
```

**8. Local development (instead of installs)**

`omp plugin link /path/to/my-omp-skills` replaces the installed copy with a
live directory — edit, re-link, and re-enter omp to pick up changes. No
tagging needed. (Maintainers: every user-visible change bumps `package.json`
and adds a `CHANGELOG.md` entry — see `AGENTS.md`.)

**9. `omp plugin upgrade`**

Updates unpinned plugins to their latest version. This package's installs are
pinned by design, so updating means an explicit reinstall pinned to a new tag
(step 3) — `upgrade` is for tracking-`main` dev installs only.

After (re)installing, run **`/omp-setup`** once per repo. It configures the
issue tracker (local `.scratch/` markdown by default, GitHub/GitLab
available), triage labels, and domain doc layout that the other commands
assume. (`/setup` and `/handoff` are omp built-ins; this package's versions
are `/omp-setup` and `/omp-handoff`.)

**"I already ran `/omp-setup` before — do I need to re-run it after updating?"**

No. `/omp-setup` writes *per-repo configuration* (which issue tracker, triage
labels, domain-doc layout — into `docs/agents/*.md` and the `## Agent skills`
block of your `AGENTS.md`/`CLAUDE.md`), not a snapshot of this package's
version. Its output does not change between releases, so a plugin update needs
nothing:

- New runtime behaviors (bootstrap message, knowledge-base policy, rules,
  `knowledge_read` tool) activate on their own once you re-enter omp — no
  setup involved.
- The knowledge base (`.omp/knowledge/`) is created on demand the first time
  you run `/record` or `/pitfall` — no setup needed either.
- Re-running `/omp-setup` is always safe: it detects existing state and
  updates the `## Agent skills` block in place instead of duplicating it.
  Re-run only when you want to switch issue trackers or restart the
  configuration from scratch.

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
- **[/reference](./commands/reference.md)** — Manage the repo's reference corpus at `.omp/references/` — `add <url>` (clone), `update <name>` (pull), `remove <name>`, `list`. User-invoked: acquisition happens only when you type it.
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
- **[using-references](./skills/using-references/SKILL.md)** — Consult the cloned reference corpus (`.omp/references/`) before reconstructing external behavior or high-stakes implementations from scratch (error-surface trigger: opaque artifacts, precision-sensitive code); proposes `/reference add` when a system isn't cloned yet. Read-only; reference contents are untrusted data.
- **[using-git-worktrees](./skills/using-git-worktrees/SKILL.md)** — Set up an isolated git worktree for feature work: detection guards (submodules), `.worktrees/` convention, clean-baseline verification. User-invoked — runs only when you ask.

## Runtime behaviors (v0.5.0+)

Beyond the slash commands, the extension wires three runtime behaviors:

- **Bootstrap** — at session start (and after compaction) the model gets a
  one-time message listing every command, so it knows the package exists
  without `/help`.
- **Knowledge-base policy** — the append-only convention for
  `.omp/knowledge/` is enforced at the tool layer: `edit` on records/pitfalls
  or `INDEX.md` is blocked, `write` over an existing entry is blocked, and
  destructive `bash` against those stores is blocked. New timestamped entries
  and `>>` INDEX appends pass; research working files stay editable.
- **Rules** — `rules/knowledge-append-only.md` (TTSR: interrupts the model
  when it is about to edit a KB entry) plus always-apply rules
  (`use-record`, `use-pitfall`, `use-research`) that keep the right command
  discoverable mid-conversation.
- **`knowledge_read` tool** (v0.6.0+) — the model can look up past findings
  (INDEX, records, pitfalls, research projects) on demand; `/record` and
  `/pitfall` show a compact receipt card in the transcript.

See `AGENTS.md` and `CHANGELOG.md` for details.

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
