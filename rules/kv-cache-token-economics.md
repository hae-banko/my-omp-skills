---
description: KV Cache prefix stability and token economics rules for prompt optimization, context budget preservation, and zero-turn harness performance.
alwaysApply: true
---

# KV Cache & Token Economics Rules

To maintain maximum LLM performance, low turn latency, and high KV cache hit rates:

1. **KV Cache Prefix Stability Invariant**:
   - The system prompt base prefix MUST remain static across turns within a session.
   - Dynamic system prompt additions (like `<relevant-knowledge>` or `## Active knowledge base`) MUST be appended strictly to the tail (`evt.systemPrompt = sysPrompt + ...`). Never prepend or mutate prefix text, as mutating the prefix invalidates the prompt cache for all subsequent tokens.
   - Use static, deterministic formats (e.g. `YYYY-MM-DD` mtime dates, deterministic list sorting) rather than volatile timestamps like `Date.now()`.

2. **Token Economics & Context Preservation**:
   - Prefer in-TS command bypasses (like `/record --recent` or `/reference`) for passive reads to avoid injecting multi-KB workflow bodies and burning LLM turns.
   - Offload heavy codebase or API reading to background `task` subagents (`scout` for read-only exploration, `librarian` for API/docs/source-code research) to keep the main session context clean and unpolluted.
   - Cap system prompt injections (e.g. max 5 records + 5 pitfalls in `kb-index-injector.ts`) to avoid context dilution.

3. **Zero-Turn Harness Surface**:
   - Use TUI completion headers (`value: ""`) to surface live project state (`/wayfinder`, `/research`, `/reference`, `/routinize`, `/audit`) directly in the editor dropdown without requiring an LLM turn or command execution.
