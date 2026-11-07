# Mining Preferences from Past Sessions

Use when asked to "automate me", capture user preferences, synthesize workflow from past sessions, or build personalized agent guidance from session history.

Extract durable working preferences and workflow habits from past session transcripts. Synthesize reusable operational guidance, not mere conversation summaries.

## Confidence Levels

Rate every extracted preference or workflow pattern against these confidence levels:

- **Strong**: explicit user statement ("always do X", "stop doing Y"), direct correction repeated across 2+ sessions, or explicit command to encode a workflow.
- **Medium**: accepted workflow pattern observed across multiple sessions without correction, consistent subagent delegation habit, or repeated tool choice.
- **Weak**: behavior chosen autonomously by an agent without explicit user validation, or a pattern observed in only one session.
- **Contradicted**: conflicting instructions observed across sessions. Do not encode without asking the user to resolve the contradiction.

## Artifact Selection Matrix

Route synthesized findings to the appropriate project artifact:

| Artifact | When to Use | Destination |
|---|---|---|
| **Playbook Edit** | Pattern refines or extends an existing workflow | `skills/<router>/playbooks/<name>.md` |
| **New Playbook** | Distinct, multi-step repeatable procedure | Drafted via [skill://improve-skills/playbooks/author.md](author.md) under `skills/<router>/` |
| **Rule** | Broad invariant or behavior constraint | `rules/` or project rule file |
| **AGENTS.md** | General agent team instructions or operational bounds | Project `AGENTS.md` |
| **Knowledge Record** | Domain insight, technical pitfall, or architectural decision | Proposed user-invoked `/record` command |
| **No Artifact** | Situational workaround, ephemeral detail, or low confidence | Dropped with explanation |

## Privacy and Scoping Bounds

- Scope search to the current project workspace by default unless the user explicitly requests wider history.
- Never output raw secrets, credentials, proprietary customer data, or sensitive tokens discovered in transcripts.
- Cite sessions by session identifier and date; avoid publishing unscrubbed chat quotes.

## Procedure

1. **Scope the mining pass.**
   Determine the target area (e.g. general working style, verification posture, commit conventions, or a specific domain task). Set the time horizon (defaulting to the last 14 to 30 days) and check whether an existing personal mode skill or profile exists.
   _Completion criterion:_ Scoping parameters and target workflow areas defined.

2. **Query past session transcripts.**
   Inspect historical sessions using the `archive` eval helper (e.g. `archive.sessions()`, `archive.search(query)`) or spawn read-only `seance` subagents targeting specific session IDs with `sourceSession`. Scan for explicit preferences, repeated corrections, and tool usage patterns.
   _Completion criterion:_ Corpus of relevant session IDs and transcript references assembled.

3. **Extract and rate preference atoms.**
   Extract discrete preference atoms:
   - Trigger condition: when the behavior applies.
   - Prescribed action: what the agent should do.
   - Decision rule: criteria used to choose paths.
   - Quality bar: what constitutes done.
   - Evidence citations: session IDs and dates where the pattern appeared.
   Assign confidence: Strong, Medium, Weak, or Contradicted.
   _Completion criterion:_ List of structured preference atoms with confidence scores and citations.

4. **Clarify ambiguities or contradictions.**
   If key preferences contradict each other or strong evidence is missing for a desired area, present focused clarifying questions to the user before drafting.
   _Completion criterion:_ Ambiguities resolved through user input or marked as unresolved.

5. **Select target artifacts and draft guidance.**
   Cluster confirmed preferences into thematic categories (response style, autonomy, verification posture, subagent usage, process). Map each cluster to its target artifact using the artifact selection matrix. Draft minimal, actionable prose adhering to house style.
   _Completion criterion:_ Drafted updates prepared for playbooks, rules, `AGENTS.md`, or knowledge records.

6. **Present recommendations and await approval.**
   Present the synthesized profile and proposed file modifications. Edits to skills, rules, or documentation must only be applied after explicit user review and approval.
   _Completion criterion:_ Synthesis presented to the user and approval requested.

## Reply

Hand back:
- Target workflow and session corpus inspected (session IDs and dates).
- Preference profile clustered by domain area.
- Extracted atoms with confidence ratings (Strong, Medium, Weak, Contradicted).
- Proposed artifacts and exact diffs or new file locations.
- Any open questions or dropped low-confidence observations.
