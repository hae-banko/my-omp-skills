# Authoring and Refining Skills

Use when authoring a new skill, refining an existing skill, or reviewing skill structure to maximize agent predictability.

A skill exists to wrangle determinism out of a stochastic system. **Predictability** — the agent taking the same _process_ every run, not producing the same output — is the root virtue; every lever below serves it.

Bold terms are defined in [skill://improve-skills/references/GLOSSARY.md](../references/GLOSSARY.md); read it for complete domain definitions.

## Principles and Vocabulary

### Invocation

Two choices, trading different costs:

- A **model-invoked** skill keeps a **description**, so the agent can fire it autonomously and other skills can reach it. It contributes to **context load** because the description sits in the context window every turn. Mechanics: omit `disable-model-invocation`, and write a model-facing description with rich trigger phrasing ("Use when the user wants…, mentions…").
- A **user-invoked** skill strips the description from the agent's reach: only the user typing its command can invoke it, and no other skill can. Zero context load, but it spends **cognitive load** on the user to remember it exists. Mechanics: set `disable-model-invocation: true`; the `description` becomes human-facing — a one-line summary, trigger lists stripped.

Pick model-invocation only when the agent must reach the skill on its own, or another skill must. If it only ever fires by hand, make it user-invoked and pay no context load.

When user-invoked skills multiply past what can be easily remembered, that piled-up cognitive load is cured by a **router skill**: one skill that names the others and when to reach for each.

### Writing the Description

A model-invoked **description** does two jobs: state what the skill is, and list the **branches** that should trigger it. Every word increases **context load**, so a description earns aggressive pruning:

- **Front-load the skill's leading word** — the description is where invocation work happens.
- **One trigger per branch.** Synonyms that rename a single branch are **duplication** — "build features using TDD … asks for test-first development" is one branch written twice. Collapse them; keep only genuinely distinct branches.
- **Cut identity already in the body.** Keep the description strictly to triggers plus any cross-skill reach clauses.

### Information Hierarchy

A skill is built from two content types — **steps** and **reference** — ranked by how immediately the agent needs the material:

1. **In-skill step** — an ordered action in the skill or playbook, the primary tier: what the agent does, in order. Each step ends on a checkable **completion criterion** (can the agent tell done from not-done?). A vague criterion invites **premature completion**.
2. **In-skill reference** — a definition, rule, or fact in the file, consulted on demand. Often a flat peer-set (e.g. every rule of a review on one rung).
3. **External reference** — reference pushed out of the main file into a separate companion file (`references/`), reached by an explicit **context pointer**, loaded only when the pointer fires.

A demanding completion criterion drives thorough **legwork** — the digging the agent does within the work — whether the skill has steps or not, since "every rule applied" binds flat reference just as "every step done" binds a sequence.

**Progressive disclosure** moves reference down the ladder into a linked file so the top stays legible. Branching is the cleanest disclosure test: inline what every branch needs, and push behind a pointer what only some branches reach.

**Co-location** keeps related concepts together: keep a concept's definition, rules, and caveats under one heading rather than scattered, so reading one part brings its neighbours with it.

### Pruning and Leading Words

- **Single source of truth**: keep each meaning in one authoritative place so behavioural changes require only a single edit.
- **Relevance**: check that every line bears directly on what the skill does.
- **Hunt no-ops**: run the no-op test on each sentence in isolation. If an instruction says what the model already does by default, delete it.
- **Leading words**: recruit priors already in the model's pretraining (e.g. _tight loop_, _tracer bullets_, _red-green-refactor_) to anchor behaviour in the fewest tokens.
- **Avoid negation**: steer with positive target behaviours rather than prohibitions. Banning a pattern names it into the prompt; state what to do instead.

### Failure Modes

- **Premature completion**: ending a step before it is genuinely done. Cure: sharpen the completion criterion first; if still rushed, split steps across sequence boundaries.
- **Duplication**: repeating meanings across files or headings.
- **Sediment**: stale instructions accumulating because addition feels safe and removal feels risky.
- **Sprawl**: excessive length even when unique. Cure: disclose reference behind pointers and split into playbooks.

## Canonical Layout: Routers and Playbooks

For complex workflows and skill families in this package, the canonical layout is a **router `SKILL.md` + playbooks**:

```
skills/<router>/SKILL.md              router (model-invoked)
skills/<router>/playbooks/<name>.md   one procedure per task
skills/<router>/references/...        companion files (formats, glossaries, reviewer prompts)
skills/<router>/scripts/...           runnable helpers
```

### Router SKILL.md Requirements

- **Frontmatter**:
  - `name: <router>` matching the directory name.
  - `description:` model-facing. Front-load the leading word, use one trigger per branch, and name every task its playbooks cover (including absorbed trigger phrases). Omit `disable-model-invocation`.
- **Body** (target <= 45 lines):
  - One-line purpose statement.
  - Routing table:
    `| The user wants… | Playbook | Side effects |`
    where Playbook is written as `[playbooks/<name>.md](playbooks/<name>.md)` and Side effects is explicit (e.g. "read-only report", "edits code only after approval").
  - Routing rules: instruct reading exactly the one matching playbook (`skill://<router>/playbooks/<name>.md`) before acting; do not preload siblings. Ambiguous requests resolve to the most conservative (read-only) playbook with a one-line explanation.
  - One hop: a playbook executes directly without bouncing back to a router.
  - Shared family rules: rules that bind every playbook in the family live once in the router body, not duplicated per playbook.

### Playbook Requirements

- **No frontmatter**.
- Top level: `# <Title>`, followed immediately by one `Use when …` line.
- Numbered steps: each step ends on an explicit, checkable completion criterion.
- Companion links: link text is the canonical skill URL, target is the relative file path:
  `[skill://<router>/references/<file>.md](../references/<file>.md)`.
- Slash command compatibility: must work both when invoked via router and when a slash command injects the playbook body directly (scope defaults to the user's argument or stated default).
- Trailing section: ends on `## Reply` defining the exact hand-off artifact.

### Placement

- Standard package skills live under `skills/<name>/`.
- Project-local skills live at `.omp/skills/<name>/SKILL.md` (discovered walking up from current working directory).
- User-level skills live at `~/.omp/agent/skills/`.

## Procedure

Scope is set by the user's argument (e.g. `/writing-great-skills <target>`) or the skill under discussion.

1. **Scope and invocation mode.**
   Determine whether the capability requires model discovery or manual execution. Identify the leading word and unique trigger phrases for each distinct branch.
   _Completion criterion:_ A written scope specifying target directory, invocation mode, leading word, and exact trigger list.

2. **Choose architecture and file structure.**
   For multi-procedure capabilities, map out the router `SKILL.md`, `playbooks/<name>.md` files, and companion files under `references/`. For single-procedure tasks, confirm if a standalone `SKILL.md` suffices.
   _Completion criterion:_ Directory and file map documented before authoring or modifying files.

3. **Draft the content.**
   Write procedures using numbered steps ending in checkable completion criteria. Push supporting tables, schemas, and extensive definitions to companion files under `references/`. Phrase instructions positively and prune no-ops.
   _Completion criterion:_ Complete drafts for router, playbooks, and references with zero unanchored sections.

4. **Validate structure and links.**
   - Frontmatter: verify `name` matches directory; verify `description` contains leading word and triggers without model slugs or emojis.
   - Links: verify that all relative paths in markdown links point to existing files on disk and use the `[skill://...](<relative-path>)` syntax.
   - House style: verify no `--` flags (ADR-0008: bare keywords), no banned jargon, and no no-op sentences.
   - Test suite: run project linting or tests (`npm test`) to confirm markdown and skill structures pass repository gates.
   _Completion criterion:_ Zero broken links and passing test suite output.

5. **Hand back the diff.**
   Present the file changes and a concise summary of design choices. Never commit, push, or open a pull request unless the user explicitly requested it.
   _Completion criterion:_ File diff and summary delivered to the user.

## Reply

Hand back:
- Summary of the skill or playbook created or modified.
- Key design decisions: leading words chosen, disclosure boundaries, and triggers preserved.
- Validation results: link resolution, frontmatter checks, and test output.
