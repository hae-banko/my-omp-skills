// Unified Native TUI Card Engine (SPEC-003 / ADR-0007).
//
// Bridges custom message renderers across my-omp-skills onto Oh My Pi's native
// `@oh-my-pi/pi-tui` Box architecture, with dynamic theme-aware background
// tinting, semantic intent tokens, and responsive full-width viewports.

import { Box, type BoxBorder, type Component, Container, Text } from "@oh-my-pi/pi-tui";
import { displayWidth } from "../research/research-format.ts";

export type SemanticCardIntent =
  | "neutral"
  | "active"
  | "success"
  | "warning"
  | "danger"
  | "accent";
export interface CardBadge {
  label: string;
  value: string;
  intent?: SemanticCardIntent;
}

export interface CardSection {
  title?: string;
  content: string[] | Component;
  divider?: boolean;
}

export interface CardSpec {
  title: string;
  subtitle?: string;
  intent: SemanticCardIntent;
  badges?: CardBadge[];
  sections: CardSection[];
  footerActions?: string[];
}

export interface ThemeHelper {
  isLight?: boolean;
  fg(colorKey: string, text: string): string;
  bg(colorKey: string, text: string): string;
}

export const ROUNDED_BORDER_CHARS = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
};

export interface ResolvedIntentTokens {
  bgToken: string;
  borderToken: string;
  accentToken: string;
}

/**
 * Maps abstract semantic card intent to concrete Oh My Pi theme tokens.
 */
export function resolveIntentTokens(intent: SemanticCardIntent): ResolvedIntentTokens {
  switch (intent) {
    case "active":
      return { bgToken: "toolPendingBg", borderToken: "borderAccent", accentToken: "borderAccent" };
    case "success":
      return { bgToken: "toolSuccessBg", borderToken: "success", accentToken: "success" };
    case "warning":
      return { bgToken: "toolPendingBg", borderToken: "warning", accentToken: "warning" };
    case "danger":
      return { bgToken: "toolErrorBg", borderToken: "error", accentToken: "error" };
    case "accent":
      return { bgToken: "customMessageBg", borderToken: "borderAccent", accentToken: "accent" };
    case "neutral":
    default:
      return { bgToken: "customMessageBg", borderToken: "borderMuted", accentToken: "dim" };
  }
}

/**
 * Fallback ANSI color escapes when theme object is not provided or lacks methods.
 */
function fallbackFg(colorKey: string, text: string): string {
  const map: Record<string, string> = {
    success: "32",
    error: "31",
    warning: "33",
    borderAccent: "36",
    borderMuted: "90",
    accent: "35",
    dim: "90",
    muted: "90",
    text: "0",
  };
  const code = map[colorKey] ?? "0";
  return code === "0" ? text : `\x1b[${code}m${text}\x1b[0m`;
}

/**
 * Normalizes an unknown theme parameter into a guaranteed ThemeHelper.
 */
export function normalizeTheme(theme: unknown): ThemeHelper {
  if (
    theme &&
    typeof theme === "object" &&
    "fg" in theme &&
    typeof (theme as ThemeHelper).fg === "function" &&
    "bg" in theme &&
    typeof (theme as ThemeHelper).bg === "function"
  ) {
    return theme as ThemeHelper;
  }
  return {
    isLight: false,
    fg: fallbackFg,
    bg: (_key: string, text: string) => text,
  };
}

/**
 * A responsive horizontal divider line component that dynamically scales to viewport width.
 */
export class ResponsiveDividerLine implements Component {
  constructor(
    public title: string | undefined,
    public colorFn: (text: string) => string,
  ) {}

  render(width: number): readonly string[] {
    const safeWidth = Math.max(0, width);
    if (!this.title) {
      return [this.colorFn("─".repeat(safeWidth))];
    }
    const label = ` ${this.title} `;
    if (label.length >= safeWidth) {
      return [label.slice(0, safeWidth)];
    }
    const remaining = safeWidth - label.length;
    const leftLen = Math.min(3, Math.floor(remaining / 2));
    const rightLen = remaining - leftLen;
    return [
      this.colorFn("─".repeat(leftLen)) +
        label +
        this.colorFn("─".repeat(rightLen)),
    ];
  }
}
/**
 * Component that formats badges atomically into lines based on available width.
 */
export class BadgesComponent implements Component {
  constructor(
    public badges: Array<{ label: string; value: string; intent?: SemanticCardIntent }>,
    public theme: ThemeHelper,
    public defaultTokens: ResolvedIntentTokens,
  ) {}

  render(width: number): readonly string[] {
    const formattedBadges = this.badges.map((b) => {
      const badgeTokens = b.intent ? resolveIntentTokens(b.intent) : this.defaultTokens;
      const lbl = this.theme.fg("dim", b.label.toUpperCase());
      const val = this.theme.fg(badgeTokens.accentToken, b.value);
      return `[${lbl}: ${val}]`;
    });

    const lines: string[] = [];
    let currentLine: string[] = [];
    let currentLen = 0;

    for (const badge of formattedBadges) {
      const bLen = displayWidth(badge);
      if (currentLine.length === 0) {
        currentLine.push(badge);
        currentLen = bLen;
      } else if (currentLen + 1 + bLen <= width) {
        currentLine.push(badge);
        currentLen += 1 + bLen;
      } else {
        lines.push(currentLine.join(" "));
        currentLine = [badge];
        currentLen = bLen;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }
    return lines;
  }
}

/**
 * Component that formats footer action hints atomically into lines.
 */
export class FooterActionsComponent implements Component {
  constructor(
    public actions: string[],
    public theme: ThemeHelper,
  ) {}

  render(width: number): readonly string[] {
    const formattedHints = this.actions.map((act) => this.theme.fg("dim", `⟨${act}⟩`));
    const lines: string[] = [];
    let currentLine: string[] = [];
    let currentLen = 0;

    for (const hint of formattedHints) {
      const hLen = displayWidth(hint);
      if (currentLine.length === 0) {
        currentLine.push(hint);
        currentLen = hLen;
      } else if (currentLen + 2 + hLen <= width) {
        currentLine.push(hint);
        currentLen += 2 + hLen;
      } else {
        lines.push(currentLine.join("  "));
        currentLine = [hint];
        currentLen = hLen;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join("  "));
    }
    return lines;
  }
}

/**
 * Component that formats content lines with hanging indents for bullets.
 */
export class ContentLinesComponent implements Component {
  constructor(public lines: string[]) {}

  render(width: number): readonly string[] {
    const out: string[] = [];
    const safeWidth = Math.max(10, width);

    for (const rawLine of this.lines) {
      if (displayWidth(rawLine) <= safeWidth) {
        out.push(rawLine);
        continue;
      }

      const match = rawLine.match(/^(\s*(?:•|-|\*|⚡)\s+)(.*)$/);
      if (match) {
        const prefix = match[1];
        const indent = " ".repeat(displayWidth(prefix));
        const words = match[2].split(" ");
        let current = prefix;
        for (const word of words) {
          if (displayWidth(current) + 1 + displayWidth(word) <= safeWidth) {
            current += (current === prefix ? "" : " ") + word;
          } else {
            out.push(current);
            current = indent + word;
          }
        }
        if (current.length > 0) out.push(current);
      } else {
        const words = rawLine.split(" ");
        let current = "";
        for (const word of words) {
          if (displayWidth(current) + 1 + displayWidth(word) <= safeWidth) {
            current += (current ? " " : "") + word;
          } else {
            if (current) out.push(current);
            current = word;
          }
        }
        if (current) out.push(current);
      }
    }
    return out;
  }
}

/**
 * Construct a native `@oh-my-pi/pi-tui` Box card from a CardSpec.
 */
export function createTuiCard(spec: CardSpec, themeInput?: unknown): Component {
  const theme = normalizeTheme(themeInput);
  const tokens = resolveIntentTokens(spec.intent);

  const border: BoxBorder = {
    chars: ROUNDED_BORDER_CHARS,
    color: (t: string) => theme.fg(tokens.borderToken, t),
  };

  const bgFn = (t: string) => theme.bg(tokens.bgToken, t);
  const cardBox = new Box(1, 0, bgFn, border);

  // 1. Header (Title + Subtitle)
  const headerContainer = new Container();
  const styledTitle = `\x1b[1m${theme.fg(tokens.accentToken, spec.title)}\x1b[0m`;
  headerContainer.addChild(new Text(styledTitle, 0, 0));
  if (spec.subtitle) {
    const styledSub = theme.fg("dim", spec.subtitle);
    headerContainer.addChild(new Text(styledSub, 0, 0));
  }
  cardBox.addChild(headerContainer);

  // 2. Badges (if present)
  if (spec.badges && spec.badges.length > 0) {
    cardBox.addChild(new BadgesComponent(spec.badges, theme, tokens));
  }

  // 3. Sections
  let lastWasDivider = false;
  for (let i = 0; i < spec.sections.length; i++) {
    const sec = spec.sections[i];

    if (sec.divider || i > 0 || (spec.badges && spec.badges.length > 0)) {
      if (!lastWasDivider) {
        cardBox.addChild(
          new ResponsiveDividerLine(sec.title, (t) => theme.fg(tokens.borderToken, t)),
        );
        lastWasDivider = true;
      }
    } else if (sec.title) {
      cardBox.addChild(
        new Text(`\x1b[1m${theme.fg("accent", sec.title)}\x1b[0m`, 0, 0),
      );
      lastWasDivider = false;
    }

    if (Array.isArray(sec.content)) {
      if (sec.content.length > 0) {
        cardBox.addChild(new ContentLinesComponent(sec.content));
        lastWasDivider = false;
      }
    } else {
      cardBox.addChild(sec.content);
      lastWasDivider = false;
    }
  }

  // 4. Footer actions (if present)
  if (spec.footerActions && spec.footerActions.length > 0) {
    cardBox.addChild(
      new ResponsiveDividerLine(undefined, (t) => theme.fg("borderMuted", t)),
    );
    cardBox.addChild(new FooterActionsComponent(spec.footerActions, theme));
  }

  return cardBox;
}
