# Ponytail Debt Ledger

Use when harvesting deliberate ponytail shortcut comments into a structured debt ledger to track ceilings and upgrade triggers.

Scope is what the user named (directory, file pattern, or module; `/ponytail-debt` passes it under `## User's arguments`). If unspecified, scan the entire repository.

## Steps

### 1. Scan for shortcut markers

Search the codebase for deliberate shortcut comments, excluding `.git`, `node_modules`, and build output directories:
```bash
grep -rnE '(#|//) ?ponytail:' .
```
(Adjust or extend comment syntax if repository uses different language conventions).
Extract matching lines, file paths, and line numbers.
Completion criterion: All matching `ponytail:` comment lines extracted across scope.

### 2. Parse ceilings, upgrade triggers, and rot risk

For each matched comment, extract:
- The simplification that was made.
- The stated ceiling or upper limit.
- The trigger or threshold for revisiting/upgrading.

Convention check: markers follow `ponytail: <ceiling>, <upgrade path>`.
Rot risk check: if a marker specifies no upgrade path or trigger, tag it as `[no-trigger]` to highlight silent rot risk.
If user requested author tracking, query `git blame -L<line>,<line> <file>` for the responsible author.
Completion criterion: Every marker parsed into simplification, ceiling, and upgrade trigger, with missing triggers tagged.

### 3. Assemble and summarize the ledger

Group findings by file path. Format each finding:
```markdown
- Line <line>: <simplification> | ceiling: <limit> | upgrade: <trigger>
```

Tally total shortcut markers and total markers lacking an upgrade trigger.
Completion criterion: Grouped ledger compiled with summary counts calculated.

## Reply

Present the debt ledger grouped by file:

```markdown
### <file_path>
- Line <N>: <simplification> | ceiling: <limit> | upgrade: <trigger>
```

Conclude with the summary line:
```
<N> shortcut markers found (<M> with no trigger).
```

If no markers are found in the target scope:
```
No ponytail: debt found. Clean ledger.
```
