Record a durable finding into this repo's local knowledge base at `.omp/knowledge/`.

## When to use

The end of an investigation, a finished task, a conclusion worth keeping, a lesson learned, or a decision with a rationale a future session should find. NOT for work-in-progress status or chat messages. (For things that just went wrong mid-task, use `/pitfall` instead.)

## Behavior

1. **Identify the finding.** Take it from the user's argument or the just-finished conversation. If the user passed nothing and the conversation has no obvious finding, ask exactly one question: "What should we record?"
2. **Infer a kind.** `lesson` (something we learned), `audit` (an investigation conclusion), or `note` (anything else durable). Pitfalls belong to `/pitfall`, which pins `kind: pitfall`.
3. **Compose the record** using the `RECORD-FORMAT.md` companion file (listed below). Keep the title to one greppable line.
4. **Choose the filename.** `YYYY-MM-DD_<slug>.md` under `.omp/knowledge/`, slug = dash-case of the title. If a file with that name already exists, append `-2`, `-3`, … — **never overwrite**.
5. **Write the file.** Create `.omp/knowledge/` if missing.
6. **Update the index.** Append a one-line entry to `.omp/knowledge/INDEX.md`, newest first: `- YYYY-MM-DD <title> — <relative path>`. Create `INDEX.md` with a one-line header if missing.
7. **Report the path** in one line. Do not commit on the user's behalf; mention `git add` if they want it tracked.

## `--recent` mode

If the user's argument starts with `--recent` (optionally `--recent 5` for a count, default 10): skip writing entirely and print the last N entries from `INDEX.md` with their paths.

## Rules

- **Append-only.** Never edit an existing record in place. A new finding is a new file.
- **Timestamped names.** The filename date is the record date; keep it truthful to the day it was recorded.
- Every record carries the frontmatter from `RECORD-FORMAT.md` — `created`, `title`, `kind`, `tags`.
