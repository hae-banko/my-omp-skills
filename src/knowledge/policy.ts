// tool_call policy: the repo-local knowledge base is append-only. Records and
// pitfalls are never rewritten in place and INDEX.md only gains lines — this
// is the AGENTS.md convention made a runtime invariant. Research project
// working files (outline.yaml, fields.yaml) stay editable; they are
// human-in-the-loop work products, not durable records.
//
// Block counter is surfaced via the kb-guard-status widget; do not remove the recordBlock() calls.

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { sessionIdOf, type ExtensionApi, type ToolCallEvent } from "../core/api.ts";
import { recordBlock } from "./kb-guard-status.ts";

const KB_REASON =
  "Blocked: the knowledge base is append-only — records, pitfalls, and INDEX.md are never edited in place. " +
  "A new finding is a new file. " +
  "Save what you learned with /record <title>, capture the failure with /pitfall <description>, " +
  "or query past entries with the knowledge_read tool (or /record --recent). " +
  "To overwrite an outdated entry, add a correcting one instead of editing the old file.";

const AUDIT_REASON =
  "Blocked: .omp/audits/ is protected against arbitrary edits, overwrites, and deletions. " +
  "To revise an existing audit report, perform a controlled update with an explicit SemVer bump " +
  "(e.g. v0.1.0 -> v0.1.1) in frontmatter and an entry in ## Revision History. " +
  "Historical archives in archive/ are immutable.";

/** Segments of a tool-call path below `.omp/knowledge/`, or null when outside the KB. */
function knowledgeSubpath(cwd: string, raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const abs = isAbsolute(raw) ? normalize(raw) : normalize(resolve(cwd, raw));
  const parts = abs.split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === ".omp") {
      if (i === parts.length - 1) {
        return [".omp"];
      }
      if (parts[i + 1] === "knowledge") {
        if (i + 1 === parts.length - 1) {
          return ["knowledge"];
        }
        return parts.slice(i + 2);
      }
      if (parts[i + 1] === "audits") {
        return ["audits", ...parts.slice(i + 2)];
      }
    }
  }
  return null;
}

/** True when the path targets the append-only stores (records/, pitfalls/, INDEX.md, audits/, or their root/ancestors). */
function isProtectedPath(cwd: string, raw: unknown): boolean {
  const sub = knowledgeSubpath(cwd, raw);
  if (!sub || sub.length === 0) return false;
  const first = sub[0];
  return (
    first === ".omp" ||
    first === "knowledge" ||
    first === "records" ||
    first === "pitfalls" ||
    first === "INDEX.md" ||
    first === "audits"
  );
}



/**
 * Detects if a shell command is attempting to delete, truncate, or overwrite
 * a protected path (.omp/knowledge/{records,pitfalls,INDEX.md} or .omp/audits/).
 *
 * Distinguishes true destructive targets from harmless references (e.g. reading,
 * grepping, or temporary scripts in /tmp that happen to mention protected terms).
 */
export function isDestructiveBashAgainstProtected(
  command: string,
  cwd: string,
): { blocked: boolean; target?: string; reason?: "knowledge" | "audit" } {
  // 1. Check stdout/stderr overwrite redirection: `> <file>`, `1> <file>`, `2> <file>` (excluding `>>`, `1>>`, `>&`, and heredocs `<<`)
  const redirectMatches = command.matchAll(/(?<![>&])(?:[0-9]+)?>(?!>|&)\s*([^\s;&|]+)/g);
  for (const m of redirectMatches) {
    const target = m[1].replace(/^['"]|['"]$/g, "");
    if (isProtectedPath(cwd, target)) {
      const reason = isAuditSubpath(cwd, target) ? "audit" : "knowledge";
      return { blocked: true, target, reason };
    }
  }

  const tokenizeArgs = (str: string): string[] => {
    const matches = str.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    return matches ? matches.map((s) => s.replace(/^['"]|['"]$/g, "")) : [];
  };

  // 2. Check deletion commands: rm, unlink, shred, git rm
  const deleteMatches = command.matchAll(
    /\b(?:rm|unlink|shred|git\s+rm)\b\s+([^;&|]+)/g,
  );
  for (const m of deleteMatches) {
    const args = tokenizeArgs(m[1]);
    for (const arg of args) {
      if (arg.startsWith("-") || !arg) continue;
      if (isProtectedPath(cwd, arg)) {
        const reason = isAuditSubpath(cwd, arg) ? "audit" : "knowledge";
        return { blocked: true, target: arg, reason };
      }
    }
  }

  // 3. Check move/rename commands: mv <src> <dest> or mv -t <dir> <src>
  const mvMatches = command.matchAll(/\bmv\b\s+([^;&|]+)/g);
  for (const m of mvMatches) {
    const tokens = tokenizeArgs(m[1]);
    for (let i = 0; i < tokens.length; i++) {
      const arg = tokens[i];
      if (arg === "-t" || arg === "--target-directory") {
        if (i + 1 < tokens.length) {
          const target = tokens[i + 1];
          if (isProtectedPath(cwd, target)) {
            const reason = isAuditSubpath(cwd, target) ? "audit" : "knowledge";
            return { blocked: true, target, reason };
          }
          i++;
        }
        continue;
      }
      if (arg.startsWith("-t")) {
        const target = arg.slice(2);
        if (isProtectedPath(cwd, target)) {
          const reason = isAuditSubpath(cwd, target) ? "audit" : "knowledge";
          return { blocked: true, target, reason };
        }
        continue;
      }
      if (arg.startsWith("--target-directory=")) {
        const target = arg.slice("--target-directory=".length);
        if (isProtectedPath(cwd, target)) {
          const reason = isAuditSubpath(cwd, target) ? "audit" : "knowledge";
          return { blocked: true, target, reason };
        }
        continue;
      }
      if (arg.startsWith("-")) continue;
      if (isProtectedPath(cwd, arg)) {
        const reason = isAuditSubpath(cwd, arg) ? "audit" : "knowledge";
        return { blocked: true, target: arg, reason };
      }
    }
  }

  // 4. Check cp overwrite: cp ... <dest> or cp -t <dir> ...
  const cpMatches = command.matchAll(/\bcp\b\s+([^;&|]+)/g);
  for (const m of cpMatches) {
    const tokens = tokenizeArgs(m[1]);
    let targetDir: string | undefined = undefined;
    const positional: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const arg = tokens[i];
      if (arg === "-t" || arg === "--target-directory") {
        if (i + 1 < tokens.length) {
          targetDir = tokens[i + 1];
          i++;
        }
        continue;
      }
      if (arg.startsWith("-t")) {
        targetDir = arg.slice(2);
        continue;
      }
      if (arg.startsWith("--target-directory=")) {
        targetDir = arg.slice("--target-directory=".length);
        continue;
      }
      if (arg.startsWith("-")) continue;
      positional.push(arg);
    }
    const dest = targetDir ?? (positional.length >= 2 ? positional[positional.length - 1] : undefined);
    if (dest && isProtectedPath(cwd, dest)) {
      const reason = isAuditSubpath(cwd, dest) ? "audit" : "knowledge";
      return { blocked: true, target: dest, reason };
    }
  }

  // 5. Check in-place edits: sed -i ... <file>
  const sedMatches = command.matchAll(/\bsed\s+-[a-zA-Z0-9]*i[a-zA-Z0-9]*\s+([^;&|]+)/g);
  for (const m of sedMatches) {
    const args = tokenizeArgs(m[1]);
    for (const arg of args) {
      if (arg.startsWith("-") || !arg) continue;
      if (isProtectedPath(cwd, arg)) {
        const reason = isAuditSubpath(cwd, arg) ? "audit" : "knowledge";
        return { blocked: true, target: arg, reason };
      }
    }
  }

  // 6. Check truncate: truncate -s ... <file>
  const truncateMatches = command.matchAll(/\btruncate\b\s+([^;&|]+)/g);
  for (const m of truncateMatches) {
    const args = tokenizeArgs(m[1]);
    for (const arg of args) {
      if (arg.startsWith("-") || !arg) continue;
      if (isProtectedPath(cwd, arg)) {
        const reason = isAuditSubpath(cwd, arg) ? "audit" : "knowledge";
        return { blocked: true, target: arg, reason };
      }
    }
  }

  return { blocked: false };
}
function isAuditSubpath(cwd: string, raw: unknown): boolean {
  const sub = knowledgeSubpath(cwd, raw);
  return !!sub && sub[0] === "audits";
}

function getPathList(input?: Record<string, unknown>): string[] {
  if (!input || typeof input !== "object") return [];
  const res: string[] = [];
  if (typeof input.path === "string" && input.path.length > 0) res.push(input.path);
  if (Array.isArray(input.paths)) {
    for (const p of input.paths) {
      if (typeof p === "string" && p.length > 0) res.push(p);
    }
  }
  if (typeof input.input === "string" && input.input.length > 0) {
    const matches = input.input.matchAll(/^\[([^#\]\r\n]+)(?:#[^\]\r\n]+)?\]/gm);
    for (const match of matches) {
      const p = match[1].trim();
      if (p.length > 0) res.push(p);
    }
  }
  return Array.from(new Set(res));
}

/**
 * First path in `input` that `isProtectedPath(cwd, ...)` accepts (optionally
 * narrowed by `filter`). Returns `undefined` when no candidate matches.
 * Used by `installPolicy` to capture the exact path that triggered a block
 * so the kb-guard-status widget can surface it for future audit-card
 * rendering.
 */
function matchedPath(
  cwd: string,
  input: Record<string, unknown>,
  filter?: (p: string) => boolean,
): string | undefined {
  for (const p of getPathList(input)) {
    if (filter && !filter(p)) continue;
    if (isProtectedPath(cwd, p)) return p;
  }
  return undefined;
}


function parseSemVer(v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareSemVer(a: string, b: string): number | null {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa || !pb) return null;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

const VALID_STATUSES: Record<string, true> = {
  active: true,
  superseded: true,
  archived: true,
};

function isControlledAuditUpdate(
  cwd: string,
  input: Record<string, unknown>,
  toolName: "write" | "edit",
): boolean {
  const paths = getPathList(input);
  if (paths.length === 0) return false;

  for (const raw of paths) {
    if (!isAuditSubpath(cwd, raw)) return false;
    const abs = resolve(cwd, raw);
    if (!existsSync(abs)) continue;

    const normalized = normalize(abs);
    if (normalized.includes(`${sep}archive${sep}`) || normalized.includes("/archive/")) {
      return false;
    }

    let oldContent = "";
    try {
      oldContent = readFileSync(abs, "utf8");
    } catch {
      return false;
    }

    // Frontmatter status, minus the YAML comment the AUDIT-FORMAT template
    // carries (`status: active # active | superseded | archived`).
    const readStatus = (text: string): string | undefined =>
      text.match(/(?:^|\n|\+)\s*status:\s*["']?([^"'#\r\n]+)/m)?.[1].trim().toLowerCase();
    const oldStatus = readStatus(oldContent) ?? "active";

    let newText = "";
    if (toolName === "write") {
      newText = typeof input.content === "string" ? input.content : "";
    } else if (toolName === "edit") {
      newText = typeof input.input === "string" ? input.input : "";
    }

    const newStatus = readStatus(newText) ?? oldStatus;
    if (!VALID_STATUSES[newStatus]) {
      return false;
    }

    const oldVersionMatch = oldContent.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
    const oldVersion = oldVersionMatch ? oldVersionMatch[1].trim() : "";

    const newVersionMatch = newText.match(/(?:^|\n|\+)\s*version:\s*["']?([^"'\r\n]+)["']?/m);
    const newVersion = newVersionMatch ? newVersionMatch[1].trim() : "";

    const filename = abs.split(sep).pop() ?? "";
    const isSubtopic = filename !== "overview.md" && filename !== "report.md";

    if (isSubtopic && !oldVersion && !newVersion) {
      const parts = normalized.split(sep);
      const auditIdx = parts.lastIndexOf("audits");
      let rootP: string | null = null;
      if (auditIdx !== -1 && auditIdx + 1 < parts.length) {
        const slugDir = parts.slice(0, auditIdx + 2).join(sep);
        const overviewP = join(slugDir, "overview.md");
        const reportP = join(slugDir, "report.md");
        rootP = existsSync(overviewP) ? overviewP : existsSync(reportP) ? reportP : null;
      }
      if (!rootP || rootP === abs) return false;

      let rootContent = "";
      try {
        rootContent = readFileSync(rootP, "utf8");
      } catch {
        return false;
      }

      const rootHasRevHistory = /revision\s+history/i.test(rootContent);
      if (!rootHasRevHistory) return false;

      const rootVM = rootContent.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
      const rootVersion = rootVM ? rootVM[1].trim() : "";
      if (!parseSemVer(rootVersion)) return false;

      const rootMtime = statSync(rootP).mtimeMs;
      const subtopicMtime = statSync(abs).mtimeMs;
      if (rootMtime < subtopicMtime) {
        return false;
      }
      continue;
    }

    if (!newVersion || !oldVersion) {
      return false;
    }
    const cmp = compareSemVer(newVersion, oldVersion);
    if (cmp === null || cmp <= 0) {
      return false;
    }

    const hasRevHistory =
      toolName === "write"
        ? /revision\s+history/i.test(newText)
        : /revision\s+history/i.test(newText) || /revision\s+history/i.test(oldContent);

    if (!hasRevHistory) {
      return false;
    }
  }

  return true;
}

export function installPolicy(pi: ExtensionApi): void {
  pi.on("tool_call", (event, ctx) => {
    const cwd = handlerCwd(ctx);
    const sessId = sessionIdOf(ctx);
    const e = event as ToolCallEvent;

    if (e.toolName === "edit") {
      const protectedMatch = matchedPath(cwd, e.input);
      if (protectedMatch !== undefined) {
        if (isAuditSubpath(cwd, protectedMatch)) {
          if (!isControlledAuditUpdate(cwd, e.input, "edit")) {
            recordBlock(e.toolName, protectedMatch, "audit", sessId);
            return { block: true, reason: AUDIT_REASON };
          }
        } else {
          recordBlock(e.toolName, protectedMatch, "knowledge", sessId);
          return { block: true, reason: KB_REASON };
        }
      }
    }

    if (e.toolName === "write") {
      const protectedMatch = matchedPath(
        cwd,
        e.input,
        (p) => isProtectedPath(cwd, p) && existsSync(resolve(cwd, p)),
      );
      if (protectedMatch !== undefined) {
        if (isAuditSubpath(cwd, protectedMatch)) {
          if (!isControlledAuditUpdate(cwd, e.input, "write")) {
            recordBlock(e.toolName, protectedMatch, "audit", sessId);
            return { block: true, reason: AUDIT_REASON };
          }
        } else {
          recordBlock(e.toolName, protectedMatch, "knowledge", sessId);
          return { block: true, reason: KB_REASON };
        }
      }
    }

    if (e.toolName === "bash") {
      const command = typeof e.input.command === "string" ? e.input.command : "";
      const check = isDestructiveBashAgainstProtected(command, cwd);
      if (check.blocked) {
        recordBlock(e.toolName, check.target ?? "<bash>", check.reason ?? "knowledge", sessId);
        if (check.reason === "audit") {
          return { block: true, reason: AUDIT_REASON };
        }
        return { block: true, reason: KB_REASON };
      }
    }
    return;
  });
}

/** Resolve the handler working directory; the runtime provides it via ctx. */
function handlerCwd(ctx: unknown): string {
  if (!ctx || typeof ctx !== "object" || !("cwd" in ctx)) return process.cwd();
  return typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
}
