# Record format

Every record in `.omp/knowledge/` follows this shape.

Filename: `YYYY-MM-DD_<slug>.md`, slug = dash-case of the title; append `-2`, `-3`, … on same-day collision. **Append-only** — never edit an existing record in place; a new finding is a new file.

```markdown
---
created: YYYY-MM-DD
title: <one line, greppable>
kind: lesson          # lesson | pitfall | audit | note
tags: [tag1, tag2]
---

## Context
What was happening when this finding surfaced. Two or three sentences.

## Finding
The durable insight — what we learned, what went wrong, what we concluded.

## Evidence
Where it came from: session context, commands run, files, links. Only what grounds the finding.

## Next time
What to do differently, or how to recognize this again.
```

`kind` is a searchable tag, not a ceremony — omit it when no label fits. `## Evidence` and `## Next time` are the load-bearing sections; keep them honest and short.
