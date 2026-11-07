# Why Is It Shaped This Way

Use when investigating historical motivation, design rationale, or regressions ("why does X work this way", "why did we pick Y", postmortems).

This playbook is strictly read-only. Do not edit files, commit changes, or alter repository state.

## 1. Establish the Code Anchor

Identify the exact target code and its historical commits.

1. **Locate target files and lines**: Identify specific files, line ranges, and key symbols (types, functions, configuration constants).
2. **Inspect git history**:
   - Run `git blame -L <start>,<end> <file>` to identify the commits that last modified the relevant lines.
   - Run `git log --follow -p -20 -- <file>` to trace changes through file renames and inspect commit messages.
   - Search commit subjects and bodies for pull request numbers (`(#1234)`) and issue references.
3. **Capture PR context**: Use `gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,comments,reviews` to extract the author's stated motivation and reviewer discussions.

*Completion criterion:* Concrete code anchor documented with file:line ranges, commit hashes, PR numbers, and originating author names.

## 2. Search Historical Evidence Sources

Consult primary historical sources in parallel to gather documentary evidence. Review the epistemics framework in `[skill://investigate/references/EPISTEMICS.md](../references/EPISTEMICS.md)` before assessing findings.

Investigate the following categories:
1. **Source control & PRs**: Commit messages, pull request descriptions, code review threads, and contemporary test cases.
2. **Architecture Decision Records**: Search `.omp/adr/` and `docs/adr/` for relevant decision records and architectural context.
3. **Local knowledge base**: Search `.omp/knowledge/` (`records/`, `pitfalls/`, `research/`) via `xd://knowledge_read` or filesystem tools for logged findings.
4. **Session transcripts**: Search historical session transcripts using the eval `archive` global (e.g. `archive.search("<symbol>")` or `archive.sessions()` in `eval`), or spawn a `seance` subagent via `task` if a relevant session ID is known.
5. **Issue trackers & external docs**: If MCP tools are connected (such as Plane, Linear, or Notion), search for tickets, customer requests, or project specs matching the target symbols.

Document every source checked, including queries that yielded zero results.

*Completion criterion:* A comprehensive source log listing every search performed, records retrieved, and explicit notes for empty or unavailable sources.

## 3. Calibrate Claims Against Evidence Tiers

Classify every finding into an explicit confidence tier per `[skill://investigate/references/EPISTEMICS.md](../references/EPISTEMICS.md)`.

1. **Direct**: Explicit textual statement from the author or reviewer (in a PR description, commit message, issue discussion, or code comment) directly stating why the code was shaped this way. Must include an exact citation.
2. **Supported**: Multiple converging pieces of indirect evidence (e.g. test assertions added in the same PR, commit timing matching an outage, or linked bug labels). Must list all supporting items.
3. **Inferred**: Logical deduction from code structure, system patterns, or surrounding convention. The inference step must be visible, and the claim must use calibrated hedging ("appears to", "suggests", "is consistent with").
4. **Speculative**: A plausible hypothesis lacking documentary backing. State as an unverified possibility under Competing Hypotheses.
5. **Unknown**: Acknowledged historical gap where searches yielded no evidence.

*Integrity checks:*
- Never cite the code's operation as evidence of its own intent (e.g. "it clamps the value, so the author wanted clamping" is circular).
- If the user suggested a motive ("is this for performance?"), treat it as a candidate hypothesis to evaluate independently against the evidence, never as an established fact.

*Completion criterion:* Every claim mapped to an explicit confidence tier with adjacent citations or hedged phrasing.

## 4. Extract Decision Constraints

If the investigation informs planned modifications or refactoring, convert findings into an actionable constraint set:
- **Preserve**: Invariants, edge cases, and contracts that must remain intact.
- **Change**: Outdated assumptions, dead constraints, or superseded requirements that can be retired.
- **Avoid**: Past failure modes, regressions, and anti-patterns revealed by incident or PR history.
- **Risk**: Areas where historical rationale remains unknown and requires cautious testing.

*Completion criterion:* Actionable Preserve/Change/Avoid/Risk summary prepared, or explicitly marked as not applicable if no modifications are planned.

## Reply

Present the investigation report to the user:
- **The Question**: Restatement of the investigated decision or pattern.
- **The Code in Question**: File paths, line ranges, and key symbols.
- **What We Found**: `[Direct]` and `[Supported]` findings with explicit citations (PR #, commit SHA, ADR path, or ticket ID).
- **What We Can Reasonably Infer**: `[Inferred]` claims with reasoning chains and hedged language.
- **Competing Hypotheses**: Alternative explanations if the documentary record is inconclusive.
- **What We Don't Know**: Specific sources and queries that yielded no rationale.
- **Sources Consulted**: Itemized list of commits, PRs, ADRs, knowledge files, and session archives searched.
- **Decision Constraints**: Preserve / Change / Avoid / Risk table if code modification is anticipated.
- **Confidence Summary**: 1–2 sentences summarizing overall confidence in the historical rationale.
