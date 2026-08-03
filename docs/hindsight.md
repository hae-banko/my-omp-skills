# Hindsight — the settle-time reflection pass

**Status:** shipped (v0.9.0). Implemented in `src/hindsight.ts`, toggled by
`/hindsight`. Mechanics verified against the omp runtime source
(`packages/coding-agent/src/session/agent-session.ts`, omp 17.x).

## The idea

From a viral tweet about Fable: give the agent a hard task, let it think, and
right when it is about to answer, abort — then ask it, with its own thinking
traces in front of it: *"while reasoning about this, did you face challenges or
hit walls that would be greatly simplified by design-level changes?"*

The bet: the first answer is often the locally-optimal path the model
committed to early. A nudge at the settle moment, forcing one reflection pass,
catches the cases where a design-level change would have made the whole
approach simpler.

`hindsight` turns this into a session behavior: user-invoked toggle
(`/hindsight on|off`, bare toggles), once-per-turn, only when the turn did
real work.

## Why this is buildable: the `session_stop` seam

The extension API exposes `pi.on("session_stop", ...)` — the main-session stop
hook, "awaited before settle". Runtime semantics (source-verified):

- Fires when the main session's agent loop finishes a turn, inside `agent_end`
  processing (`agent-session.ts:2886`).
- A handler returning `{ continue: true, additionalContext }` queues a
  **hidden** next-turn message — `role: "custom"`,
  `customType: "session-stop-continuation"`, `display: false`,
  `attribution: "agent"` (`agent-session.ts:3268-3276`) — and the agent loop
  runs one more turn with that context.
- **Never fires for subagent/task sessions** (`#agentKind === "sub"` guard,
  `agent-session.ts:3237`) — background research agents are not interrupted.
- **Capped at 8 consecutive continuations** (`SESSION_STOP_CONTINUATION_CAP`,
  `agent-session.ts:344`) — a runaway hook cannot spin the session.
- The event payload includes `{ messages, turn_id, last_assistant_message,
  session_id, session_file, stop_hook_active, signal }`. `stop_hook_active`
  is `true` when the previous turn was already a session-stop continuation —
  the built-in "nudge once" guard. The runtime clears the flag whenever a
  handler returns no `additionalContext` (the chain ends), so the next user
  turn starts clean and the cap is never approached.

**Thinking traces come for free.** The continuation turn's context is the full
transcript, including the model's own thinking blocks. The tweet's
"copy/paste its thinking traces into a new prompt" is automatic: the
reflection turn literally has the thinking in context.

## The one honest limitation: timing

`session_stop` fires *after* the final assistant message has streamed. The
experience is therefore:

```
answer streams → one reflection turn revises/confirms it
```

not a literal abort before any text appears. The Fable *spirit* (the model
reconsiders its approach, with its reasoning in context, before the turn
settles) is delivered; the presentation differs.

A true pre-stream abort would require intercepting `before_provider_request`
and heuristically distinguishing the final-answer provider request from
intermediate thinking/tool-use requests — fragile across providers and not
worth the risk for a package. Not implemented.

## UX

- **`/hindsight`** — user-invoked toggle, session-scoped. `on`, `off`, or bare
  (toggles). Default: off.
- While on, after each turn that did real work, the harness queues the nudge
  once (hidden message) and the model runs a reflection turn.
- The nudge copy (the tweet's question + the lead-with-revision rule):

  > While reasoning about this, did you face challenges or hit walls that
  > would be greatly simplified by design-level changes? Look back at your own
  > thinking and your tool results, and revise your answer if a design-level
  > change would help. If you revise: lead your reply with a one-line
  > "On reflection…" note. If the answer stands: say so in one line and stop.

- The nudge is `display: false` (forced by the runtime); the user sees the
  reflection turn's output. The toggle handler sends a short state message
  and a `hindsight` receipt card.

## Gating rules

Nudge only when the turn did real work and hasn't been nudged yet:

1. `stop_hook_active === false` — never nudge a continuation turn (once per
   turn; the runtime's 8-cap is then never approached).
2. `last_assistant_message` contains `toolCall` content blocks — the turn
   actually used tools.
3. OR the turn's thinking was substantial (≥ 400 characters of thinking
   text) — a pure-reasoning hard problem still gets the nudge.
4. Trivial turns (no tool calls, little thinking) pass through untouched.

## Implementation notes

- `src/hindsight.ts` — module-level `enabled` flag, `installHindsight(pi)`
  wiring `pi.on("session_stop", ...)`; the handler checks the gating rules and
  returns `{ continue: true, additionalContext }` or nothing. The event
  payload arrives as `unknown` through the package's API shim; narrowed with
  guards (`"stop_hook_active" in event`, etc.).
- `src/index.ts` — `CommandSpec.handler` (a `pi`-receiving factory) replaces
  the default body-send handler for toggle commands; `/hindsight` toggles the
  flag, sends the state message, and emits the `hindsight` receipt.
- The event payload is a structural subset of the real one: content block
  types `"toolCall"` and `"thinking"` match the runtime's own checks
  (`agent-session.ts:2645,7273`).
- Selftest (`scripts/selftest.ts`) fires synthetic session_stop events:
  tool turn → `{ continue: true }` + nudge text; `stop_hook_active: true` →
  no continuation; substantial thinking → continuation; trivial turn → none;
  toggle off → none; bare toggle → receipt reports the new state.

## Edge cases

- **Compaction**: the `enabled` flag is module state; it survives compaction.
- **Subagent sessions**: never fire (runtime guard) — deep-research workers
  are unaffected.
- **Cap interaction**: once-per-turn gating means at most one continuation
  per user turn; the 8-cap is a safety net, not a normal path.
- **UI modes**: `session_stop` is a session-level event, independent of
  interactive/RPC/headless rendering — works everywhere the agent loop runs.
- **Interaction with plan/goal/vibe modes**: core modes with their own
  settle-time logic; the session_stop pass runs after theirs. No conflicts
  observed in the runtime ordering; worth a manual check when a mode is on.

## Alternatives considered

- **Prompt-level lite tier** (`before_agent_start`): inject "before
  finalizing, reflect on design-level changes" as a system-prompt line. Zero
  machinery, but the model can skip it inside a single turn — no enforced
  second pass. Could complement the nudge (cheap, always-on phrasing).
- **`before_provider_request` interception**: the true pre-stream abort —
  rejected as fragile (final-answer discrimination problem).
- **`after_provider_response`**: fires after the response, before the stream
  body is consumed; same discrimination problem as above, no advantage.

## Open questions (unresolved, acceptable)

- "Substantial thinking" threshold is a fixed 400 characters; a token-ratio
  heuristic might tune better, but the conservative-low default biases toward
  nudging, which matches the feature's intent.
- Same model for the reflection turn (no model switch from the hook without
  extra machinery).
- Long autonomous turns benefit most; short interactive turns may find the
  extra pass noisy — the toggle makes this a user choice.
