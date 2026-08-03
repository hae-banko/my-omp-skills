// Hindsight — the settle-time reflection pass.
//
// User-invoked toggle (/hindsight). While on, after each main-session turn
// that did real work (used tools, or reasoned substantially), the session_stop
// hook queues ONE hidden continuation message — the nudge — and the agent
// runs one more turn with its own thinking traces in context, instructed to
// revise the answer if a design-level change would make the approach simpler.
// The Fable trick, without a fragile pre-stream abort.
//
// Runtime contract (verified against packages/coding-agent/src/session/
// agent-session.ts, omp 17.x):
// - session_stop fires after the final assistant message of a main-session
//   turn; subagent/task sessions never fire it.
// - A handler returning { continue: true, additionalContext } queues a hidden
//   next-turn message (role "custom", customType "session-stop-continuation",
//   display false) and the agent loop runs one more turn.
// - The payload carries stop_hook_active, true when the previous turn was
//   already a session-stop continuation — our once-per-turn guard. The
//   runtime clears the flag when a handler returns no additionalContext, so
//   the next user turn starts clean and the 8-continuation cap is never
//   approached.
// - Thinking traces come for free: the continuation turn's context is the
//   full transcript, including the model's own thinking blocks.

import type { ExtensionApi } from "./api.ts";

/** A "substantial" pure-reasoning turn, in characters of thinking text. */
const THINKING_MIN_CHARS = 400;

const NUDGE = `<my-omp-skills:hindsight>

One more look before this turn settles — Hindsight.

While reasoning about this, did you face challenges or hit walls that would be greatly simplified by design-level changes? Look back at your own thinking and your tool results, and revise your answer if a design-level change would help.

If you revise: lead your reply with a one-line "On reflection…" note so this second pass is self-explanatory. If the answer stands: say so in one line and stop.`;

export const HINDSIGHT_ON_MESSAGE =
  "Hindsight enabled. After each turn that does real work, one hidden reflection pass runs before the turn settles: the model looks back at its own thinking and tool results and revises the answer if a design-level change would simplify the approach. Run /hindsight off to disable.";

export const HINDSIGHT_OFF_MESSAGE =
  "Hindsight disabled — turns settle after the first pass.";

let enabled = false;

export function isHindsightEnabled(): boolean {
  return enabled;
}

export function setHindsightEnabled(next: boolean): void {
  enabled = next;
}

/** Narrowed view of the session_stop event payload. */
interface SessionStopEvent {
  stop_hook_active?: unknown;
  last_assistant_message?: unknown;
}

export function installHindsight(pi: ExtensionApi): void {
  pi.on("session_stop", (event) => {
    if (!enabled) return;
    const stopEvent = event as SessionStopEvent;
    if (stopEvent.stop_hook_active === true) return; // already a continuation turn
    if (!didRealWork(stopEvent.last_assistant_message)) return; // trivial turn
    return { continue: true, additionalContext: NUDGE };
  });
}

/**
 * Gate: did the turn actually do work? True when the last assistant message
 * contains a tool call, or when its thinking is substantial. Plain
 * text-only replies (acknowledgments, "done") pass through untouched.
 */
function didRealWork(last: unknown): boolean {
  if (!last || typeof last !== "object" || !("content" in last)) return false;
  const content: unknown = (last as { content: unknown }).content;
  if (typeof content === "string") return false;
  if (!Array.isArray(content)) return false;

  let thinkingChars = 0;
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) continue;
    const type = (block as { type: unknown }).type;
    if (type === "toolCall") return true;
    if (
      type === "thinking" &&
      "text" in block &&
      typeof (block as { text: unknown }).text === "string"
    ) {
      thinkingChars += ((block as { text: string }).text).length;
    }
  }
  return thinkingChars >= THINKING_MIN_CHARS;
}
