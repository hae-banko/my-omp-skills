# Changelog

All user-visible changes to my-omp-skills. Releases are tagged `vX.Y.Z`;
installs pin to a tag (see README). Version history before v0.5.0 predates
this changelog.

## v0.5.0 — runtime behaviors: bootstrap, KB policy, rules

- **Bootstrap**: at session start and after compaction, the model receives a
  one-time message listing all 21 commands (user-invoked slash commands, not
  tools) — no more needing `/help` to know the package exists. Cleared on
  `agent_end`; dedup-guarded (superpowers pattern).
- **Knowledge-base policy**: a `tool_call` guard makes the append-only
  convention a runtime invariant — `edit` on records/pitfalls/`INDEX.md` is
  blocked, `write` over an existing entry is blocked, destructive `bash`
  against those stores is blocked. New timestamped files and `>>` INDEX
  appends still pass; research working files stay editable.
- **Rules**: `knowledge-append-only` TTSR rule (fires when the model is about
  to edit a KB entry) plus three always-apply rulebook rules (`use-record`,
  `use-pitfall`, `use-research`) keeping the right command discoverable
  mid-conversation.
- **Docs**: AGENTS.md gains runtime-behavior and memory-backend sections;
  repo changelog discipline introduced.

## Before v0.5.0

v0.4.2 and earlier (21 commands, 10 skills, deep-research workflow, `/record`
+ `/pitfall` knowledge base, `/plugin-issue` auto-posting) shipped without a
changelog. See git history and the README reference table.
