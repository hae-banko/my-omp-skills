// Semantic color policy for research cards.
//
// Cards are monochrome by default (safe everywhere, NO_COLOR-proof); color is
// an opt-in secondary cue that must never be the only signal (WCAG 1.4.1 —
// every colored element keeps its word/glyph twin). The harness theme object
// is threaded through, but accents only activate when the environment reports
// color support AND the theme provides colors.

export interface ResearchTheme {
  monochrome: boolean;
  colors: {
    badge: string; // SGR code, e.g. "36" (cyan)
    ok: string;
    warn: string;
    error: string;
    accent: string;
  };
}

export const CONTRAST = { text: 4.5, critical: 7, ui: 3 } as const;

/** Okabe-Ito colorblind-safe palette (reference for any future accent work). */
export const OKABE_ITO = {
  orange: "#E69F00",
  skyBlue: "#56B4E9",
  blueGreen: "#009E73",
  yellow: "#F0E442",
  blue: "#0072B2",
  vermillion: "#D55E00",
  reddishPurple: "#CC79A7",
} as const;

export interface ColorEnv {
  NO_COLOR?: string;
  COLORTERM?: string;
  TERM?: string;
}

export function supportsColorEnv(env: ColorEnv = {}): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  const term = env.TERM ?? "";
  const colorterm = env.COLORTERM ?? "";
  return colorterm !== "" || /(^|-)256color$/.test(term) || /xterm|screen|tmux|vt100|linux/i.test(term);
}

export function resolveResearchTheme(theme?: unknown, env?: ColorEnv): ResearchTheme {
  const t = (theme && typeof theme === "object" ? theme : {}) as { colors?: unknown };
  const hasColors = !!t.colors && typeof t.colors === "object";
  const monochrome = !hasColors || !supportsColorEnv(env);
  return {
    monochrome,
    colors: { badge: "36", ok: "32", warn: "33", error: "31", accent: "35" },
  };
}

/** Wrap in SGR color unless monochrome (the default — zero ANSI emitted). */
export function colorize(text: string, sgr: string, monochrome: boolean): string {
  return monochrome ? text : `\x1b[${sgr}m${text}\x1b[0m`;
}
