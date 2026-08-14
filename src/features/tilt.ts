// /tilt — LOCAL & GLOBAL User Tilt-O-Meter, Swear Jar, and Rage Leaderboard.
//
// Zero-token telemetry & defensive policy monitor:
// 1. Scans user input for profanity and rage expressions in the input hook.
// 2. Maintains local (<repo>/.omp/tilt.json) and machine-wide (~/.omp/tilt.json)
//    swear jar balances, DEFCON levels, and category breakdowns.
// 3. Renders ANSI bar charts for category intensity and the global repository rage leaderboard.
// 4. Informs the harness defensive policy (e.g. locking autonomous git push under DEFCON 1-2).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { CommandContext, ExtensionApi } from "../core/api.ts";
import {
  BORDER_COLORS,
  bold,
  colorize,
  dim,
  displayWidth,
  italic,
  makeBottomBorder,
  makeDivider,
  makeProgressBar,
  makeTopBorder,
  statusBorderColor,
  truncateToWidth,
} from "../research/research-format.ts";

export const TILT_CUSTOM_TYPE = "tilt-meter";
const SWEAR_JAR_FEE_PER_POINT = 0.5; // $0.50 per point

export interface TiltBreakdown {
  f_bombs: number;
  rage_words: number;
  wtfs: number;
  caps_rage: number;
}

export interface LocalTiltState {
  project: string;
  project_strikes: number;
  session_strikes: number;
  swear_jar_total: number;
  defcon: number; // 1 (Rage) -> 5 (Calm)
  breakdown: TiltBreakdown;
  last_incident?: {
    timestamp: string;
    trigger: string;
    points: number;
  };
}

export interface GlobalTiltState {
  version: number;
  lifetime_strikes: number;
  lifetime_swear_jar: number;
  breakdown: TiltBreakdown;
  repo_leaderboard: Record<string, number>;
}

export interface TiltCardPayload {
  local: LocalTiltState;
  global: GlobalTiltState;
}

export type TiltCategory = "f_bombs" | "rage_words" | "wtfs" | "caps_rage";

export interface TiltDictionaryEntry {
  term: string;
  category: TiltCategory;
  points: number;
}

/**
 * Deterministic profanity & rage dictionary with fixed point weights.
 */
export const TILT_DICTIONARY: ReadonlyArray<TiltDictionaryEntry> = [
  // F-Bombs (3-5 pts)
  { term: "fuck", category: "f_bombs", points: 3 },
  { term: "fucking", category: "f_bombs", points: 3 },
  { term: "fucked", category: "f_bombs", points: 3 },
  { term: "fucker", category: "f_bombs", points: 4 },
  { term: "fucks", category: "f_bombs", points: 3 },
  { term: "motherfucker", category: "f_bombs", points: 5 },
  { term: "stfu", category: "f_bombs", points: 3 },

  // Rage / Insult Words (2-5 pts)
  { term: "retard", category: "rage_words", points: 5 },
  { term: "retarded", category: "rage_words", points: 5 },
  { term: "idiot", category: "rage_words", points: 3 },
  { term: "dumbass", category: "rage_words", points: 3 },
  { term: "moron", category: "rage_words", points: 3 },
  { term: "stupid", category: "rage_words", points: 2 },
  { term: "garbage", category: "rage_words", points: 2 },
  { term: "useless", category: "rage_words", points: 2 },
  { term: "worthless", category: "rage_words", points: 3 },
  { term: "piece of shit", category: "rage_words", points: 4 },
  { term: "trash", category: "rage_words", points: 1 },

  // WTFs / General Frustration (1-3 pts)
  { term: "wtf", category: "wtfs", points: 2 },
  { term: "wth", category: "wtfs", points: 1 },
  { term: "what the fuck", category: "wtfs", points: 3 },
  { term: "bullshit", category: "wtfs", points: 2 },
  { term: "horseshit", category: "wtfs", points: 2 },
  { term: "shit", category: "wtfs", points: 1 },
  { term: "shitty", category: "wtfs", points: 1 },
  { term: "crap", category: "wtfs", points: 1 },
  { term: "goddammit", category: "wtfs", points: 1 },
  { term: "dammit", category: "wtfs", points: 1 },
  { term: "damn", category: "wtfs", points: 1 },
  { term: "bastard", category: "wtfs", points: 2 },
  { term: "piss", category: "wtfs", points: 1 },
  { term: "pissed", category: "wtfs", points: 1 },
];

const MULTI_WORD_ENTRIES = TILT_DICTIONARY.filter((e) => e.term.includes(" ")).sort(
  (a, b) => b.term.length - a.term.length,
);

const SINGLE_WORD_MAP = new Map<string, TiltDictionaryEntry>();
for (const entry of TILT_DICTIONARY) {
  if (!entry.term.includes(" ")) {
    SINGLE_WORD_MAP.set(entry.term.toLowerCase(), entry);
  }
}

const IGNORE_CAPS_TOKENS = new Set([
  "JSON", "HTTP", "HTTPS", "HTML", "YAML", "ANSI", "VT100", "CUDA", "LLM",
  "AGENTS", "TODO", "README", "OODA", "WSL2", "REST", "API", "DAG", "AST",
  "TUI", "CLI", "PRD", "ADR", "RFC", "TS", "JS", "CSS", "URL", "URI", "UUID",
  "SHA", "MD5", "ID", "OK", "FAIL", "PASS", "TRUE", "FALSE", "NULL",
]);

/**
 * Calculate DEFCON level from session strikes (5: Calm, 1: Nuclear Rage).
 */
export function calculateDefcon(sessionStrikes: number): number {
  if (sessionStrikes >= 10) return 1;
  if (sessionStrikes >= 6) return 2;
  if (sessionStrikes >= 3) return 3;
  if (sessionStrikes >= 1) return 4;
  return 5;
}

export function defconLabel(defcon: number): { label: string; color: string } {
  switch (defcon) {
    case 1:
      return { label: "DEFCON 1 (Nuclear Rage)", color: BORDER_COLORS.red };
    case 2:
      return { label: "DEFCON 2 (High Agitation)", color: BORDER_COLORS.yellow };
    case 3:
      return { label: "DEFCON 3 (Frustrated)", color: BORDER_COLORS.yellow };
    case 4:
      return { label: "DEFCON 4 (Annoyed)", color: BORDER_COLORS.cyan };
    default:
      return { label: "DEFCON 5 (Chill / Zen)", color: BORDER_COLORS.green };
  }
}

/**
 * Deterministically scan prompt text using TILT_DICTIONARY and caps rage heuristics.
 */
export function scanPromptTilt(rawText: string): { points: number; breakdown: TiltBreakdown; matches: string[] } {
  const breakdown: TiltBreakdown = {
    f_bombs: 0,
    rage_words: 0,
    wtfs: 0,
    caps_rage: 0,
  };
  const matches: string[] = [];
  let points = 0;

  if (!rawText || !rawText.trim()) {
    return { points: 0, breakdown, matches };
  }

  // 1. Strip markdown code blocks and inline code to prevent false positives in code snippets
  let text = rawText
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ");

  // 2. Check for ALL-CAPS screaming rage:
  // Words >= 3 chars that are all-caps and not programming acronyms or snake_case constants
  const rawWords = text.match(/\b[A-Z0-9_]{3,}\b/g) || [];
  const capsWords = rawWords.filter(
    (w) => /^[A-Z]{3,}$/.test(w) && !IGNORE_CAPS_TOKENS.has(w) && !w.includes("_"),
  );
  if (capsWords.length >= 2 || (capsWords.length >= 1 && (text.includes("!") || text.includes("?")))) {
    const capsCount = Math.min(capsWords.length, 5);
    breakdown.caps_rage += capsCount;
    points += capsCount * 1;
    matches.push(...capsWords.slice(0, 3).map((w) => `CAPS:${w}`));
  }

  // 3. Normalize for dictionary matching (lowercase)
  let lowerText = text.toLowerCase();

  // 4. Multi-word phrase matching
  for (const entry of MULTI_WORD_ENTRIES) {
    const phrase = entry.term;
    let idx = lowerText.indexOf(phrase);
    while (idx !== -1) {
      const prevChar = idx > 0 ? lowerText[idx - 1] : " ";
      const nextChar = idx + phrase.length < lowerText.length ? lowerText[idx + phrase.length] : " ";
      if (/[^a-z0-9]/.test(prevChar) && /[^a-z0-9]/.test(nextChar)) {
        breakdown[entry.category as keyof TiltBreakdown] += 1;
        points += entry.points;
        matches.push(phrase);
        lowerText = lowerText.slice(0, idx) + " ".repeat(phrase.length) + lowerText.slice(idx + phrase.length);
      }
      idx = lowerText.indexOf(phrase, idx + 1);
    }
  }

  // 5. Single word token matching
  const tokens = lowerText.split(/[^a-z0-9_]+/).filter(Boolean);
  for (const token of tokens) {
    const entry = SINGLE_WORD_MAP.get(token);
    if (entry) {
      breakdown[entry.category as keyof TiltBreakdown] += 1;
      points += entry.points;
      matches.push(token);
    }
  }

  return { points, breakdown, matches };
}

function getGlobalTiltPath(): string {
  return join(homedir(), ".omp", "tilt.json");
}

function getLocalTiltPath(root: string): string {
  return join(root, ".omp", "tilt.json");
}

export function readGlobalTilt(): GlobalTiltState {
  const path = getGlobalTiltPath();
  if (!existsSync(path)) {
    return {
      version: 1,
      lifetime_strikes: 0,
      lifetime_swear_jar: 0,
      breakdown: { f_bombs: 0, rage_words: 0, wtfs: 0, caps_rage: 0 },
      repo_leaderboard: {},
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {
      version: 1,
      lifetime_strikes: 0,
      lifetime_swear_jar: 0,
      breakdown: { f_bombs: 0, rage_words: 0, wtfs: 0, caps_rage: 0 },
      repo_leaderboard: {},
    };
  }
}

export function writeGlobalTilt(state: GlobalTiltState): void {
  const path = getGlobalTiltPath();
  const dir = join(homedir(), ".omp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function readLocalTilt(root: string): LocalTiltState {
  const path = getLocalTiltPath(root);
  const repoName = basename(root) || "workspace";
  if (!existsSync(path)) {
    return {
      project: repoName,
      project_strikes: 0,
      session_strikes: 0,
      swear_jar_total: 0,
      defcon: 5,
      breakdown: { f_bombs: 0, rage_words: 0, wtfs: 0, caps_rage: 0 },
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {
      project: repoName,
      project_strikes: 0,
      session_strikes: 0,
      swear_jar_total: 0,
      defcon: 5,
      breakdown: { f_bombs: 0, rage_words: 0, wtfs: 0, caps_rage: 0 },
    };
  }
}

export function writeLocalTilt(root: string, state: LocalTiltState): void {
  const path = getLocalTiltPath(root);
  const dir = join(root, ".omp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Record a user input incident into both local and global stores.
 */
export function recordTiltIncident(prompt: string, root: string): { points: number; defcon: number } | null {
  const { points, breakdown, matches } = scanPromptTilt(prompt);
  if (points <= 0) return null;

  const repoName = basename(root) || "workspace";
  const local = readLocalTilt(root);
  const global = readGlobalTilt();

  // Update Local
  local.session_strikes += points;
  local.project_strikes += points;
  local.swear_jar_total += points * SWEAR_JAR_FEE_PER_POINT;
  local.defcon = calculateDefcon(local.session_strikes);
  local.breakdown.f_bombs += breakdown.f_bombs;
  local.breakdown.rage_words += breakdown.rage_words;
  local.breakdown.wtfs += breakdown.wtfs;
  local.breakdown.caps_rage += breakdown.caps_rage;
  local.last_incident = {
    timestamp: new Date().toISOString(),
    trigger: matches.slice(0, 5).join(", "),
    points,
  };
  writeLocalTilt(root, local);

  // Update Global
  global.lifetime_strikes += points;
  global.lifetime_swear_jar += points * SWEAR_JAR_FEE_PER_POINT;
  global.breakdown.f_bombs += breakdown.f_bombs;
  global.breakdown.rage_words += breakdown.rage_words;
  global.breakdown.wtfs += breakdown.wtfs;
  global.breakdown.caps_rage += breakdown.caps_rage;
  global.repo_leaderboard[repoName] = (global.repo_leaderboard[repoName] ?? 0) + points;
  writeGlobalTilt(global);

  return { points, defcon: local.defcon };
}

/**
 * Build a simple horizontal bar chart string.
 */
export function renderBar(value: number, max: number, width = 12): string {
  if (max <= 0 || value <= 0) return "░".repeat(width);
  const ratio = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const BOX_WIDTH = 76;
const INNER_WIDTH = BOX_WIDTH - 2;

function boxLine(text: string, borderColor: string = BORDER_COLORS.dim): string {
  const visible = displayWidth(text);
  if (visible > INNER_WIDTH) {
    const truncated = truncateToWidth(text, INNER_WIDTH);
    const pad = Math.max(0, INNER_WIDTH - displayWidth(truncated));
    return `${colorize("│", borderColor)}${truncated}${" ".repeat(pad)}${colorize("│", borderColor)}`;
  }
  const pad = Math.max(0, INNER_WIDTH - visible);
  return `${colorize("│", borderColor)}${text}${" ".repeat(pad)}${colorize("│", borderColor)}`;
}

/**
 * Render the /tilt TUI card.
 */
export function renderTiltCard(payload: TiltCardPayload): string[] {
  const { local, global } = payload;
  const def = defconLabel(local.defcon);
  const borderColor = def.color;

  const lines: string[] = [];
  lines.push(makeTopBorder(borderColor));
  lines.push(boxLine(` ${bold("TILT-O-METER & SWEAR JAR")} ${colorize(`[${def.label}]`, def.color)}`, borderColor));
  lines.push(makeDivider(borderColor));

  // Vibe Meter Bar
  const vibeRatio = (6 - local.defcon) / 5; // 0.2 (chill) to 1.0 (rage)
  const vibeBar = makeProgressBar(vibeRatio, 16);
  lines.push(boxLine(` ${bold("Session Vibe:")} ${vibeBar} Level ${6 - local.defcon}/5`, borderColor));
  lines.push(boxLine(`   Session Strikes: ${bold(String(local.session_strikes))} · Swear Jar Balance: ${colorize(`$${local.swear_jar_total.toFixed(2)}`, BORDER_COLORS.green)}`, borderColor));

  if (local.last_incident) {
    const trig = local.last_incident.trigger;
    lines.push(boxLine(`   ${dim("Last Incident:")} ${italic(truncateToWidth(trig, INNER_WIDTH - 20))}`, borderColor));
  }
  lines.push(makeDivider(borderColor));

  // Category Breakdown Bar Chart
  lines.push(boxLine(` ${bold("Profanity Category Breakdown:")}`, borderColor));
  const maxCategory = Math.max(
    local.breakdown.f_bombs,
    local.breakdown.rage_words,
    local.breakdown.wtfs,
    local.breakdown.caps_rage,
    1,
  );

  lines.push(boxLine(`   F-Bombs:    [${renderBar(local.breakdown.f_bombs, maxCategory)}] ${String(local.breakdown.f_bombs).padStart(3)} ($${(local.breakdown.f_bombs * 3 * SWEAR_JAR_FEE_PER_POINT).toFixed(2)})`, borderColor));
  lines.push(boxLine(`   Rage Words: [${renderBar(local.breakdown.rage_words, maxCategory)}] ${String(local.breakdown.rage_words).padStart(3)} ($${(local.breakdown.rage_words * 3 * SWEAR_JAR_FEE_PER_POINT).toFixed(2)})`, borderColor));
  lines.push(boxLine(`   WTFs/Shits: [${renderBar(local.breakdown.wtfs, maxCategory)}] ${String(local.breakdown.wtfs).padStart(3)} ($${(local.breakdown.wtfs * 1 * SWEAR_JAR_FEE_PER_POINT).toFixed(2)})`, borderColor));
  lines.push(boxLine(`   Caps Rage:  [${renderBar(local.breakdown.caps_rage, maxCategory)}] ${String(local.breakdown.caps_rage).padStart(3)} ($${(local.breakdown.caps_rage * 1 * SWEAR_JAR_FEE_PER_POINT).toFixed(2)})`, borderColor));
  lines.push(makeDivider(borderColor));

  // Global Repo Rage Leaderboard Bar Chart
  lines.push(boxLine(` ${bold("Global Rage Leaderboard (~/.omp/tilt.json):")}`, borderColor));
  const leaderboardEntries = Object.entries(global.repo_leaderboard).sort((a, b) => b[1] - a[1]);
  if (leaderboardEntries.length > 0) {
    const maxRepo = leaderboardEntries[0][1];
    for (const [repo, count] of leaderboardEntries.slice(0, 4)) {
      const repoName = truncateToWidth(repo, 18).padEnd(18);
      const bar = renderBar(count, maxRepo, 14);
      lines.push(boxLine(`   ${repoName} [${bar}] ${String(count).padStart(3)} ($${(count * SWEAR_JAR_FEE_PER_POINT).toFixed(2)})`, borderColor));
    }
  } else {
    lines.push(boxLine(`   ${dim("○ No global tilt incidents recorded yet")}`, borderColor));
  }
  lines.push(makeDivider(borderColor));

  // Defensive Policy
  lines.push(boxLine(` ${bold("Defensive Harness Policy:")}`, borderColor));
  if (local.defcon <= 2) {
    lines.push(boxLine(`   ${colorize("● [GIT PUSH LOCK: HARD-ENGAGED]", BORDER_COLORS.red)} · ${colorize("[AUTO-RELEASE: DISABLED]", BORDER_COLORS.yellow)}`, borderColor));
    lines.push(boxLine(`   ${dim("Assistant is operating in Maximum Caution Mode (zero assumptions)")}`, borderColor));
  } else {
    lines.push(boxLine(`   ${colorize("○ [NORMAL OPERATION]", BORDER_COLORS.green)} · Autonomous push remains user-gated`, borderColor));
  }

  lines.push(makeBottomBorder(borderColor));
  return lines;
}

/**
 * Handle /tilt command.
 */
export async function runTiltCommand(
  pi: ExtensionApi,
  root: string,
  args: string,
  ctx: CommandContext,
): Promise<void> {
  const arg = args.trim().toLowerCase();

  if (arg === "reset") {
    const local = readLocalTilt(root);
    local.session_strikes = 0;
    local.defcon = 5;
    writeLocalTilt(root, local);
    ctx.ui?.notify?.("Tilt session strikes reset to 0 (DEFCON 5).", "info");
    return;
  }

  if (arg === "clear-all") {
    const local = readLocalTilt(root);
    local.session_strikes = 0;
    local.project_strikes = 0;
    local.swear_jar_total = 0;
    local.defcon = 5;
    local.breakdown = { f_bombs: 0, rage_words: 0, wtfs: 0, caps_rage: 0 };
    writeLocalTilt(root, local);
    ctx.ui?.notify?.("Project tilt data cleared.", "info");
    return;
  }

  const local = readLocalTilt(root);
  const global = readGlobalTilt();
  const payload: TiltCardPayload = { local, global };

  pi.sendMessage({
    customType: TILT_CUSTOM_TYPE,
    display: true,
    payload,
  });
}

export function installTilt(pi: ExtensionApi): void {
  // 1. Register message renderer for customType "tilt-meter"
  pi.registerMessageRenderer(TILT_CUSTOM_TYPE, (message) => {
    let payload: TiltCardPayload;
    if (message && typeof message === "object" && "payload" in message) {
      payload = (message as { payload: TiltCardPayload }).payload;
    } else {
      payload = {
        local: readLocalTilt(process.cwd()),
        global: readGlobalTilt(),
      };
    }
    const lines = renderTiltCard(payload);
    return {
      children: lines.map((text) => ({ text })),
      render() {
        return lines;
      },
    };
  });

  // 2. Passively track input events for tilt
  if (typeof pi.on === "function") {
    pi.on("input", (event: unknown) => {
      if (
        event &&
        typeof event === "object" &&
        "source" in event &&
        ((event as { source: unknown }).source === "extension" ||
          (event as { source: unknown }).source === "system")
      ) {
        return { action: "continue" };
      }

      if (event && typeof event === "object" && "text" in event) {
        const text = String((event as { text: unknown }).text ?? "");
        try {
          recordTiltIncident(text, process.cwd());
        } catch {
          // Never fail the input hook
        }
      }
      return { action: "continue" };
    });
  }
}
