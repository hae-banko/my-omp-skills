---
name: design
description: "Design before or while building. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, or make code more testable or AI-navigable; pin down domain terminology or a ubiquitous language, or record an architectural decision (ADR); build a throwaway prototype to sanity-check whether a state model or logic feels right, or explore a UI; or design an agentic control loop (sensor, controller, actuator, scheduled workflow)."
---

# Design

Architectural design, interface deepening, domain modeling, interactive prototyping, and agentic control loops.

| The user wants… | Playbook | Side effects |
| :--- | :--- | :--- |
| Deep module interface, deepening shallow code, seam placement, testability, or alternative interfaces (design it twice) | [playbooks/interface.md](playbooks/interface.md) | Edits code only after approval (read-only design proposals by default) |
| Pin down domain terminology, ubiquitous language, context boundaries, or record architectural decisions (ADRs) | [playbooks/domain-model.md](playbooks/domain-model.md) | Writes `CONTEXT.md` / `CONTEXT-MAP.md` and `.omp/adr/NNNN-*.md` |
| Build a throwaway prototype to sanity-check state logic/transitions (terminal app) or explore UI variations (route switcher) | [playbooks/prototype.md](playbooks/prototype.md) | Writes throwaway prototype code or UI route |
| Design and build an agentic control loop (sensor, controller, actuator skill, recurring CI workflow, memory file) | [playbooks/control-loop.md](playbooks/control-loop.md) | Writes scripts, repo-local skill, CI workflow YAML, and memory file |

## Routing Rules

1. **Read exactly one matching playbook**: Load `skill://design/playbooks/<name>.md` before taking action. Do not preload sibling playbooks.
2. **Ambiguous intent**: State in one line which playbook was selected and why; prefer the more conservative (read-only) playbook when uncertain.
3. **One hop**: Execute the task directly within the chosen playbook; never route back to another router.

## Shared Principles

All playbooks follow the core architectural principles in [skill://design/references/principles.md](references/principles.md) (boundary discipline, type system discipline, domain modeling, separate before serializing shared state, idempotence, and exhausting the design space) and use the authoritative deep-module vocabulary in [skill://design/references/GLOSSARY.md](references/GLOSSARY.md).
