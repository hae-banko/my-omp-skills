---
name: using-herdr
description: Operate herdr (the terminal workspace manager this session runs inside) through the herdr_layout, herdr_pane, and herdr_agent tools — or the herdr CLI directly. Use when the user mentions herdr, or asks to inspect or control workspaces, tabs, panes, or sibling coding agents.
---

# Using herdr

This session runs inside [herdr](https://herdr.dev) — a terminal workspace
manager for AI coding agents (workspaces → tabs → panes; panes host shells or
coding agents). The package registers three structured tools that exec the
herdr CLI:

| Tool | Covers |
|---|---|
| `herdr_layout` | `current`, `workspace_list/create/focus`, `tab_list/create/focus`, `pane_list`, `pane_layout`, `pane_split` |
| `herdr_pane` | `get`, `run` (command + Enter), `read`, `wait_output`, `send_text`, `send_keys`, `close` — raw terminal control |
| `herdr_agent` | `list`, `get`, `start`, `prompt` (send + wait for settlement), `wait`, `read`, `send`, `focus`, `rename` |

## Activation and policy

- The tools activate only inside a herdr pane (`HERDR_ENV=1`, `HERDR_PANE_ID`
  set). Outside herdr they return a gate message — use the CLI directly there.
- **Opt-in**: do not use these tools unless the user mentions herdr or asks
  to inspect/control herdr. Normal work and delegation stay local.
- Default topology: the caller's own tab and working directory; focus stays
  with the user. A different tab/workspace/cwd is used only when requested.

## Working with agents

- **Targets**: a unique live agent name or the pane id hosting it. IDs are
  opaque — always use ones returned by herdr.
- **Lifecycle states**: `working` (processing), `blocked` (waiting on
  approval/input), `done` (finished unseen work), `idle` (ready, seen),
  `unknown`.
- **Start a sibling agent** (needs an existing pane at a shell prompt):
  `pane_split` → `start` with `name` (+ `cwd`/`split`/`focus`) → `prompt`
  → `read`. `prompt` sends the text and waits for settlement, then reports
  the agent's state.
- **Verify first**: `agent list` / `agent get` before acting on a target.

## Working with panes (ordinary processes)

- `pane run` submits a command atomically (with Enter); `pane read` reads the
  terminal; `wait_output` polls `read` until a literal/regex match appears or
  the timeout passes. Good for builds, servers, and tests.
- `pane close` never closes the pane running this session's agent.

## Output limits and gotchas

- Reads truncate to the last ~2000 lines / 50KB.
- Full-screen agents may render on the terminal's alternate screen — those
  rows never enter herdr's scrollback. If `read` misses output, ask the
  sibling agent to write its response to a markdown file and read that.

## CLI escape hatch

Anything the tools don't cover (sessions, worktrees, `--remote` attach,
`herdr api`, notifications) — use `herdr <subcommand>` directly via bash:
`herdr workspace list`, `herdr agent read <target> --source recent-unwrapped`,
`herdr pane run <id> <cmd>`, `herdr --remote <host> session attach <name>`.
The CLI prints JSON envelopes; unwrap `.result`.

## Boundary

herdr control is herdr's job. Do not confuse it with omp session management
(`/omp-handoff`, compaction) or with the knowledge base. This skill is about
operating herdr's workspaces, panes, and sibling agents.
