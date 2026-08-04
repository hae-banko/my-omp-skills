---
description: Don't proactively search for CLAUDE.md or other agent-context files at session start — the runtime already loads the relevant ones. If one is missing, proceed silently.
alwaysApply: true
---

The runtime loads the agent-context files it has (CLAUDE.md, AGENTS.md, etc.) into the system prompt automatically. The relevant ones are already in your context; any others are noise, and the user has not asked for them.

Do not grep, glob, or `read` for `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / similar at the start of a session, on entering a new directory, or "just to check". If a workflow body tells you to read one, follow that instruction — otherwise leave them alone.

If a file the user expects is genuinely missing and the workflow stalls, ask the user — don't go hunting.
