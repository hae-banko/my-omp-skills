// Research project store — the single module that owns every read of
// `.omp/knowledge/research/<slug>/` behind a small interface.
//
// The workflow bodies (commands/research/command.md, research-deep,
// research-report) are the authoring surface: they write the `research.md`
// front-matter fields `counts` (items/fields/filled/partial/pending),
// `waves_run`, `status` and `updated`. This module is the reading surface —
// those front-matter values are the read source for total_items/total_fields/
// waves_run/status, with outline.yaml / fields.yaml / results/ scans as
// fallback only when a front-matter value is absent. Both emitters
// (getResearchDashboardMetrics, getResearchReviewPayload) are adapters on
// this seam; validate_json.py is the third adapter (defined-field count),
// making the markdown↔code seam real instead of hypothetical. index.ts and
// research-renderer.ts stay thin consumers.
//
// The front-matter / outline / fields formats are narrow and workflow-owned,
// so regex parsing lives HERE (locality) — never in index.ts.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ExecutionSettingsSpec,
  ResearchDagSummary,
  ResearchDashboardPayload,
  ResearchFieldSpec,
  ResearchFindingPreview,
  ResearchItemSpec,
  ResearchPreset,
  ResearchReviewPayload,
} from "./research-renderer.ts";
import { EXPECTED_INTERVAL_SECONDS, freshnessOf } from "./research-freshness.ts";
import { derivePipelineStatus, phaseOf, type PipelineStatus } from "./research-status.ts";
import {
  listArchivedResearchProjects,
  listResearchProjects,
  resolveArchivedResearchProjectDir,
  resolveResearchProjectDir,
  safeResearchTarget,
} from "../core/locators.ts";
import { buildResearchDag } from "./research-dag.ts";
const FRONTMATTER_RE = /^---[\s\S]*?\n---\s*/;
const GITHUB_REPO_RE = /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/gi;
const SYSTEM_OWNERS = new Set(["features", "topics", "collections", "trending", "events", "sponsor", "pricing", "orgs", "settings", "notifications"]);
const SYSTEM_REPOS = new Set(["settings", "issues", "pulls", "actions", "wiki", "discussions", "releases", "commit", "commits", "blob", "tree", "raw", "stargazers", "watchers"]);

export interface DiscoveredReference {
  name: string;
  url: string;
  count: number;
}

export function extractDiscoveredReferences(projectDir: string): DiscoveredReference[] {
  if (!projectDir || !existsSync(projectDir)) return [];
  const counts = new Map<string, number>();

  const scanText = (text: string) => {
    if (!text) return;
    GITHUB_REPO_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = GITHUB_REPO_RE.exec(text)) !== null) {
      const owner = match[1];
      let repo = match[2].replace(/[.,;:!?)]}>"']+$/, "");
      if (repo.endsWith(".git")) repo = repo.slice(0, -4);
      if (SYSTEM_OWNERS.has(owner.toLowerCase()) || SYSTEM_REPOS.has(repo.toLowerCase())) continue;
      const slug = `${owner}/${repo}`;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  };

  const resultsDir = join(projectDir, "results");
  if (existsSync(resultsDir) && statSync(resultsDir).isDirectory()) {
    try {
      for (const f of readdirSync(resultsDir)) {
        if (f.endsWith(".json")) {
          try {
            const raw = readFileSync(join(resultsDir, f), "utf8");
            scanText(raw);
          } catch {}
        }
      }
    } catch {}
  }

  const reportPath = join(projectDir, "report.md");
  if (existsSync(reportPath)) {
    try {
      scanText(readFileSync(reportPath, "utf8"));
    } catch {}
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([slug, count]) => ({
    name: slug,
    url: `https://github.com/${slug}`,
    count,
  }));
}

export function extractFindingsPreview(projectDir: string, limit = 5): ResearchFindingPreview[] {
  if (!projectDir || !existsSync(projectDir)) return [];
  const resultsDir = join(projectDir, "results");
  if (!existsSync(resultsDir) || !statSync(resultsDir).isDirectory()) return [];

  const findings: ResearchFindingPreview[] = [];
  try {
    const files = readdirSync(resultsDir).filter((f) => f.endsWith(".json")).sort();
    for (const f of files) {
      if (findings.length >= limit) break;
      try {
        const raw = readFileSync(join(resultsDir, f), "utf8");
        const json = JSON.parse(raw);
        if (!json || typeof json !== "object") continue;

        const slug = f.replace(/\.json$/, "");
        const name = typeof json.name === "string" && json.name.trim() ? json.name.trim() : slug;
        const id = typeof json.id === "string" ? json.id.trim() : slug;

        // Extract summary / one-liner
        const summaryCandidates = [
          json.summary,
          json.ux_issue,
          json.finding,
          json.problem,
          json.verdict,
          json.overview,
          json.description,
        ];
        let summary: string | undefined;
        for (const cand of summaryCandidates) {
          if (typeof cand === "string" && cand.trim()) {
            summary = cand.trim();
            break;
          }
        }

        const severity = typeof json.severity === "string" ? json.severity.trim() : undefined;
        const priority = typeof json.priority === "string" ? json.priority.trim() : undefined;
        const confidence = typeof json.confidence === "string" ? json.confidence.trim() : undefined;

        // Extract 2-3 key non-metadata fields
        const keyFields: Record<string, string> = {};
        const skipKeys = new Set([
          "name",
          "id",
          "summary",
          "ux_issue",
          "finding",
          "problem",
          "verdict",
          "overview",
          "description",
          "severity",
          "priority",
          "confidence",
          "uncertain",
          "evidence",
          "sources",
          "_sources",
          "_attempts",
        ]);

        for (const [k, v] of Object.entries(json)) {
          if (k.startsWith("_") || skipKeys.has(k)) continue;
          if (typeof v === "string" && v.trim()) {
            keyFields[k] = v.trim();
            if (Object.keys(keyFields).length >= 3) break;
          } else if (typeof v === "number" || typeof v === "boolean") {
            keyFields[k] = String(v);
            if (Object.keys(keyFields).length >= 3) break;
          }
        }

        findings.push({
          name,
          id,
          summary,
          key_fields: Object.keys(keyFields).length > 0 ? keyFields : undefined,
          severity,
          priority,
          confidence,
        });
      } catch {
        // ignore individual parse errors
      }
    }
  } catch {
    // ignore readdir errors
  }

  return findings;
}

export interface ResearchProjectRead {
  slug: string;
  projectDir: string;
  notFound: boolean;
  payload: ResearchDashboardPayload;
}

/** Resolve the project dir (via the locator) and read its dashboard payload. */
export function readProject(root: string, slugArg: string): ResearchProjectRead {
  const { slug, projectDir, notFound } = resolveResearchProjectDir(root, slugArg);
  return { slug, projectDir, notFound, payload: getResearchDashboardMetrics(projectDir, slug) };
}

// ---------------------------------------------------------------------------
// research.md front-matter — the read source for counts / status / waves_run.
// ---------------------------------------------------------------------------

interface ResearchFrontMatter {
  topic?: string;
  status?: string;
  wavesRun?: number;
  updated?: string;
  counts?: {
    items?: number;
    fields?: number;
    filled?: number;
    partial?: number;
    pending?: number;
  };
}

function readFrontMatter(projectDir: string): ResearchFrontMatter | undefined {
  const researchMdPath = join(projectDir, "research.md");
  if (!existsSync(researchMdPath)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(researchMdPath, "utf8");
  } catch {
    return undefined;
  }
  const fmMatch = raw.match(FRONTMATTER_RE);
  if (!fmMatch) return undefined;
  const fm = fmMatch[0];
  const out: ResearchFrontMatter = {};
  const topic = fm.match(/^topic:\s*["']?([^"'\r\n]+)["']?/m);
  if (topic) out.topic = topic[1].trim();
  const status = fm.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
  if (status) out.status = status[1].trim();
  const wavesRun = fm.match(/^waves_run:\s*(\d+)/m);
  if (wavesRun) out.wavesRun = parseInt(wavesRun[1], 10);
  const updated = fm.match(/^updated:\s*["']?([^"'\r\n]+)["']?/m);
  if (updated) out.updated = updated[1].trim();
  // counts: is an indented key block terminated by the next column-0 key.
  const countsBlock = fm.match(/^counts:\s*\n((?:\s+[a-z_]+:\s*\S+[^\r\n]*\n?)*)/m);
  if (countsBlock) {
    const block = countsBlock[1];
    const readInt = (key: string): number | undefined => {
      const m = block.match(new RegExp(`^\\s+${key}:\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) : undefined;
    };
    const items = readInt("items");
    const fields = readInt("fields");
    const filled = readInt("filled");
    const partial = readInt("partial");
    const pending = readInt("pending");
    if (
      items !== undefined || fields !== undefined || filled !== undefined ||
      partial !== undefined || pending !== undefined
    ) {
      out.counts = { items, fields, filled, partial, pending };
    }
  }
  return out;
}

/** Canonical pipeline words are uppercase (REPORT_READY); tolerate snake_case from the body. */
function normalizeStatusWord(word: string | undefined): string | undefined {
  if (!word) return undefined;
  const upper = word.trim().toUpperCase();
  return upper.length > 0 ? upper : undefined;
}

// ---------------------------------------------------------------------------
// outline.yaml / fields.yaml reads (fallback + review items/fields).
// ---------------------------------------------------------------------------

function pickOutlinePath(projectDir: string): string | undefined {
  if (!projectDir) return undefined;
  if (existsSync(join(projectDir, "outline.yaml"))) return join(projectDir, "outline.yaml");
  if (existsSync(join(projectDir, "outline.yml"))) return join(projectDir, "outline.yml");
  return undefined;
}

function pickFieldsPath(projectDir: string): string | undefined {
  if (!projectDir) return undefined;
  if (existsSync(join(projectDir, "fields.yaml"))) return join(projectDir, "fields.yaml");
  if (existsSync(join(projectDir, "fields.yml"))) return join(projectDir, "fields.yml");
  return undefined;
}

/** Item names from outline.yaml; undefined when no outline exists. */
export function readOutlineItems(projectDir: string): string[] | undefined {
  const outlinePath = pickOutlinePath(projectDir);
  if (!outlinePath) return undefined;
  try {
    const content = readFileSync(outlinePath, "utf8");
    const matches = content.match(/^(?!\s*#)\s*-\s*name:\s*(.+)$/gm);
    if (matches) {
      return matches.map((m) => m.replace(/^\s*-\s*name:\s*/, "").replace(/#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
    }
    // Fallback for outlines that list items without `- name:` keys.
    const names: string[] = [];
    const lines = content.split("\n");
    let inItems = false;
    for (const l of lines) {
      if (/^items:/i.test(l.trim())) {
        inItems = true;
        continue;
      }
      if (inItems && /^[a-z0-9_]+:/i.test(l.trim())) inItems = false;
      if (inItems && /^\s*-\s*/.test(l)) {
        names.push(l.trim().replace(/^-\s*/, "").replace(/#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
      }
    }
    return names;
  } catch {
    return undefined;
  }
}

/**
 * Full item specifications (name, id, category, depends_on) from outline.yaml.
 */
export function readOutlineItemSpecs(projectDir: string): ResearchItemSpec[] | undefined {
  const outlinePath = pickOutlinePath(projectDir);
  if (!outlinePath) return undefined;
  try {
    const content = readFileSync(outlinePath, "utf8");
    const lines = content.split("\n");
    const items: ResearchItemSpec[] = [];
    let inItems = false;
    let currentItem: ResearchItemSpec | null = null;

    const finalizeItem = (): void => {
      if (currentItem && (currentItem.name || currentItem.id)) {
        if (!currentItem.name && currentItem.id) {
          currentItem.name = currentItem.id;
        }
        items.push(currentItem);
      }
      currentItem = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (/^items:\s*$/i.test(trimmed)) {
        inItems = true;
        continue;
      }

      if (inItems && /^[a-z0-9_]+:/i.test(trimmed) && !trimmed.startsWith("-") && !rawLine.startsWith(" ") && !rawLine.startsWith("\t")) {
        inItems = false;
        finalizeItem();
        continue;
      }

      if (!inItems) continue;

      // New item block starts with "- "
      if (/^\s*-\s*/.test(rawLine)) {
        finalizeItem();

        // Check if it's "- name: ..." or "- id: ..." or just "- item_name"
        const afterDash = rawLine.replace(/^\s*-\s*/, "").replace(/#.*$/, "").trim();
        if (/^name:\s*(.+)$/i.test(afterDash)) {
          const nameVal = afterDash.replace(/^name:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
          currentItem = { name: nameVal };
        } else if (/^id:\s*(.+)$/i.test(afterDash)) {
          const idVal = afterDash.replace(/^id:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
          currentItem = { name: idVal, id: idVal };
        } else if (!afterDash.includes(":")) {
          // Plain string item
          const val = afterDash.replace(/^['"]|['"]$/g, "");
          if (val) items.push({ name: val });
        } else {
          currentItem = { name: "" };
        }
        continue;
      }
      // Inside a multi-line item block
      if (currentItem) {
        const cleanLine = trimmed.replace(/#.*$/, "").trim();
        if (/^name:\s*(.+)$/i.test(cleanLine)) {
          currentItem.name = cleanLine.replace(/^name:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^id:\s*(.+)$/i.test(cleanLine)) {
          currentItem.id = cleanLine.replace(/^id:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^category:\s*(.+)$/i.test(cleanLine)) {
          currentItem.category = cleanLine.replace(/^category:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^depends_on:\s*\[(.*)\]/i.test(cleanLine)) {
          const match = cleanLine.match(/^depends_on:\s*\[(.*)\]/i);
          if (match) {
            const rawDeps = match[1].split(",").map((d) => d.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
            currentItem.depends_on = rawDeps;
          }
        } else if (/^depends_on:\s*$/i.test(cleanLine)) {
          // Multi-line list under depends_on:
          const deps: string[] = [];
          while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
            i++;
            const depVal = lines[i].replace(/^\s*-\s+/, "").replace(/#.*$/, "").trim().replace(/^['"]|['"]$/g, "");
            if (depVal) deps.push(depVal);
          }
          currentItem.depends_on = deps;
        }
      }
    }

    finalizeItem();
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}
/**
 * Field names from fields.yaml. Counting rule is shared with
 * validate_json.py: `- name:` entries under `categories:` / `field_categories`
 * only (both adapters must agree on the defined-field denominator).
 */
export function readFieldNames(projectDir: string): string[] | undefined {
  const fieldsPath = pickFieldsPath(projectDir);
  if (!fieldsPath) return undefined;
  try {
    const lines = readFileSync(fieldsPath, "utf8").split("\n");
    const names: string[] = [];
    let inBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(categories|field_categories):\s*$/i.test(trimmed)) {
        inBlock = true;
        continue;
      }
      if (inBlock && /^[a-z0-9_]+:/i.test(trimmed) && !trimmed.startsWith("- ")) {
        // A column-0 key ends the block (category keys stay indented).
        if (!line.startsWith(" ") && !line.startsWith("\t")) inBlock = false;
        continue;
      }
      if (inBlock && /^-\s*name:\s*(.+)$/.test(trimmed)) {
        names.push(trimmed.replace(/^-\s*name:\s*/, "").replace(/#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
      }
    }
    return names;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Execution settings (review payload) — outline.yaml `execution:` block.
// ---------------------------------------------------------------------------

interface ExecutionBlock {
  preset?: string;
  batch_size?: number;
  items_per_agent?: number;
  max_waves?: number;
  approval_mode?: string;
}

export function readExecutionBlock(projectDir: string): ExecutionBlock {
  const outlinePath = pickOutlinePath(projectDir);
  if (!outlinePath) return {};
  try {
    const content = readFileSync(outlinePath, "utf8");
    const blockMatch = content.match(/^execution:\s*\n((?:\s+[a-z_]+:\s*\S+[^\r\n]*\n?)*)/m);
    if (!blockMatch) return {};
    const block = blockMatch[1];
    const readStr = (key: string): string | undefined => {
      const m = block.match(new RegExp(`^\\s+${key}:\\s*(.+)$`, "m"));
      return m ? m[1].replace(/#.*$/, "").trim().replace(/^['"]|['"]$/g, "") : undefined;
    };
    const readInt = (key: string): number | undefined => {
      const m = block.match(new RegExp(`^\\s+${key}:\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) : undefined;
    };
    return {
      preset: readStr("preset"),
      batch_size: readInt("batch_size"),
      items_per_agent: readInt("items_per_agent"),
      max_waves: readInt("max_waves"),
      approval_mode: readStr("approval_mode"),
    };
  } catch {
    return {};
  }
}

function normalizePreset(value: string | undefined): ResearchPreset | undefined {
  if (value === "small" || value === "medium" || value === "high") return value;
  return undefined;
}

/**
 * Execution settings from outline.yaml, matching the workflow body's
 * resolution order: explicit batch_size/items_per_agent override the preset,
 * else the preset's scale, else the medium defaults. The renderer's
 * ExecutionSettingsSpec shape is kept; batch_size/items_per_agent ride along
 * as additive fields.
 */
function readExecutionSettings(projectDir: string): ExecutionSettingsSpec {
  const block = readExecutionBlock(projectDir);
  const preset = normalizePreset(block.preset) ?? "medium";
  const batchSize = block.batch_size;
  const agentsPerWave =
    batchSize ?? (preset === "small" ? 2 : 4); // medium/high: the historical default
  const maxWaves = block.max_waves ?? 3;
  const approvalMode = block.approval_mode ?? "auto";
  return {
    preset,
    agents_per_wave: agentsPerWave,
    max_waves: maxWaves,
    approval_mode: approvalMode,
    ...(batchSize !== undefined ? { batch_size: batchSize } : {}),
    ...(block.items_per_agent !== undefined ? { items_per_agent: block.items_per_agent } : {}),
  };
}

// ---------------------------------------------------------------------------
// Dashboard payload.
// ---------------------------------------------------------------------------

export function getResearchDashboardMetrics(projectDir: string, slug: string): ResearchDashboardPayload {
  const hasOutline = projectDir
    ? existsSync(join(projectDir, "outline.yaml")) || existsSync(join(projectDir, "outline.yml"))
    : false;
  const hasFields = projectDir
    ? existsSync(join(projectDir, "fields.yaml")) || existsSync(join(projectDir, "fields.yml"))
    : false;
  const hasReport = projectDir ? existsSync(join(projectDir, "report.md")) : false;
  const resultsDir = projectDir ? join(projectDir, "results") : "";
  let jsonFiles: string[] = [];
  if (resultsDir && existsSync(resultsDir)) {
    try {
      jsonFiles = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
    } catch {
      // ignore
    }
  }

  const frontMatter = readFrontMatter(projectDir);

  // Read source: front-matter counts (workflow-owned); fall back to scanning
  // outline.yaml / fields.yaml only when the front-matter value is absent.
  let totalItems = frontMatter?.counts?.items;
  if (totalItems === undefined) {
    totalItems = hasOutline ? readOutlineItems(projectDir)?.length : undefined;
  }
  totalItems = totalItems ?? 0;

  const definedFieldsPerItem = hasFields ? readFieldNames(projectDir)?.length : undefined;
  let totalFields: number;
  if (frontMatter?.counts?.fields !== undefined) {
    totalFields = frontMatter.counts.fields;
  } else if (definedFieldsPerItem !== undefined && totalItems > 0) {
    totalFields = definedFieldsPerItem * totalItems;
  } else {
    totalFields = definedFieldsPerItem ?? 0;
  }

  const completedItems = jsonFiles.length;
  let completedFields = 0;
  if (completedItems > 0) {
    let totalValidFieldsAcrossJson = 0;
    for (const file of jsonFiles) {
      try {
        const raw = readFileSync(join(resultsDir, file), "utf8");
        const json = JSON.parse(raw);
        if (json && typeof json === "object") {
          const uncertainList = Array.isArray(json.uncertain) ? json.uncertain : [];
          const keys = Object.keys(json).filter((k) => !k.startsWith("_") && k !== "uncertain");
          const validCount = keys.filter(
            (k) => !uncertainList.includes(k) && String(json[k]).indexOf("[uncertain]") === -1,
          ).length;
          totalValidFieldsAcrossJson += validCount;
        }
      } catch {
        // ignore unparseable files here; counted as errors below
      }
    }
    // Cap at the fields.yaml denominator — the numerator counts fields found
    // across result JSONs and could previously exceed it (=> >100% coverage).
    completedFields = totalFields > 0 ? Math.min(totalFields, totalValidFieldsAcrossJson) : totalValidFieldsAcrossJson;
  }

  const coverage = totalItems > 0 && totalFields > 0 ? Math.min(1, completedFields / totalFields) : hasReport ? 1 : 0;

  // Canonical pipeline status — one vocabulary across all research cards.
  // Front-matter `status` is the read source; derivePipelineStatus derives it
  // only when the front-matter word is absent or not canonical.
  const status = derivePipelineStatus({
    hasReport,
    completedItems,
    totalItems,
    explicit: normalizeStatusWord(frontMatter?.status),
  });
  const current_phase: 1 | 2 | 3 = phaseOf(status);

  // Topic from research.md front-matter (fallback: outline.yaml).
  let topic: string | undefined = frontMatter?.topic;
  if (!topic && hasOutline) {
    try {
      const m = readFileSync(pickOutlinePath(projectDir)!, "utf8").match(/^topic:\s*["']?([^"'\r\n]+)["']?/m);
      if (m) topic = m[1].trim();
    } catch {
      // ignore — topic stays undefined
    }
  }

  // as_of = newest artifact mtime (honest snapshot time, frozen at emit).
  // Freshness only applies to RUNNING — OUTLINE/REPORT_READY are historical.
  let asOfIso: string | undefined;
  try {
    const candidates = [
      join(projectDir, "research.md"),
      join(projectDir, "outline.yaml"),
      join(projectDir, "fields.yaml"),
      join(projectDir, "report.md"),
      ...(resultsDir ? jsonFiles.map((f) => join(resultsDir, f)) : []),
    ];
    let newest = 0;
    for (const c of candidates) {
      if (existsSync(c)) newest = Math.max(newest, statSync(c).mtimeMs);
    }
    if (newest > 0) asOfIso = new Date(newest).toISOString();
  } catch {
    // ignore — no as_of
  }
  const freshness =
    status === "RUNNING"
      ? freshnessOf({ asOfIso, expectedIntervalSeconds: EXPECTED_INTERVAL_SECONDS.RUNNING })
      : undefined;

  // waves_run from research.md front-matter; pending + unresolved from results.
  const wavesRun = frontMatter?.wavesRun;
  let unresolvedCount = 0;
  let invalidResults = 0;
  for (const file of jsonFiles) {
    try {
      const json = JSON.parse(readFileSync(join(resultsDir, file), "utf8")) as { uncertain?: unknown };
      if (json && typeof json === "object") {
        const uncertainList = Array.isArray(json.uncertain) ? json.uncertain : [];
        unresolvedCount += uncertainList.length;
      }
    } catch {
      invalidResults += 1;
    }
  }
  const pendingItems = Math.max(0, totalItems - completedItems);
  const next_step_command =
    current_phase === 3
      ? `View .omp/knowledge/research/${slug}/report.md for the full report`
      : current_phase === 2
        ? `/research-report ${slug}`
        : `/research-deep ${slug}`;

  const errors: string[] = [];
  if (invalidResults > 0) {
    errors.push(`${invalidResults} result file(s) in results/ could not be parsed.`);
  }

  let dagSummary: ResearchDagSummary | undefined;
  const outlineSpecs = projectDir ? readOutlineItemSpecs(projectDir) : undefined;
  if (outlineSpecs && outlineSpecs.length > 0) {
    const hasAnyDep = outlineSpecs.some((s) => Boolean(s.depends_on || s.dependsOn));
    const dag = buildResearchDag(outlineSpecs, resultsDir);
    let readyCount = 0;
    let completedCount = 0;
    let blockedCount = 0;
    for (const node of dag.nodes.values()) {
      if (node.status === "completed") completedCount++;
      else if (node.status === "ready") readyCount++;
      else if (node.status === "pending") blockedCount++;
    }
    dagSummary = {
      enabled: hasAnyDep,
      total_nodes: dag.nodes.size,
      ready_nodes: readyCount,
      completed_nodes: completedCount,
      blocked_nodes: blockedCount,
      has_cycles: dag.hasCycles,
      max_depth: dag.maxDepth,
      critical_path_length: dag.criticalPathLength,
    };
    if (dag.hasCycles) {
      errors.push(`Circular dependency detected in outline.yaml among items: ${(dag.cycleNodes ?? []).join(", ")}`);
    }
  }

  return {
    slug,
    topic,
    status,
    current_phase,
    pipeline_status: hasReport
      ? "Phase 1: Outline ──> Phase 2: OODA ──> [Phase 3: Report]"
      : completedItems > 0
        ? "Phase 1: Outline ──> [Phase 2: OODA] ──> Phase 3: Report"
        : "[Phase 1: Outline] ──> Phase 2: OODA ──> Phase 3: Report",
    global_metrics: {
      total_items: totalItems,
      completed_items: completedItems,
      total_fields: totalFields,
      completed_fields: completedFields,
      coverage,
    },
    artifacts: {
      outline_yaml: hasOutline ? "Ready" : "Pending",
      fields_yaml: hasFields ? "Ready" : "Pending",
      results_json: jsonFiles.length > 0 ? jsonFiles.length : "Pending",
      report_md: hasReport ? "Generated" : "Pending",
    },
    recommended_next_step: next_step_command,
    next_step_command,
    as_of: asOfIso,
    freshness,
    waves_run: wavesRun,
    max_waves: 3,
    pending_items: pendingItems,
    unresolved_fields_count: unresolvedCount,
    discovered_references: extractDiscoveredReferences(projectDir),
    findings_preview: extractFindingsPreview(projectDir),
    dag: dagSummary,
    project_path: projectDir || undefined,
  };
}

// ---------------------------------------------------------------------------
// Review payload.
// ---------------------------------------------------------------------------

export function getResearchReviewPayload(projectDir: string, slug: string): ResearchReviewPayload {
  const items: ResearchItemSpec[] = [];
  const fields: ResearchFieldSpec[] = [];
  let hasOutline = false;
  let hasResearchMd = false;

  if (projectDir) {
    const outlineSpecs = readOutlineItemSpecs(projectDir);
    if (outlineSpecs && outlineSpecs.length > 0) {
      hasOutline = true;
      for (const spec of outlineSpecs) {
        items.push({ ...spec, status: spec.status ?? "pending" });
      }
    } else {
      const outlineItems = readOutlineItems(projectDir);
      if (outlineItems) {
        hasOutline = true;
        for (const name of outlineItems) {
          items.push({ name, status: "pending" });
        }
      }
    }
    const fieldNames = readFieldNames(projectDir);
    if (fieldNames) {
      for (const name of fieldNames) {
        fields.push({ name });
      }
    }
    hasResearchMd = existsSync(join(projectDir, "research.md"));
  }
  return {
    slug,
    status: hasOutline || hasResearchMd ? "READY" : "DRAFT REVIEW",
    items,
    fields,
    modules: [
      "general-web",
      "chinese-tech",
      "academic-papers",
    ],
    execution: readExecutionSettings(projectDir),
  };
}

/**
 * Archive a research project: updates status to ARCHIVED and moves the project directory
 * to `.omp/knowledge/research/.archive/<slug>/`.
 */
export function archiveResearchProject(root: string, slugArg: string): { ok: boolean; slug?: string; error?: string } {
  const { slug, projectDir, notFound } = resolveResearchProjectDir(root, slugArg);
  if (notFound || !projectDir || !existsSync(projectDir)) {
    return { ok: false, error: `Research project "${slugArg}" not found under .omp/knowledge/research/` };
  }

  const archiveBase = join(root, ".omp", "knowledge", "research", ".archive");
  mkdirSync(archiveBase, { recursive: true });
  const destDir = join(archiveBase, slug);

  if (existsSync(destDir)) {
    return { ok: false, error: `An archive directory for "${slug}" already exists in .archive/` };
  }

  // Update research.md frontmatter if present
  const researchMdPath = join(projectDir, "research.md");
  if (existsSync(researchMdPath)) {
    try {
      let content = readFileSync(researchMdPath, "utf8");
      if (/^status:\s*.+$/m.test(content)) {
        content = content.replace(/^status:\s*.+$/m, "status: ARCHIVED");
      }
      if (/^updated:\s*.+$/m.test(content)) {
        content = content.replace(/^updated:\s*.+$/m, `updated: ${new Date().toISOString()}`);
      }
      writeFileSync(researchMdPath, content, "utf8");
    } catch {
      // Best-effort frontmatter update
    }
  }

  try {
    renameSync(projectDir, destDir);
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, error: `Failed to move project to archive: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Restore an archived research project: moves it from `.archive/<slug>/` back to active research.
 */
export function unarchiveResearchProject(root: string, slugArg: string): { ok: boolean; slug?: string; error?: string } {
  const { slug, projectDir, notFound } = resolveArchivedResearchProjectDir(root, slugArg);
  if (notFound || !projectDir || !existsSync(projectDir)) {
    return { ok: false, error: `Archived research project "${slugArg}" not found under .omp/knowledge/research/.archive/` };
  }

  const activeDir = join(root, ".omp", "knowledge", "research", slug);
  if (existsSync(activeDir)) {
    return { ok: false, error: `An active research project "${slug}" already exists at .omp/knowledge/research/${slug}` };
  }

  // Update research.md frontmatter status
  const researchMdPath = join(projectDir, "research.md");
  if (existsSync(researchMdPath)) {
    try {
      let content = readFileSync(researchMdPath, "utf8");
      const hasReport = existsSync(join(projectDir, "report.md"));
      const targetStatus = hasReport ? "REPORT_READY" : "CONVERGED";
      if (/^status:\s*.+$/m.test(content)) {
        content = content.replace(/^status:\s*.+$/m, `status: ${targetStatus}`);
      }
      if (/^updated:\s*.+$/m.test(content)) {
        content = content.replace(/^updated:\s*.+$/m, `updated: ${new Date().toISOString()}`);
      }
      writeFileSync(researchMdPath, content, "utf8");
    } catch {
      // Best-effort update
    }
  }

  try {
    renameSync(projectDir, activeDir);
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, error: `Failed to restore project from archive: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Permanently delete a research project directory (from active or archived store).
 */
export function removeResearchProject(root: string, slugArg: string): { ok: boolean; slug?: string; error?: string } {
  // First check active projects
  const activeTarget = safeResearchTarget(root, slugArg);
  let targetDir = activeTarget;
  let resolvedSlug = slugArg.trim();

  if (!targetDir) {
    const { slug, projectDir, notFound } = resolveResearchProjectDir(root, slugArg);
    if (!notFound && projectDir && existsSync(projectDir)) {
      targetDir = projectDir;
      resolvedSlug = slug;
    }
  }

  // Fall back to check archived projects
  if (!targetDir) {
    const { slug, projectDir, notFound } = resolveArchivedResearchProjectDir(root, slugArg);
    if (!notFound && projectDir && existsSync(projectDir)) {
      targetDir = projectDir;
      resolvedSlug = slug;
    }
  }

  if (!targetDir || !existsSync(targetDir)) {
    return { ok: false, error: `Research project "${slugArg}" not found` };
  }

  try {
    rmSync(targetDir, { recursive: true, force: true });
    return { ok: true, slug: resolvedSlug };
  } catch (err) {
    return { ok: false, error: `Failed to remove project: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface ResearchProjectSummary {
  slug: string;
  topic: string;
  status: string;
  totalItems: number;
  completedItems: number;
  totalFields: number;
  completedFields: number;
  archived: boolean;
}

/**
 * List summaries for active or archived research projects.
 */
export function listResearchSummaries(root: string, archived = false): ResearchProjectSummary[] {
  const slugs = archived ? listArchivedResearchProjects(root) : listResearchProjects(root);
  const baseDir = join(root, ".omp", "knowledge", "research", archived ? ".archive" : "");
  const summaries: ResearchProjectSummary[] = [];

  for (const slug of slugs) {
    const projectDir = join(baseDir, slug);
    const m = getResearchDashboardMetrics(projectDir, slug);
    const g = m.global_metrics ?? {};
    summaries.push({
      slug,
      topic: m.topic ?? slug,
      status: String(m.status ?? "UNKNOWN"),
      totalItems: g.total_items ?? 0,
      completedItems: g.completed_items ?? 0,
      totalFields: g.total_fields ?? 0,
      completedFields: g.completed_fields ?? 0,
      archived,
    });
  }

  return summaries;
}
