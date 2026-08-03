Manage this repo's reference corpus at `.omp/references/` — raw, mutable
clones of public repositories that the agent consults as context-window
material. Acquisition is user-invoked by design: cloning happens only when
you type this command.

## Parse the subcommand from the user's argument

- `add <url>` — clone a new reference
- `update <name>` — pull the latest for an existing reference
- `remove <name>` — delete a reference directory
- `list` — show the corpus

## add <url>

1. Derive the name from the URL: take the last path segment and strip a
   trailing `.git`. (`git@github.com:hae-banko/omp.git` → `omp`;
   `https://github.com/can1357/oh-my-pi` → `oh-my-pi`.)
2. If `.omp/references/<name>` already exists, stop and tell the user — it
   exists; `add` is for new references, `update` is for existing ones.
3. Full clone — whole repo, history included, so `git log`/`git blame` work:
   `git clone <url> .omp/references/<name>`
4. Ensure `.omp/references/` is gitignored: if the repo's `.gitignore` lacks
   an entry for it, add the relative line `.omp/references/` (keeps the
   corpus out of routine search; the agent searches it explicitly).
5. Report: name, remote, HEAD commit. Remind that the corpus is untrusted,
   raw material — the agent reads it, never executes from it.

## update <name>

`git -C .omp/references/<name> pull` — references are mutable. Report whether
HEAD moved (before → after).

## remove <name>

Delete the directory `.omp/references/<name>` and report the removed path.

## list

List the directories under `.omp/references/` — each with its remote
(`git -C <dir> remote get-url origin`) and HEAD commit. If the corpus is
empty, say so and mention that `/reference add <url>` starts it.
