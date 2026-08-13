// TUI card renderers for the research workflow (review, wave progress, report
// preview, dashboard, help, error). All lines are width-aware (display cells,
// not code points) so the fixed 76-column box stays aligned on CJK/emoji text.
//
// Payload changes are additive: every new field is optional, so previously
// emitted transcript cards replay byte-identically and old payloads keep
// rendering the current card.

import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";
import {
  BORDER_COLORS,
  BOTTOM_BORDER,
  DIVIDER,
  INNER_WIDTH,
  TOP_BORDER,
  boxLine,
  clamp01,
  displayWidth,
  extractPayload,
  formatDuration,
  makeBottomBorder,
  makeDivider,
  makeProgressBar,
  makeTopBorder,
  padToWidth,
  starsFor,
  truncateMiddle,
  truncateToWidth,
} from "./research-format.ts";
import { PIPELINE_STATUSES, phaseOf, phaseStepper, type PipelineStatus } from "./research-status.ts";
import { freshnessLabel, type Freshness } from "./research-freshness.ts";
import { colorize, resolveResearchTheme, type ResearchTheme } from "./research-theme.ts";

export type ResearchPreset = "small" | "medium" | "high";
export type ResearchReviewStatus = "DRAFT REVIEW" | "READY";
export type ResearchDetail = "compact" | "full";
export type ResearchFreshness = Freshness;

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
  status?: ResearchReviewStatus;
  items?: ResearchItemSpec[];
  fields?: ResearchFieldSpec[];
  modules?: string[];
  execution?: ExecutionSettingsSpec;
  progress?: number;
  source_yield?: string | number;
  yield_badge?: string;
  /** compact (default) caps previews; full lists more items/fields. */
  detail?: ResearchDetail;
}

export interface ResearchWaveProgressPayload {
  slug?: string;
  wave?: number;
  max_waves?: number;
  /** Canonical pipeline status word (RUNNING/PAUSED/CANCELLED/ERROR/...). */
  status?: string;
  field_completion?: number;
  completed_fields?: number;
  total_fields?: number;
  active_subagents?: number | string[] | Array<{ name?: string; id?: string }>;
  active_modules?: string[];
  uncertainty_delta?: number | string;
  delta_u?: number | string;
  // Operational metrics (previously declared but never rendered).
  total_items?: number;
  completed_items?: number;
  pending_items?: number;
  wave_items?: number;
  unresolved_fields_count?: number;
  preset?: string;
  failed_items?: number;
  failed_count?: number;
  per_item_status?: Array<{ name?: string; status?: string }>;
  // Time semantics.
  elapsed_seconds?: number;
  eta_seconds?: number;
  indeterminate?: boolean;
  as_of?: string;
}

export interface ResearchReportPreviewPayload {
  slug?: string;
  coverage?: number;
  verified_sources_count?: number;
  verified_sources?: number;
  executive_summary?: string;
  summary_preview?: string;
  unresolved_provenance?:
    | Array<{ field: string; attempts?: unknown; reason?: string }>
    | string[]
    | Record<string, unknown>;
  unresolved_fields_provenance?:
    | Array<{ field: string; attempts?: unknown; reason?: string }>
    | string[]
    | Record<string, unknown>;
  // Contract fields the renderer previously ignored.
  toc?: Array<{ name?: string; summary?: string } | string>;
  summary_fields?: string[];
  total_items?: number;
  resolved_items?: number;
  unresolved_fields_count?: number;
  preview_content?: string;
}

export interface ResearchDashboardPayload {
  slug?: string;
  topic?: string;
  /** Canonical pipeline status word (uppercase). */
  status?: PipelineStatus | string;
  current_phase?: 1 | 2 | 3 | string;
  /** Legacy phase-arrow display string; superseded by status + stepper. */
  pipeline_status?: string;
  global_metrics?: {
    total_items?: number;
    completed_items?: number;
    total_fields?: number;
    completed_fields?: number;
    coverage?: number;
  };
  artifacts?:
    | {
        outline_yaml?: boolean | string;
        fields_yaml?: boolean | string;
        results_json?: boolean | string | number;
        report_md?: boolean | string;
        [key: string]: unknown;
      }
    | Array<{ name: string; status: string }>;
  recommended_next_step?: string;
  /** Concrete next command with the slug filled in (e.g. `/research-deep 2026-08-07_x`). */
  next_step_command?: string;
  as_of?: string;
  freshness?: ResearchFreshness;
  expected_interval_seconds?: number;
  waves_run?: number;
  max_waves?: number;
  pending_items?: number;
  unresolved_fields_count?: number;
  discovered_references?: Array<{ name: string; url: string; count: number }>;
  detail?: ResearchDetail;
  errors?: string[];
  project_path?: string;
}

export interface ResearchHelpCommandSpec {
  command: string;
  description: string;
}

export interface ResearchHelpPayload {
  slug?: string;
  phase?: number | string;
  status?: string;
  commands?: ResearchHelpCommandSpec[];
  shortcuts?: Array<{ key: string; description: string }>;
  env?: Record<string, string>;
  next_step?: string;
}

export interface ResearchErrorPayload {
  slug?: string;
  code?: string;
  message?: string;
  hint?: string;
}

function toRecord(payload: unknown): Record<string, unknown> {
  return (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Ratio from a 0..1 or 0..100 value. */
function ratioOf(v: number | undefined): number {
  if (v === undefined) return 0;
  return clamp01(v > 1 ? v / 100 : v);
}

/** "updated 2026-08-07T12:00:00Z [STALE]" suffix when freshness present. */
function freshnessSuffix(freshness: unknown, asOf: unknown): string {
  const label = freshnessLabel(freshness as Freshness);
  const asOfText = asString(asOf);
  const parts: string[] = [];
  if (asOfText) parts.push(`updated ${asOfText}`);
  if (label) parts.push(label);
  return parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
}

function buildContainer(rawLines: string[]): Container {
  const container = new Container();
  rawLines.forEach((line) => {
    container.addChild(new Text(line, 0, 0));
  });
  return container;
}

/**
 * Header row that guarantees the trailing badge is never truncated: the slug
 * is middle-truncated to whatever width the badge leaves over.
 * `plainBadge` is measured (no ANSI); `renderedBadge` is what gets drawn.
 */
function cardHeader(prefix: string, slug: string, plainBadge: string, renderedBadge: string): string {
  const prefixWidth = displayWidth(` ${prefix}`);
  const badgeWidth = displayWidth(plainBadge);
  const slugWidth = Math.max(8, INNER_WIDTH - prefixWidth - badgeWidth);
  return boxLine(` ${prefix}${truncateMiddle(slug, slugWidth)}${renderedBadge}`);
}

// ---------------------------------------------------------------------------
// Review window
// ---------------------------------------------------------------------------

export function renderResearchReviewCard(payload?: ResearchReviewPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "unknown";
  const status = asString(p.status) ?? "DRAFT REVIEW";
  const detail = asString(p.detail) === "full" ? "full" : "compact";
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);

  const badge = colorize(`[${status}]`, theme.colors.badge, theme.monochrome);
  rawLines.push(cardHeader("RESEARCH DRAFT REVIEW — ", slug, ` [${status}]`, ` ${badge}`));
  rawLines.push(DIVIDER);

  // Section 1: Living Outline
  rawLines.push(boxLine(" Section 1: Living Outline (research.md)"));

  const items = Array.isArray(p.items)
    ? p.items.filter((i): i is ResearchItemSpec => Boolean(i && typeof i === "object"))
    : [];
  const filledItems = items.filter(
    (i) => typeof i.status === "string" && ["filled", "done", "completed", "verified"].includes(i.status.toLowerCase()),
  ).length;
  const progressRatio =
    typeof p.progress === "number"
      ? ratioOf(p.progress)
      : items.length > 0
        ? filledItems / items.length
        : 0;
  const progressBar = makeProgressBar(progressRatio, 8);

  const rawYieldBadge = p.source_yield ?? p.yield_badge;
  const yieldBadgeText =
    rawYieldBadge !== undefined && rawYieldBadge !== null
      ? `[Yield: ${rawYieldBadge}]`
      : items.some((i) => i.yield !== undefined || i.sources_count !== undefined)
        ? `[Yield: ${items.reduce((acc, i) => acc + (typeof i.sources_count === "number" ? i.sources_count : i.yield !== undefined ? 1 : 0), 0)} src]`
        : "[Yield: High]";

  rawLines.push(boxLine(`   Progress: ${progressBar} ${Math.round(progressRatio * 100)}% | ${yieldBadgeText}`));

  const itemCap = detail === "full" ? 10 : 5;
  rawLines.push(boxLine(`   Items (${items.length}):`));
  if (items.length === 0) {
    rawLines.push(boxLine("     (none)"));
  } else {
    for (const item of items.slice(0, itemCap)) {
      let desc = typeof item.name === "string" ? item.name : String(item.name ?? "item");
      if (typeof item.category === "string" && item.category) desc += ` (${item.category})`;
      if (typeof item.status === "string" && item.status) desc += ` [${item.status}]`;
      if (item.yield !== undefined && item.yield !== null) desc += ` [Yield: ${item.yield}]`;
      else if (typeof item.sources_count === "number") desc += ` [Yield: ${item.sources_count} src]`;
      rawLines.push(boxLine(`     - ${desc}`));
    }
    if (items.length > itemCap) {
      rawLines.push(boxLine(`     ... and ${items.length - itemCap} more item(s) — run '/research review ${slug} --full'`));
    }
  }

  const fields = Array.isArray(p.fields)
    ? p.fields.filter((f): f is ResearchFieldSpec => Boolean(f && typeof f === "object"))
    : [];
  const fieldCap = detail === "full" ? 8 : 4;
  rawLines.push(boxLine(`   Fields (${fields.length}):`));
  if (fields.length === 0) {
    rawLines.push(boxLine("     (none)"));
  } else {
    for (const field of fields.slice(0, fieldCap)) {
      let desc = typeof field.name === "string" ? field.name : String(field.name ?? "field");
      if (typeof field.category === "string" && field.category) desc += ` (${field.category})`;
      const stars = starsFor(field.detail_level);
      if (stars) desc += ` ${stars}`;
      if (typeof field.description === "string" && field.description) desc += `: ${field.description}`;
      rawLines.push(boxLine(`     - ${desc}`));
    }
    if (fields.length > fieldCap) {
      rawLines.push(boxLine(`     ... and ${fields.length - fieldCap} more field(s) — run '/research review ${slug} --full'`));
    }
  }

  const modules = Array.isArray(p.modules) ? p.modules.filter((m) => m !== null && m !== undefined).map(String) : [];
  rawLines.push(boxLine(`   Strategy Modules: ${modules.length > 0 ? modules.join(", ") : "none"}`));
  rawLines.push(DIVIDER);

  // Section 2: Execution Settings
  const exec = p.execution && typeof p.execution === "object" ? (p.execution as Record<string, unknown>) : {};
  rawLines.push(boxLine(" Section 2: Execution Settings"));
  rawLines.push(boxLine(`   Preset Scale: ${asString(exec.preset) ?? "medium"}`));
  rawLines.push(boxLine(`   Agents/Wave: ${asNumber(exec.agents_per_wave) ?? 4}`));
  rawLines.push(boxLine(`   Max Waves: ${asNumber(exec.max_waves) ?? 3}`));
  rawLines.push(boxLine(`   Approval Mode: ${asString(exec.approval_mode) ?? "auto"}`));
  rawLines.push(DIVIDER);

  // Section 3: real, copy-pasteable commands (the old [1]-[4] lines were fake affordances)
  rawLines.push(boxLine(" Section 3: Next Commands"));
  rawLines.push(boxLine(`   /research-deep ${slug}       Launch deep research waves`));
  rawLines.push(boxLine(`   /research add-items ${slug}  Add research items`));
  rawLines.push(boxLine(`   /research add-fields ${slug} Add field definitions`));
  rawLines.push(boxLine(`   /research review ${slug} --full  Re-open with all items`));

  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchReviewCardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-review", (message, _options, theme) => {
    return renderResearchReviewCard(extractPayload<ResearchReviewPayload>(message), theme);
  });
}

// ---------------------------------------------------------------------------
// Wave progress
// ---------------------------------------------------------------------------

export function renderResearchWaveProgressCard(payload?: ResearchWaveProgressPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "unknown";
  const wave = asNumber(p.wave) ?? 1;
  const maxWaves = asNumber(p.max_waves) ?? 3;
  const status = asString(p.status);
  const indeterminate = p.indeterminate === true;
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);

  const statusBadge = status ? colorize(`[${status}]`, theme.colors.badge, theme.monochrome) : "";
  const plainBadge = ` [WAVE ${wave}/${maxWaves}]${status ? ` [${status}]` : ""}`;
  const renderedBadge = ` [WAVE ${wave}/${maxWaves}]${status ? ` ${statusBadge}` : ""}`;
  rawLines.push(cardHeader("RESEARCH WAVE PROGRESS — ", slug, plainBadge, renderedBadge));
  rawLines.push(DIVIDER);

  // Field completion (indeterminate state renders a textual pulse, not a fake 0%)
  rawLines.push(boxLine(" Section: Wave Status & Field Completion"));
  const compFields = asNumber(p.completed_fields);
  const totFields = asNumber(p.total_fields);
  const fieldCompRatio = ratioOf(
    typeof p.field_completion === "number" ? p.field_completion : compFields !== undefined && totFields ? compFields / totFields : undefined,
  );
  if (indeterminate) {
    rawLines.push(boxLine("   Status: RUNNING… (indeterminate — no results yet)"));
  } else {
    const progressBar = makeProgressBar(fieldCompRatio, 8);
    let fieldText = `   Field Completion: ${progressBar} ${Math.round(fieldCompRatio * 100)}%`;
    if (compFields !== undefined && totFields !== undefined) fieldText += ` (${compFields}/${totFields} fields)`;
    rawLines.push(boxLine(fieldText));
  }

  // Item status (operational metrics the renderer previously ignored)
  const totalItems = asNumber(p.total_items);
  const completedItems = asNumber(p.completed_items);
  const pendingItems = asNumber(p.pending_items);
  const waveItems = asNumber(p.wave_items);
  const failedCount = asNumber(p.failed_count) ?? asNumber(p.failed_items);
  const unresolvedCount = asNumber(p.unresolved_fields_count);
  const perItem = Array.isArray(p.per_item_status) ? p.per_item_status.filter((s) => s && typeof s === "object") : [];
  if (perItem.length > 0) {
    const count = (statusWord: string) => perItem.filter((s) => (s.status ?? "").toLowerCase() === statusWord.toLowerCase()).length;
    const landed = count("landed") + count("filled") + count("done");
    const inFlight = count("in flight") + count("running") + count("active");
    const failed = count("failed") + count("error");
    const pending = perItem.length - landed - inFlight - failed;
    rawLines.push(boxLine(`   Items: ${landed} landed · ${inFlight} in flight · ${failed} failed · ${pending} pending`));
  } else if (totalItems !== undefined) {
    let itemText = `   Items: ${completedItems ?? 0}/${totalItems} completed`;
    if (waveItems !== undefined) itemText += ` (wave: ${waveItems})`;
    if (failedCount !== undefined && failedCount > 0) itemText += ` · ${failedCount} failed`;
    if (pendingItems !== undefined) itemText += ` · ${pendingItems} pending`;
    rawLines.push(boxLine(itemText));
  }
  if (unresolvedCount !== undefined) {
    rawLines.push(boxLine(`   Unresolved fields: ${unresolvedCount}`));
  }

  // Time semantics (monotonic elapsed, ETA only when estimable)
  const elapsed = formatDuration(asNumber(p.elapsed_seconds));
  const eta = formatDuration(asNumber(p.eta_seconds));
  if (elapsed || eta) {
    const parts: string[] = [];
    if (elapsed) parts.push(`elapsed ${elapsed}`);
    if (eta) parts.push(`ETA ≈ ${eta}`);
    rawLines.push(boxLine(`   Time: ${parts.join(" · ")}`));
  }

  rawLines.push(DIVIDER);

  // Active OODA subagents — omitted entirely when the payload has none
  // (the old "Active Agents: 0 (idle)" fabricated an idle state).
  const subagents = p.active_subagents;
  if (typeof subagents === "number") {
    rawLines.push(boxLine(" Section: Active OODA Subagents"));
    rawLines.push(boxLine(`   Active Agents: ${subagents}`));
    rawLines.push(DIVIDER);
  } else if (Array.isArray(subagents) && subagents.length > 0) {
    rawLines.push(boxLine(" Section: Active OODA Subagents"));
    rawLines.push(boxLine(`   Active Agents (${subagents.length}):`));
    for (const sa of subagents.slice(0, 5)) {
      const saName =
        typeof sa === "string"
          ? sa
          : sa && typeof sa === "object"
            ? asString((sa as { name?: unknown }).name) ?? asString((sa as { id?: unknown }).id) ?? String(sa)
            : String(sa);
      rawLines.push(boxLine(`     - ${saName}`));
    }
    if (subagents.length > 5) {
      rawLines.push(boxLine(`     ... and ${subagents.length - 5} more agent(s)`));
    }
    rawLines.push(DIVIDER);
  }

  // Strategy modules & uncertainty delta — ΔU only when the payload provides it
  const modules = Array.isArray(p.active_modules) ? p.active_modules.filter((m) => m !== null && m !== undefined).map(String) : [];
  if (modules.length > 0 || p.delta_u !== undefined || p.uncertainty_delta !== undefined) {
    rawLines.push(boxLine(" Section: Strategy Modules & Uncertainty"));
    if (modules.length > 0) rawLines.push(boxLine(`   Active Strategy Modules: ${modules.join(", ")}`));
    const rawDelta = p.delta_u ?? p.uncertainty_delta;
    if (rawDelta !== undefined && rawDelta !== null) {
      const deltaText = String(rawDelta);
      rawLines.push(boxLine(`   Uncertainty Reduction (ΔU): ${deltaText === "" ? "—" : deltaText}`));
    }
    rawLines.push(DIVIDER);
  }

  const asOf = asString(p.as_of);
  if (asOf) {
    rawLines.push(boxLine(`   Updated: ${asOf}`));
    rawLines.push(DIVIDER);
  }

  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchWaveProgressRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-wave-progress", (message, _options, theme) => {
    return renderResearchWaveProgressCard(extractPayload<ResearchWaveProgressPayload>(message), theme);
  });
}

// ---------------------------------------------------------------------------
// Report preview
// ---------------------------------------------------------------------------

export function renderResearchReportPreviewCard(payload?: ResearchReportPreviewPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "unknown";
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);

  const badge = colorize("[PREVIEW]", theme.colors.accent, theme.monochrome);
  rawLines.push(cardHeader("RESEARCH REPORT PREVIEW — ", slug, " [PREVIEW]", ` ${badge}`));
  rawLines.push(DIVIDER);

  // Coverage & verified sources
  const covRatio = ratioOf(asNumber(p.coverage));
  const progressBar = makeProgressBar(covRatio, 8);
  rawLines.push(boxLine(` Coverage: ${progressBar} ${Math.round(covRatio * 100)}%`));

  const sourcesCount = asNumber(p.verified_sources_count) ?? asNumber(p.verified_sources) ?? 0;
  rawLines.push(boxLine(` Verified Sources Count: ${sourcesCount}`));

  // Counts (previously declared in the payload contract but never rendered)
  const totalItems = asNumber(p.total_items);
  const resolvedItems = asNumber(p.resolved_items);
  const unresolvedCount = asNumber(p.unresolved_fields_count);
  if (totalItems !== undefined || resolvedItems !== undefined || unresolvedCount !== undefined) {
    const parts: string[] = [];
    if (totalItems !== undefined) parts.push(`items ${totalItems}`);
    if (resolvedItems !== undefined) parts.push(`${resolvedItems} resolved`);
    if (unresolvedCount !== undefined) parts.push(`${unresolvedCount} unresolved fields`);
    rawLines.push(boxLine(` ${parts.join(" · ")}`));
  }

  // TOC (the renderer previously ignored toc/summary_fields entirely)
  const toc = Array.isArray(p.toc) ? p.toc.filter((t) => t !== null && t !== undefined) : [];
  if (toc.length > 0) {
    rawLines.push(DIVIDER);
    rawLines.push(boxLine(" Table of Contents:"));
    for (const entry of toc.slice(0, 6)) {
      if (typeof entry === "string") {
        rawLines.push(boxLine(`   - ${entry}`));
      } else {
        const entryObj = entry as Record<string, unknown>;
        const name = asString(entryObj.name) ?? "item";
        const summary = asString(entryObj.summary);
        rawLines.push(boxLine(`   - ${name}${summary ? ` — ${summary}` : ""}`));
      }
    }
    if (toc.length > 6) {
      rawLines.push(boxLine(`   ... and ${toc.length - 6} more (see report.md)`));
    }
  }

  // Executive summary preview
  rawLines.push(DIVIDER);
  rawLines.push(boxLine(" Executive Summary Preview:"));
  const rawSummary = asString(p.executive_summary) ?? asString(p.summary_preview) ?? asString(p.preview_content);
  const summaryText = rawSummary ?? "(No preview available)";
  const summaryLines = summaryText.split("\n").filter((l) => l.trim().length > 0);
  if (summaryLines.length === 0) {
    rawLines.push(boxLine("   (No preview available)"));
  } else {
    for (const sLine of summaryLines.slice(0, 3)) {
      rawLines.push(boxLine(`   ${sLine}`));
    }
    if (summaryLines.length > 3) rawLines.push(boxLine("   ..."));
  }

  // Unresolved field provenance — honest empty state, never a fake "all resolved"
  rawLines.push(DIVIDER);
  rawLines.push(boxLine(" Unresolved Field Provenance:"));
  const provenance = p.unresolved_provenance ?? p.unresolved_fields_provenance;
  if (totalItems === 0) {
    rawLines.push(boxLine("   No results yet — run /research-deep to start waves."));
  } else if (Array.isArray(provenance) && provenance.length > 0) {
    const validProvenance = provenance.filter((item) => item !== null && item !== undefined);
    for (const item of validProvenance.slice(0, 4)) {
      if (typeof item === "string") {
        rawLines.push(boxLine(`   - ${item}`));
      } else if (typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        const fieldName = asString(itemObj.field) ?? "unknown_field";
        const attemptsInfo =
          itemObj.attempts !== undefined
            ? ` (${typeof itemObj.attempts === "object" ? JSON.stringify(itemObj.attempts) : String(itemObj.attempts)} attempts)`
            : "";
        const reasonInfo = asString(itemObj.reason) ? `: ${itemObj.reason}` : "";
        rawLines.push(boxLine(`   - ${fieldName}${attemptsInfo}${reasonInfo}`));
      } else {
        rawLines.push(boxLine(`   - ${String(item)}`));
      }
    }
    if (validProvenance.length > 4) {
      rawLines.push(boxLine(`   ... and ${validProvenance.length - 4} more unresolved field(s)`));
    }
  } else if (provenance && typeof provenance === "object") {
    const keys = Object.keys(provenance);
    for (const k of keys.slice(0, 4)) {
      const val = (provenance as Record<string, unknown>)[k];
      rawLines.push(boxLine(`   - ${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`));
    }
  } else {
    rawLines.push(boxLine("   None (all fields resolved)"));
  }

  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchReportPreviewRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-report-preview", (message, _options, theme) => {
    return renderResearchReportPreviewCard(extractPayload<ResearchReportPreviewPayload>(message), theme);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle dashboard
// ---------------------------------------------------------------------------

export function renderResearchDashboardCard(payload?: ResearchDashboardPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "unknown";
  const status = asString(p.status);
  const detail = asString(p.detail) === "compact" ? "compact" : "full";
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);

  const statusBadge = status ? colorize(`[${status}]`, theme.colors.badge, theme.monochrome) : "";
  rawLines.push(cardHeader("RESEARCH DASHBOARD — ", slug, status ? ` [${status}]` : "", status ? ` ${statusBadge}` : ""));

  const topic = asString(p.topic);
  if (topic) rawLines.push(boxLine(` Topic: ${topic}`));

  const freshnessText = freshnessSuffix(p.freshness, p.as_of);
  if (freshnessText) rawLines.push(boxLine(freshnessText));
  rawLines.push(DIVIDER);

  // Action first: the concrete next command (with slug), then the stepper.
  const nextCommand = asString(p.next_step_command) ?? asString(p.recommended_next_step);
  if (nextCommand) {
    rawLines.push(boxLine(" Next:"));
    rawLines.push(boxLine(`   ${nextCommand}`));
    rawLines.push(DIVIDER);
  }

  // Phase stepper with completed/current/upcoming marks.
  const statusWord = (status && (PIPELINE_STATUSES as readonly string[]).includes(status) ? status : undefined) as PipelineStatus | undefined;
  const currentPhase = statusWord ? phaseOf(statusWord) : (asNumber(p.current_phase) as 1 | 2 | 3 | undefined) ?? 1;
  rawLines.push(boxLine(` Pipeline: ${phaseStepper(currentPhase)}`));
  rawLines.push(DIVIDER);

  // Global completion metrics.
  rawLines.push(boxLine(" Global Completion Metrics:"));
  const metrics = p.global_metrics && typeof p.global_metrics === "object" ? (p.global_metrics as Record<string, unknown>) : {};
  const metricsCov = asNumber(metrics.coverage);
  const compItems = asNumber(metrics.completed_items);
  const totItems = asNumber(metrics.total_items);
  const covRatio = ratioOf(metricsCov ?? (compItems !== undefined && totItems && totItems > 0 ? compItems / totItems : undefined));
  const progressBar = makeProgressBar(covRatio, 8);
  rawLines.push(boxLine(`   Overall Progress: ${progressBar} ${Math.round(covRatio * 100)}%`));
  if (totItems !== undefined) {
    rawLines.push(boxLine(`   Items Completed: ${compItems ?? 0} / ${totItems}`));
  }
  const pendingItems = asNumber(p.pending_items) ?? (totItems !== undefined && compItems !== undefined ? Math.max(0, totItems - compItems) : undefined);
  if (pendingItems !== undefined) rawLines.push(boxLine(`   Pending Items: ${pendingItems}`));

  const totFields = asNumber(metrics.total_fields);
  if (totFields !== undefined) {
    // Fields ratio is capped at 1.0 — the numerator (fields found across result
    // JSONs) could previously exceed the fields.yaml denominator (=> >100%).
    const compFields = Math.min(totFields, asNumber(metrics.completed_fields) ?? 0);
    rawLines.push(boxLine(`   Fields Completed: ${compFields} / ${totFields}`));
  }
  const unresolvedCount = asNumber(p.unresolved_fields_count);
  if (unresolvedCount !== undefined) rawLines.push(boxLine(`   Unresolved Fields: ${unresolvedCount}`));

  const wavesRun = asNumber(p.waves_run);
  const maxWaves = asNumber(p.max_waves);
  if (wavesRun !== undefined || maxWaves !== undefined) {
    rawLines.push(boxLine(`   Waves: ${wavesRun ?? "?"}${maxWaves !== undefined ? ` / ${maxWaves}` : ""} run`));
  }
  rawLines.push(DIVIDER);

  // Project artifacts status.
  rawLines.push(boxLine(" Project Artifacts Status:"));
  const art = p.artifacts;
  if (Array.isArray(art)) {
    const validArt = art.filter((a) => a !== null && a !== undefined);
    for (const a of validArt.slice(0, 4)) {
      if (typeof a === "object") {
        const aObj = a as Record<string, unknown>;
        const aName = asString(aObj.name) ?? String(aObj.name ?? "artifact");
        const aStatus = asString(aObj.status) ?? String(aObj.status ?? "unknown");
        rawLines.push(boxLine(`   - ${aName}: ${aStatus}`));
      } else {
        rawLines.push(boxLine(`   - ${String(a)}: status unknown`));
      }
    }
  } else if (art && typeof art === "object") {
    const artObj = art as Record<string, unknown>;
    const outline = artObj.outline_yaml ? (asString(artObj.outline_yaml) ?? "Ready") : "Pending";
    const fields = artObj.fields_yaml ? (asString(artObj.fields_yaml) ?? "Ready") : "Pending";
    const results =
      artObj.results_json !== undefined && artObj.results_json !== null
        ? typeof artObj.results_json === "number"
          ? `${artObj.results_json} files`
          : String(artObj.results_json)
        : "Pending";
    const report = artObj.report_md ? (asString(artObj.report_md) ?? "Generated") : "Pending";
    rawLines.push(boxLine(`   - outline.yaml: ${outline}`));
    rawLines.push(boxLine(`   - fields.yaml: ${fields}`));
    rawLines.push(boxLine(`   - results/*.json: ${results}`));
    rawLines.push(boxLine(`   - report.md: ${report}`));
  } else {
    rawLines.push(boxLine("   - outline.yaml: Pending"));
    rawLines.push(boxLine("   - fields.yaml: Pending"));
    rawLines.push(boxLine("   - results/*.json: Pending"));
    rawLines.push(boxLine("   - report.md: Pending"));
  }

  // Explicit error section (instead of silently rendering defaults).
  const errors = Array.isArray(p.errors) ? p.errors.filter((e) => typeof e === "string") : [];
  if (errors.length > 0) {
    rawLines.push(DIVIDER);
    rawLines.push(boxLine(" Errors:"));
    for (const err of errors.slice(0, 4)) {
      rawLines.push(boxLine(`   ! ${err}`));
    }
  }

  if (detail === "full") {
    const path = asString(p.project_path);
    if (path) {
      rawLines.push(DIVIDER);
      rawLines.push(boxLine(` Path: ${truncateMiddle(path, INNER_WIDTH - 4)}`));
    }
  }

  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchDashboardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-dashboard", (message, _options, theme) => {
    return renderResearchDashboardCard(extractPayload<ResearchDashboardPayload>(message), theme);
  });
}

// ---------------------------------------------------------------------------
// Help overlay (new customType, namespaced per omp convention)
// ---------------------------------------------------------------------------

export function renderResearchHelpCard(payload?: ResearchHelpPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "research";
  const status = asString(p.status);
  const phase = asString(p.phase) ?? asNumber(p.phase);
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);

  const badgeText = status ?? (phase !== undefined ? `Phase ${phase}` : "");
  const badge = colorize(badgeText ? `[${badgeText}]` : "", theme.colors.badge, theme.monochrome);
  rawLines.push(cardHeader("RESEARCH HELP — ", slug, badgeText ? ` [${badgeText}]` : "", badgeText ? ` ${badge}` : ""));
  rawLines.push(DIVIDER);

  const nextStep = asString(p.next_step);
  if (nextStep) {
    rawLines.push(boxLine(" Next Step:"));
    rawLines.push(boxLine(`   ${nextStep}`));
    rawLines.push(DIVIDER);
  }

  const commands = Array.isArray(p.commands)
    ? p.commands.filter((c): c is { command: string; description: string } => Boolean(c && typeof c === "object"))
    : [];
  if (commands.length > 0) {
    rawLines.push(boxLine(" Commands:"));
    for (const c of commands.slice(0, 12)) {
      rawLines.push(boxLine(`   ${c.command} — ${c.description}`));
    }
    rawLines.push(DIVIDER);
  }

  const shortcuts = Array.isArray(p.shortcuts) ? p.shortcuts.filter((s) => s && typeof s === "object") : [];
  if (shortcuts.length > 0) {
    rawLines.push(boxLine(" Shortcuts:"));
    for (const s of shortcuts.slice(0, 6)) {
      const sObj = s as Record<string, unknown>;
      rawLines.push(boxLine(`   ${asString(sObj.key) ?? "?"} — ${asString(sObj.description) ?? ""}`));
    }
    rawLines.push(DIVIDER);
  }

  const env = p.env && typeof p.env === "object" ? (p.env as Record<string, string>) : {};
  const envKeys = Object.keys(env);
  if (envKeys.length > 0) {
    rawLines.push(boxLine(" Environment:"));
    for (const k of envKeys.slice(0, 6)) {
      rawLines.push(boxLine(`   ${k}=${String(env[k])}`));
    }
    rawLines.push(DIVIDER);
  }

  rawLines.push(boxLine(" Press F1 or run '/research help' from any phase."));
  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchHelpRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("my-omp-research-help", (message, _options, theme) => {
    return renderResearchHelpCard(extractPayload<ResearchHelpPayload>(message), theme);
  });
}

// ---------------------------------------------------------------------------
// Error card (new customType, namespaced per omp convention)
// ---------------------------------------------------------------------------

export function renderResearchErrorCard(payload?: ResearchErrorPayload, themeRaw?: unknown): Container {
  const p = toRecord(payload);
  const slug = asString(p.slug) ?? "research";
  const code = asString(p.code) ?? "ERROR";
  const message = asString(p.message) ?? "Something went wrong.";
  const hint = asString(p.hint);
  const theme = resolveResearchTheme(themeRaw);

  const rawLines: string[] = [];
  rawLines.push(TOP_BORDER);
  const badge = colorize(` [${code}]`, theme.colors.error, theme.monochrome);
  rawLines.push(boxLine(` RESEARCH ERROR — ${slug}${badge}`));
  rawLines.push(DIVIDER);
  rawLines.push(boxLine(` ${message}`));
  if (hint) {
    rawLines.push(DIVIDER);
    rawLines.push(boxLine(" Hint:"));
    rawLines.push(boxLine(`   ${hint}`));
  }
  rawLines.push(BOTTOM_BORDER);
  return buildContainer(rawLines);
}

export function installResearchErrorRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("my-omp-research-error", (message, _options, theme) => {
    return renderResearchErrorCard(extractPayload<ResearchErrorPayload>(message), theme);
  });
}
