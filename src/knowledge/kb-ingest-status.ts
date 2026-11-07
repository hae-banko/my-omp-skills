// Knowledge-base ingest status widget.
//
// v0.38.0 added a status-bar widget for the *denied* side of the KB append-only
// invariant (block count from `policy.ts`). This module is the complementary
// widget for the *accepted* side: every successful ingest of a NEW file under
// `.omp/knowledge/records/` or `.omp/knowledge/pitfalls/` bumps a counter
// rendered in the footer status bar.
//
// The classifier mirrors the shape of `knowledgeSubpath` in `./policy.ts` but
// is duplicated here on purpose — keeping the widget independent from the
// policy means the policy can refactor without touching the widget, and vice
// versa. They agree on the path geometry by convention, not by shared code.
//
// Unlike `kb-guard-status`, this widget does NOT call into policy.ts; instead
// it listens to `tool_call` events and inspects `input.path` itself. The
// "is this a NEW file" check uses `existsSync` BEFORE the write would land
// (tool_call fires pre-exec), so existing-file edits and `edit` calls do not
// increment — they are revisions, not ingest.

import { existsSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { asEventContext, sessionIdOf, type ExtensionApi } from "../core/api.ts";
import { findKnowledgeRoot } from "./knowledge.ts";

/** Unique key for `ui.setStatus`. Distinct from `kb-guardrail` so both widgets coexist. */
export const STATUS_KEY = "kb-ingest";

/** Kind of file ingested. */
export type IngestKind = "record" | "pitfall";

interface SessionIngestState {
  recordCount: number;
  pitfallCount: number;
  cwd: string | null;
  ingestedPaths: Set<string>;
}

const sessionIngestStates = new Map<string, SessionIngestState>();
let currentSessionId = "default";

function getOrCreateState(sessionId?: string): SessionIngestState {
  const id = sessionId ?? currentSessionId;
  let state = sessionIngestStates.get(id);
  if (!state) {
    state = {
      recordCount: 0,
      pitfallCount: 0,
      cwd: sessionRootCwd,
      ingestedPaths: new Set<string>(),
    };
    sessionIngestStates.set(id, state);
  }
  return state;
}

/** Closure-captured cwd from the most recent session_start. `null` before then. */
let sessionRootCwd: string | null = null;

/** Optional `setStatus` seam exposed by the runtime; undefined when absent. */
let setStatusFn: ((key: string, text: string | undefined) => void) | undefined =
  undefined;

/**
 * Record a single ingest event. Increments the matching counter and refreshes
 * the status-bar entry. Intended caller: `installKbIngestStatus` (the `tool_result` subscriber).
 */
export function recordIngest(
  kind: IngestKind,
  targetPath?: string,
  sessionId?: string,
): void {
  const state = getOrCreateState(sessionId);
  if (targetPath) {
    if (state.ingestedPaths.has(targetPath)) return;
    state.ingestedPaths.add(targetPath);
  }
  if (kind === "record") {
    state.recordCount += 1;
  } else {
    state.pitfallCount += 1;
  }
  refreshStatus();
}

/** Zero both counters. Called on each `session_start`. */
export function resetSession(sessionId?: string): void {
  const state = getOrCreateState(sessionId);
  state.recordCount = 0;
  state.pitfallCount = 0;
  state.ingestedPaths.clear();
}

/** Records ingested by `sessionId` (default: current main session); read-only. */
export function getRecordCount(sessionId?: string): number {
  return sessionIngestStates.get(sessionId ?? currentSessionId)?.recordCount ?? 0;
}

/** Pitfalls ingested by `sessionId` (default: current main session); read-only. */
export function getPitfallCount(sessionId?: string): number {
  return sessionIngestStates.get(sessionId ?? currentSessionId)?.pitfallCount ?? 0;
}

/**
 * Build the footer status text for the current session. Returns `undefined`
 * when no KB is present so the status bar omits the entry rather than
 * rendering an empty row.
 *
 * The text is always `"KB: {N} record{s} · {M} pitfall{s}"` (singular forms
 * for N=1 / M=1) whenever a `.omp/knowledge/` directory exists in the
 * working tree, even when no ingests have fired yet — so the user can see
 * the widget is active on a quiet session, and the counters become the loud
 * state once the model starts appending.
 */
export function formatStatusText(
  rootCwd: string | null,
  sessionId?: string,
): string | undefined {
  if (rootCwd === null) return undefined;
  const root = findKnowledgeRoot(rootCwd);
  if (!root) return undefined;
  if (!existsSync(join(root, ".omp", "knowledge"))) return undefined;
  const state = getOrCreateState(sessionId);
  const rNoun = state.recordCount === 1 ? "record" : "records";
  const pNoun = state.pitfallCount === 1 ? "pitfall" : "pitfalls";
  return `KB: ${state.recordCount} ${rNoun} · ${state.pitfallCount} ${pNoun}`;
}

/** Re-render the status bar entry from the current closure state. */
export function refreshStatus(): void {
  if (setStatusFn === undefined) return;
  setStatusFn(STATUS_KEY, formatStatusText(sessionRootCwd));
}

/**
 * Classify a tool-call path as a record or pitfall ingest. Returns the kind
 * when the absolute path lives under `.omp/knowledge/records/` or
 * `.omp/knowledge/pitfalls/`; returns null otherwise (including for paths
 * under `.omp/audits/`, INDEX.md, audits subtrees, etc.).
 *
 * Mirrors the shape of `knowledgeSubpath` from `policy.ts` (same resolver,
 * same split, same `.omp/knowledge/` anchor) but inline here so the widget
 * is decoupled from policy's internal vocabulary.
 */
export function classifyIngestPath(
  cwd: string,
  rawPath: unknown,
): IngestKind | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const abs = isAbsolute(rawPath)
    ? normalize(rawPath)
    : normalize(resolve(cwd, rawPath));
  const parts = abs.split(sep);
  for (let i = 0; i + 2 < parts.length; i++) {
    if (parts[i] !== ".omp" || parts[i + 1] !== "knowledge") continue;
    const sub = parts[i + 2];
    if (sub === "records") return "record";
    if (sub === "pitfalls") return "pitfall";
  }
  return null;
}

/**
 * Register the kb-ingest-status widget against an ExtensionApi.
 *
 * Subscribes to:
 *  - `session_start` — cache cwd, reset counters, render.
 *  - `agent_end` — re-render so any late `recordIngest` lands on the bar.
 *  - `tool_call` — inspect write events whose target is a NEW file under
 *    `.omp/knowledge/records/` or `.omp/knowledge/pitfalls/`. Edits and
 *    overwrites of existing files do NOT increment; those are revisions.
 */
export function installKbIngestStatus(pi: ExtensionApi): void {
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
      sessionRootCwd = readCwdFromEvent(event);
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
    if (!sessionIngestStates.has(sessId)) {
      sessionIngestStates.set(sessId, {
        recordCount: 0,
        pitfallCount: 0,
        cwd: sessionRootCwd,
        ingestedPaths: new Set<string>(),
      });
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
    if (sessId) sessionIngestStates.delete(sessId);
  });

  pi.on("tool_result", (event, ctx) => {
    if (!event || typeof event !== "object") return;
    const e = event as { toolName?: unknown; input?: unknown; isError?: unknown };
    if (e.toolName !== "write" || e.isError) return;
    const input = e.input;
    if (!input || typeof input !== "object" || !("path" in input)) return;
    const inputPath = input.path;
    if (typeof inputPath !== "string") return;
    const cwd = asEventContext(ctx).cwd ?? sessionRootCwd ?? process.cwd();
    const kind = classifyIngestPath(cwd, inputPath);
    if (kind === null) return;
    const target = resolve(cwd, inputPath);
    if (!existsSync(target)) return;
    const sessId = sessionIdOf(ctx);
    recordIngest(kind, target, sessId);
  });
}

/**
 * Test seam: replace the `setStatus` slot. The selftest mocks the runtime's
 * status-bar surface; production passes the real hook from the omp runtime.
 * No-op when called with `undefined`.
 */
export function __setStatusFnForTests(
  fn: ((key: string, text: string | undefined) => void) | undefined,
): void {
  setStatusFn = fn;
  refreshStatus();
}

/** Resolve cwd from a session_start event payload; falls back to process.cwd(). */
function readCwdFromEvent(event: unknown): string {
  if (!event || typeof event !== "object") return process.cwd();
  if (!("cwd" in event)) return process.cwd();
  const cwd = (event as { cwd: unknown }).cwd;
  return typeof cwd === "string" ? cwd : process.cwd();
}