Harvest every `ponytail:` shortcut and deferral comment in the codebase into a structured **Ponytail Debt Ledger**.

## Process

1. Grep the repository for deliberate shortcut comments, ignoring build directories, node_modules, and git internals:
   `grep -rnE '(#|//) ?ponytail:' .`

2. For each comment found, extract:
   - File path and line number
   - What simplification was made
   - Stated ceiling / limit
   - Upgrade trigger / path to revisit

3. Identify rot risk: Flag any `ponytail:` marker that lacks an upgrade trigger as `[no-trigger]`.

## Output Format

Group findings by directory and file:

```markdown
### <file_path>
- Line <N>: <simplification> | ceiling: <limit> | upgrade: <trigger>
```

Summary footer:
`<N> shortcut markers found (<M> with no trigger).`

If no markers exist:
`No ponytail: debt found. Clean ledger.`
