// /timeline — LOCAL, deterministic project history & progress digest.
//
// Mirrors the /recent pattern (src/recent-command.ts): runs in TS only — no
// command body injected, no user prompt queued, no model turn (zero LLM
// overhead). Aggregates git commits, knowledge base records/pitfalls, research
// projects, and scratch/frontier decision tickets into a unified, chronological
// digest rendered via a custom transcript card (customType: "timeline-digest").

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { CommandContext, ExtensionApi } from "./api.ts";
import { findKnowledgeRoot, readKnowledge } from "./knowledge.ts";
import { listResearchProjects } from "./locators.ts";
import { readProject } from "./research-store.ts";
import { BORDER_COLORS, toolResultCard } from "./research-format.ts";
export const DEFAULT_TIMELINE_LIMIT = 15;
export const MAX_TIMELINE_LIMIT = 50;
export const TIMELINE_CUSTOM_TYPE = "timeline-digest";

export type TimelineCategory = "git" | "record" | "pitfall" | "research" | "ticket";

export interface TimelineItem {
  date: string; // YYYY-MM-DD
  category: TimelineCategory;
  title: string;
  detail?: string;
  badge?: string;
}

/**
 * Does the raw argument string look like a `/timeline [N]` invocation?
 */
export function parseTimelineLimit(rawArgs: string): number {
  const trimmed = rawArgs.trim();
  if (!trimmed) return DEFAULT_TIMELINE_LIMIT;
  const match = trimmed.match(/^(\d+)$/);
  if (!match) return DEFAULT_TIMELINE_LIMIT;
  const n = parseInt(match[1], 10);
  return Math.max(1, Math.min(n, MAX_TIMELINE_LIMIT));
}

/**
 * Collect git commits (up to limit).
 */
export function getGitEvents(root: string, limit: number): TimelineItem[] {
  const items: TimelineItem[] = [];
  try {
    const out = execFileSync(
      "git",
      ["log", `-n${limit}`, '--format=%ad|%h|%d|%s', "--date=short"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const rawLine of out.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split("|");
      if (parts.length < 4) continue;
      const [date, hash, refs, subject] = parts;
      let badge: string | undefined;
      const tagMatch = refs.match(/tag:\s*([vV]?\d+\.\d+\.\d+[^\s,)]*)/);
      if (tagMatch) {
        badge = tagMatch[1];
      } else if (hash) {
        badge = hash;
      }
      items.push({
        date,
        category: "git",
        title: subject,
        badge,
      });
    }
  } catch {
    // Ignore git errors (e.g. not a git repo or no commits yet)
  }
  return items;
}

/**
 * Collect knowledge base records and pitfalls from INDEX.md.
 */
export function getKnowledgeEvents(root: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const kbRoot = findKnowledgeRoot(root);
  if (!kbRoot) return items;
  const indexFile = join(kbRoot, ".omp", "knowledge", "INDEX.md");
  if (!existsSync(indexFile)) return items;

  try {
    const content = readFileSync(indexFile, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      // Pattern: - YYYY-MM-DD [kind] Title or 2026-08-13 [lesson] Title
      const match = line.match(/^(?:-\s*)?(\d{4}-\d{2}-\d{2})\s+\[([^\]]+)\]\s+(.+)$/);
      if (match) {
        const [, date, kind, title] = match;
        const category: TimelineCategory = kind.toLowerCase() === "pitfall" ? "pitfall" : "record";
        items.push({
          date,
          category,
          title: title.trim(),
          badge: kind.toLowerCase(),
        });
      }
    }
  } catch {
    // Ignore read errors
  }
  return items;
}

/**
 * Collect research projects.
 */
export function getResearchEvents(root: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const slugs = listResearchProjects(root);
  for (const slug of slugs) {
    const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
    const pRead = readProject(root, slug);
    const topic = !pRead.notFound && pRead.payload.topic ? pRead.payload.topic : slug;
    const phase = !pRead.notFound && pRead.payload.current_phase ? `Phase ${pRead.payload.current_phase}` : "research";
    items.push({
      date,
      category: "research",
      title: topic,
      badge: phase,
      detail: slug,
    });
  }
  return items;
}

/**
 * Collect wayfinder / scratch decision tickets.
 */
export function getTicketEvents(root: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const scratchDirs = [
    join(root, ".omp", "scratch"),
    join(root, ".scratch"),
    join(root, "docs", "specs"),
  ];

  for (const dir of scratchDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        const date = stat.mtime.toISOString().slice(0, 10);
        let title = basename(file, ".md");
        try {
          const content = readFileSync(filePath, "utf8");
          const headingMatch = content.match(/^#\s+(.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim();
          }
        } catch {
          // ignore file read error
        }
        items.push({
          date,
          category: "ticket",
          title,
          badge: "ticket",
          detail: file,
        });
      }
    } catch {
      // ignore readdir error
    }
  }
  return items;
}

/**
 * Assemble and sort unified timeline items.
 */
export function getUnifiedTimeline(root: string, limit: number): TimelineItem[] {
  const all: TimelineItem[] = [
    ...getGitEvents(root, limit),
    ...getKnowledgeEvents(root),
    ...getResearchEvents(root),
    ...getTicketEvents(root),
  ];

  // Sort descending by date (YYYY-MM-DD), secondary sort by title
  all.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return a.title.localeCompare(b.title);
  });

  // Deduplicate exact duplicates (same category, date, title)
  const seen = new Set<string>();
  const unique: TimelineItem[] = [];
  for (const item of all) {
    const key = `${item.date}|${item.category}|${item.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique.slice(0, limit);
}
/**
 * Format lines for the timeline digest card.
 */
export function formatTimelineLines(items: TimelineItem[]): string[] {
  if (items.length === 0) {
    return ["No project history events found in git, knowledge base, research, or tickets."];
  }

  const lines: string[] = [];
  for (const item of items) {
    const catTag = `[${item.category}]`.padEnd(10, " ");
    const badgeStr = item.badge ? ` (${item.badge})` : "";
    lines.push(`${item.date}  ${catTag} ${item.title}${badgeStr}`);
  }
  return lines;
}

/**
 * Run the /timeline local command handler.
 */
export async function runTimelineCommand(
  pi: ExtensionApi,
  root: string,
  rawArgs: string,
  ctx: CommandContext,
): Promise<void> {
  const limit = parseTimelineLimit(rawArgs);
  const items = getUnifiedTimeline(root, limit);
  const formattedLines = formatTimelineLines(items);

  const headerTitle = `TIMELINE DIGEST — ${basename(root) || "project"} (${items.length} events)`;

  pi.sendMessage({
    customType: TIMELINE_CUSTOM_TYPE,
    content: [headerTitle, ...formattedLines].join("\n"),
  });

  ctx.ui?.notify?.(`Timeline: ${items.length} event(s) generated`, "info");
}

/**
 * Register the transcript card renderer for `/timeline`.
 */
export function installTimelineRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer(TIMELINE_CUSTOM_TYPE, (message, _options, _theme) => {
    let content = "";
    if (message && typeof message === "object" && "content" in message && typeof message.content === "string") {
      content = message.content;
    }
    const lines = content.split("\n");
    const title = lines[0] || "TIMELINE DIGEST";
    const body = lines.slice(1);
    return toolResultCard(body, title, BORDER_COLORS.cyan);
  });
}
