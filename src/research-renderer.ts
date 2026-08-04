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
  const slug = payload?.slug ?? "unknown";
  const status = payload?.status ?? "DRAFT REVIEW";

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

  const items = payload?.items ?? [];
  const itemsCount = items.length;
  const filledItems = items.filter(
    (i) => i.status && ["filled", "done", "completed", "verified"].includes(i.status.toLowerCase()),
  ).length;
  const progressRatio =
    payload?.progress !== undefined
      ? payload.progress > 1
        ? payload.progress / 100
        : payload.progress
      : itemsCount > 0
      ? filledItems / itemsCount
      : 0;
  const progressBar = makeProgressBar(progressRatio, 8);

  const yieldBadgeText =
    payload?.source_yield !== undefined || payload?.yield_badge !== undefined
      ? `[Yield: ${payload?.source_yield ?? payload?.yield_badge}]`
      : items.some((i) => i.yield !== undefined || i.sources_count !== undefined)
      ? `[Yield: ${items.reduce((acc, i) => acc + (i.sources_count ?? (i.yield ? 1 : 0)), 0)} src]`
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
      let desc = item.name;
      if (item.category) desc += ` (${item.category})`;
      if (item.description) desc += `: ${item.description}`;
      if (item.status) desc += ` [${item.status}]`;
      if (item.yield) desc += ` [Yield: ${item.yield}]`;
      else if (item.sources_count !== undefined) desc += ` [Yield: ${item.sources_count} src]`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (itemsCount > 5) {
      rawLines.push(formatContentLine(`     ... and ${itemsCount - 5} more item(s)`));
    }
  }

  const fields = payload?.fields ?? [];
  const fieldsCount = fields.length;
  rawLines.push(formatContentLine(`   Fields (${fieldsCount}):`));
  if (fieldsCount === 0) {
    rawLines.push(formatContentLine("     (none)"));
  } else {
    const previewFields = fields.slice(0, 4);
    for (const field of previewFields) {
      let desc = field.name;
      if (field.category) desc += ` (${field.category})`;
      if (field.detail_level) desc += ` [${field.detail_level}]`;
      if (field.description) desc += `: ${field.description}`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (fieldsCount > 4) {
      rawLines.push(formatContentLine(`     ... and ${fieldsCount - 4} more field(s)`));
    }
  }

  const modules = payload?.modules ?? [];
  const modulesText = modules.length > 0 ? modules.join(", ") : "none";
  rawLines.push(formatContentLine(`   Strategy Modules: ${modulesText}`));

  rawLines.push(DIVIDER);

  // Section 2: Execution Settings
  const exec = payload?.execution;
  rawLines.push(formatContentLine(" Section 2: Execution Settings"));
  rawLines.push(formatContentLine(`   Preset Scale: ${exec?.preset ?? "medium"}`));
  rawLines.push(formatContentLine(`   Agents/Wave: ${exec?.agents_per_wave ?? 4}`));
  rawLines.push(formatContentLine(`   Max Waves: ${exec?.max_waves ?? 3}`));
  rawLines.push(formatContentLine(`   Approval Mode: ${exec?.approval_mode ?? "auto"}`));

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
  const slug = payload?.slug ?? "unknown";
  const wave = payload?.wave ?? 1;
  const maxWaves = payload?.max_waves ?? 3;
  const waveBadge = `[WAVE ${wave}/${maxWaves}]`;

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH WAVE PROGRESS — ${slug} ${waveBadge}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Section: Wave Status & Field Completion
  rawLines.push(formatContentLine(` Section: Wave Status & Field Completion`));
  const fieldCompRatio =
    payload?.field_completion !== undefined
      ? payload.field_completion > 1
        ? payload.field_completion / 100
        : payload.field_completion
      : payload?.completed_fields && payload?.total_fields
      ? payload.completed_fields / payload.total_fields
      : 0;
  const progressBar = makeProgressBar(fieldCompRatio, 8);
  const percentText = `${Math.round(fieldCompRatio * 100)}%`;
  let fieldText = `   Field Completion: ${progressBar} ${percentText}`;
  if (payload?.completed_fields !== undefined && payload?.total_fields !== undefined) {
    fieldText += ` (${payload.completed_fields}/${payload.total_fields} fields)`;
  }
  rawLines.push(formatContentLine(fieldText));

  rawLines.push(DIVIDER);

  // Section: Active OODA Subagents
  rawLines.push(formatContentLine(` Section: Active OODA Subagents`));
  const subagents = payload?.active_subagents;
  if (typeof subagents === "number") {
    rawLines.push(formatContentLine(`   Active Agents: ${subagents}`));
  } else if (Array.isArray(subagents) && subagents.length > 0) {
    rawLines.push(formatContentLine(`   Active Agents (${subagents.length}):`));
    for (const sa of subagents.slice(0, 5)) {
      const saName = typeof sa === "string" ? sa : sa.name ?? sa.id ?? "agent";
      rawLines.push(formatContentLine(`     - ${saName}`));
    }
    if (subagents.length > 5) {
      rawLines.push(formatContentLine(`     ... and ${subagents.length - 5} more agent(s)`));
    }
  } else {
    rawLines.push(formatContentLine(`   Active Agents: 0 (idle)`));
  }

  rawLines.push(DIVIDER);

  // Section: Active Strategy Modules & Uncertainty Delta
  rawLines.push(formatContentLine(` Section: Strategy Modules & Uncertainty`));
  const modules = payload?.active_modules ?? [];
  const modulesText = modules.length > 0 ? modules.join(", ") : "none";
  rawLines.push(formatContentLine(`   Active Strategy Modules: ${modulesText}`));

  const deltaU = payload?.delta_u ?? payload?.uncertainty_delta ?? "-0.15";
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
  const slug = payload?.slug ?? "unknown";
  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH REPORT PREVIEW — ${slug}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Coverage & Verified Sources Count
  const covVal = payload?.coverage ?? 0;
  const covRatio = covVal > 1 ? covVal / 100 : covVal;
  const progressBar = makeProgressBar(covRatio, 8);
  const percentText = `${Math.round(covRatio * 100)}%`;
  rawLines.push(formatContentLine(` Coverage: ${progressBar} ${percentText}`));

  const sourcesCount = payload?.verified_sources_count ?? payload?.verified_sources ?? 0;
  rawLines.push(formatContentLine(` Verified Sources Count: ${sourcesCount}`));

  rawLines.push(DIVIDER);

  // Executive Summary Preview
  rawLines.push(formatContentLine(` Executive Summary Preview:`));
  const summaryText = payload?.executive_summary ?? payload?.summary_preview ?? "(No preview available)";
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
  const provenance = payload?.unresolved_provenance ?? payload?.unresolved_fields_provenance;

  if (Array.isArray(provenance) && provenance.length > 0) {
    for (const item of provenance.slice(0, 4)) {
      if (typeof item === "string") {
        rawLines.push(formatContentLine(`   - ${item}`));
      } else if (item && typeof item === "object") {
        const fieldName = item.field ?? "unknown_field";
        const attemptsInfo =
          item.attempts !== undefined
            ? ` (${typeof item.attempts === "object" ? JSON.stringify(item.attempts) : item.attempts} attempts)`
            : "";
        const reasonInfo = item.reason ? `: ${item.reason}` : "";
        rawLines.push(formatContentLine(`   - ${fieldName}${attemptsInfo}${reasonInfo}`));
      }
    }
    if (provenance.length > 4) {
      rawLines.push(formatContentLine(`   ... and ${provenance.length - 4} more unresolved field(s)`));
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
  const slug = payload?.slug ?? "unknown";
  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);

  const headerText = `RESEARCH DASHBOARD — ${slug}`;
  rawLines.push(formatContentLine(` ${headerText}`));

  rawLines.push(DIVIDER);

  // Pipeline Status: Phase 1 -> Phase 2 -> Phase 3
  const phase = payload?.current_phase ?? 1;
  const pStr = String(phase).toLowerCase();
  let pipelineStr = "";
  if (payload?.pipeline_status) {
    pipelineStr = payload.pipeline_status;
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
  const metrics = payload?.global_metrics;
  const covVal =
    metrics?.coverage ??
    (metrics?.completed_items && metrics?.total_items ? metrics.completed_items / metrics.total_items : 0);
  const covRatio = covVal > 1 ? covVal / 100 : covVal;
  const progressBar = makeProgressBar(covRatio, 8);
  const percentText = `${Math.round(covRatio * 100)}%`;
  rawLines.push(formatContentLine(`   Overall Progress: ${progressBar} ${percentText}`));
  if (metrics?.total_items !== undefined) {
    rawLines.push(formatContentLine(`   Items Completed: ${metrics.completed_items ?? 0} / ${metrics.total_items}`));
  }
  if (metrics?.total_fields !== undefined) {
    rawLines.push(formatContentLine(`   Fields Completed: ${metrics.completed_fields ?? 0} / ${metrics.total_fields}`));
  }

  rawLines.push(DIVIDER);

  // Project Artifacts Status
  rawLines.push(formatContentLine(` Project Artifacts Status:`));
  const art = payload?.artifacts;
  if (Array.isArray(art)) {
    for (const a of art.slice(0, 4)) {
      rawLines.push(formatContentLine(`   - ${a.name}: ${a.status}`));
    }
  } else if (art && typeof art === "object") {
    const outline = art.outline_yaml ? (typeof art.outline_yaml === "string" ? art.outline_yaml : "Ready") : "Pending";
    const fields = art.fields_yaml ? (typeof art.fields_yaml === "string" ? art.fields_yaml : "Ready") : "Pending";
    const results =
      art.results_json !== undefined
        ? typeof art.results_json === "number"
          ? `${art.results_json} files`
          : String(art.results_json)
        : "Pending";
    const report = art.report_md ? (typeof art.report_md === "string" ? art.report_md : "Generated") : "Pending";

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
  const nextStep = payload?.recommended_next_step ?? "Run /research-deep to execute Phase 2 background research waves.";
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
