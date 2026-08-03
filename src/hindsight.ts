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
//
// Configuration: ~/.omp/hindsight.json (user-level). Fields: name (what the
// pass is called), nudge (the reflection question), leadIn (the one-line
// prefix a revision leads with). Missing or invalid fields fall back to
// defaults; the file is re-read on every /hindsight invocation. The toggle
// itself is silent — no user message, so the model never replies; a receipt
// card and a UI notification are the only feedback.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";

/** A "substantial" pure-reasoning turn, in characters of thinking text. */
const THINKING_MIN_CHARS = 400;

export interface HindsightConfig {
  name: string;
  nudge: string;
  leadIn: string;
}

export const HINDSIGHT_CONFIG_PATH = join(homedir(), ".omp", "hindsight.json");

/** Config file location — overridable via HINDSIGHT_CONFIG (e.g. for testing). */
export function hindsightConfigPath(): string {
  return process.env.HINDSIGHT_CONFIG ?? HINDSIGHT_CONFIG_PATH;
}

const DEFAULT_CONFIG: HindsightConfig = {
  name: "Hindsight",
  nudge:
    "While reasoning about this, did you face challenges or hit walls that would be greatly simplified by design-level changes? Look back at your own thinking and your tool results, and revise your answer if a design-level change would help.",
  leadIn: "On reflection…",
};

let config: HindsightConfig = DEFAULT_CONFIG;
let enabled = false;

/**
 * Re-read the config file (default: ~/.omp/hindsight.json). A missing file,
 * invalid JSON, or invalid fields all fall back to the defaults — a broken
 * config must never take the nudge down.
 */
export function reloadHindsightConfig(path: string = hindsightConfigPath()): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    config = DEFAULT_CONFIG;
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    config = DEFAULT_CONFIG;
    return;
  }
  const partial = (parsed ?? {}) as Record<string, unknown>;
  const pick = (key: keyof HindsightConfig): string =>
    typeof partial[key] === "string" && (partial[key] as string).length > 0
      ? (partial[key] as string)
      : DEFAULT_CONFIG[key];
  config = {
    name: pick("name"),
    nudge: pick("nudge"),
    leadIn: pick("leadIn"),
  };
}

export function isHindsightEnabled(): boolean {
  return enabled;
}

export function setHindsightEnabled(next: boolean): void {
  enabled = next;
}

function buildNudge(): string {
  return `<my-omp-skills:hindsight>

One more look before this turn settles — ${config.name}.

${config.nudge}

If you revise: lead your reply with a one-line "${config.leadIn}" note so this second pass is self-explanatory. If the answer stands: say so in one line and stop.`;
}

/** Narrowed view of the session_stop event payload. */
interface SessionStopEvent {
  stop_hook_active?: unknown;
  last_assistant_message?: unknown;
}

export function installHindsight(pi: ExtensionApi): void {
  reloadHindsightConfig();
  pi.on("session_stop", (event) => {
    if (!enabled) return;
    const stopEvent = event as SessionStopEvent;
    if (stopEvent.stop_hook_active === true) return; // already a continuation turn
    if (!didRealWork(stopEvent.last_assistant_message)) return; // trivial turn
    return { continue: true, additionalContext: buildNudge() };
  });
  pi.registerMessageRenderer("hindsight", (message, _options, _theme) => {
    const content =
      message && typeof message === "object" && "content" in message
        ? String(message.content ?? "")
        : "";
    const on = content.trim().endsWith(" on");
    const box = new Container();
    box.addChild(new Text(`HINDSIGHT — ${on ? "ON" : "OFF"}`));
    box.addChild(
      new Text(
        on
          ? "  reflection pass runs after real-work turns"
          : "  turns settle after the first pass",
        0,
        1,
      ),
    );
    return box;
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
