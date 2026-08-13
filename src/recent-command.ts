// /record --recent and /pitfall --recent — LOCAL, deterministic listers.
//
// Mirrors the /reference pattern (src/references.ts): the command runs in TS
// only — no command body injected, no user prompt queued, no model turn. The
// listing is a passive read of `.omp/knowledge/records/` or
// `.omp/knowledge/pitfalls/`, formatted as a transcript card via the existing
// `knowledge-record` / `knowledge-pitfall` message renderers
// (src/knowledge-tool.ts). Zero LLM overhead per invocation.

import type { CommandContext, ExtensionApi } from "./api.ts";
import { findKnowledgeRoot, readKnowledge } from "./knowledge.ts";
import { toolResultCard } from "./research-format.ts";

/** Default number of entries shown when `--recent` is passed without a count. */
export const DEFAULT_LIMIT = 10;

/** Hard cap so a stray `--recent 99999` can't dump the whole KB into a card. */
export const MAX_LIMIT = 50;

/** `knowledge-record` / `knowledge-pitfall` — the message renderers are global. */
const RECORD_CUSTOM_TYPE = "knowledge-record";
const PITFALL_CUSTOM_TYPE = "knowledge-pitfall";

/**
 * Does the raw argument string look like a `--recent [N]` invocation?
 * Accepts `--recent`, `--recent 5`, with surrounding whitespace. Anything
 * else (a free-text finding, a typo, a different flag) is a no — the caller
 * falls through to the default LLM workflow body.
 */
export function isRecentArgs(args: string): boolean {
  const trimmed = args.trim();
  if (trimmed.length === 0) return false;
  return /^(?:--recent(?:\s+\d+)?)?\s*$/.test(trimmed) && trimmed.startsWith("--recent");
}

/**
 * Parse the count from `--recent [N]`. Returns DEFAULT_LIMIT when no number
 * was given, and clamps to MAX_LIMIT for any larger input.
 */
export function parseRecentCount(args: string): number {
  const match = args.trim().match(/^--recent\s+(\d+)$/);
  if (!match) return DEFAULT_LIMIT;
  const n = parseInt(match[1], 10);
  return Math.min(n, MAX_LIMIT);
}

/** The two kinds of recent-listing this module handles. */
export type RecentCommandKind = "record" | "pitfall";

export interface RunRecentCommandArgs {
  kind: RecentCommandKind;
  rawArgs: string;
  root: string;
  pi: ExtensionApi;
  ctx: CommandContext;
}

/**
 * Entry point for the local handler. Returns `{ handled: false }` when the
 * invoked args are NOT a `--recent` invocation, so the caller can fall through
 * to the default body-send flow. Never throws — every failure path becomes
 * an error toast + an error card.
 */
export async function runRecentCommand(args: RunRecentCommandArgs): Promise<{ handled: boolean }> {
  const { kind, rawArgs, root, pi, ctx } = args;
  if (!isRecentArgs(rawArgs)) return { handled: false };

  const customType = kind === "record" ? RECORD_CUSTOM_TYPE : PITFALL_CUSTOM_TYPE;
  const kindLabel = kind === "record" ? "RECORD" : "PITFALL";
  const kindNoun = kind === "record" ? "record" : "pitfall";

  const kbRoot = findKnowledgeRoot(root);
  if (!kbRoot) {
    const message = `No .omp/knowledge/ found from this working directory — run /record once (or /omp-setup) to create it.`;
    ctx.ui?.notify?.(message, "warn");
    const card = toolResultCard(["no knowledge base here"], `${kindLabel} — not found`);
    pi.sendMessage({
      customType,
      content: stringifyCard(card),
      display: true,
      attribution: "user",
    });
    return { handled: true };
  }

  const limit = parseRecentCount(rawArgs);
  const result = readKnowledge(kbRoot, { type: kind === "record" ? "records" : "pitfalls", limit });
  const lines = result.text.split("\n").slice(0, MAX_LIMIT);
  const label = `${kindLabel} — ${kind.toUpperCase()}S (${result.details.count})`;
  const card = toolResultCard(lines, label);
  pi.sendMessage({
    customType,
    content: stringifyCard(card),
    display: true,
    attribution: "user",
  });
  ctx.ui?.notify?.(
    `${result.details.count} recent ${kindNoun}${result.details.count === 1 ? "" : "s"}`,
    "info",
  );
  return { handled: true };
}

/**
 * Flatten a Container from toolResultCard into a single string for the
 * transcript message body. The same renderer in src/knowledge-tool.ts
 * receives the string back and rebuilds the card visually — see
 * `registerMessageCard` there for the message-payload -> card round-trip.
 *
 * The Container's children are accessed via the documented `@oh-my-pi/pi-tui`
 * shape (`{ text: string }` per child); we narrow with `in` + `typeof` to
 * stay honest about what we trust here.
 */
function stringifyCard(card: unknown): string {
  if (!card || typeof card !== "object" || !("children" in card)) return "";
  const children = (card as { children: unknown }).children;
  if (!Array.isArray(children)) return "";
  const lines: string[] = [];
  for (const child of children) {
    if (child && typeof child === "object" && "text" in child) {
      const text = (child as { text: unknown }).text;
      if (typeof text === "string") lines.push(text);
    }
  }
  return lines.join("\n");
}
