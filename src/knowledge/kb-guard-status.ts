// Knowledge-base guardrail status widget.
//
// `installPolicy` in ./policy.ts enforces the append-only invariant on records/,
// pitfalls/, INDEX.md, and .omp/audits/ — every block is delivered to the model
// as a tool-result reason, but until now the user (and the model's
// self-introspection) had no visible signal of how many edits got blocked this
// session.
//
// This module surfaces that count passively via `ui.setStatus` (the footer
// status-bar API). It registers an entry on `session_start` whenever the
// working tree contains `.omp/knowledge/`, and clears it when no KB is
// present. No events fire into the LLM, no extra tool calls, no model
// coordination: the widget is purely render-side.
//
// The runtime contract on `recordBlock` is shared between this module
// (writer of the count) and `policy.ts` (caller on every block). Both must
// be updated together.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionApi } from "../core/api.ts";

/** Unique key for `ui.setStatus`. The status bar uses key to de-dup. */
export const STATUS_KEY = "kb-guardrail";

/** Class of the guardrail that triggered the block. */
export type KbBlockReason = "knowledge" | "audit";

/** One blocked-tool-call record, retained for future audit-card rendering. */
export interface KbBlockDetail {
  /** Epoch millis the block was recorded. */
  ts: number;
  /** Tool name reported by the tool_call event ("edit" | "write" | "bash" | …). */
  tool: string;
  /** Path or token that triggered the block. "<bash>" for shell commands. */
  path: string;
  /** Which guardrail rejected the call. */
  reason: KbBlockReason;
}

/** Max retained details. Older entries roll off; count is uncapped. */
const DETAILS_CAP = 8;

/** Module-scoped counter and detail ring; reset per session. */
let blockCount = 0;
let blockDetails: KbBlockDetail[] = [];

/** Closure-captured cwd from the most recent session_start. `null` before then. */
let sessionRootCwd: string | null = null;

/** Optional `setStatus` seam exposed by the runtime; undefined when absent. */
let setStatusFn: ((key: string, text: string | undefined) => void) | undefined =
  undefined;

/**
 * Record a single blocked tool call. Increments the counter, pushes a detail
 * row (capped at DETAILS_CAP), and refreshes the status-bar entry.
 *
 * Intended caller: `installPolicy` (one site per `return { block: true }`).
 */
export function recordBlock(tool: string, path: string, reason: KbBlockReason): void {
  blockCount += 1;
  blockDetails.push({ ts: Date.now(), tool, path, reason });
  if (blockDetails.length > DETAILS_CAP) {
    blockDetails = blockDetails.slice(blockDetails.length - DETAILS_CAP);
  }
  refreshStatus();
}

/** Zero the counter and detail list. Called on each `session_start`. */
export function resetSession(): void {
  blockCount = 0;
  blockDetails = [];
}

/** Snapshot accessor for tests; not part of the public runtime surface. */
export function getBlockCount(): number {
  return blockCount;
}

/** Snapshot accessor for tests; returns a defensive copy. */
export function getBlockDetails(): KbBlockDetail[] {
  return blockDetails.slice();
}

/**
 * Build the footer status text for the current session. Returns `undefined`
 * when no KB is present so the status bar omits the entry rather than
 * rendering an empty row.
 *
 * The text is always "KB append-only · N block{s}" (singular form for N=1)
 * whenever a `.omp/knowledge/` directory exists in the working tree, even
 * when no blocks have fired yet — so the user can see the guardrail is
 * active on a quiet session, and the counter becomes the loud state once
 * the model starts hitting it.
 */
export function formatStatusText(rootCwd: string | null): string | undefined {
  if (rootCwd === null) return undefined;
  if (!existsSync(join(rootCwd, ".omp", "knowledge"))) return undefined;
  const noun = blockCount === 1 ? "block" : "blocks";
  return `KB append-only · ${blockCount} ${noun}`;
}

/** Re-render the status bar entry from the current closure state. */
export function refreshStatus(): void {
  if (setStatusFn === undefined) return;
  setStatusFn(STATUS_KEY, formatStatusText(sessionRootCwd));
}

/**
 * Register the kb-guard-status widget against an ExtensionApi.
 *
 * Subscribes to `session_start` (cache cwd, reset counter, render) and
 * `agent_end` (re-render so any late `recordBlock` lands on the bar).
 */
export function installKbGuardStatus(pi: ExtensionApi): void {
  pi.on("session_start", (event) => {
    const cwd = handlerCwdFromEvent(event);
    sessionRootCwd = cwd;
    resetSession();
    refreshStatus();
  });
  pi.on("agent_end", () => {
    refreshStatus();
  });
}

/**
 * Test seam: replace the `setStatus` slot. The selftest mocks the runtime's
 * status-bar surface; production passes the real hook from the omp runtime.
 * No-op when called with `undefined`.
 */
export function __setStatusFnForTests(fn: ((key: string, text: string | undefined) => void) | undefined): void {
  setStatusFn = fn;
  refreshStatus();
}

/** Resolve cwd from a session_start event payload; falls back to process.cwd(). */
function handlerCwdFromEvent(event: unknown): string {
  if (!event || typeof event !== "object") return process.cwd();
  const cwd = (event as { cwd?: unknown }).cwd;
  return typeof cwd === "string" ? cwd : process.cwd();
}
