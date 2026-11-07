---
name: investigate
description: "Diagnose, trace, or explain code from evidence. Use when the user says 'diagnose' or 'debug this', or reports something broken, throwing, failing, flaky, or slow; asks how something works or what happens at runtime ('how does X work', 'walk me through'); or asks why code is shaped the way it is ('why does X work this way', 'why did we pick Y'), including regressions and postmortems."
---

# Investigate Router

Route debugging, runtime flow analysis, and historical architecture rationale to dedicated analytical playbooks.

| The user wants… | Playbook | Side effects |
|---|---|---|
| Diagnose hard bugs, failures, crashes, or performance regressions ("diagnose", "debug this", broken, throwing, failing, slow) | [playbooks/diagnose.md](playbooks/diagnose.md) | Edits code to instrument and fix; removes instrumentation |
| Understand runtime execution flow, subsystem architecture, or code walkthroughs ("how does X work") | [playbooks/how.md](playbooks/how.md) | Read-only report |
| Discover historical motivation, design rationale, or regressions ("why does X work this way", "why did we pick Y", postmortems) | [playbooks/why.md](playbooks/why.md) | Read-only report |

## Routing Rules

- Read exactly the one matching playbook (`skill://investigate/playbooks/<name>.md`) before acting; do not preload siblings.
- If ambiguous, state which playbook was selected and why in one line; prefer the more conservative (read-only) playbook.
- One hop: a playbook never sends the agent back to a router. A playbook may invoke standalone skills (`tdd`, `grilling`, `research`, `ponytail`, `using-references`) or another router's playbook via full `skill://` URL.

## Shared Family Rules

- Evidence before conclusions: ground every finding in reproducible command runs, concrete `file:line` locations, or primary historical sources (git blame/log, PRs, ADRs). Never present speculation as fact.
- Non-destructive by default: `how` and `why` are strictly read-only. `diagnose` may only edit files to add tagged temporary instrumentation and apply the minimal verified fix; all instrumentation must be deleted before completion. Never commit or push without explicit user instruction.
