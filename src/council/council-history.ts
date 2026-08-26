// /council recent [N] — Local zero-token decision-history lister.
//
// Mirrors the /record --recent pattern (src/features/recent-command.ts): the
// listing runs entirely in TypeScript with zero LLM turn overhead. Reads
// `.omp/scratch/debates/*.md`, parses the YAML frontmatter for each debate,
// and renders a tight 76-column ANSI history card via the existing
// `council-verdict` custom message renderer so the output is consistent with
// the rest of the council feature.
//
// The YAML parser is intentionally minimal — debate records are emitted by
// `saveCouncilRecord()` in src/council/council.ts, so the field set is known
// and stable. Any unrecognised field is preserved verbatim so the renderer can
// surface it later without an upgrade dance.
//
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BORDER_COLORS,
  bold,
  boxLine,
  dim,
  displayWidth,
  makeBottomBorder,
  makeDivider,
  makeTopBorder,
  truncateToWidth,
} from "../research/research-format.ts";
import type { CommandContext, ExtensionApi } from "../core/api.ts";
import { getWorkspaceContext } from "../core/workspace.ts";
import { COUNCIL_CUSTOM_TYPE } from "./council.ts";

/** Default number of entries shown when `/council recent` is called bare. */
export const DEFAULT_RECENT_LIMIT = 10;

/** Hard cap so a stray `/council recent 99999` can't dump every debate. */
export const MAX_RECENT_LIMIT = 50;

/** Decoded frontmatter block from a single debate record. */
export interface DebateFrontmatter {
  debate_id: string;
  topic: string;
  council: string;
  mode: string;
  timestamp: string;
  snapshot_id?: string;
  signature_ed25519?: string;
  consensus_invariants: string[];
}

/** A parsed debate record, ready to render. */
export interface DebateRecord {
  /** Absolute path to the source markdown file. */
  path: string;
  /** Slug extracted from the filename (e.g. "2026-08-25_topic-slug"). */
  slug: string;
  /** Frontmatter block (or sensible defaults when parsing failed). */
  frontmatter: DebateFrontmatter;
}

/** Parsed frontmatter row — `{ raw, value }` so the renderer can surface the
 *  original YAML verbatim if a more nuanced formatting decision is needed. */
interface FrontmatterKV {
  raw: string;
}

/**
 * Does the raw arg string look like a `/council recent [N]` or
 * `/council --recent [N]` invocation? Matches:
 *   "recent"
 *   "recent 5"
 *   "--recent"
 *   "--recent 5"
 * Trailing whitespace and additional trailing args are tolerated; the caller
 * can still fall through to the deliberation workflow when the args describe
 * a normal topic.
 */
export function isRecentArgs(rawArgs: string): boolean {
  const trimmed = rawArgs.trim();
  if (trimmed.length === 0) return false;
  return /^(?:--?recent(?:\s+\d+)?)\s*$/.test(trimmed);
}

/**
 * Parse the count from `recent [N]` / `--recent [N]`. Returns
 * DEFAULT_RECENT_LIMIT when no number was supplied, and clamps to
 * MAX_RECENT_LIMIT for any larger input. Accepts both `--recent` and
 * `recent` prefixes so the call site stays uniform.
 */
export function parseRecentCount(rawArgs: string): number {
  const match = rawArgs.trim().match(/^(?:--?recent)\s+(\d+)$/);
  if (!match) return DEFAULT_RECENT_LIMIT;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RECENT_LIMIT;
  return Math.min(n, MAX_RECENT_LIMIT);
}

/** Locate the debates directory under the resolved workspace root. */
function findDebatesDir(rootDir: string): string | null {
  try {
    const ctx = getWorkspaceContext(rootDir);
    const candidate = join(ctx.scratch, "debates");
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Minimal YAML scalar parser: strips surrounding quotes, returns the inner
 *  string. Sufficient for our controlled frontmatter field set. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
  }
  return trimmed;
}

/** Trim a leading "- " from a YAML list bullet. */
function stripListBullet(line: string): string {
  return line.replace(/^\s*-\s+/, "").trim();
}

/**
 * Parse a single debate record's frontmatter. Tolerates the field set emitted
 * by `saveCouncilRecord()`: `debate_id`, `topic`, `council`, `mode`,
 * `timestamp`, optional `snapshot_id` / `signature_ed25519`, and a YAML list
 * `consensus_invariants: [...]`. Returns sensible defaults when a field is
 * missing so callers don't have to null-check every key.
 */
export function parseDebateFrontmatter(content: string): DebateFrontmatter {
  const result: DebateFrontmatter = {
    debate_id: "",
    topic: "",
    council: "",
    mode: "",
    timestamp: "",
    consensus_invariants: [],
  };

  // Extract the leading frontmatter block delimited by `---`.
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;
  const block = match[1] ?? "";
  const lines = block.split("\n");

  let currentList: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    // Top-level `key: value` row.
    const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (scalar) {
      const key = scalar[1];
      const value = scalar[2] ?? "";
      currentList = null;
      switch (key) {
        case "debate_id":
          result.debate_id = unquote(value);
          break;
        case "topic":
          result.topic = unquote(value);
          break;
        case "council":
          result.council = unquote(value);
          break;
        case "mode":
          result.mode = unquote(value);
          break;
        case "timestamp":
          result.timestamp = unquote(value);
          break;
        case "snapshot_id":
          result.snapshot_id = unquote(value);
          break;
        case "signature_ed25519":
          result.signature_ed25519 = unquote(value);
          break;
        case "consensus_invariants":
          // `consensus_invariants:` alone — start a list block.
          if (value.trim().length === 0) currentList = "consensus_invariants";
          break;
        default:
          // Unknown key — preserve as `_extras[key]` via FrontmatterKV would
          // require extending the public surface; for now we silently ignore.
          break;
      }
      continue;
    }
    // Indented list item `- "..."` continuation.
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentList === "consensus_invariants") {
      const item = unquote(stripListBullet(line));
      if (item.length > 0) result.consensus_invariants.push(item);
      continue;
    }
    // Anything else: end the current list block.
    currentList = null;
  }

  // Suppress unused parameter for FrontmatterKV — kept for future expansion.
  void ({} as FrontmatterKV);

  return result;
}

/**
 * List and parse every debate record under `.omp/scratch/debates/`,
 * sorted newest-first (by ISO date prefix in the filename). Returns an empty
 * array when the directory does not exist or contains no markdown files.
 */
export function listDebateRecords(rootDir: string): DebateRecord[] {
  const dir = findDebatesDir(rootDir);
  if (!dir) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const records: DebateRecord[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const fullPath = join(dir, name);
    try {
      if (!statSync(fullPath).isFile()) continue;
    } catch {
      continue;
    }
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    const frontmatter = parseDebateFrontmatter(content);
    const slug = name.replace(/\.md$/, "");
    records.push({ path: fullPath, slug, frontmatter });
  }
  // Sort by ISO date descending — filenames start with `YYYY-MM-DD_` so the
  // string compare is also the date compare.
  records.sort((a, b) => {
    const aDate = a.frontmatter.timestamp || a.slug;
    const bDate = b.frontmatter.timestamp || b.slug;
    return bDate.localeCompare(aDate);
  });
  return records;
}

/**
 * Render the council history as a clean 76-column ANSI summary card. Each
 * debate gets one line: `[date] topic · <council> · <N> invariants ·
 * <signed|unsigned>`. Designed to match the existing verdict-card visual
 * vocabulary so `/council recent` feels native.
 */
export function renderCouncilHistoryCard(records: DebateRecord[], limit: number): string {
  const borderColor = records.length > 0 ? BORDER_COLORS.cyan : BORDER_COLORS.dim;
  const inner = 74;
  const lines: string[] = [makeTopBorder(borderColor)];
  const titleText = `⚖️  ${bold("COUNCIL HISTORY")} · ${records.length} decision${records.length === 1 ? "" : "s"} (showing ${Math.min(limit, records.length)})`;
  lines.push(boxLine(titleText, borderColor));
  lines.push(makeDivider(borderColor));

  if (records.length === 0) {
    lines.push(boxLine(` ${dim("○ No council decision records found in .omp/scratch/debates/")}`, borderColor));
    lines.push(boxLine(` ${dim("  Run /council --save <topic> to create the first one.")}`, borderColor));
  } else {
    const slice = records.slice(0, limit);
    for (const rec of slice) {
      const date = (rec.frontmatter.timestamp || rec.slug).slice(0, 10);
      const topic = rec.frontmatter.topic || rec.slug;
      const council = rec.frontmatter.council || "default-triad";
      const invariants = rec.frontmatter.consensus_invariants.length;
      const signed = rec.frontmatter.signature_ed25519 ? "🔏 signed" : "unsigned";
      // Topic + council + counts must fit in the inner width; truncate the
      // topic aggressively so the metadata tail always renders.
      const meta = ` · ${council} · ${invariants} invariants · ${signed}`;
      const metaWidth = displayWidth(meta);
      const topicBudget = Math.max(0, inner - 2 /* leading " " + date prefix */ - 4 /* "[YYYY-MM-DD]" */ - 1 /* space */ - metaWidth - 1 /* trailing space */);
      const truncatedTopic = truncateToWidth(topic, topicBudget);
      const row = ` [${date}] ${truncatedTopic}${meta}`;
      lines.push(boxLine(row, borderColor));
    }
  }
  lines.push(makeBottomBorder(borderColor));
  return lines.join("\n");
}
/**
 * Entry point for the local handler. Returns `{ handled: false }` when the
 * invoked args are NOT a `recent` invocation, so the caller can fall through
 * to the default deliberation workflow. Never throws — every failure path
 * becomes a notification + an empty history card.
 */
export async function runCouncilRecentCommand(args: {
  rawArgs: string;
  root: string;
  pi: ExtensionApi;
  ctx: CommandContext;
}): Promise<{ handled: boolean }> {
  const { rawArgs, root, pi, ctx } = args;
  if (!isRecentArgs(rawArgs)) return { handled: false };

  const limit = parseRecentCount(rawArgs);
  const dir = findDebatesDir(root);
  if (!dir) {
    ctx.ui?.notify?.(
      `No .omp/scratch/debates/ directory here — run /council --save <topic> to create the first record.`,
      "warn",
    );
    pi.sendMessage({
      customType: COUNCIL_CUSTOM_TYPE,
      content: "○ No council decision records found in .omp/scratch/debates/",
      display: true,
      attribution: "user",
      details: {
        topic: "Council history",
        mode: "raw",
        councilName: "__history__",
        opinions: [],
        consensusInvariants: [],
        majorityRecommendations: [],
        uniqueInsights: [],
        criticalDivergences: [],
        verdictSummary: "No council decision records found.",
        timestamp: new Date().toISOString(),
        compact: true,
      },
    });
    return { handled: true };
  }
  const records = listDebateRecords(root);
  const card = renderCouncilHistoryCard(records, limit);
  // Send the rendered card AND a stub verdict so the council-verdict renderer
  // is exercised end-to-end (the message renderer will receive the details).
  const latest = records[0];
  const summary = records.length === 0
    ? "No council decision records found."
    : `${records.length} decision${records.length === 1 ? "" : "s"} · ${records.filter((r) => r.frontmatter.signature_ed25519).length} signed`;
  pi.sendMessage({
    customType: COUNCIL_CUSTOM_TYPE,
    content: card,
    display: true,
    attribution: "user",
    details: {
      topic: latest?.frontmatter.topic ?? "Council history",
      mode: "raw",
      councilName: latest?.frontmatter.council ?? "__history__",
      opinions: [],
      consensusInvariants: [],
      majorityRecommendations: [],
      uniqueInsights: [],
      criticalDivergences: [],
      verdictSummary: summary,
      timestamp: latest?.frontmatter.timestamp ?? new Date().toISOString(),
      compact: true,
    },
  });
  // Also render the stub verdict as compact via the same customType so the
  // existing renderer shows the compact 4-line card. This second message is
  // hidden because the rich card already conveys the data.
  ctx.ui?.notify?.(
    records.length === 0
      ? "No council decision records found — run /council --save <topic> to start"
      : `Showing ${Math.min(limit, records.length)} of ${records.length} council decisions`,
    "info",
  );
  return { handled: true };
}
