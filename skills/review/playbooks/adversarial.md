# Adversarial Review

Use when stress-testing a change, pull request, or design with parallel adversaries where findings survive only when proven by executing real code.

Scope is what the user named (branch, commit range, PR, or design document; a slash command passes it under `## User's arguments`). If unspecified, use the current branch diff against its merge-base.

## Steps

### 1. Frame the intent and scope

Establish the target scope: resolve commit ranges, branch diffs, or design documents.
Restate the change's intended behavior, contracts, and invariants in plain terms. If the intent or acceptance criteria are ambiguous, ask the user to clarify before proceeding.
Completion criterion: Intent articulated and target scope confirmed.

### 2. Prepare isolated worktrees

Create 2–3 isolated workspaces using [skill://using-git-worktrees](../../using-git-worktrees/SKILL.md) (under `.worktrees/adversary-<n>` or `/tmp/adversary-<slug>-<n>`).
Copy any uncommitted changes from the main working tree into each worktree so each adversary begins from an identical baseline.
Completion criterion: Isolated workspaces created and baseline state verified.

### 3. Spawn parallel adversaries

Launch 2–3 adversary subagents concurrently in a single batch using the `task` tool.
Provide each subagent with its designated workspace path, the scope diff, the restated intent, and the following brief:
> Break this change. Prove every finding with a run against real code: a failing test, a repro script, or a command showing incorrect behavior. For a design or plan, probe the codebase or run a prototype. Keep repro scripts in your assigned workspace. Report each finding with title, exact command executed, observed terminal output, and required output per intent. Omit anything not proven by a run: style, naming, structure, or speculative risks requiring future modifications. Reporting zero findings is a valid result.
Completion criterion: All adversary subagents finish and return their repro commands and outputs.

### 4. Verify and deduplicate findings

Review each reported finding. Rerun the repro command or inspect the terminal output directly:
- Retain the finding only if the execution demonstrates an active failure that violates the stated intent.
- Drop findings that lack code execution proof, reflect stylistic preferences, or represent hypothetical future risks.
- Group and merge findings that stem from the same root cause.
Completion criterion: Candidate findings filtered to proven defects and deduplicated.

### 5. Clean up workspaces

Remove the temporary worktrees and branches created in step 2.
Verify no orphaned directories or unmerged branch locks remain.
Completion criterion: Worktrees removed and git status verified clean.

## Reply

Present the adversarial review report:
- **Intent**: The restated intent and contract evaluated.
- **Verified findings**: For each confirmed finding, report title, repro command, observed output, expected behavior, failure mechanism, and discovering adversaries. State "No verified findings" if none survived.
- **Dropped findings**: Per adversary, the count of dropped findings and reasons (unproven, stylistic, or out of scope).
