---
description: Generate a unified project history & progress digest — /timeline [limit]. User-invoked: local, zero-agent execution.
disable-model-invocation: true
---

# /timeline

Generates a unified project digest combining git commits/tags, knowledge base findings (`.omp/knowledge/`), research projects, and decision tickets into a chronological visual digest.

```
/timeline
/timeline 10
/timeline 25
```

## Details

- **Local & Deterministic**: Runs in TypeScript only — no prompt queued, no LLM turns, 0 token cost.
- **Unified Streams**: Aggregates Git history (`git log`), Knowledge Base records (`INDEX.md`), Deep Research projects, and Wayfinder tickets (`.omp/scratch/`).
- **Transcript Card**: Displays a formatted `TIMELINE DIGEST` transcript card.
