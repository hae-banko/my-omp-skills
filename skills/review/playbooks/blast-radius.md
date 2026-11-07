# Blast Radius

Use when identifying what a change breaks beyond its immediate diff, evaluating ripple effects, or proving the single premise safety hinges on.

Scope is what the user named (file, commit, branch, or PR). If unspecified, use the current branch diff against its merge-base.

## Steps

### 1. Frame the delta

Read the change: inspect modified, added, and deleted symbols.
Identify what behaves differently at runtime, including subtle semantics not immediately apparent from diff hunks.
Completion criterion: Modified symbols and runtime behavior deltas cataloged.

### 2. Identify the single safety premise

Determine the core invariant or assumption that makes this change safe (for example: "this cache clear only removes expired keys and triggers no cascade").
Evaluate how confident that premise is along the safety ladder:
1. Stated in prose (insufficient on its own).
2. Pointed at code (`file:line` or library source).
3. Traced execution: bad case shown impossible step-by-step.
4. Ran real code: script or test calling the implementation directly.
5. Verified in a running system.
Completion criterion: Single safety premise stated in one verifiable sentence with targeted ladder level.

### 3. Trace beyond static search

Inspect areas where simple symbol searches fall short:
- Pinned external library versions and local patches.
- Serialization boundaries: API payloads, JSON wire formats, database schemas.
- Execution timing and lifecycle: microtasks, teardown hooks, asynchronous queues.
- Multi-hop callers and indirect consumers three layers downstream.
Completion criterion: Indirect dependencies, serialization contracts, and lifecycle timings audited.

### 4. Categorize risks and cleared hypotheses

List concrete potential breakages with likelihood, severity, and `file:line`.
Distinguish real, confirmed risks from hypotheses checked and proven benign. Cite exact locations and reasoning for cleared items.
For wide or complex changes, spawn parallel analytical perspectives in a single batch using the `task` tool to audit independent risk areas.
Completion criterion: Risks partitioned into confirmed issues and verified cleared hypotheses.

### 5. Prove the safety premise with real code

Draft and run a focused test or script calling the real application code or library to verify the safety premise.
Capture the command run and the terminal output. If code execution is impossible in the current environment, state the fact and mark the premise unproven.
Completion criterion: Verification script executed with output recorded or premise explicitly designated unproven.

## Reply

Present the blast-radius assessment:
- **What it does**: Functional changes, including non-obvious runtime effects.
- **Single safety premise**: The foundational safety assumption, its ladder level (1–5), and the execution proof or explicit "unproven" designation.
- **Confirmed risks**: Breakage mechanism, `file:line`, likelihood, severity, and check method.
- **Cleared hypotheses**: Potential failure modes investigated and verified benign.
- **Before merging**: Minimal test or repro script to safeguard against regression.
