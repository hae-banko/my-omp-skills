Report a bug or missing feature in this plugin (my-omp-skills) as a GitHub issue on `hae-banko/my-omp-skills`. Auto-posts — no confirmation step.

## Trigger

`/plugin-issue <what's wrong or what feature you want>`

## Behavior

1. **Classify.** Determine whether this is a `bug` (something broken) or an `enhancement` (missing feature).

2. **Duplicate check — never post a duplicate.** Run:
   `gh issue list -R hae-banko/my-omp-skills --state all --search "<2-3 key terms from the report>"`
   If a closely matching issue exists, do NOT create a new one — tell the user which issue already tracks it and ask whether they want a comment appended to it instead. Otherwise proceed.

3. **Draft the issue.** Gather facts first:
   - Plugin version: read `version` from `~/.omp/plugins/node_modules/my-omp-skills/package.json` (fall back to `package.json` in the plugin repo if missing).
   - omp version: `omp --version`.
   - Current date.
   - Reproduction context from the conversation (only what actually happened — do not invent steps).

   Title: `<bug|feat>: <one-line summary>`.

   **Bug body:**
   ```markdown
   ## What happened
   <what actually happened>

   ## Expected
   <what should have happened>

   ## Steps to reproduce
   <concrete steps, only the ones that actually occurred or are certain>

   ## Environment
   - plugin version: <version>
   - omp version: <version>
   - date: YYYY-MM-DD
   ```

   **Enhancement body:**
   ```markdown
   ## What I want
   <the feature or change>

   ## Why
   <the workflow it unlocks or the friction it removes>

   ## Current behavior
   <what the plugin does today>
   ```

4. **Auto-post.** Create the issue:
   `gh issue create -R hae-banko/my-omp-skills --title "<title>" --body "<body>" --label "bug"|"enhancement"`
   No confirmation — the user chose auto-post. If the command fails (network, auth, gh missing), report the error and offer to fall back to opening the prefilled new-issue URL in the browser.

5. **Report.** Give the issue URL and number in one line.

## Notes

- The issue lands in the plugin repo's backlog — triage it later by running `/omp-setup` + `/triage` inside `my-omp-skills` itself.
- `bug` and `enhancement` are the only labels; the repo is the plugin, nothing else needs labeling.
- Never invent reproduction steps, version numbers, or environment details. If you don't know, say so in the body.
