# Reflecting on Session Learnings

Use when reflecting on the active session, invoked with "reflect" or "/reflect", to mine durable learnings and route them into skill updates.

Mine the current conversation for durable learnings, then route them into skill edits. Skip trivial sessions, off-topic work, or sessions where existing skills were followed without friction.

## Reviewer and Synthesizer Prompts

Companion templates for the reflection pass:
- [skill://improve-skills/references/reflect/judgment-reviewer.md](../references/reflect/judgment-reviewer.md) — Judgment and synthesis lens.
- [skill://improve-skills/references/reflect/tooling-reviewer.md](../references/reflect/tooling-reviewer.md) — Tooling, command conventions, and self-sufficiency lens.
- [skill://improve-skills/references/reflect/divergent-reviewer.md](../references/reflect/divergent-reviewer.md) — Divergent angles and blind-spot coverage lens.
- [skill://improve-skills/references/reflect/synthesizer.md](../references/reflect/synthesizer.md) — Cross-reviewer synthesis and classification template.

## Procedure

1. **Scope the active session and skill usage.**
   Identify the active session transcript from context and any child subagent transcripts (`history://<id>`). Note which skills were actually invoked or read during the session.
   _Completion criterion:_ Summary of session actions, invoked skills, and tool interactions compiled.

2. **Spawn three reviewers in parallel.**
   Spawn three concurrent reviewer subagents using the `task` tool, passing the session transcript or a structured digest:
   - Reviewer 1: prompt from [skill://improve-skills/references/reflect/judgment-reviewer.md](../references/reflect/judgment-reviewer.md)
   - Reviewer 2: prompt from [skill://improve-skills/references/reflect/tooling-reviewer.md](../references/reflect/tooling-reviewer.md)
   - Reviewer 3: prompt from [skill://improve-skills/references/reflect/divergent-reviewer.md](../references/reflect/divergent-reviewer.md)
   _Completion criterion:_ Findings returned from all three reviewer subagents.

3. **Synthesize reviewer findings.**
   Collate the three reviewer outputs and run the synthesis criteria from [skill://improve-skills/references/reflect/synthesizer.md](../references/reflect/synthesizer.md) (durability, specificity, convergence, decision-changing impact, skill-was-used, and already-covered checks). Produce an initial partition of Accepted, Rejected, and Backlog items.
   _Completion criterion:_ Formatted synthesis tables generated for Accepted, Rejected, and Backlog.

4. **Run structural enforcement check.**
   Review every item in the initial Accepted list. If an item can be enforced by a linter rule, strict type definition, test case, or automated pre-commit script, move it from Accepted to Backlog. Skill text is reserved for guidance that automated mechanisms cannot enforce.
   _Completion criterion:_ All structurally enforceable items migrated to Backlog.

5. **Present recommendations and await approval.**
   Display the full Accepted, Rejected, and Backlog lists to the user. State clearly what edits are proposed. Wait for explicit user approval before modifying any files.
   _Completion criterion:_ Table presented and user confirmation requested before taking action.

6. **Apply approved edits.**
   Once the user approves specific rows:
   - For minor tweaks (clarifying a sentence, updating a path): apply edits directly.
   - For substantive skill revisions or new playbooks: author changes adhering to [skill://improve-skills/playbooks/author.md](author.md).
   - For description tuning: update the skill frontmatter `description` with new triggers.
   - For Backlog items: file issues or note them in project backlog tracking.
   _Completion criterion:_ Approved skill edits applied and validated without unapproved modifications.

## Reply

Hand back:
- Table of Accepted proposals with user approval status.
- Rejected findings with the disqualifying criterion (e.g. `already-covered`, `structural`, `durability`).
- Backlog items with recommended automated enforcement mechanisms.
- Summary of applied file changes (if approved).
