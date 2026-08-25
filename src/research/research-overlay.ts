// Interactive Research Dashboard Overlay (SPEC-001).
//
// State-driven TUI component rendered through `ctx.ui.custom(...)`. Holds a list
// of research projects; one is "active" and exposes four tabs:
//   overview  — getResearchDashboardMetrics summary
//   items     — outline.yaml items (ResearchItemSpec[])
//   fields    — fields.yaml field dimensions
//   artifacts — outline/fields/results/report.md existence & state
//
// Keyboard:
//   Tab / Shift+Tab              cycle tabs forward / backward
//   1 - 4                       jump to tab
//   [ / ]                       previous / next project
//   p                           toggle the project picker overlay
//   ↑ / ↓ / j / k               scroll / move cursor in current tab
//   Enter                       run the payload's "next" command
//   d                           launch deep waves: /research-deep <slug>
//   r                           compile report:    /research-report <slug>
//   Esc / q                     dismiss overlay
//
// Empty state (0 projects): instead of the dashboard, render a guided 3-phase
// onboarding view describing how to scaffold the first project.
//
// Returns an action payload from `handleInput(...)`:
//   { action: "run", command }  — caller should pi.sendUserMessage(command)
//   { action: "dismiss" }       — caller should close the overlay

import { Container, Text } from "@oh-my-pi/pi-tui";
import {
  BORDER_COLORS,
  BOTTOM_BORDER,
  DIVIDER,
  TOP_BORDER,
  bold,
  boxLine,
  colorize,
  dim,
  displayWidth,
  italic,
  makeProgressBar,
  makeBottomBorder,
  makeDivider,
  makeTopBorder,
  padToWidth,
  statusBorderColor,
  starsFor,
  truncateToWidth,
} from "./research-format.ts";
import {
  getResearchDashboardMetrics,
  getResearchReviewPayload,
  listResearchSummaries,
  readOutlineItemSpecs,
  readFieldNames,
  readProject,
  type ResearchProjectSummary,
} from "./research-store.ts";
import { phaseOf, phaseStepper } from "./research-status.ts";
import { getWorkspaceContext } from "../core/workspace.ts";
import { findRepoRoot } from "../core/locators.ts";
import type {
  ResearchDashboardPayload,
  ResearchFieldSpec,
  ResearchItemSpec,
  ResearchReviewPayload,
} from "./research-renderer.ts";

export type ResearchOverlayTab = "overview" | "items" | "fields" | "artifacts";

export interface ResearchOverlayProjectEntry {
  slug: string;
  topic?: string;
  status?: string;
  phase?: number | string;
  artifactsReady?: boolean;
  itemsCount?: number;
  fieldsCount?: number;
}

export interface ResearchOverlayState {
  projects: ResearchOverlayProjectEntry[];
  activeProjectIndex: number;
  activeTab: ResearchOverlayTab;
  scrollOffsets: Record<ResearchOverlayTab, number>;
  selectedItemIndex: number;
  showProjectPicker: boolean;
}

export interface ResearchOverlayActionResult {
  action: "run";
  command?: string;
}

export type ResearchOverlayAction =
  | { action: "run"; command: string }
  | { action: "dismiss" };

export interface ResearchOverlayComponent {
  getState(): ResearchOverlayState;
  setActiveSlug(slug: string): void;
  invalidate(): void;
  render(width: number, height: number): Container;
  handleInput(key: string): ResearchOverlayAction | undefined;
}

export interface ResearchOverlayOptions {
  initialTab?: ResearchOverlayTab;
}

export type ResearchOverlayDone = (
  result: ResearchOverlayActionResult | { action: "dismiss" },
) => void;

const TABS: ResearchOverlayTab[] = ["overview", "items", "fields", "artifacts"];
const TAB_LABELS: Record<ResearchOverlayTab, string> = {
  overview: "Overview",
  items: "Items",
  fields: "Fields",
  artifacts: "Artifacts",
};
// Static single-digit hotkeys → tab name.
const TAB_KEY_INDEX: Record<string, ResearchOverlayTab> = {
  "1": "overview",
  "2": "items",
  "3": "fields",
  "4": "artifacts",
};

function projectDataPath(root: string, slug: string): string {
  const ctx = getWorkspaceContext(root);
  return `${ctx.knowledge.research}/${slug}`;
}
// Header & footer rows reserved by every non-empty render frame.
const HEADER_HEIGHT = 5; // top border + title + topic + tabs + bottom header border
const FOOTER_HEIGHT = 3; // top footer border + help line + bottom footer border
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;

interface ProjectData {
  dashboard: ResearchDashboardPayload;
  review: ResearchReviewPayload;
  itemSpecs?: ResearchItemSpec[];
  fieldNames?: ResearchFieldSpec[];
}

/** Clamp `value` into [lo, hi] (always inclusive); finite-fallback to `lo`. */
function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function projectEntryFromSummary(summary: ResearchProjectSummary, root: string): ResearchOverlayProjectEntry {
  const project = readProject(root, summary.slug);
  const metrics = project.payload.global_metrics ?? {};
  const artifacts =
    project.payload.artifacts && typeof project.payload.artifacts === "object" && !Array.isArray(project.payload.artifacts)
      ? project.payload.artifacts
      : undefined;
  const phase = typeof project.payload.current_phase === "number"
    ? project.payload.current_phase
    : phaseOf((project.payload.status ?? "OUTLINE") as Parameters<typeof phaseOf>[0]);
  return {
    slug: summary.slug,
    topic: summary.topic ?? project.payload.topic,
    status: typeof project.payload.status === "string" ? project.payload.status : undefined,
    phase,
    artifactsReady: Boolean(artifacts?.report_md),
    itemsCount: metrics.total_items,
    fieldsCount: metrics.total_fields,
  };
}

function findActiveIndex(projects: ResearchOverlayProjectEntry[], slug?: string): number {
  if (!slug) return 0;
  for (let i = 0; i < projects.length; i++) {
    if (projects[i]?.slug === slug) return i;
  }
  return 0;
}

function nextTab(tab: ResearchOverlayTab, delta: number): ResearchOverlayTab {
  const idx = TABS.indexOf(tab);
  const next = (idx + delta + TABS.length) % TABS.length;
  return TABS[next] ?? "overview";
}

function rowsToContainer(lines: string[]): Container {
  const container = new Container();
  for (const line of lines) container.addChild(new Text(line, 0, 0));
  return container;
}

export class ResearchOverlay implements ResearchOverlayComponent {
  private root: string;
  private state: ResearchOverlayState;
  private cache: Map<string, ProjectData> = new Map();
  private width: number;
  private height: number;
  private onDone?: ResearchOverlayDone;

  constructor(
    root: string,
    initialSlug?: string,
    initialTab: ResearchOverlayTab = "overview",
    onDone?: ResearchOverlayDone,
    width: number = DEFAULT_WIDTH,
    height: number = DEFAULT_HEIGHT,
  ) {
    this.root = root || findRepoRoot();
    this.onDone = onDone;
    const summaries = listResearchSummaries(this.root, false);
    // Slugs are date-prefixed (`YYYY-MM-DD_<topic>`); sort ascending (oldest
    // first) so the picker reads chronologically, not the store's reverse-lex.
    const projects = summaries
      .map((s) => projectEntryFromSummary(s, this.root))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    this.state = {
      projects,
      activeProjectIndex: findActiveIndex(projects, initialSlug),
      activeTab: initialTab,
      scrollOffsets: { overview: 0, items: 0, fields: 0, artifacts: 0 },
      selectedItemIndex: 0,
      showProjectPicker: false,
    };
    this.width = Math.max(40, width);
    this.height = Math.max(12, height);
  }
  getState(): ResearchOverlayState {
    return {
      ...this.state,
      projects: [...this.state.projects],
      scrollOffsets: { ...this.state.scrollOffsets },
    };
  }

  setActiveSlug(slug: string): void {
    const idx = findActiveIndex(this.state.projects, slug);
    this.state.activeProjectIndex = idx;
  }

  invalidate(): void {
    this.cache.clear();
    const summaries = listResearchSummaries(this.root, false);
    this.state.projects = summaries
      .map((s) => projectEntryFromSummary(s, this.root))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    if (this.state.activeProjectIndex >= this.state.projects.length) {
      this.state.activeProjectIndex = Math.max(0, this.state.projects.length - 1);
    }
  }

  private currentProject(): ResearchOverlayProjectEntry | undefined {
    return this.state.projects[this.state.activeProjectIndex];
  }

  private currentData(): ProjectData | undefined {
    const proj = this.currentProject();
    if (!proj) return undefined;
    const cached = this.cache.get(proj.slug);
    if (cached) return cached;
    const projectDir = projectDataPath(this.root, proj.slug);
    const project = readProject(this.root, proj.slug);
    // Use the dedicated emitters so dashboard + review consumers share the
    // exact same data flow as the rest of the suite (vs reading the bundled
    // dashboard payload only).
    const dashboard = getResearchDashboardMetrics(projectDir, proj.slug);
    const review = getResearchReviewPayload(projectDir, proj.slug);
    const itemSpecs = readOutlineItemSpecs(projectDir);
    const fieldNames = readFieldNames(projectDir);
    const fresh: ProjectData = {
      dashboard: project.payload ?? dashboard,
      review,
      itemSpecs,
      fieldNames: fieldNames?.map((name) => ({ name }) as ResearchFieldSpec),
    };
    this.cache.set(proj.slug, fresh);
    return fresh;
  }

  private statusBorder(status?: string): string {
    return statusBorderColor(status);
  }

  private headerLines(): string[] {
    const proj = this.currentProject();
    const slugText = proj?.slug ?? "(no project)";
    const topicText = proj?.topic ?? "";
    const statusText = proj?.status ?? "UNKNOWN";
    const inner = Math.max(20, this.width - 2);
    const borderColor = this.statusBorder(statusText);

    const total = this.state.projects.length;
    const currentNum = total > 0 ? this.state.activeProjectIndex + 1 : 0;
    const counter = total > 1 ? ` ◄ (${currentNum}/${total}) ►` : "";
    const badge = ` [${statusText}]`;
    const title = `  ${bold("Research Dashboard")} — ${slugText}${colorize(counter, BORDER_COLORS.dim)}${colorize(badge, borderColor)}`;
    const topicLine = topicText
      ? `  🎯 ${bold("Topic:")} ${italic(truncateToWidth(topicText, inner - 14))}`
      : `  🎯 ${bold("Topic:")} ${dim("(not set)")}`;

    const tabSegments = TABS.map((t, i) => {
      const isActive = t === this.state.activeTab;
      const marker = isActive ? colorize("●", BORDER_COLORS.cyan) : colorize("○", BORDER_COLORS.dim);
      const label = isActive ? bold(TAB_LABELS[t]) : TAB_LABELS[t];
      return `${marker} [${i + 1}] ${label}`;
    });
    const tabLine = `  ${tabSegments.join("   ")}`;

    return [
      makeTopBorder(borderColor),
      padToWidth(truncateToWidth(title, inner), inner),
      topicLine,
      tabLine,
      makeBottomBorder(borderColor),
    ];
  }

  private renderEmptyState(): string[] {
    const inner = Math.max(20, this.width - 2);
    const borderColor = BORDER_COLORS.cyan;
    const lines: string[] = [
      makeTopBorder(borderColor),
      boxLine(`  🎯 Welcome — Research Dashboard is empty`, borderColor),
      boxLine(`  ${" ".repeat(inner - 2)}`, borderColor),
      boxLine(`  📊 ${bold("Phase 1 — Outline")}`, borderColor),
      boxLine(`     ${colorize("Run `/research <topic>` to scaffold a project", BORDER_COLORS.cyan)}`, borderColor),
      boxLine(`     ${dim("outline.yaml + fields.yaml + research.md")}`, borderColor),
      boxLine(`  ⚡ ${bold("Phase 2 — Deep Waves")}`, borderColor),
      boxLine(`     ${colorize("Run `/research-deep <slug>` for parallel OODA", BORDER_COLORS.cyan)}`, borderColor),
      boxLine(`     ${dim("subagents filling items × fields matrix")}`, borderColor),
      boxLine(`  🧭 ${bold("Phase 3 — Report")}`, borderColor),
      boxLine(`     ${colorize("Run `/research-report <slug>` to compile", BORDER_COLORS.cyan)}`, borderColor),
      boxLine(`     ${dim("comparative findings into report.md")}`, borderColor),
      boxLine(`  ${" ".repeat(inner - 2)}`, borderColor),
      boxLine(`  Press ${bold("q")} or ${bold("Esc")} to dismiss this overlay.`, borderColor),
      makeBottomBorder(borderColor),
    ];
    return lines;
  }

  private renderProjectPicker(): string[] {
    const inner = Math.max(20, this.width - 2);
    const lines: string[] = [];
    const borderColor = BORDER_COLORS.magenta;
    const sub = "─".repeat(inner - 2);
    lines.push(makeTopBorder(borderColor));
    lines.push(boxLine(`  📁 ${bold("Select a research project")} · [p] to close`, borderColor));
    lines.push(boxLine(`  ${sub}`, borderColor));
    if (this.state.projects.length === 0) {
      lines.push(boxLine(`  ⭕ (no projects on disk)`, borderColor));
    } else {
      this.state.projects.forEach((p, i) => {
        const isActive = i === this.state.activeProjectIndex;
        const marker = isActive ? colorize("●", BORDER_COLORS.cyan) : colorize("○", BORDER_COLORS.dim);
        const label = `${marker} ${i + 1}. ${isActive ? bold(p.slug) : p.slug}`;
        const phaseTxt = typeof p.phase === "number" ? `phase ${p.phase}` : p.phase ? String(p.phase) : "";
        const meta = `[${p.status ?? "?"}]${phaseTxt ? ` · ${phaseTxt}` : ""}`;
        const metaColored = colorize(meta, BORDER_COLORS.dim);
        const text = `  ${label}  ${metaColored}`;
        lines.push(boxLine(text, borderColor));
      });
    }
    lines.push(boxLine(`  ${sub}`, borderColor));
    lines.push(boxLine(`  ${dim("[ / ] cycle · j/k move · Enter open · p close")}`, borderColor));
    lines.push(makeBottomBorder(borderColor));
    return lines;
  }

  private renderOverview(): string[] {
    const data = this.currentData();
    const inner = Math.max(20, this.width - 2);
    const borderColor = this.statusBorder(data?.dashboard.status);
    const lines: string[] = [makeTopBorder(borderColor)];
    if (!data) {
      lines.push(boxLine(`  ⭕ No project selected`, borderColor));
      lines.push(makeBottomBorder(borderColor));
      return lines;
    }
    const dashboard = data.dashboard;
    const metrics = dashboard.global_metrics ?? {};
    const totalItems = metrics.total_items ?? 0;
    const completedItems = metrics.completed_items ?? 0;
    const totalFields = metrics.total_fields ?? 0;
    const completedFields = metrics.completed_fields ?? 0;
    const coverageValue =
      typeof metrics.coverage === "number"
        ? metrics.coverage
        : totalFields > 0 ? completedFields / totalFields : 0;
    const ratio = Math.max(0, Math.min(1, coverageValue > 1 ? coverageValue / 100 : coverageValue));
    const progressBar = colorize(makeProgressBar(ratio, 8), BORDER_COLORS.green);
    const statusWord = typeof dashboard.status === "string" ? dashboard.status : "UNKNOWN";
    const pipelineStatus = (statusWord as Parameters<typeof phaseOf>[0]);
    const phase = phaseOf(pipelineStatus);
    const stepper = colorize(phaseStepper(phase), BORDER_COLORS.cyan);

    const artifacts = dashboard.artifacts && typeof dashboard.artifacts === "object" && !Array.isArray(dashboard.artifacts)
      ? dashboard.artifacts
      : undefined;
    const reportReady = artifacts?.report_md
      ? colorize("🟢 generated", BORDER_COLORS.green)
      : colorize("⏳ pending", BORDER_COLORS.yellow);
    const outlineReady = artifacts?.outline_yaml ? colorize("🟡", BORDER_COLORS.yellow) : colorize("⚪", BORDER_COLORS.dim);
    const fieldsReady = artifacts?.fields_yaml ? colorize("🟡", BORDER_COLORS.yellow) : colorize("⚪", BORDER_COLORS.dim);
    const resultsReady = artifacts?.results_json ? colorize("🟢", BORDER_COLORS.green) : colorize("⚪", BORDER_COLORS.dim);

    lines.push(boxLine(`  🎯 Lifecycle: [${statusWord}] · ${stepper}`, borderColor));
    lines.push(boxLine(`  📊 Coverage: ${progressBar} ${Math.round(ratio * 100)}%`, borderColor));
    lines.push(boxLine(`     items ${completedItems}/${totalItems} · fields ${completedFields}/${totalFields}`, borderColor));
    lines.push(boxLine(`  ⚡ Artifacts: ${outlineReady} outline · ${fieldsReady} fields · ${resultsReady} results · ${reportReady} report`, borderColor));

    const dag = dashboard.dag;
    if (dag && dag.enabled) {
      const cycleTag = dag.has_cycles ? colorize(" · ⚠ cycles", BORDER_COLORS.red) : "";
      lines.push(
        boxLine(
          `  🕸️ DAG: ${dag.completed_nodes ?? 0}/${dag.total_nodes ?? 0} done · ${dag.ready_nodes ?? 0} ready${cycleTag}`,
          borderColor,
        ),
      );
    }

    const refs = Array.isArray(dashboard.discovered_references) ? dashboard.discovered_references : [];
    if (refs.length > 0) {
      const top = refs.slice(0, 3).map((r) => r.name).join(", ");
      lines.push(boxLine(`  📦 Top refs: ${truncateToWidth(top, inner - 14)}`, borderColor));
    }

    const preview = Array.isArray(dashboard.findings_preview) ? dashboard.findings_preview : [];
    if (preview.length > 0) {
      lines.push(boxLine(`  🧭 Findings preview:`, borderColor));
      for (const item of preview.slice(0, 3)) {
        const text = item.summary ?? item.name;
        lines.push(boxLine(`     - ${truncateToWidth(text, inner - 6)}`, borderColor));
      }
    }

    const nextCmd = dashboard.next_step_command ?? dashboard.recommended_next_step;
    if (nextCmd) {
      lines.push(boxLine(`  ▶️ Next: ${colorize(truncateToWidth(nextCmd, inner - 9), BORDER_COLORS.cyan)}`, borderColor));
    }

    lines.push(makeBottomBorder(borderColor));
    return lines;
  }

  private renderItems(): string[] {
    const data = this.currentData();
    const inner = Math.max(20, this.width - 2);
    const usableHeight = Math.max(4, this.height - HEADER_HEIGHT - FOOTER_HEIGHT);
    const items: ResearchItemSpec[] = data?.itemSpecs ?? data?.review.items ?? [];
    const borderColor = BORDER_COLORS.cyan;
    const lines: string[] = [makeTopBorder(borderColor)];
    lines.push(boxLine(`  📋 ${bold("Items")} (${items.length}) — ↑/↓ select · Enter run`, borderColor));
    if (items.length === 0) {
      lines.push(boxLine(`  ⭕ (no items defined — outline.yaml missing)`, borderColor));
    } else {
      const start = clampInt(this.state.scrollOffsets.items, 0, Math.max(0, items.length - 1));
      const visible = items.slice(start, start + usableHeight);
      visible.forEach((item, i) => {
        const idx = start + i;
        const isActive = idx === this.state.selectedItemIndex;
        const marker = isActive ? colorize("●", BORDER_COLORS.green) : colorize("○", BORDER_COLORS.dim);
        const name = item.name ?? item.id ?? "?";
        const status = item.status ? colorize(` [${item.status}]`, BORDER_COLORS.dim) : "";
        const cat = item.category ? dim(` (${item.category})`) : "";
        const text = `  ${marker} ${truncateToWidth(name, Math.max(8, inner - 16))}${cat}${status}`;
        lines.push(boxLine(text, borderColor));
      });
      if (start + usableHeight < items.length) {
        lines.push(boxLine(`  ↪ ${items.length - start - usableHeight} more below`, borderColor));
      }
    }
    lines.push(makeBottomBorder(borderColor));
    return lines;
  }

  private renderFields(): string[] {
    const data = this.currentData();
    const inner = Math.max(20, this.width - 2);
    const usableHeight = Math.max(4, this.height - HEADER_HEIGHT - FOOTER_HEIGHT);
    const fields: ResearchFieldSpec[] = data?.review.fields ?? [];
    const borderColor = BORDER_COLORS.magenta;
    const lines: string[] = [makeTopBorder(borderColor)];
    lines.push(boxLine(`  🧬 ${bold("Fields")} (${fields.length})`, borderColor));
    if (fields.length === 0) {
      lines.push(boxLine(`  ⭕ (no field dimensions defined — fields.yaml missing)`, borderColor));
    } else {
      const start = clampInt(this.state.scrollOffsets.fields, 0, Math.max(0, fields.length - 1));
      const visible = fields.slice(start, start + usableHeight);
      visible.forEach((field, i) => {
        const idx = start + i;
        const isActive = idx === this.state.selectedItemIndex;
        const marker = isActive ? colorize("●", BORDER_COLORS.green) : colorize("○", BORDER_COLORS.dim);
        const name = field.name ?? "?";
        const cat = field.category ? dim(` (${field.category})`) : "";
        const stars = field.detail_level ? ` ${starsFor(field.detail_level)}` : "";
        const text = `  ${marker} ${truncateToWidth(name, Math.max(8, inner - 18))}${stars}${cat}`;
        lines.push(boxLine(text, borderColor));
      });
      if (start + usableHeight < fields.length) {
        lines.push(boxLine(`  ↪ ${fields.length - start - usableHeight} more below`, borderColor));
      }
    }
    lines.push(makeBottomBorder(borderColor));
    return lines;
  }

  private renderArtifacts(): string[] {
    const data = this.currentData();
    const inner = Math.max(20, this.width - 2);
    const borderColor = BORDER_COLORS.blue;
    const lines: string[] = [makeTopBorder(borderColor)];
    lines.push(boxLine(`  📦 ${bold("Artifacts inventory")}`, borderColor));
    if (!data) {
      lines.push(boxLine(`  ⭕ (no project)`, borderColor));
    } else {
      const artifacts = data.dashboard.artifacts && typeof data.dashboard.artifacts === "object" && !Array.isArray(data.dashboard.artifacts)
        ? data.dashboard.artifacts
        : undefined;
      const rows: Array<{ name: string; state: boolean | string | number | undefined }> = [
        { name: "outline.yaml", state: artifacts?.outline_yaml },
        { name: "fields.yaml", state: artifacts?.fields_yaml },
        { name: "results/*.json", state: artifacts?.results_json },
        { name: "report.md", state: artifacts?.report_md },
      ];
      rows.forEach((row) => {
        const present = row.state ? colorize("🟢", BORDER_COLORS.green) : colorize("⚪", BORDER_COLORS.dim);
        const value = typeof row.state === "string" || typeof row.state === "number" ? String(row.state) : "";
        const valueColored = value ? colorize(truncateToWidth(value, inner - 24), BORDER_COLORS.dim) : "";
        const text = `  ${present} ${row.name}${value ? `  ${valueColored}` : ""}`;
        lines.push(boxLine(text, borderColor));
      });
      const findings = Array.isArray(data.dashboard.findings_preview) ? data.dashboard.findings_preview : [];
      if (findings.length > 0) {
        lines.push(`  ${makeDivider(borderColor)}`);
        lines.push(boxLine(`  🧭 ${bold("Findings preview")} (${findings.length}):`, borderColor));
        for (const f of findings.slice(0, 3)) {
          const label = f.summary ?? f.name ?? "—";
          lines.push(boxLine(`     - ${truncateToWidth(label, inner - 6)}`, borderColor));
        }
      }
    }
    lines.push(makeBottomBorder(borderColor));
    return lines;
  }

  private renderHelp(): string[] {
    const inner = Math.max(20, this.width - 2);
    const helpLine = `  ${bold("⟨Enter: Run Next⟩")}  ${bold("⟨d: Deep Waves⟩")}  ${bold("⟨r: Report⟩")}  ${bold("⟨[ / ]: Switch⟩")}  ${bold("⟨Esc: Close⟩")}`;
    return [
      makeTopBorder(BORDER_COLORS.dim),
      boxLine(helpLine, BORDER_COLORS.dim),
      makeBottomBorder(BORDER_COLORS.dim),
    ];
  }

  private renderBody(): string[] {
    if (this.state.projects.length === 0) return this.renderEmptyState();
    if (this.state.showProjectPicker) return this.renderProjectPicker();
    switch (this.state.activeTab) {
      case "overview":
        return this.renderOverview();
      case "items":
        return this.renderItems();
      case "fields":
        return this.renderFields();
      case "artifacts":
        return this.renderArtifacts();
    }
  }

  render(width: number, height: number): Container {
    this.width = Math.max(40, width);
    this.height = Math.max(12, height);
    const lines: string[] = [];
    if (this.state.projects.length > 0) lines.push(...this.headerLines());
    lines.push(...this.renderBody());
    lines.push(...this.renderHelp());
    if (lines.length > this.height) lines.length = this.height;
    return rowsToContainer(lines);
  }

  private runCommandForActive(): string | undefined {
    const data = this.currentData();
    if (!data) return undefined;
    const next = data.dashboard.next_step_command ?? data.dashboard.recommended_next_step;
    if (typeof next === "string" && next.trim().length > 0) return next;
    const slug = this.currentProject()?.slug;
    if (!slug) return undefined;
    const status = (data.dashboard.status ?? "").toUpperCase();
    if (status.includes("OUTLINE")) return `/research-deep ${slug}`;
    if (status.includes("RUNNING") || status.includes("CONVERGED")) return `/research-report ${slug}`;
    return `/research status ${slug}`;
  }

  handleInput(key: string): ResearchOverlayAction | undefined {
    if (this.state.projects.length === 0) {
      if (key === "q" || key === "\x1b" || key === "\x1b\x1b" || key === "\r" || key === "\x03") {
        const action: ResearchOverlayAction = { action: "dismiss" };
        this.onDone?.({ action: "dismiss" });
        return action;
      }
      return undefined;
    }

    if (this.state.showProjectPicker) {
      if (key === "p" || key === "\x1b") {
        this.state.showProjectPicker = false;
      } else if (key === "[") {
        this.cycleProject(-1);
      } else if (key === "]") {
        this.cycleProject(1);
      } else if (key === "j" || key === "\x1b[B") {
        this.cycleProject(1);
      } else if (key === "k" || key === "\x1b[A") {
        this.cycleProject(-1);
      } else if (key === "\r") {
        this.state.showProjectPicker = false;
      }
      return undefined;
    }

    if (key === "q" || key === "\x1b" || key === "\x1b\x1b" || key === "\x03") {
      const action: ResearchOverlayAction = { action: "dismiss" };
      this.onDone?.({ action: "dismiss" });
      return action;
    }
    if (key === "p") {
      this.state.showProjectPicker = true;
      return undefined;
    }
    if (key === "[") {
      this.cycleProject(-1);
      return undefined;
    }
    if (key === "]") {
      this.cycleProject(1);
      return undefined;
    }

    const tabKey = TAB_KEY_INDEX[key];
    if (tabKey) {
      this.state.activeTab = tabKey;
      return undefined;
    }
    if (key === "\t") {
      this.state.activeTab = nextTab(this.state.activeTab, 1);
      return undefined;
    }
    if (key === "\x1b[Z" || key === "BTab") {
      this.state.activeTab = nextTab(this.state.activeTab, -1);
      return undefined;
    }

    if (key === "j" || key === "\x1b[B") {
      this.moveSelection(1);
      return undefined;
    }
    if (key === "k" || key === "\x1b[A") {
      this.moveSelection(-1);
      return undefined;
    }
    if (key === "d") {
      const slug = this.currentProject()?.slug;
      if (!slug) return undefined;
      const action: ResearchOverlayAction = { action: "run", command: `/research-deep ${slug}` };
      this.onDone?.(action);
      return action;
    }
    if (key === "r") {
      const slug = this.currentProject()?.slug;
      if (!slug) return undefined;
      const action: ResearchOverlayAction = { action: "run", command: `/research-report ${slug}` };
      this.onDone?.(action);
      return action;
    }
    if (key === "\r") {
      const cmd = this.runCommandForActive();
      if (!cmd) return undefined;
      const action: ResearchOverlayAction = { action: "run", command: cmd };
      this.onDone?.(action);
      return action;
    }
    return undefined;
  }

  private cycleProject(delta: number): void {
    const n = this.state.projects.length;
    if (n === 0) return;
    this.state.activeProjectIndex = (this.state.activeProjectIndex + delta + n) % n;
    this.state.scrollOffsets[this.state.activeTab] = 0;
    this.state.selectedItemIndex = 0;
    this.cache.clear();
  }

  private moveSelection(delta: number): void {
    const data = this.currentData();
    if (!data) {
      this.state.selectedItemIndex = 0;
      return;
    }
    const tab = this.state.activeTab;
    let max = 0;
    if (tab === "items") {
      const len = data.itemSpecs?.length ?? data.review.items?.length ?? 0;
      max = len;
    } else if (tab === "fields") {
      max = data.review.fields?.length ?? 0;
    } else {
      return; // overview / artifacts have no cursor
    }
    const next = clampInt(this.state.selectedItemIndex + delta, 0, Math.max(0, max - 1));
    this.state.selectedItemIndex = next;
    const visible = Math.max(4, this.height - HEADER_HEIGHT - FOOTER_HEIGHT);
    const cur = clampInt(this.state.scrollOffsets[tab], 0, Math.max(0, max - 1));
    if (next < cur) this.state.scrollOffsets[tab] = next;
    else if (next >= cur + visible) this.state.scrollOffsets[tab] = next - visible + 1;
  }
}

/**
 * Create a new interactive Research Dashboard overlay. Loads the project list
 * for `root` and pre-selects `initialSlug` if it exists.
 */
export function createResearchOverlay(
  root: string,
  initialSlug?: string,
  initialTab: ResearchOverlayTab = "overview",
  onDone?: ResearchOverlayDone,
  options: ResearchOverlayOptions = {},
): ResearchOverlayComponent {
  const resolvedRoot = root && root.trim().length > 0 ? root : findRepoRoot();
  const wantedTab = options.initialTab ?? initialTab ?? "overview";
  return new ResearchOverlay(resolvedRoot, initialSlug, wantedTab, onDone);
}

