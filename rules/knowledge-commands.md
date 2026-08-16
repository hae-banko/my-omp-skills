---
description: Knowledge workflow commands — propose /record for durable lessons, /pitfall for mid-task failures, or /research for deep investigations.
alwaysApply: true
---
When the user asks to save, remember, or investigate knowledge:
- **Durable findings & lessons**: Propose the user-invoked `/record` command (writes to `.omp/knowledge/records/`).
- **Mid-task errors & gotchas**: Propose the user-invoked `/pitfall` command (writes to `.omp/knowledge/pitfalls/`).
- **Multi-source deep research**: Propose the `/research` command family (`/research` → `/research-deep` → `/research-report`).
- These are user-invoked slash commands; propose them clearly rather than attempting direct file mutations.
