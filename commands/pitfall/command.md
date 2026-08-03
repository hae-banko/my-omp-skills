Something just went wrong. Capture the pitfall before the context fades.

## When to use

The moment a dead end, costly mistake, or wrong approach becomes obvious — mid-task, not at the end. The difference from `/record`: `/pitfall` is reactive and instant; `/record` is the deliberate end-of-work capture.

## Run in the background

**The capture must never stop the current work.** Delegate the write to a **background subagent** and get back to the task immediately — the pitfall is freshest now, and the flow is worth more than the file.

The subagent brief must include:

- The pitfall: title + tags + the context/finding/evidence/next-time content (from the user's argument and the conversation). Pin `kind: pitfall`.
- The absolute path of the `RECORD-FORMAT.md` companion file (listed below) — the subagent composes from it.
- The repo root and the three rules: timestamped name (`YYYY-MM-DD_<slug>.md`, `-2` on collision), append-only (never edit an existing record), append one line to `INDEX.md` (newest first).
- The instruction to report the written path back.

If the user invoked `/pitfall` as the sole purpose of the turn, write it inline instead.

## Verify

At the next natural pause, confirm the record exists by reading its path. If it is missing, write it yourself. Never double-write: if the file is there, leave it.

## `--recent` mode

If the user's argument starts with `--recent` (optionally `--recent 5`): skip writing and print the last N pitfall entries from `INDEX.md`. This runs inline.

## Rules

- **Append-only.** Never edit an existing pitfall in place; supersede it with a new record.
- **Timestamped names.** The filename date is the record date.
- Every record carries the frontmatter from `RECORD-FORMAT.md`.
