# Overengineering Diff Review

Use when reviewing diffs, staged changes, branches, or pull requests exclusively for unnecessary complexity, dead flexibility, and code to eliminate. The cut comes before the addition ([skill://principles/subtract-before-you-add.md](../../principles/subtract-before-you-add.md)).

Scope is what the user named (unstaged changes, staged diff, commit range, branch, or PR; `/ponytail-review` passes it under `## User's arguments`). If unspecified, review the working tree diff against `HEAD`.

## Steps

### 1. Identify and pin the diff

Resolve the diff corresponding to the target scope:
- Unstaged working tree changes (`git diff`).
- Staged changes (`git diff --cached`).
- A commit range or branch (`git diff <range>...HEAD`).
Confirm the diff is non-empty before proceeding.
Completion criterion: Target diff captured and verified non-empty.

### 2. Audit against complexity categories

Inspect each hunk in the diff exclusively for complexity and over-engineering. Skip formatting trivia. Defer correctness and security issues to standard review unless critical:
- `delete:` Dead code, unused flexibility, speculative features, boilerplate factories, or wrappers around idempotent local calls. Replacement: nothing.
- `stdlib:` Hand-rolled utilities that the runtime standard library already provides. Name the function or module that replaces it.
- `native:` External dependencies or custom polyfills for features the runtime or platform already natively supports. Name the platform feature.
- `yagni:` Abstractions with one implementation, configuration nobody alters, or indirection layers with only a single caller. Suggest inlining or flattening.
- `shrink:` Identical logic achievable in fewer lines using standard idiomatic expressions. Show the concise alternative.

Guardrail: A smoke test or `assert`-based self-check is baseline diligence, not bloat. Never flag test safety nets for deletion.
Completion criterion: Every modified hunk evaluated against complexity tags.

### 3. Compile line-by-line findings

Format each finding on a single line:
- Single file: `L<line>: <tag> <what>. <replacement>.`
- Multi-file: `<file>:L<line>: <tag> <what>. <replacement>.`

Calculate the net impact: count eliminated lines and eliminated dependencies across all findings.
Completion criterion: Findings formatted as single-line items with net line and dependency reductions calculated.

## Reply

List each finding:
```
<file>:L<line>: <tag> <what>. <replacement>.
```

End with the net impact summary:
```
net: -<N> lines possible, -<M> dependencies.
```

If no unnecessary complexity is found, return:
```
Lean already. Ship.
```
