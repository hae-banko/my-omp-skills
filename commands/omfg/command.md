Something just went wrong. Capture the pitfall before the context fades.

## When to use

The moment a dead end, costly mistake, or wrong approach becomes obvious — mid-task, not at the end. The difference from `/record`: `/omfg` is reactive and instant; `/record` is the deliberate end-of-work capture.

## Behavior

1. **Pull the context** from the current conversation: what we were trying, what failed, what we tried, what actually worked or unblocked us.
2. **Compose a pitfall record** using the `RECORD-FORMAT.md` companion file (listed below), with `kind: pitfall`. Fill `## Context`, `## Finding`, `## Evidence`, and `## Next time` — the detection signal goes in `## Next time` ("how to recognize this again").
3. **Write it now.** `YYYY-MM-DD_<slug>.md` under `.omp/knowledge/` (`-2` suffix on same-day collision); create the directory if missing. Do not wait for the session to end.
4. **Update the index.** Append the one-line entry to `.omp/knowledge/INDEX.md`, newest first: `- YYYY-MM-DD <title> — <relative path>`.
5. **Report the path in one line.** Then get back to the work — the record is one step, not a detour.

## `--recent` mode

If the user's argument starts with `--recent` (optionally `--recent 5`): skip writing and print the last N pitfall entries from `INDEX.md`.

## Rules

- **Append-only.** Never edit an existing pitfall in place; supersede it with a new record.
- **Timestamped names.** The filename date is the record date.
- Every record carries the frontmatter from `RECORD-FORMAT.md`.
