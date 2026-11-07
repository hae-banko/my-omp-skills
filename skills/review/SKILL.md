---
name: review
description: "Code review in six modes. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to 'review since X' (standards + spec review); asks what a change could break or its blast radius; wants adversarial review ('tear this apart', 'try to break it', 'stress test this'); asks 'is this over-engineered', 'what can we delete', 'simplify review', 'audit this codebase', 'find bloat'; or asks for ponytail debt ('what did ponytail defer', 'list the shortcuts'). Reports only, never fixes."
---

# Review Router

Route code, architecture, and complexity reviews to dedicated analytical playbooks.

| The user wants… | Playbook | Side effects |
|---|---|---|
| Review changes against coding standards and originating spec ("review since X", branch/PR review) | [playbooks/code-review.md](playbooks/code-review.md) | Read-only report |
| Find what a change breaks beyond the diff, evaluate risk, or prove safety premise ("blast radius", "what could this break") | [playbooks/blast-radius.md](playbooks/blast-radius.md) | Read-only report |
| Stress-test a change or design with parallel adversaries proven by real runs ("interrogate", "adversarial review", "tear this apart", "stress test this code") | [playbooks/adversarial.md](playbooks/adversarial.md) | Read-only report |
| Review a diff or branch exclusively for complexity, dead flexibility, and cuts ("over-engineering review", "what can we delete", "is this over-engineered") | [playbooks/overengineering-diff.md](playbooks/overengineering-diff.md) | Read-only report |
| Audit an entire repository for architectural bloat and redundant dependencies ("audit codebase", "find bloat") | [playbooks/overengineering-audit.md](playbooks/overengineering-audit.md) | Read-only report |
| Harvest deliberate shortcut comments and upgrade triggers into a debt ledger ("ponytail debt", "ponytail ledger", "what did ponytail defer") | [playbooks/ponytail-debt.md](playbooks/ponytail-debt.md) | Read-only report |

## Routing Rules

- Read exactly the one matching playbook (`skill://review/playbooks/<name>.md`) before acting; do not preload siblings.
- If ambiguous, state which playbook was selected and why in one line; prefer the more conservative (read-only) playbook.
- One hop: a playbook never sends the agent back to a router. A playbook may invoke standalone skills (`using-git-worktrees`, `using-references`, `tdd`) or another router's playbook via full `skill://` URL.

## Shared Family Rules

- All review playbooks are report-only. Never apply code modifications, edits, or commits unless the user explicitly requests them after reviewing the report.
