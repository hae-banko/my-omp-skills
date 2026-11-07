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
import { asEventContext, sessionIdOf, type ExtensionApi } from "../core/api.ts";
import { findKnowledgeRoot } from "./knowledge.ts";

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

interface SessionGuardState {
  blockCount: number;
  blockDetails: KbBlockDetail[];
  cwd: string | null;
}

const sessionGuardStates = new Map<string, SessionGuardState>();
let currentSessionId = "default";

function getOrCreateState(sessionId?: string): SessionGuardState {
  const id = sessionId ?? currentSessionId;
  let state = sessionGuardStates.get(id);
  if (!state) {
    state = { blockCount: 0, blockDetails: [], cwd: sessionRootCwd };
    sessionGuardStates.set(id, state);
  }
  return state;
}

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
export function recordBlock(
  tool: string,
  path: string,
  reason: KbBlockReason,
  sessionId?: string,
): void {
  const state = getOrCreateState(sessionId);
  state.blockCount += 1;
  state.blockDetails.push({ ts: Date.now(), tool, path, reason });
  if (state.blockDetails.length > DETAILS_CAP) {
    state.blockDetails = state.blockDetails.slice(state.blockDetails.length - DETAILS_CAP);
  }
  refreshStatus();
}

/** Zero the counter and detail list. Called on each `session_start`. */
export function resetSession(sessionId?: string): void {
  const state = getOrCreateState(sessionId);
  state.blockCount = 0;
  state.blockDetails = [];
}

/** Snapshot accessor; reading never creates session state. */
export function getBlockCount(sessionId?: string): number {
  return sessionGuardStates.get(sessionId ?? currentSessionId)?.blockCount ?? 0;
}

/** Snapshot accessor; returns a defensive copy, never creates session state. */
export function getBlockDetails(sessionId?: string): KbBlockDetail[] {
  return sessionGuardStates.get(sessionId ?? currentSessionId)?.blockDetails.slice() ?? [];
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
export function formatStatusText(
  rootCwd: string | null,
  sessionId?: string,
): string | undefined {
  if (rootCwd === null) return undefined;
  const root = findKnowledgeRoot(rootCwd);
  if (!root) return undefined;
  const hasKb = existsSync(join(root, ".omp", "knowledge"));
  const hasAudits = existsSync(join(root, ".omp", "audits"));
  if (!hasKb && !hasAudits) return undefined;
  const count = getOrCreateState(sessionId).blockCount;
  const noun = count === 1 ? "block" : "blocks";
  return `KB append-only · ${count} ${noun}`;
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
  const syncUi = (ctx?: unknown) => {
    const evCtx = asEventContext(ctx);
    if (evCtx.hasUI !== false && typeof evCtx.ui?.setStatus === "function") {
      setStatusFn = evCtx.ui.setStatus.bind(evCtx.ui);
    }
  };

  pi.on("session_start", (event, ctx) => {
    const evCtx = asEventContext(ctx);
    const isSubagent = evCtx.hasUI === false;
    const sessId = sessionIdOf(ctx) ?? (isSubagent ? "subagent" : "default");
    if (!isSubagent) {
      currentSessionId = sessId;
      sessionRootCwd = handlerCwdFromEvent(event);
      syncUi(ctx);
      resetSession(sessId);
      refreshStatus();
    } else {
      resetSession(sessId);
    }
  });

  const handleSessionChange = (event: unknown, ctx?: unknown) => {
    const evCtx = asEventContext(ctx);
    if (evCtx.hasUI === false) return;
    const sessId = sessionIdOf(ctx) ?? "default";
    currentSessionId = sessId;
    if (evCtx.cwd) sessionRootCwd = evCtx.cwd;
    syncUi(ctx);
    if (!sessionGuardStates.has(sessId)) {
      sessionGuardStates.set(sessId, { blockCount: 0, blockDetails: [], cwd: sessionRootCwd });
    }
    refreshStatus();
  };

  pi.on("session_switch", handleSessionChange);
  pi.on("session_branch", handleSessionChange);
  pi.on("session_tree", handleSessionChange);

  pi.on("agent_end", (_event, ctx) => {
    syncUi(ctx);
    refreshStatus();
  });

  // Task subagents are disposed after they finish; their dispose emits
  // session_shutdown on their own binding. Release that session's entry so
  // the process-shared map tracks only live sessions.
  pi.on("session_shutdown", (_event, ctx) => {
    const sessId = sessionIdOf(ctx);
    if (sessId) sessionGuardStates.delete(sessId);
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
