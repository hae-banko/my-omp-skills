// tool_call policy: the repo-local knowledge base is append-only. Records and
// pitfalls are never rewritten in place and INDEX.md only gains lines — this
// is the AGENTS.md convention made a runtime invariant. Research project
// working files (outline.yaml, fields.yaml) stay editable; they are
// human-in-the-loop work products, not durable records.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { ExtensionApi, ToolCallEvent, ToolCallEventResult } from "./api.ts";

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
  const parts = abs.split(sep);
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === ".omp" && parts[i + 1] === "knowledge") {
      return parts.slice(i + 2);
    }
    if (parts[i] === ".omp" && parts[i + 1] === "audits") {
      return ["audits", ...parts.slice(i + 2)];
    }
  }
  return null;
}

/** True when the path targets the append-only stores (records/, pitfalls/, INDEX.md). */
function isProtectedPath(cwd: string, raw: unknown): boolean {
  const sub = knowledgeSubpath(cwd, raw);
  if (!sub || sub.length === 0) return false;
  const first = sub[0];
  return first === "records" || first === "pitfalls" || first === "INDEX.md" || first === "audits";
}

function anyProtectedPath(cwd: string, input: Record<string, unknown>): boolean {
  const single = input.path;
  if (typeof single === "string" && isProtectedPath(cwd, single)) return true;
  const many = input.paths;
  if (Array.isArray(many)) {
    return many.some((p) => typeof p === "string" && isProtectedPath(cwd, p));
  }
  return false;
}

function anyExistingProtectedPath(cwd: string, input: Record<string, unknown>): boolean {
  const single = input.path;
  if (typeof single === "string" && isProtectedPath(cwd, single) && existsSync(resolve(cwd, single))) {
    return true;
  }
  const many = input.paths;
  if (Array.isArray(many)) {
    return many.some(
      (p) => typeof p === "string" && isProtectedPath(cwd, p) && existsSync(resolve(cwd, p)),
    );
  }
  return false;
}

/** True when the command text references the append-only stores. */
function refersToProtected(command: string): boolean {
  return (
    command.includes(".omp/knowledge/records") ||
    command.includes(".omp/knowledge/pitfalls") ||
    command.includes(".omp/knowledge/INDEX.md") ||
    command.includes(".omp/audits")
  );
}

const DESTRUCTIVE_SHELL_RE =
  /(?:^|\s)sed\s+-i\b|\btee\b|(?<!>)>(?!>)|\bmv\b|\brm\b|\bcp\b|\btruncate\b|\bshred\b|\bunlink\b/;

/** True when the shell command can mutate a file (append `>>` excluded — INDEX.md grows by appending). */
function isDestructiveShell(command: string): boolean {
  return DESTRUCTIVE_SHELL_RE.test(command);
}

function isAuditSubpath(cwd: string, raw: unknown): boolean {
  const sub = knowledgeSubpath(cwd, raw);
  return !!sub && sub[0] === "audits";
}

function getPathList(input: Record<string, unknown>): string[] {
  const res: string[] = [];
  if (typeof input.path === "string") res.push(input.path);
  if (Array.isArray(input.paths)) {
    for (const p of input.paths) {
      if (typeof p === "string") res.push(p);
    }
  }
  return res;
}

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

    const oldVersionMatch = oldContent.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
    const oldVersion = oldVersionMatch ? oldVersionMatch[1].trim() : "";

    let newText = "";
    if (toolName === "write") {
      newText = typeof input.content === "string" ? input.content : "";
    } else if (toolName === "edit") {
      newText = typeof input.input === "string" ? input.input : "";
    }

    const versionMatch = newText.match(/(?:^|\n|\+)\s*version:\s*["']?([^"'\r\n]+)["']?/m);
    const newVersion = versionMatch ? versionMatch[1].trim() : "";
    const isSemVer = /^v?\d+\.\d+\.\d+/.test(newVersion);
    if (!newVersion || !isSemVer || newVersion === oldVersion) {
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
    const e = event as ToolCallEvent;

    if (e.toolName === "edit") {
      const paths = getPathList(e.input);
      for (const p of paths) {
        if (isProtectedPath(cwd, p)) {
          if (isAuditSubpath(cwd, p)) {
            if (!isControlledAuditUpdate(cwd, e.input, "edit")) {
              return { block: true, reason: AUDIT_REASON };
            }
          } else {
            return { block: true, reason: KB_REASON };
          }
        }
      }
    }

    if (e.toolName === "write") {
      const paths = getPathList(e.input);
      for (const p of paths) {
        if (isProtectedPath(cwd, p) && existsSync(resolve(cwd, p))) {
          if (isAuditSubpath(cwd, p)) {
            if (!isControlledAuditUpdate(cwd, e.input, "write")) {
              return { block: true, reason: AUDIT_REASON };
            }
          } else {
            return { block: true, reason: KB_REASON };
          }
        }
      }
    }

    if (e.toolName === "bash") {
      const command = typeof e.input.command === "string" ? e.input.command : "";
      if (refersToProtected(command) && isDestructiveShell(command)) {
        if (command.includes(".omp/audits")) {
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
