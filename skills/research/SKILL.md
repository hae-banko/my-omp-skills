---
name: research
description: Investigate a topic, library, spec, or codebase question using specialized background subagents and record findings in the repository. Use when researching external libraries, APIs, specs, or codebase architecture.
---

Spin up a **background agent** via `task` using specialized subagents so you keep working while it investigates:
- `agent: "librarian"` for researching external libraries, APIs, specs, and external source code.
- `agent: "scout"` for read-only codebase exploration.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save single-topic findings to `.omp/knowledge/records/YYYY-MM-DD_<topic_slug>.md` (or propose `/record`) and append the entry to `.omp/knowledge/INDEX.md`.

For structured, multi-item deep research (e.g. evaluating candidate libraries or components against defined field schema), direct the user or propose the `/research` command family:
- `/research` — Phase 1: Draft research outline and field framework.
- `/research-deep` — Phase 2: Execute parallel background research agents in OODA waves.
- `/research-report` — Phase 3: Synthesize results into a summary-first markdown report.
