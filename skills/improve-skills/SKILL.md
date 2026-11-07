---
name: improve-skills
description: Skills authoring, evaluation, reflection, and evolution. Use when writing or editing skills well; evaluating or A/B testing a skill change ("did this skill change help"); reflecting on the active session to mine learnings ("reflect"); eliminating recurring corrections and repeated mistakes at the highest architectural level ("/correct"); or mining past sessions for preferences and workflows ("automate me", "workflow from chats").
---

# Improve Skills

Author, evaluate, reflect upon, and eliminate mistakes in agent skills and repository workflows.

| The user wants… | Playbook | Side effects |
|---|---|---|
| Author, refine, or review a skill using canonical layout, leading words, and progressive disclosure | [playbooks/author.md](playbooks/author.md) | Edits skill files when authoring requested |
| A/B benchmark or evaluate a skill change against baseline with blinded candidates and judge | [playbooks/eval.md](playbooks/eval.md) | Runs candidates in isolated temp dirs; read-only report |
| Mine the active session for learnings and route them into skill improvements | [playbooks/reflect.md](playbooks/reflect.md) | Read-only report; applies skill edits only after approval |
| Stop recurring agent mistakes permanently via architecture, types, linters, tests, and AGENTS.md | [playbooks/correct.md](playbooks/correct.md) | Modifies code, tests, or rules after approval |
| Mine past session transcripts to capture user preferences, workflows, or personal mode skills | [playbooks/from-sessions.md](playbooks/from-sessions.md) | Read-only report; modifies artifacts only after approval |

## Routing Rules

1. Read exactly the matching playbook (`skill://improve-skills/playbooks/<name>.md`) before acting; do not preload siblings.
2. If ambiguous, state which playbook you picked and why in one line, preferring the more conservative (read-only) playbook.
3. One hop: execute the matching playbook directly without returning to this router.

## Family Rules

- Edits to skills, rules, or codebase files require explicit user approval, except `author` when the user explicitly asked to create or edit the skill.
- Ground all proposals in concrete transcript evidence or historical failure cases; never make speculative additions.
- Enforce lessons at the highest structural level feasible: architecture > types > linter > tests > agent instructions.
