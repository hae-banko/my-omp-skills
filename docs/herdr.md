# Herdr control — absorbed from pi-herdr

**Status:** shipped (v0.13.0). Port of
[pi-herdr](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-herdr)
(MIT, by Can Celik) into this package.

## Why

This session runs inside [herdr](https://herdr.dev) — a terminal workspace
manager for AI coding agents (workspaces → tabs → panes; panes host shells or
coding agents). pi-herdr gives the agent structured control over it. The
user wanted that capability here: "absorb the herdr skill."

## What was absorbed

- **Three registered tools** — `herdr_layout`, `herdr_pane`, `herdr_agent` —
  with the same action surface as pi-herdr, registered through omp's
  `registerTool` (same mechanism as `knowledge_read`), with TUI render cards.
- **`using-herdr` skill** — model-invoked operating discipline: activation
  gate, opt-in policy, target resolution, lifecycle states, workflows, output
  limits, alternate-screen caveat, CLI escape hatch.

## Mechanics (identical to pi-herdr)

pi-herdr shells out to the herdr CLI (`pi.exec("herdr", args)`) and parses the
JSON envelopes the CLI prints (`{"id":…,"result":…}` / `{"error":…}`). Our
port does the same via `node:child_process.execFile`. No socket access — the
herdr CLI is the whole surface.

## Port deltas (herdr 0.7.x vs pi-herdr's 0.7.5+ floor)

pi-herdr targets herdr ≥0.7.5; the installed CLI here is 0.7.4. Composed
where the primitive is absent:

| pi-herdr action | 0.7.x composition here |
|---|---|
| `agent start {kind, pane}` | `agent start <name> [--cwd] [--workspace] [--tab] [--split] [--focus] -- <argv>` (no `--kind`/`--pane`) |
| `agent prompt` (single call) | `agent send` + `agent wait --status blocked --timeout`, then `agent get` for the final state |
| `agent send_keys` | not in 0.7.x CLI — use `send` (literal text) or `pane send-keys` |
| `pane wait_output` | poll `pane read --source recent` until literal/regex match or timeout |

Tool descriptions and the skill note the version floor; upgrading herdr past
0.7.5 would let the tools pass the richer flags through.

## Activation and policy

- Tools register unconditionally; `execute` returns a gate message unless
  `HERDR_ENV=1` and `HERDR_PANE_ID` are set (pi-herdr instead skips
  registration — the runtime gate keeps the tools discoverable and testable).
- Opt-in invocation: the model uses them only when the user mentions herdr or
  asks to inspect/control herdr. Default topology is the caller's tab/cwd;
  focus stays with the user.

## Verification

- Selftest: all three tools registered with description + zod parameters, and
  `execute` outside herdr returns the gate message (the selftest runs outside
  herdr, which also proves the gate works).
- In-session (this session is herdr pane `w3:p1`): `herdr workspace list` and
  `herdr agent list` demonstrated live against the running server.
