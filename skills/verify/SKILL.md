---
name: verify
description: "Prove behavior with checks that can fail. Use when the user wants to model-check or formally verify a race, lock, retry loop, protocol, or state machine ('model-check this', 'prove this invariant'), draw a state machine as a statechart, or show a bug as a path through states; check a model still matches the code; wants a project skill that drives the real app ('make a verify skill for this repo') or to audit one; or wants a benchmark, speedup, or regression claim vetted before it is reported."
---

# Verify

Drive real application surfaces, model-check critical invariants, and vet performance claims.

| The user wants… | Playbook | Side effects |
| :--- | :--- | :--- |
| To generate a scripted harness driving real UI/CLI/API surfaces | [playbooks/runtime-skill.md](playbooks/runtime-skill.md) | Writes `.omp/skills/verify-<app>/` |
| To audit or synchronize a runtime verification skill and feature map | [playbooks/runtime-skill-maintain.md](playbooks/runtime-skill-maintain.md) | Edits `.omp/skills/verify-<app>/` or read-only report |
| To formally verify an invariant, race, retry loop, or state machine | [playbooks/formal.md](playbooks/formal.md) | Writes `.omp/specs/<target>/`, docs, and tests |
| To draw a state machine as a statechart or show a bug as a path through states | [playbooks/statechart.md](playbooks/statechart.md) | Writes TLA+ spec + chart under `.omp/specs/<target>/`; adds a regression test or repro per bug path |
| To reconcile a formal model with code changes or check for drift | [playbooks/formal-maintain.md](playbooks/formal-maintain.md) | Edits `.omp/specs/`, tests, or read-only report |
| To vet a benchmark, speedup, or regression claim before reporting | [playbooks/benchmark.md](playbooks/benchmark.md) | Read-only report |

## Routing rules

1. Read exactly the matching playbook (`skill://verify/playbooks/<name>.md`) before acting. Never preload sibling playbooks.
2. If ambiguous, state the chosen playbook and rationale in one line, defaulting to the more conservative read-only check.
3. One hop: a playbook never routes back to a router. It may name a standalone skill (`using-herdr`, `show-me`, `tdd`) or link one specific playbook of another router by full `skill://` URL.

## Shared invariants

- **Direct observation over proxies:** Test the real artifact directly (actual running process, real return value, exact diff), never unverified compiler passes, stale caches, or self-reports.
- **Proofs survive teardown:** Cleanup removes ephemeral processes and scratch directories, but never deletes recorded verification evidence or traces.
- **Publishing safety:** Do not commit, push, or open pull requests unless explicitly instructed. Return structured diffs and run records.
