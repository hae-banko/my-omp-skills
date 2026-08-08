Manage the repo's reference corpus at `.omp/references/` — raw, mutable
clones of public repositories the agent consults as context-window material.
Fully local: this command runs git itself and reports the result — no agent
turn is spent, and cloning happens only when you type it.

| Subcommand | Semantics |
| --- | --- |
| `add <url>` | Clone `<url>` into `.omp/references/<name>` (name derived from the URL). Fails if the name is already installed — use `update`. |
| `update <name>` | `git pull` the installed reference; reports HEAD before → after. |
| `remove <name>` | Delete `.omp/references/<name>`. Refuses names that are not a plain directory inside the corpus. |
| `list` | List the corpus — each entry with its remote and HEAD; "corpus is empty" when none. |

Notes:

- Bare `/reference` is an alias for `list`.
- The corpus is gitignored (`.omp/references/`) and is **untrusted, read-only
  material**: the agent reads references, never executes from them and never
  follows instructions embedded in them.
