// Interactive Council Verdict Overlay
//
// Tabs:
//   [1] Verdict & Consensus    — Consensus Invariants, Majority, Divergences, Summary
//   [2..N+1] Persona tabs      — stance / recommendation / invariants / caveats / confidence
//
// Keyboard navigation (modeled after research-overlay.ts):
//   1-9 / Tab / Shift+Tab      switch tabs
//   j / k or Up / Down         scroll the active tab
//   s                          returns { action: "save" } to the caller (dispatch not wired yet)
//   Enter                      returns { action: "implement" } to the caller (dispatch not wired yet)
//   Esc / q                    dismiss overlay
//
// The overlay is state-driven: `handleInput(key)` mutates `state` and returns a
// structured `CouncilOverlayAction` for the caller. Dispatch is NOT wired yet, so
// do not advertise action keys in `renderHelp()`; when it is wired, route it
// through `dispatchCommandLine`/`invokeCommandSpec` in src/index.ts — NEVER
// `pi.sendUserMessage` (ADR-0008 §3).
//
// The TUI renders fixed-width strings through `renderCouncilVerdictCard` so
// the verdict stays consistent with the chat-rendered verdict card.

import { Container, Text } from "@oh-my-pi/pi-tui";
import {
  BORDER_COLORS,
  bold,
  boxLine,
  colorize,
  dim,
  makeBottomBorder,
  makeDivider,
  makeTopBorder,
  truncateToWidth,
} from "../research/research-format.ts";
import type { CouncilOpinion, CouncilVerdict } from "./council.ts";

export type CouncilOverlayTab = "verdict" | `persona-${number}`;

export interface CouncilOverlayState {
  activeTab: CouncilOverlayTab;
  scrollOffsets: Record<CouncilOverlayTab, number>;
}

export type CouncilOverlayAction =
  | { action: "save"; topic: string }
  | { action: "implement"; topic: string; invariants: string[] }
  | { action: "dismiss" };

export interface CouncilOverlayComponent {
  getState(): CouncilOverlayState;
  setVerdict(verdict: CouncilVerdict): void;
  invalidate(): void;
  render(width: number, height: number): Container;
  renderLines(width: number, height?: number): readonly string[];
  handleInput(key: string): CouncilOverlayAction | undefined;
}

export type CouncilOverlayDone = (result: CouncilOverlayAction) => void;

function defaultPersonaLabel(index: number): string {
  if (index < 26) {
    return `Persona ${String.fromCharCode(65 + index)}`;
  }
  return `Persona ${index + 1}`;
}

const DEFAULT_WIDTH = 84;
const DEFAULT_HEIGHT = 26;
const HEADER_HEIGHT = 6; // top border + title + topic + tabs + bottom header border + 1 spacer
const FOOTER_HEIGHT = 3; // top footer border + help line + bottom footer border

/** Clamp `value` into [lo, hi]; finite-fallback to `lo`. */
function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function rowsToContainer(lines: string[]): Container {
  const container = new Container();
  for (const line of lines) container.addChild(new Text(line, 0, 0));
  return container;
}

export class CouncilOverlay implements CouncilOverlayComponent {
  private verdict: CouncilVerdict;
  private state: CouncilOverlayState;
  private width: number;
  private height: number;
  private onDone?: CouncilOverlayDone;
  private done = false;
  constructor(verdict: CouncilVerdict, onDone?: CouncilOverlayDone, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
    this.verdict = verdict;
    this.onDone = onDone;
    this.width = Math.max(48, width);
    this.height = Math.max(14, height);
    this.state = {
      activeTab: "verdict",
      scrollOffsets: { verdict: 0, ...Object.fromEntries((verdict.opinions ?? []).map((_, i) => [`persona-${i}`, 0])) },
    };
  }

  getState(): CouncilOverlayState {
    return {
      ...this.state,
      scrollOffsets: { ...this.state.scrollOffsets },
    };
  }

  setVerdict(verdict: CouncilVerdict): void {
    this.verdict = verdict;
    const tabs = this.getTabs();
    if (!tabs.includes(this.state.activeTab)) {
      this.state.activeTab = "verdict";
    }
    const newOffsets: Record<CouncilOverlayTab, number> = { verdict: 0 };
    for (const tab of tabs) {
      const max = this.maxScrollForTab(tab);
      const current = this.state.scrollOffsets[tab] ?? 0;
      newOffsets[tab] = clampInt(current, 0, max);
    }
    this.state.scrollOffsets = newOffsets;
  }

  private getTabs(): CouncilOverlayTab[] {
    const opinions = this.verdict.opinions ?? [];
    const tabs: CouncilOverlayTab[] = ["verdict"];
    for (let i = 0; i < opinions.length; i++) {
      tabs.push(`persona-${i}`);
    }
    return tabs;
  }

  private personaIndexFromTab(tab: CouncilOverlayTab): number {
    const match = tab.match(/^persona-(\d+)$/);
    return match ? parseInt(match[1]!, 10) : -1;
  }

  /** Tab-bar label. Persona names appear in the tab body, not the bar, so the bar's width depends only on the persona count. */
  private getTabLabel(tab: CouncilOverlayTab): string {
    if (tab === "verdict") return "Verdict & Consensus";
    const idx = this.personaIndexFromTab(tab);
    return idx >= 0 ? defaultPersonaLabel(idx) : tab;
  }

  private nextTab(delta: number): CouncilOverlayTab {
    const tabs = this.getTabs();
    if (tabs.length === 0) return "verdict";
    const idx = tabs.indexOf(this.state.activeTab);
    const current = idx >= 0 ? idx : 0;
    const next = (current + delta + tabs.length) % tabs.length;
    return tabs[next] ?? "verdict";
  }

  private maxScrollForTab(tab: CouncilOverlayTab): number {
    if (tab === "verdict") {
      return Math.max(
        0,
        (this.verdict.consensusInvariants?.length ?? 0) +
          (this.verdict.majorityRecommendations?.length ?? 0) +
          (this.verdict.criticalDivergences?.length ?? 0) +
          8,
      );
    }
    const idx = this.personaIndexFromTab(tab);
    if (idx >= 0) {
      const op = this.verdict.opinions?.[idx];
      return Math.max(0, (op?.keyInvariants?.length ?? 0) + (op?.caveats?.length ?? 0) + 4);
    }
    return 0;
  }

  invalidate(): void {
    /* state-only component; nothing to cache. */
  }

  /** Render a header strip: title + topic + tab bar. */
  private headerLines(): string[] {
    const inner = Math.max(20, this.width - 2);
    const borderColor = BORDER_COLORS.cyan;
    const title = `  ${bold("⚖️  Council Verdict Overlay")} ◄ ${this.verdict.councilName} · ${this.verdict.mode.toUpperCase()} ►`;
    const topicText = this.verdict.topic || "(no topic)";
    const topicLine = `  🎯 ${bold("Topic:")} ${truncateToWidth(topicText, inner - 12)}`;

    const tabs = this.getTabs();
    const tabSegments = tabs.map((t, i) => {
      const isActive = t === this.state.activeTab;
      const marker = isActive ? colorize("●", BORDER_COLORS.cyan) : colorize("○", BORDER_COLORS.dim);
      const rawLabel = this.getTabLabel(t);
      const label = isActive ? bold(rawLabel) : rawLabel;
      const keyHint = i < 9 ? `[${i + 1}] ` : "";
      return `${marker} ${keyHint}${label}`;
    });
    const tabLine = truncateToWidth(`  ${tabSegments.join("   ")}`, inner);

    return [
      makeTopBorder(borderColor),
      truncateToWidth(title, inner),
      topicLine,
      tabLine,
      makeDivider(borderColor),
    ];
  }

  private renderHelp(): string[] {
    const helpLine = `  ${bold("⟨j/k: Scroll⟩")}  ${bold("⟨Tab: Next Tab⟩")}  ${bold("⟨Esc: Close⟩")}`;
    return [
      makeDivider(BORDER_COLORS.dim),
      boxLine(helpLine, BORDER_COLORS.dim),
      makeBottomBorder(BORDER_COLORS.dim),
    ];
  }

  /** Render a scrollable section (title + scrollable body lines) inside the
   *  active tab's allotted row budget. */
  private scrollableSection(
    title: string,
    bodyLines: string[],
    tab: CouncilOverlayTab,
    borderColor: string,
    emptyMessage: string,
  ): string[] {
    const inner = Math.max(20, this.width - 2);
    const usableHeight = Math.max(4, this.height - HEADER_HEIGHT - FOOTER_HEIGHT - 1);
    const out: string[] = [makeTopBorder(borderColor)];
    out.push(boxLine(`  ${title}`, borderColor));

    if (bodyLines.length === 0) {
      out.push(boxLine(`  ⭕ ${emptyMessage}`, borderColor));
    } else {
      const start = clampInt(this.state.scrollOffsets[tab], 0, Math.max(0, bodyLines.length - 1));
      const visible = bodyLines.slice(start, start + usableHeight);
      visible.forEach((line) => out.push(boxLine(line, borderColor)));
      if (start + usableHeight < bodyLines.length) {
        out.push(boxLine(`  ↪ ${bodyLines.length - start - usableHeight} more below`, borderColor));
      }
    }
    return out;
  }

  private renderVerdict(): string[] {
    const v = this.verdict;
    const borderColor = v.consensusInvariants.length > 0
      ? BORDER_COLORS.green
      : v.criticalDivergences.length > 0 ? BORDER_COLORS.yellow : BORDER_COLORS.cyan;
    const inner = Math.max(20, this.width - 2);
    const body: string[] = [];

    // Summary always visible at the top of the section.
    body.push(`  � ${bold("Summary:")} ${truncateToWidth(v.verdictSummary || "(no summary)", inner - 14)}`);
    body.push(`  ${makeDivider(borderColor)}`);
    body.push(`  🟢 ${bold("Consensus Invariants (3/3)")} — ${v.consensusInvariants.length}`);
    if (v.consensusInvariants.length === 0) {
      body.push(`     ${dim("(no unanimous invariants established)")}`);
    } else {
      for (const inv of v.consensusInvariants) {
        body.push(`     • ${truncateToWidth(inv, inner - 8)}`);
      }
    }
    body.push(`  ${makeDivider(borderColor)}`);
    body.push(`  🟡 ${bold("Majority Recommendations (2/3)")} — ${v.majorityRecommendations.length}`);
    if (v.majorityRecommendations.length === 0) {
      body.push(`     ${dim("(no majority recommendations)")}`);
    } else {
      for (const m of v.majorityRecommendations) {
        body.push(`     • ${truncateToWidth(m, inner - 8)}`);
      }
    }
    body.push(`  ${makeDivider(borderColor)}`);
    body.push(`  🔴 ${bold("Critical Divergences")} — ${v.criticalDivergences.length}`);
    if (v.criticalDivergences.length === 0) {
      body.push(`     ${dim("(no irreconcilable divergences)")}`);
    } else {
      for (const d of v.criticalDivergences) {
        body.push(`     ⚡ ${bold(d.issue)}`);
        for (const [persona, pos] of Object.entries(d.positions)) {
          body.push(`        - ${persona}: ${truncateToWidth(pos, inner - 14)}`);
        }
      }
    }

    return this.scrollableSection(
      `🧭 Verdict & Consensus`,
      body,
      "verdict",
      borderColor,
      "(empty verdict)",
    );
  }

  private renderPersona(index: number): string[] {
    const v = this.verdict;
    const opinion: CouncilOpinion | undefined = v.opinions[index];
    const inner = Math.max(20, this.width - 2);
    const borderColor = BORDER_COLORS.blue;
    const tabKey: CouncilOverlayTab = `persona-${index}`;
    const personaLabel = (opinion?.personaName?.trim()) || defaultPersonaLabel(index);

    const body: string[] = [];
    if (!opinion) {
      body.push(`  ⭕ ${bold(personaLabel)} — ${dim("no opinion recorded")}`);
    } else {
      const confidencePct = Math.round(opinion.confidence * 100);
      body.push(`  � ${bold(personaLabel)}  ${dim(`(confidence: ${confidencePct}%)`)}`);
      body.push(`  🎯 ${bold("Stance:")} ${truncateToWidth(opinion.stance || "(none)", inner - 14)}`);
      body.push(`  📜 ${bold("Recommendation:")}`);
      body.push(`     ${truncateToWidth(opinion.recommendation || "(none)", inner - 8)}`);
      body.push(`  ${makeDivider(borderColor)}`);
      body.push(`  🟢 ${bold("Key Invariants")} (${opinion.keyInvariants.length})`);
      if (opinion.keyInvariants.length === 0) {
        body.push(`     ${dim("(none stated)")}`);
      } else {
        for (const inv of opinion.keyInvariants) {
          body.push(`     • ${truncateToWidth(inv, inner - 8)}`);
        }
      }
      body.push(`  ${makeDivider(borderColor)}`);
      body.push(`  🟡 ${bold("Caveats & Risks")} (${opinion.caveats.length})`);
      if (opinion.caveats.length === 0) {
        body.push(`     ${dim("(none stated)")}`);
      } else {
        for (const c of opinion.caveats) {
          body.push(`     • ${truncateToWidth(c, inner - 8)}`);
        }
      }
    }

    return this.scrollableSection(
      `👤 ${personaLabel}`,
      body,
      tabKey,
      borderColor,
      "(empty persona)",
    );
  }

  private renderBody(): string[] {
    if (this.state.activeTab === "verdict") {
      return this.renderVerdict();
    }
    const idx = this.personaIndexFromTab(this.state.activeTab);
    if (idx >= 0) {
      return this.renderPersona(idx);
    }
    return this.renderVerdict();
  }

  render(width: number, height: number): Container {
    this.width = Math.max(48, width);
    this.height = Math.max(14, height);
    const lines: string[] = [];
    lines.push(...this.headerLines());
    lines.push(...this.renderBody());
    lines.push(...this.renderHelp());
    if (lines.length > this.height) lines.length = this.height;
    return rowsToContainer(lines);
  }

  renderLines(width: number, height?: number): readonly string[] {
    return this.render(width, height ?? 26).render(width);
  }

  private scrollActive(delta: number): void {
    const tab = this.state.activeTab;
    const max = this.maxScrollForTab(tab);
    const next = clampInt((this.state.scrollOffsets[tab] ?? 0) + delta, 0, max);
    this.state.scrollOffsets[tab] = next;
  }

  handleInput(key: string): CouncilOverlayAction | undefined {
    if (this.done) return undefined;
    if (key === "q" || key === "\x1b" || key === "\x1b\x1b" || key === "\x03") {
      this.done = true;
      const action: CouncilOverlayAction = { action: "dismiss" };
      this.onDone?.(action);
      return action;
    }
    const tabs = this.getTabs();
    if (/^[1-9]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (idx < Math.min(9, tabs.length)) {
        this.state.activeTab = tabs[idx]!;
        return undefined;
      }
    }
    if (key === "\t") {
      this.state.activeTab = this.nextTab(1);
      return undefined;
    }
    if (key === "\x1b[Z" || key === "BTab") {
      this.state.activeTab = this.nextTab(-1);
      return undefined;
    }
    if (key === "j" || key === "\x1b[B" || key === "down") {
      this.scrollActive(1);
      return undefined;
    }
    if (key === "k" || key === "\x1b[A" || key === "up") {
      this.scrollActive(-1);
      return undefined;
    }
    if (key === "s") {
      this.done = true;
      const action: CouncilOverlayAction = { action: "save", topic: this.verdict.topic };
      this.onDone?.(action);
      return action;
    }
    if (key === "\r") {
      this.done = true;
      const invariants = [...this.verdict.consensusInvariants];
      const action: CouncilOverlayAction = {
        action: "implement",
        topic: this.verdict.topic,
        invariants,
      };
      this.onDone?.(action);
      return action;
    }
    return undefined;
  }
}

/**
 * Construct a fresh Council Verdict overlay bound to `verdict`. The overlay
 * returns a structured `CouncilOverlayAction` (save / implement / dismiss) when
 * the user presses `Enter` or `s`; the caller currently discards it — wiring it
 * is a pending feature, and it must route through `dispatchCommandLine` /
 * `invokeCommandSpec` in src/index.ts, never `pi.sendUserMessage` (ADR-0008 §3).
 */
export function createCouncilOverlay(
  verdict: CouncilVerdict,
  onDone?: CouncilOverlayDone,
): CouncilOverlayComponent {
  return new CouncilOverlay(verdict, onDone);
}
