import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";

export type ResearchPreset = "small" | "medium" | "high";
export type ResearchStatus = "DRAFT REVIEW" | "READY" | "RUNNING";

export interface ResearchItemSpec {
  name: string;
  category?: string;
  description?: string;
  status?: string;
  yield?: string | number;
  sources_count?: number;
}

export interface ResearchFieldSpec {
  name: string;
  category?: string;
  description?: string;
  detail_level?: string;
  status?: string;
}

export interface ExecutionSettingsSpec {
  preset?: ResearchPreset;
  agents_per_wave?: number;
  max_waves?: number;
  approval_mode?: string;
}

export interface ResearchReviewPayload {
  slug: string;
  status?: ResearchStatus;
  items?: ResearchItemSpec[];
  fields?: ResearchFieldSpec[];
  modules?: string[];
  execution?: ExecutionSettingsSpec;
  progress?: number;
  source_yield?: string | number;
  yield_badge?: string;
}

export interface ResearchWaveProgressPayload {
  slug?: string;
  wave?: number;
  max_waves?: number;
  status?: string;
  field_completion?: number;
  completed_fields?: number;
  total_fields?: number;
  active_subagents?: number | string[] | Array<{ name?: string; id?: string }>;
  active_modules?: string[];
  uncertainty_delta?: number | string;
  delta_u?: number | string;
}

export interface ResearchReportPreviewPayload {
  slug?: string;
  coverage?: number;
  verified_sources_count?: number;
  verified_sources?: number;
  executive_summary?: string;
  summary_preview?: string;
  unresolved_provenance?: Array<{ field: string; attempts?: unknown; reason?: string }> | string[] | Record<string, unknown>;
  unresolved_fields_provenance?: Array<{ field: string; attempts?: unknown; reason?: string }> | string[] | Record<string, unknown>;
}

export interface ResearchDashboardPayload {
  slug?: string;
  current_phase?: 1 | 2 | 3 | string;
  pipeline_status?: string;
  global_metrics?: {
    total_items?: number;
    completed_items?: number;
    total_fields?: number;
    completed_fields?: number;
    coverage?: number;
  };
  artifacts?: {
    outline_yaml?: boolean | string;
    fields_yaml?: boolean | string;
    results_json?: boolean | string | number;
    report_md?: boolean | string;
    [key: string]: unknown;
  } | Array<{ name: string; status: string }>;
  recommended_next_step?: string;
}

export interface ThemeHelper {
  [key: string]: unknown;
}

const BOX_WIDTH = 76;
const INNER_WIDTH = BOX_WIDTH - 2; // 74

function formatContentLine(text: string): string {
  const content =
    text.length > INNER_WIDTH ? text.slice(0, INNER_WIDTH - 3) + "..." : text.padEnd(INNER_WIDTH, " ");
  return `│${content}│`;
}

const TOP_BORDER = `┌${"─".repeat(INNER_WIDTH)}┐`;
const DIVIDER = `├${"─".repeat(INNER_WIDTH)}┤`;
const BOTTOM_BORDER = `└${"─".repeat(INNER_WIDTH)}┘`;

export function makeProgressBar(ratio: number, width: number = 8): string {
  const norm = Math.max(0, Math.min(1, ratio > 1 ? ratio / 100 : ratio));
  const filled = Math.round(norm * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function extractPayload<T>(message: unknown): T | undefined {
  if (message && typeof message === "object") {
    if ("details" in message && message.details && typeof message.details === "object") {
      return message.details as T;
    }
    return message as T;
  }
  return undefined;
}

export function renderResearchReviewCard(
  payload?: ResearchReviewPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug : "unknown";
  const status = typeof p.status === "string" ? p.status : "DRAFT REVIEW";

  const rawLines: string[] = [];

  // Top border
  rawLines.push(TOP_BORDER);

  // Header
  const headerText = `RESEARCH DRAFT REVIEW — ${slug} [${status}]`;
  rawLines.push(formatContentLine(` ${headerText}`));

  // Divider
  rawLines.push(DIVIDER);

  // Section 1: Living Outline (research.md)
  rawLines.push(formatContentLine(" Section 1: Living Outline (research.md)"));

  const rawItems = Array.isArray(p.items) ? p.items : [];
  const items = rawItems.filter((i): i is ResearchItemSpec => Boolean(i && typeof i === "object"));
  const itemsCount = items.length;
  const filledItems = items.filter(
    (i) => typeof i.status === "string" && ["filled", "done", "completed", "verified"].includes(i.status.toLowerCase()),
  ).length;
  const progressRatio =
    typeof p.progress === "number" && !isNaN(p.progress)
      ? p.progress > 1
        ? p.progress / 100
        : p.progress
      : itemsCount > 0
      ? filledItems / itemsCount
      : 0;
  const progressBar = makeProgressBar(progressRatio, 8);

  const rawYieldBadge = p.source_yield ?? p.yield_badge;
  const yieldBadgeText =
    rawYieldBadge !== undefined && rawYieldBadge !== null
      ? `[Yield: ${rawYieldBadge}]`
      : items.some((i) => i.yield !== undefined || i.sources_count !== undefined)
      ? `[Yield: ${items.reduce((acc, i) => acc + (typeof i.sources_count === "number" ? i.sources_count : (i.yield !== undefined ? 1 : 0)), 0)} src]`
      : "[Yield: High]";

  rawLines.push(
    formatContentLine(
      `   Progress: ${progressBar} ${Math.round(progressRatio * 100)}% | ${yieldBadgeText}`,
    ),
  );

  rawLines.push(formatContentLine(`   Items (${itemsCount}):`));
  if (itemsCount === 0) {
    rawLines.push(formatContentLine("     (none)"));
  } else {
    const previewItems = items.slice(0, 5);
    for (const item of previewItems) {
      let desc = typeof item.name === "string" ? item.name : String(item.name ?? "item");
      if (typeof item.category === "string" && item.category) desc += ` (${item.category})`;
      if (typeof item.description === "string" && item.description) desc += `: ${item.description}`;
      if (typeof item.status === "string" && item.status) desc += ` [${item.status}]`;
      if (item.yield !== undefined && item.yield !== null) desc += ` [Yield: ${item.yield}]`;
      else if (typeof item.sources_count === "number") desc += ` [Yield: ${item.sources_count} src]`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (itemsCount > 5) {
      rawLines.push(formatContentLine(`     ... and ${itemsCount - 5} more item(s)`));
    }
  }

  const rawFields = Array.isArray(p.fields) ? p.fields : [];
  const fields = rawFields.filter((f): f is ResearchFieldSpec => Boolean(f && typeof f === "object"));
  const fieldsCount = fields.length;
  rawLines.push(formatContentLine(`   Fields (${fieldsCount}):`));
  if (fieldsCount === 0) {
    rawLines.push(formatContentLine("     (none)"));
  } else {
    const previewFields = fields.slice(0, 4);
    for (const field of previewFields) {
      let desc = typeof field.name === "string" ? field.name : String(field.name ?? "field");
      if (typeof field.category === "string" && field.category) desc += ` (${field.category})`;
      if (typeof field.detail_level === "string" && field.detail_level) desc += ` [${field.detail_level}]`;
      if (typeof field.description === "string" && field.description) desc += `: ${field.description}`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (fieldsCount > 4) {
      rawLines.push(formatContentLine(`     ... and ${fieldsCount - 4} more field(s)`));
    }
  }

  const rawModules = Array.isArray(p.modules) ? p.modules : [];
  const modules = rawModules.filter((m) => m !== null && m !== undefined).map(String);
  const modulesText = modules.length > 0 ? modules.join(", ") : "none";
  rawLines.push(formatContentLine(`   Strategy Modules: ${modulesText}`));

  rawLines.push(DIVIDER);

  // Section 2: Execution Settings
  const exec = p.execution && typeof p.execution === "object" ? (p.execution as Record<string, unknown>) : {};
  const presetStr = typeof exec.preset === "string" ? exec.preset : "medium";
  const agentsPerWave = typeof exec.agents_per_wave === "number" ? exec.agents_per_wave : 4;
  const maxWaves = typeof exec.max_waves === "number" ? exec.max_waves : 3;
  const approvalMode = typeof exec.approval_mode === "string" ? exec.approval_mode : "auto";

  rawLines.push(formatContentLine(" Section 2: Execution Settings"));
  rawLines.push(formatContentLine(`   Preset Scale: ${presetStr}`));
  rawLines.push(formatContentLine(`   Agents/Wave: ${agentsPerWave}`));
  rawLines.push(formatContentLine(`   Max Waves: ${maxWaves}`));
  rawLines.push(formatContentLine(`   Approval Mode: ${approvalMode}`));

  // Divider
  rawLines.push(DIVIDER);

  // Section 3: Interactive Action Options
  rawLines.push(formatContentLine(" Section 3: Interactive Action Options"));
  rawLines.push(formatContentLine("   [1] Launch Deep Waves"));
  rawLines.push(formatContentLine("   [2] Refine Items"));
  rawLines.push(formatContentLine("   [3] Edit Fields"));
  rawLines.push(formatContentLine("   [4] Direct File Edit"));

  // Bottom border
  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installResearchReviewCardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-review", (message, _options, theme) => {
    const payload = extractPayload<ResearchReviewPayload>(message);
    return renderResearchReviewCard(payload, theme as ThemeHelper | undefined);
  });
}

export function renderResearchWaveProgressCard(
  payload?: ResearchWaveProgressPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug : "unknown";
  const wave = typeof p.wave === "number" ? p.wave : 1;
  const maxWaves = typeof p.max_waves === "number" ? p.max_waves : 3;
  const waveBadge = `[WAVE ${wave}/${maxWaves}]`;

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH WAVE PROGRESS — ${slug} ${waveBadge}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Section: Wave Status & Field Completion
  rawLines.push(formatContentLine(` Section: Wave Status & Field Completion`));
  const compFields = typeof p.completed_fields === "number" ? p.completed_fields : undefined;
  const totFields = typeof p.total_fields === "number" ? p.total_fields : undefined;
  const fieldCompRatio =
    typeof p.field_completion === "number" && !isNaN(p.field_completion)
      ? p.field_completion > 1
        ? p.field_completion / 100
        : p.field_completion
      : compFields !== undefined && totFields
      ? compFields / totFields
      : 0;
  const progressBar = makeProgressBar(fieldCompRatio, 8);
  const percentText = `${Math.round(fieldCompRatio * 100)}%`;
  let fieldText = `   Field Completion: ${progressBar} ${percentText}`;
  if (compFields !== undefined && totFields !== undefined) {
    fieldText += ` (${compFields}/${totFields} fields)`;
  }
  rawLines.push(formatContentLine(fieldText));

  rawLines.push(DIVIDER);

  // Section: Active OODA Subagents
  rawLines.push(formatContentLine(` Section: Active OODA Subagents`));
  const subagents = p.active_subagents;
  if (typeof subagents === "number") {
    rawLines.push(formatContentLine(`   Active Agents: ${subagents}`));
  } else if (Array.isArray(subagents) && subagents.length > 0) {
    const validSubagents = subagents.filter((sa) => sa !== null && sa !== undefined);
    rawLines.push(formatContentLine(`   Active Agents (${validSubagents.length}):`));
    for (const sa of validSubagents.slice(0, 5)) {
      const saName =
        typeof sa === "string"
          ? sa
          : sa && typeof sa === "object"
          ? typeof (sa as { name?: string }).name === "string"
            ? (sa as { name: string }).name
            : typeof (sa as { id?: string }).id === "string"
            ? (sa as { id: string }).id
            : String(sa)
          : String(sa);
      rawLines.push(formatContentLine(`     - ${saName}`));
    }
    if (validSubagents.length > 5) {
      rawLines.push(formatContentLine(`     ... and ${validSubagents.length - 5} more agent(s)`));
    }
  } else {
    rawLines.push(formatContentLine(`   Active Agents: 0 (idle)`));
  }

  rawLines.push(DIVIDER);

  // Section: Active Strategy Modules & Uncertainty Delta
  rawLines.push(formatContentLine(` Section: Strategy Modules & Uncertainty`));
  const rawModules = Array.isArray(p.active_modules) ? p.active_modules : [];
  const modules = rawModules.filter((m) => m !== null && m !== undefined).map(String);
  const modulesText = modules.length > 0 ? modules.join(", ") : "none";
  rawLines.push(formatContentLine(`   Active Strategy Modules: ${modulesText}`));

  const rawDelta = p.delta_u ?? p.uncertainty_delta;
  const deltaU = rawDelta !== undefined && rawDelta !== null ? String(rawDelta) : "-0.15";
  rawLines.push(formatContentLine(`   Uncertainty Reduction (ΔU): ${deltaU}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installResearchWaveProgressRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-wave-progress", (message, _options, theme) => {
    const payload = extractPayload<ResearchWaveProgressPayload>(message);
    return renderResearchWaveProgressCard(payload, theme as ThemeHelper | undefined);
  });
}

export function renderResearchReportPreviewCard(
  payload?: ResearchReportPreviewPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug : "unknown";
  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH REPORT PREVIEW — ${slug}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Coverage & Verified Sources Count
  const covVal = typeof p.coverage === "number" && !isNaN(p.coverage) ? p.coverage : 0;
  const covRatio = covVal > 1 ? covVal / 100 : covVal;
  const progressBar = makeProgressBar(covRatio, 8);
  const percentText = `${Math.round(covRatio * 100)}%`;
  rawLines.push(formatContentLine(` Coverage: ${progressBar} ${percentText}`));

  const rawSources = p.verified_sources_count ?? p.verified_sources;
  const sourcesCount = typeof rawSources === "number" ? rawSources : 0;
  rawLines.push(formatContentLine(` Verified Sources Count: ${sourcesCount}`));

  rawLines.push(DIVIDER);

  // Executive Summary Preview
  rawLines.push(formatContentLine(` Executive Summary Preview:`));
  const rawSummary = p.executive_summary ?? p.summary_preview;
  const summaryText = typeof rawSummary === "string" ? rawSummary : (rawSummary !== undefined && rawSummary !== null ? String(rawSummary) : "(No preview available)");
  const summaryLines = summaryText.split("\n").filter((l) => l.trim().length > 0);
  const previewSummaryLines = summaryLines.slice(0, 3);
  for (const sLine of previewSummaryLines) {
    rawLines.push(formatContentLine(`   ${sLine}`));
  }
  if (summaryLines.length > 3) {
    rawLines.push(formatContentLine(`   ...`));
  }

  rawLines.push(DIVIDER);

  // Unresolved Field Provenance
  rawLines.push(formatContentLine(` Unresolved Field Provenance:`));
  const provenance = p.unresolved_provenance ?? p.unresolved_fields_provenance;

  if (Array.isArray(provenance) && provenance.length > 0) {
    const validProvenance = provenance.filter((item) => item !== null && item !== undefined);
    if (validProvenance.length === 0) {
      rawLines.push(formatContentLine(`   None (all fields resolved)`));
    } else {
      for (const item of validProvenance.slice(0, 4)) {
        if (typeof item === "string") {
          rawLines.push(formatContentLine(`   - ${item}`));
        } else if (typeof item === "object") {
          const itemObj = item as Record<string, unknown>;
          const fieldName = typeof itemObj.field === "string" ? itemObj.field : "unknown_field";
          const attemptsInfo =
            itemObj.attempts !== undefined
              ? ` (${typeof itemObj.attempts === "object" ? JSON.stringify(itemObj.attempts) : String(itemObj.attempts)} attempts)`
              : "";
          const reasonInfo = typeof itemObj.reason === "string" && itemObj.reason ? `: ${itemObj.reason}` : "";
          rawLines.push(formatContentLine(`   - ${fieldName}${attemptsInfo}${reasonInfo}`));
        } else {
          rawLines.push(formatContentLine(`   - ${String(item)}`));
        }
      }
      if (validProvenance.length > 4) {
        rawLines.push(formatContentLine(`   ... and ${validProvenance.length - 4} more unresolved field(s)`));
      }
    }
  } else if (provenance && typeof provenance === "object") {
    const keys = Object.keys(provenance);
    if (keys.length === 0) {
      rawLines.push(formatContentLine(`   None (all fields resolved)`));
    } else {
      for (const k of keys.slice(0, 4)) {
        const val = (provenance as Record<string, unknown>)[k];
        rawLines.push(formatContentLine(`   - ${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`));
      }
    }
  } else {
    rawLines.push(formatContentLine(`   None (all fields resolved)`));
  }

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installResearchReportPreviewRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-report-preview", (message, _options, theme) => {
    const payload = extractPayload<ResearchReportPreviewPayload>(message);
    return renderResearchReportPreviewCard(payload, theme as ThemeHelper | undefined);
  });
}

export function renderResearchDashboardCard(
  payload?: ResearchDashboardPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug : "unknown";
  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH DASHBOARD — ${slug}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Pipeline Status: Phase 1 -> Phase 2 -> Phase 3
  const phase = p.current_phase ?? 1;
  const pStr = String(phase).toLowerCase();
  let pipelineStr = "";
  const rawPipeStatus = p.pipeline_status;
  if (typeof rawPipeStatus === "string" && rawPipeStatus) {
    pipelineStr = rawPipeStatus;
  } else if (pStr.includes("1") || pStr.includes("outline")) {
    pipelineStr = "[Phase 1: Outline] ──> Phase 2: OODA ──> Phase 3: Report";
  } else if (pStr.includes("2") || pStr.includes("deep") || pStr.includes("ooda")) {
    pipelineStr = "Phase 1: Outline ──> [Phase 2: OODA] ──> Phase 3: Report";
  } else if (pStr.includes("3") || pStr.includes("report")) {
    pipelineStr = "Phase 1: Outline ──> Phase 2: OODA ──> [Phase 3: Report]";
  } else {
    pipelineStr = "Phase 1: Outline ──> Phase 2: OODA ──> Phase 3: Report";
  }

  rawLines.push(formatContentLine(` Pipeline Status:`));
  rawLines.push(formatContentLine(`   ${pipelineStr}`));

  rawLines.push(DIVIDER);

  // Global Completion Metrics
  rawLines.push(formatContentLine(` Global Completion Metrics:`));
  const metrics = p.global_metrics && typeof p.global_metrics === "object" ? (p.global_metrics as Record<string, unknown>) : undefined;
  const metricsCov = typeof metrics?.coverage === "number" && !isNaN(metrics.coverage) ? metrics.coverage : undefined;
  const compItems = typeof metrics?.completed_items === "number" ? metrics.completed_items : undefined;
  const totItems = typeof metrics?.total_items === "number" ? metrics.total_items : undefined;
  const covVal =
    metricsCov !== undefined
      ? metricsCov
      : (compItems !== undefined && totItems && totItems > 0 ? compItems / totItems : 0);
  const covRatio = covVal > 1 ? covVal / 100 : covVal;
  const progressBar = makeProgressBar(covRatio, 8);
  const percentText = `${Math.round(covRatio * 100)}%`;
  rawLines.push(formatContentLine(`   Overall Progress: ${progressBar} ${percentText}`));
  if (totItems !== undefined) {
    rawLines.push(formatContentLine(`   Items Completed: ${compItems ?? 0} / ${totItems}`));
  }
  const totFields = typeof metrics?.total_fields === "number" ? metrics.total_fields : undefined;
  if (totFields !== undefined) {
    const compFields = typeof metrics?.completed_fields === "number" ? metrics.completed_fields : 0;
    rawLines.push(formatContentLine(`   Fields Completed: ${compFields} / ${totFields}`));
  }

  rawLines.push(DIVIDER);

  // Project Artifacts Status
  rawLines.push(formatContentLine(` Project Artifacts Status:`));
  const art = p.artifacts;
  if (Array.isArray(art)) {
    const validArt = art.filter((a) => a !== null && a !== undefined);
    for (const a of validArt.slice(0, 4)) {
      if (typeof a === "object") {
        const aObj = a as Record<string, unknown>;
        const aName = typeof aObj.name === "string" ? aObj.name : String(aObj.name ?? "artifact");
        const aStatus = typeof aObj.status === "string" ? aObj.status : String(aObj.status ?? "unknown");
        rawLines.push(formatContentLine(`   - ${aName}: ${aStatus}`));
      } else {
        rawLines.push(formatContentLine(`   - ${String(a)}: status unknown`));
      }
    }
  } else if (art && typeof art === "object") {
    const artObj = art as Record<string, unknown>;
    const outline = artObj.outline_yaml ? (typeof artObj.outline_yaml === "string" ? artObj.outline_yaml : "Ready") : "Pending";
    const fields = artObj.fields_yaml ? (typeof artObj.fields_yaml === "string" ? artObj.fields_yaml : "Ready") : "Pending";
    const results =
      artObj.results_json !== undefined && artObj.results_json !== null
        ? typeof artObj.results_json === "number"
          ? `${artObj.results_json} files`
          : String(artObj.results_json)
        : "Pending";
    const report = artObj.report_md ? (typeof artObj.report_md === "string" ? artObj.report_md : "Generated") : "Pending";

    rawLines.push(formatContentLine(`   - outline.yaml: ${outline}`));
    rawLines.push(formatContentLine(`   - fields.yaml: ${fields}`));
    rawLines.push(formatContentLine(`   - results/*.json: ${results}`));
    rawLines.push(formatContentLine(`   - report.md: ${report}`));
  } else {
    rawLines.push(formatContentLine(`   - outline.yaml: Ready`));
    rawLines.push(formatContentLine(`   - fields.yaml: Ready`));
    rawLines.push(formatContentLine(`   - results/*.json: Pending`));
    rawLines.push(formatContentLine(`   - report.md: Pending`));
  }

  rawLines.push(DIVIDER);

  // Recommended Next Step
  rawLines.push(formatContentLine(` Recommended Next Step:`));
  const rawNext = p.recommended_next_step;
  const nextStep = typeof rawNext === "string" ? rawNext : "Run /research-deep to execute Phase 2 background research waves.";
  rawLines.push(formatContentLine(`   ${nextStep}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installResearchDashboardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-dashboard", (message, _options, theme) => {
    const payload = extractPayload<ResearchDashboardPayload>(message);
    return renderResearchDashboardCard(payload, theme as ThemeHelper | undefined);
  });
}
