# Reflect Mode — design proposal (draft, not shipped)

**Status:** proposal. No code ships with this doc; a future version may
implement it. The mechanics below are verified against the omp runtime source
(`packages/coding-agent/src/session/agent-session.ts`, omp 17.x) and the
extension docs (`omp://extensions.md`).

## The idea

From a viral tweet about Fable: give the agent a hard task, let it think, and
right when it is about to answer, abort — then ask it, with its own thinking
traces in front of it: *"while reasoning about this, did you face challenges or
hit walls that would be greatly simplified by design-level changes?"*

The bet: the first answer is often the locally-optimal path the model
committed to early. A nudge at the settle moment, forcing one reflection pass,
catches the cases where a design-level change would have made the whole
approach simpler.

`reflect mode` turns this into a session behavior: user-invoked, once-per-turn,
only when the turn did real work.

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
  the built-in "nudge once" guard. State resets on the next user input.

**Thinking traces come for free.** The continuation turn's context is the full
transcript, including the model's own thinking blocks (they are part of the
assistant messages). The tweet's "copy/paste its thinking traces into a new
prompt" is automatic: the reflection turn literally has the thinking in
context.

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
worth the risk for a package. Not proposed.

## Proposed UX

- **`/reflect`** — user-invoked toggle, session-scoped (like a mini-mode).
  Run again (or `/reflect off`) to disable. Default: off.
- While on, after each turn that did real work, the harness queues the nudge
  once (hidden message) and the model runs a reflection turn.
- The nudge copy (user's phrasing + the tweet's question):

  > Something feels off. Before you finalize — while reasoning about this, did
  > you face challenges or hit walls that would be greatly simplified by
  > design-level changes? Look back at your thinking and your tool results,
  > and revise your answer if a design-level change would help.

- The nudge is `display: false`; the user sees the reflection turn's output.
  The reflection turn is instructed to lead with a one-line "On reflection…"
  note so the second pass is self-explanatory.

## Gating rules

Nudge only when the turn did real work and hasn't been nudged yet:

1. `stop_hook_active === false` — never nudge a continuation turn (once per
   turn; the runtime's 8-cap is then never approached).
2. `last_assistant_message` contains `toolCall` content blocks — the turn
   actually used tools.
3. OR the turn's thinking was substantial (a threshold on thinking token
   count, defaulting conservatively low) — a pure-reasoning hard problem
   still gets the nudge.
4. Trivial turns (no tool calls, little thinking) pass through untouched.

## Implementation sketch (future version)

- `src/reflect.ts` — module-level `enabled` flag + `installReflectMode(pi)`
  wiring `pi.on("session_stop", ...)`; the handler checks the gating rules
  and returns `{ continue: true, additionalContext }` or nothing.
- `src/index.ts` — `registerCommand("reflect", ...)` with a markdown body
  explaining the loop; the handler toggles the flag and notifies via
  `ctx.ui.notify`.
- The event payload arrives typed as `unknown` through the package's minimal
  API shim; narrow with guards (`"stop_hook_active" in event`, etc.).
- Selftest: mock `pi.on("session_stop")` and fire synthetic events —
  (a) turn with tool calls → expect `{ continue: true }` + nudge text;
  (b) same with `stop_hook_active: true` → no continuation; (c) trivial turn →
  no continuation; (d) toggle off → no continuation.
- Ship as v0.7.0 with the standard loop (typecheck, selftest, bump, tag,
  reinstall, re-enter omp).

## Edge cases

- **Compaction**: the `enabled` flag is module state; it survives compaction.
- **Subagent sessions**: never fire (runtime guard) — deep-research workers
  are unaffected.
- **Cap interaction**: once-per-turn gating means at most one continuation
  per user turn; the 8-cap is a safety net, not a normal path.
- **UI modes**: `session_stop` is a session-level event, independent of
  interactive/RPC/headless rendering — works everywhere the agent loop runs.
- **Interaction with plan/goal/vibe modes**: those are core modes with their
  own settle-time logic (`#enforcePlanModeDecisionAtSettle` runs before the
  session_stop pass); coexistence needs a quick manual check in a future
  implementation.

## Alternatives considered

- **Prompt-level lite tier** (`before_agent_start`): inject "before
  finalizing, reflect on design-level changes" as a system-prompt line. Zero
  machinery, but the model can skip it inside a single turn — no enforced
  second pass. Could complement the nudge (cheap, always-on phrasing).
- **`before_provider_request` interception**: the true pre-stream abort —
  rejected as fragile (final-answer discrimination problem).
- **`after_provider_response`**: fires after the response, before the stream
  body is consumed; same discrimination problem as above, no advantage.

## Open questions

- Nudge copy: exact wording, and whether to show it (`display: true` + a
  renderer card) instead of hiding it.
- "Substantial thinking" threshold — tokens? ratio of thinking to answer?
- Should the reflection turn use the same model, or a cheaper/stronger role?
- Does the nudge help or annoy on short interactive turns (vs. long
  autonomous tasks)? A per-turn enable (`/reflect on: <prompt>`) might be
  better than a session-wide toggle.
