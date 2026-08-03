// tool_call policy: the repo-local knowledge base is append-only. Records and
// pitfalls are never rewritten in place and INDEX.md only gains lines — this
// is the AGENTS.md convention made a runtime invariant. Research project
// working files (outline.yaml, fields.yaml) stay editable; they are
// human-in-the-loop work products, not durable records.

import { existsSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { ExtensionApi, ToolCallEvent, ToolCallEventResult } from "./api.ts";

const KB_REASON =
  "Blocked: the knowledge base is append-only. Records and pitfalls are never edited in place — " +
  "a new finding is a new file. Use the /record or /pitfall command (user-invoked slash command) instead.";

/** Segments of a tool-call path below `.omp/knowledge/`, or null when outside the KB. */
function knowledgeSubpath(cwd: string, raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const abs = isAbsolute(raw) ? normalize(raw) : normalize(resolve(cwd, raw));
  const parts = abs.split(sep);
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === ".omp" && parts[i + 1] === "knowledge") {
      return parts.slice(i + 2);
    }
  }
  return null;
}

/** True when the path targets the append-only stores (records/, pitfalls/, INDEX.md). */
function isProtectedPath(cwd: string, raw: unknown): boolean {
  const sub = knowledgeSubpath(cwd, raw);
  if (!sub || sub.length === 0) return false;
  const first = sub[0];
  return first === "records" || first === "pitfalls" || first === "INDEX.md";
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
    command.includes(".omp/knowledge/INDEX.md")
  );
}

/** True when the shell command can mutate a file (append `>>` excluded — INDEX.md grows by appending). */
function isDestructiveShell(command: string): boolean {
  return /(?:^|\s)sed\s+-i\b|\btee\b|(?<!>)>(?!>)|\bmv\b|\brm\b|\bcp\b|\btruncate\b|\bshred\b|\bunlink\b/.test(
    command,
  );
}

export function installPolicy(pi: ExtensionApi): void {
  pi.on("tool_call", (event, ctx) => {
    const cwd = handlerCwd(ctx);
    // The runtime tool_call event carries toolName + input per the documented
    // event contract (omp://extensions.md); the API shim types it as unknown.
    const e = event as ToolCallEvent;

    if (e.toolName === "edit" && anyProtectedPath(cwd, e.input)) {
      return { block: true, reason: KB_REASON };
    }
    if (e.toolName === "write" && anyExistingProtectedPath(cwd, e.input)) {
      return { block: true, reason: KB_REASON };
    }
    if (e.toolName === "bash") {
      const command = typeof e.input.command === "string" ? e.input.command : "";
      if (refersToProtected(command) && isDestructiveShell(command)) {
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
