# my-omp-skills

An oh-my-pi extension package: user-invoked slash commands and model-invoked
skills implementing an engineering workflow suite (grilling, spec/ticket
flows, TDD, code review, triage, deep research, and a repo-local knowledge
base).

## Language

**Command**:
A workflow the user invokes by typing `/name`; the agent follows its markdown
body. A command may invoke a skill, never another command.
_Avoid_: tool, action

**Skill**:
A workflow the agent invokes on its own when the situation matches its
description.
_Avoid_: plugin, extension (those are package-level terms)

**Knowledge base**:
The repo-local store at `.omp/knowledge/` — typed namespaces (`records/`,
`pitfalls/`, `research/`), append-only, timestamped, indexed.
_Avoid_: notes, memory (omp's memory backend is a different mechanism)

**Reference**:
A pinned, read-only clone of a public repository that the agent consults as
ground truth when the original artifact is opaque.
_Avoid_: vendor, vendored copy, mirror, dependency

**Reference acquisition**:
The act of cloning a public repository, with the user's permission, so the
agent can read its source instead of inferring from opaque artifacts.
_Avoid_: cloning (git-specific), outsourcing (metaphor)

**Harvest**:
Extracting transferable patterns from a reference into the project's own
work.
_Avoid_: copying, inspiration

**Opaque artifact**:
A binary or closed system whose behavior cannot be read directly from its
distribution.
_Avoid_: black box (ambiguous), binary (too narrow)
