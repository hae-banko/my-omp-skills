Review the current working branch, staged changes, or specified diff `$ARGUMENTS` exclusively for **over-engineering, dead flexibility, and unnecessary complexity**.

The goal of this review is to find what to delete or simplify. The diff's best outcome is getting shorter.

## Process

1. Identify the changes to review (unstaged changes, staged diff, or commit range in `$ARGUMENTS`).
2. Read the changes and check against the complexity criteria:
   - **`delete:`** Dead code, unused flexibility, speculative features, boilerplate factories. (Replacement: nothing).
   - **`stdlib:`** Hand-rolled utilities that the standard library already provides.
   - **`native:`** External dependencies or custom JS/CSS that native HTML/CSS/browser APIs already do.
   - **`yagni:`** Single-implementation interfaces, config nobody changes, layers with only one caller.
   - **`shrink:`** Same logic achievable in fewer lines (idiomatic standard expressions).

## Output Format

Report one line per finding:
`L<line>: <tag> <what>. <replacement>.` or `<file>:L<line>: <tag> <what>. <replacement>.`

End with the net impact score:
`net: -<N> lines possible, -<M> dependencies.`

If there is nothing to cut, output:
`Lean already. Ship.`

## Boundaries

Focus exclusively on complexity and over-engineering. Do not report styling trivia or general code organization unless it cuts net lines. Correctness and security issues should be flagged only if they block merging. Does not automatically apply edits.
