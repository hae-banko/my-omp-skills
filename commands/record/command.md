Record a durable finding into this repo's local knowledge base at `.omp/knowledge/`.

## When to use

The end of an investigation, a finished task, a conclusion worth keeping, a lesson learned, or a decision with a rationale a future session should find. NOT for work-in-progress status or chat messages. (For things that just went wrong mid-task, use `/pitfall` instead.)

## Run in the background

**The write must never stop the current work.** When `/record` is invoked while work is in progress — the normal case — delegate the write to a **background subagent** and return to the current task immediately. The recording is not a detour.

The subagent brief must include:

- The finding: title + kind + tags + the context/finding/evidence/next-time content (from the user's argument and the conversation).
- The absolute path of the `RECORD-FORMAT.md` companion file (listed below) — the subagent composes from it.
- The repo root and the three rules: timestamped name (`YYYY-MM-DD_<slug>.md`, `-2` on collision), append-only (never edit an existing record), append one line to `INDEX.md` (newest first).
- The instruction to report the written path back.

If the user invoked `/record` as the sole purpose of the turn (e.g. wrapping up), write it inline instead — no subagent needed.

## Verify

When you get a free moment — the next natural pause — confirm the record exists by reading its path. If it is missing, write it yourself. Never double-write: if the file is there, leave it.

## `--recent` mode

If the user's argument starts with `--recent` (optionally `--recent 5` for a count, default 10): skip writing entirely and print the last N entries from `INDEX.md` with their paths. This runs inline — it is the whole point of the turn.

## Rules

- **Append-only.** Never edit an existing record in place. A new finding is a new file.
- **Timestamped names.** The filename date is the record date; keep it truthful to the day it was recorded.
- Every record carries the frontmatter from `RECORD-FORMAT.md` — `created`, `title`, `kind`, `tags`.
