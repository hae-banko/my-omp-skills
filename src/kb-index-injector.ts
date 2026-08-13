// Compact KB index injection into the system prompt.
//
// `knowledge_read` lets the model query the repo-local KB on demand — but each
// query costs a tool call + result round-trip. Before every agent loop the
// harness fires `before_agent_start`, which carries the assembled system
// prompt and lets extensions append to it. This module injects a small
// "Active knowledge base" section listing the most recent records and
// pitfalls the session has touched, so the model can scan them without
// burning a tool call.
//
// Two correctness constraints drive the shape:
//
// 1. **Zero work when empty** — if the repository has no records or pitfalls,
//    no section is added.
//
// 2. **Dedup-safe** — the same session can fire `before_agent_start`
//    multiple times (user prompt, compaction, etc.). The section MUST NOT
//    be appended twice; a substring check on the section marker guards
//    this. The substring (not equality) is deliberate: prior injections
//    may have wrapped the section, and the model may have echoed nearby
//    text back into the prompt.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionApi } from "./api.ts";
import { findKnowledgeRoot } from "./knowledge.ts";
import { getPitfallCount, getRecordCount } from "./kb-ingest-status.ts";

/**
 * Section header used both to build the injected block AND as the dedup
 * sentinel. Kept as a single constant so the two can never drift.
 */
export const SECTION_MARKER = "## Active knowledge base";

/** Cap the per-kind listing to keep the system prompt small. */
const MAX_ENTRIES_PER_KIND = 5;

/**
 * Build the "Active knowledge base" section for `cwd`. Returns "" when no
 * KB directory exists at `.omp/knowledge/{records,pitfalls}` or both lists
 * are empty — callers MUST treat an empty string as "do nothing".
 *
 * Entries are sorted by mtime (most recent first) and capped at
 * `MAX_ENTRIES_PER_KIND` per kind. The format intentionally mirrors the
 * existing KB layout so `knowledge_read type=records slug=<name>` resolves
 * straight from the listed filenames.
 */
export function formatIndexSection(cwd: string): string {
  const records = recentEntries(cwd, "records");
  const pitfalls = recentEntries(cwd, "pitfalls");
  if (records.length === 0 && pitfalls.length === 0) return "";

  const recordCount = getRecordCount();
  const pitfallCount = getPitfallCount();
  const lines: string[] = [];
  lines.push(SECTION_MARKER);
  lines.push("");
  if (recordCount > 0 || pitfallCount > 0) {
    lines.push(
      `You have ingested ${recordCount} records and ${pitfallCount} pitfalls this session. Recent entries:`,
    );
  } else {
    lines.push("Repository knowledge base entries:");
  }

  if (records.length > 0) {
    lines.push("");
    lines.push("**Records:**");
    for (const entry of records) {
      lines.push(`- records/${entry.name} (${entry.date})`);
    }
  }

  if (pitfalls.length > 0) {
    lines.push("");
    lines.push("**Pitfalls:**");
    for (const entry of pitfalls) {
      lines.push(`- pitfalls/${entry.name} (${entry.date})`);
    }
  }

  lines.push("");
  lines.push(
    "(Use the `knowledge_read` tool with `type=records|pitfalls` and `slug={filename-without-md}` to read any entry.)",
  );

  return lines.join("\n");
}

/**
 * Returns true if `systemPrompt` already contains the section header.
 * Substring (not equality) so that wrapped, echoed, or augmented copies of
 * the marker do not slip past the dedup guard.
 */
export function systemPromptHasSection(systemPrompt: string): boolean {
  return systemPrompt.includes(SECTION_MARKER);
}

/**
 * Subscribe to `before_agent_start` and append the compact KB index when
 * (a) records/pitfalls exist in the repository or session, and (b) the
 * system prompt does not already contain the section header.
 */
export function installKbIndexInjector(pi: ExtensionApi): void {
  pi.on("before_agent_start", (event: unknown, ctx?: unknown) => {
    if (!event || typeof event !== "object") return;
    const evt = event as { systemPrompt?: unknown; cwd?: unknown };
    if (!("systemPrompt" in evt)) return;
    if (typeof evt.systemPrompt !== "string") return;
    if (systemPromptHasSection(evt.systemPrompt)) return;
    const cwd =
      readStringField(ctx, "cwd") ?? readStringField(event, "cwd") ?? process.cwd();
    const section = formatIndexSection(cwd);
    if (section === "") return;
    evt.systemPrompt = evt.systemPrompt + "\n\n" + section;
  });
}

/** Narrow `obj[key]` to a string when present; null otherwise. */
function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object" || !(key in obj)) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

interface RecentEntry {
  name: string;
  date: string;
}

/**
 * List `kind` (`records` | `pitfalls`) under `.omp/knowledge/<kind>`, return
 * the most-recently-modified `.md` files (capped). Returns [] when the
 * directory is absent or contains no `.md` files.
 */
function recentEntries(cwd: string, kind: "records" | "pitfalls"): RecentEntry[] {
  const root = findKnowledgeRoot(cwd) ?? cwd;
  const dir = join(root, ".omp", "knowledge", kind);
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const mdFiles = names.filter((n) => n.endsWith(".md"));
  if (mdFiles.length === 0) return [];
  const withStat = mdFiles.map((name) => {
    try {
      const st = statSync(join(dir, name));
      return { name, mtimeMs: st.mtimeMs };
    } catch {
      return { name, mtimeMs: 0 };
    }
  });
  withStat.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStat.slice(0, MAX_ENTRIES_PER_KIND).map((entry) => ({
    name: entry.name,
    date: formatDate(entry.mtimeMs),
  }));
}

/** Format mtime millis as `yyyy-mm-dd`. UTC for stable cross-machine output. */
function formatDate(mtimeMs: number): string {
  if (mtimeMs <= 0) return "unknown";
  const d = new Date(mtimeMs);
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
