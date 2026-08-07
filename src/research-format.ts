// Width-aware text formatting for research cards.
//
// All card lines are measured in terminal display cells, not code points:
// CJK ideographs, Hangul, fullwidth forms and emoji occupy 2 cells, combining
// marks 0. The previous UTF-16 slice()/padEnd() broke the fixed 76-column box
// on wide glyphs and could exceed the pi-tui hard line-width limit (a
// fail-fast crash). The width table is self-contained so the renderers stay
// deterministic and testable without the runtime pi-tui.

export const BOX_WIDTH = 76;
export const INNER_WIDTH = BOX_WIDTH - 2;

// East Asian Wide / Fullwidth plus emoji ranges (wcwidth approximation).
const WIDE: ReadonlyArray<[number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK Radicals .. CJK Symbols & Punctuation
  [0x3041, 0x33ff], // Hiragana .. CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables .. Yi Radicals
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe52], // CJK Compatibility Forms
  [0xfe54, 0xfe66],
  [0xfe68, 0xfe6b],
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6],
  [0x1f000, 0x1f2ff], // Mahjong .. Enclosed Alphanumeric Supplement (incl. flags)
  [0x1f300, 0x1faff], // Emoji blocks
  [0x20000, 0x3fffd], // CJK Unified Ideographs Extension B+
];

const ZERO: ReadonlyArray<[number, number]> = [
  [0x0300, 0x036f], // combining diacritics
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f],
  [0xe0100, 0xe01ef],
];

function inRanges(code: number, ranges: ReadonlyArray<[number, number]>): boolean {
  for (const [lo, hi] of ranges) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

function charDisplayWidth(code: number): number {
  if (code === 0x200d) return 0; // ZWJ (emoji sequences)
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0; // control chars
  if (inRanges(code, ZERO)) return 0;
  if (inRanges(code, WIDE)) return 2;
  return 1;
}

/** Display-cell width of a string (wcwidth approximation). */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += charDisplayWidth(ch.codePointAt(0) ?? 0);
  return w;
}

const ELLIPSIS = "...";

/** Truncate to `width` display cells, accounting for the ellipsis width. */
export function truncateToWidth(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  const budget = Math.max(0, width - displayWidth(ELLIPSIS));
  let w = 0;
  let out = "";
  for (const ch of text) {
    const cw = charDisplayWidth(ch.codePointAt(0) ?? 0);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + ELLIPSIS;
}

/** Truncate keeping head and tail (for slugs/paths): `head...tail`. */
export function truncateMiddle(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  const budget = Math.max(0, width - displayWidth(ELLIPSIS));
  const headBudget = Math.ceil(budget / 2);
  const tailBudget = budget - headBudget;
  const chars = [...text];
  let head = "";
  let hw = 0;
  for (const ch of chars) {
    const cw = charDisplayWidth(ch.codePointAt(0) ?? 0);
    if (hw + cw > headBudget) break;
    head += ch;
    hw += cw;
  }
  let tail = "";
  let tw = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const cw = charDisplayWidth(chars[i].codePointAt(0) ?? 0);
    if (tw + cw > tailBudget) break;
    tail = chars[i] + tail;
    tw += cw;
  }
  return head + ELLIPSIS + tail;
}

export function padToWidth(text: string, width: number): string {
  const pad = width - displayWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

/** One content row of the card box: `│<padded, truncated>│`. */
export function boxLine(text: string): string {
  return `│${padToWidth(truncateToWidth(text, INNER_WIDTH), INNER_WIDTH)}│`;
}

export const TOP_BORDER = `┌${"─".repeat(INNER_WIDTH)}┐`;
export const DIVIDER = `├${"─".repeat(INNER_WIDTH)}┤`;
export const BOTTOM_BORDER = `└${"─".repeat(INNER_WIDTH)}┘`;

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function makeProgressBar(ratio: number, width = 8): string {
  const norm = clamp01(ratio > 1 ? ratio / 100 : ratio);
  const filled = Math.round(norm * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

/** 3m12s / 45s / 4m / 1h02m; undefined/NaN -> "". */
export function formatDuration(totalSeconds?: number): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

/** detail_level -> ★/★★/★★★; falls back to the raw string. */
export function starsFor(detailLevel?: string): string {
  const map: Record<string, string> = { brief: "★", moderate: "★★", detailed: "★★★" };
  if (typeof detailLevel !== "string") return "";
  return map[detailLevel.toLowerCase()] ?? detailLevel;
}
