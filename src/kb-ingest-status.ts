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
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { ExtensionApi } from "./api.ts";

/** Unique key for `ui.setStatus`. Distinct from `kb-guardrail` so both widgets coexist. */
export const STATUS_KEY = "kb-ingest";

/** Kind of file ingested. */
export type IngestKind = "record" | "pitfall";

/** Module-scoped counters; reset per session. */
let recordCount = 0;
let pitfallCount = 0;

/** Closure-captured cwd from the most recent session_start. `null` before then. */
let sessionRootCwd: string | null = null;

/** Optional `setStatus` seam exposed by the runtime; undefined when absent. */
let setStatusFn: ((key: string, text: string | undefined) => void) | undefined =
  undefined;

/**
 * Record a single ingest event. Increments the matching counter and refreshes
 * the status-bar entry. Intended caller: `installKbIngestStatus` (one site,
 * the `tool_call` subscriber).
 */
export function recordIngest(kind: IngestKind): void {
  if (kind === "record") {
    recordCount += 1;
  } else {
    pitfallCount += 1;
  }
  refreshStatus();
}

/** Zero both counters. Called on each `session_start`. */
export function resetSession(): void {
  recordCount = 0;
  pitfallCount = 0;
}

/** Snapshot accessor for tests; not part of the public runtime surface. */
export function getRecordCount(): number {
  return recordCount;
}

/** Snapshot accessor for tests; not part of the public runtime surface. */
export function getPitfallCount(): number {
  return pitfallCount;
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
export function formatStatusText(rootCwd: string | null): string | undefined {
  if (rootCwd === null) return undefined;
  if (!existsSync(resolve(rootCwd, ".omp", "knowledge"))) return undefined;
  const rNoun = recordCount === 1 ? "record" : "records";
  const pNoun = pitfallCount === 1 ? "pitfall" : "pitfalls";
  return `KB: ${recordCount} ${rNoun} · ${pitfallCount} ${pNoun}`;
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
  pi.on("session_start", (event) => {
    const cwd = readCwdFromEvent(event);
    sessionRootCwd = cwd;
    resetSession();
    refreshStatus();
  });
  pi.on("agent_end", () => {
    refreshStatus();
  });
  pi.on("tool_call", (event) => {
    if (!event || typeof event !== "object") return;
    if (!("toolName" in event) || !("input" in event)) return;
    const toolName = event.toolName;
    if (toolName !== "write") return;
    const input = event.input;
    if (!input || typeof input !== "object") return;
    if (!("path" in input)) return;
    const inputPath = input.path;
    if (typeof inputPath !== "string") return;
    const cwd = sessionRootCwd ?? process.cwd();
    const kind = classifyIngestPath(cwd, inputPath);
    if (kind === null) return;
    // Resolve the absolute path the write would create, then check
    // existsSync BEFORE the write has run (tool_call fires pre-exec). An
    // existing target means revision, not ingest — do not increment.
    const target = resolve(cwd, inputPath);
    if (existsSync(target)) return;
    recordIngest(kind);
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