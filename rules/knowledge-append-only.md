---
description: The knowledge base is append-only — never edit records, pitfalls, or INDEX.md in place. Use /record or /pitfall instead.
globs: [".omp/knowledge/records/**/*.md", ".omp/knowledge/pitfalls/**/*.md", ".omp/knowledge/INDEX.md"]
condition: ".*"
scope: "tool:edit(*.md)"
interruptMode: "always"
---
The repo-local knowledge base at `.omp/knowledge/` is append-only. Entries are never edited in place:

- A new finding is a new file: `.omp/knowledge/records/YYYY-MM-DD_<slug>.md` (or `pitfalls/` for things that went wrong mid-task).
- `INDEX.md` only ever gains lines (newest first).
- `/record` and `/pitfall` are user-invoked slash commands — you have no tool for them. Propose the right one instead of editing the files directly.

You were about to edit one of these files. Stop, and propose the append-only path.
