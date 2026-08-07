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

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  ExecutionSettingsSpec,
  ResearchDashboardPayload,
  ResearchFieldSpec,
  ResearchItemSpec,
  ResearchPreset,
  ResearchReviewPayload,
} from "./research-renderer.ts";
import { EXPECTED_INTERVAL_SECONDS, freshnessOf } from "./research-freshness.ts";
import { derivePipelineStatus, phaseOf, type PipelineStatus } from "./research-status.ts";
import { resolveResearchProjectDir } from "./locators.ts";

const FRONTMATTER_RE = /^---[\s\S]*?\n---\s*/;

/** One interface for callers: resolution + dashboard payload in a single call. */
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
function readOutlineItems(projectDir: string): string[] | undefined {
  const outlinePath = pickOutlinePath(projectDir);
  if (!outlinePath) return undefined;
  try {
    const content = readFileSync(outlinePath, "utf8");
    const matches = content.match(/^(?!\s*#)\s*-\s*name:\s*(.+)$/gm);
    if (matches) {
      return matches.map((m) => m.replace(/^\s*-\s*name:\s*/, "").trim().replace(/^['"]|['"]$/g, ""));
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
        names.push(l.trim().replace(/^-\s*/, "").replace(/^['"]|['"]$/g, "").trim());
      }
    }
    return names;
  } catch {
    return undefined;
  }
}

/**
 * Field names from fields.yaml. Counting rule is shared with
 * validate_json.py: `- name:` entries under `categories:` / `field_categories`
 * only (both adapters must agree on the defined-field denominator).
 */
function readFieldNames(projectDir: string): string[] | undefined {
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
        names.push(trimmed.replace(/^-\s*name:\s*/, "").replace(/^['"]|['"]$/g, "").trim());
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

function readExecutionBlock(projectDir: string): ExecutionBlock {
  const outlinePath = pickOutlinePath(projectDir);
  if (!outlinePath) return {};
  try {
    const content = readFileSync(outlinePath, "utf8");
    const blockMatch = content.match(/^execution:\s*\n((?:\s+[a-z_]+:\s*\S+[^\r\n]*\n?)*)/m);
    if (!blockMatch) return {};
    const block = blockMatch[1];
    const readStr = (key: string): string | undefined => {
      const m = block.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\r\n]+)["']?`, "m"));
      return m ? m[1].trim() : undefined;
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

  let totalFields = frontMatter?.counts?.fields;
  if (totalFields === undefined) {
    totalFields = hasFields ? readFieldNames(projectDir)?.length : undefined;
  }
  totalFields = totalFields ?? 0;

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

  const coverage = totalItems > 0 ? Math.min(1, completedItems / totalItems) : hasReport ? 1 : 0;

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
    errors,
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
    const outlineItems = readOutlineItems(projectDir);
    if (outlineItems) {
      hasOutline = true;
      for (const name of outlineItems) {
        items.push({ name, status: "pending" });
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
      "github-debug",
      "stackoverflow",
      "chinese-tech",
      "academic-papers",
    ],
    execution: readExecutionSettings(projectDir),
  };
}
