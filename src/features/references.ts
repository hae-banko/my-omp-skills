// /reference — LOCAL, deterministic corpus management.
//
// The command executes git itself (clone / pull / rev-parse / remote get-url)
// with an args array — never shell interpolation — and reports the result as
// a transcript card plus UI toasts. Zero agent turns: no user message is
// ever queued, so the model never replies and cloning never shows up as
// agent activity.
//
// The corpus `.omp/references/` is gitignored raw, mutable material:
//   add <url>    clone into .omp/references/<name> (name derived from URL)
//   update <name> git pull; reports HEAD before → after
//   remove <name> delete the directory (name must be a plain basename)
//   list         corpus of name: remote · HEAD
// Bare invocation is an alias for `list`.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CommandContext, ExtensionApi } from "../core/api.ts";
import { listReferences } from "../core/locators.ts";
import { BORDER_COLORS, toolResultCard } from "../research/research-format.ts";

const REFERENCES_LINE = ".omp/references/";
const RESULT_CUSTOM_TYPE = "reference-result";
const GIT_MAX_BUFFER = 32 * 1024 * 1024; // clone output can exceed node's 1 MiB default

/**
 * Derive the reference directory name from a clone URL: last path segment,
 * trailing `.git` stripped. Handles both `git@host:owner/repo.git` (scp-like)
 * and `https://host/owner/repo[.git]` forms (and any URL with a pathname,
 * e.g. `file://` in tests). Returns null when no safe name is derivable.
 */
export function deriveReferenceName(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const sshForm = trimmed.match(/^[\w.-]+@[\w.-]+:(.+)$/);
  let pathPart: string;
  if (sshForm) {
    pathPart = sshForm[1];
  } else {
    try {
      pathPart = new URL(trimmed).pathname;
    } catch {
      return null; // not a URL or an scp-like form we recognize
    }
  }

  const segments = pathPart.split("/").filter((s) => s.length > 0);
  let name = segments.length > 0 ? segments[segments.length - 1] : "";
  if (name.endsWith(".git")) name = name.slice(0, -4);

  // Refuse empty / traversal / hidden names.
  if (!name || name === "." || name === ".." || name.includes("/") || name.startsWith(".")) {
    return null;
  }
  return name;
}

/**
 * Resolve `<name>` to its corpus directory, or null when the name is not a
 * plain directory name. The basename check (no separators, no traversal, no
 * hidden/empty names) plus a final dirname assertion guarantee the resolved
 * target stays inside `<root>/.omp/references/` — `remove` and `update` rely
 * on this before touching anything.
 */
export function safeReferenceTarget(root: string, name: string): string | null {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.startsWith(".")
  ) {
    return null;
  }
  const refsDir = join(root, ".omp", "references");
  const target = join(refsDir, trimmed);
  if (dirname(target) !== refsDir) return null;
  return target;
}

/**
 * Does one normalized `.gitignore` line already cover the target path?
 * `.omp/` and `.omp` cover `.omp/references/`; `.omp/references` and
 * `.omp/references/` cover it exactly. Blank/comment lines never cover.
 */
export function gitignoreLineCovers(line: string, target: string): boolean {
  const l = line.trim();
  if (!l || l.startsWith("#")) return false;
  if (l === target) return true;
  if (l.endsWith("/") && target.startsWith(l)) return true;
  if (target.startsWith(l + "/")) return true;
  return false;
}

/**
 * Make sure the corpus stays gitignored: append the relative
 * `.omp/references/` line to the repo-root `.gitignore` when no existing
 * line covers it. Creates `.gitignore` when missing (the corpus must never
 * be committed; a fresh repo root gets the line with the first `add`).
 */
export function ensureReferencesGitignore(root: string): void {
  const gitignorePath = join(root, ".gitignore");
  let content = "";
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, "utf8");
  }
  const covered = content.split(/\r?\n/).some((line) => gitignoreLineCovers(line, REFERENCES_LINE));
  if (covered) return;
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${content}${separator}${REFERENCES_LINE}\n`);
}

function runGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  execFile("git", args, { cwd, maxBuffer: GIT_MAX_BUFFER }, (error, stdout, stderr) => {
    if (error) reject(error);
    else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
  });
  return promise;
}

function errMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; stderr?: string };
  if (e?.code === "ENOENT") return "git not found on PATH";
  // git prefixes the root cause with "fatal: " / "error: "; progress noise
  // ("Cloning into …") and continuation lines lead and must be skipped.
  const text = [typeof e?.stderr === "string" ? e.stderr : "", e?.message ?? "", String(err)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const fatal = lines.find((l) => l.startsWith("fatal:"));
  const flagged = lines.find((l) => /^error:/i.test(l));
  return fatal ?? flagged ?? lines[lines.length - 1] ?? "unknown git error";
}

function emitCard(
  pi: ExtensionApi,
  ctx: CommandContext,
  cardContent: string,
  toast: string,
  level: "info" | "error" = "info",
): void {
  ctx.ui?.notify?.(toast, level);
  pi.sendMessage({
    customType: RESULT_CUSTOM_TYPE,
    content: cardContent,
    display: true,
    attribution: "user",
  });
}

function emitError(pi: ExtensionApi, ctx: CommandContext, message: string): void {
  emitCard(pi, ctx, `Reference — ${message}`, message, "error");
}

async function addReference(pi: ExtensionApi, root: string, urlArg: string, ctx: CommandContext): Promise<void> {
  const url = urlArg.trim();
  if (!url) {
    emitError(pi, ctx, "Missing URL — /reference add <url>");
    return;
  }
  const name = deriveReferenceName(url);
  if (!name) {
    emitError(pi, ctx, `Could not derive a reference name from "${url}"`);
    return;
  }
  const target = safeReferenceTarget(root, name);
  if (!target) {
    emitError(pi, ctx, `Refusing to add "${url}": derived name "${name}" is not a safe directory name`);
    return;
  }
  if (existsSync(target)) {
    emitError(pi, ctx, `.omp/references/${name} already exists — use /reference update ${name}`);
    return;
  }

  ctx.ui?.notify?.(`Cloning ${name} from ${url}…`, "info");
  try {
    mkdirSync(join(root, ".omp", "references"), { recursive: true });
    await runGit(["clone", url, target]);
  } catch (err) {
    emitError(pi, ctx, `Clone failed for ${name}: ${errMessage(err)}`);
    return;
  }
  const [remote, head] = await Promise.all([
    runGit(["remote", "get-url", "origin"], target)
      .then((r) => r.stdout)
      .catch(() => ""),
    runGit(["rev-parse", "HEAD"], target)
      .then((r) => r.stdout)
      .catch(() => ""),
  ]);
  try {
    ensureReferencesGitignore(root);
  } catch {
    // Best-effort: the clone is the deliverable; gitignore is housekeeping.
  }
  const remoteSuffix = remote ? ` · remote ${remote}` : "";
  const headSuffix = head ? ` · HEAD ${head}` : "";
  emitCard(pi, ctx, `Reference added — ${name}${remoteSuffix}${headSuffix}`, `Reference ${name} added`);
}

async function updateReference(
  pi: ExtensionApi,
  root: string,
  nameArg: string,
  ctx: CommandContext,
): Promise<void> {
  const name = nameArg.trim();
  const target = safeReferenceTarget(root, name);
  if (!target) {
    emitError(pi, ctx, `Invalid reference name "${nameArg.trim()}"`);
    return;
  }
  if (!existsSync(join(target, ".git"))) {
    emitError(pi, ctx, `.omp/references/${name} is not an installed reference — use /reference add <url>`);
    return;
  }
  const before = await runGit(["rev-parse", "HEAD"], target)
    .then((r) => r.stdout)
    .catch(() => "unknown");
  ctx.ui?.notify?.(`Pulling ${name}…`, "info");
  try {
    await runGit(["pull"], target);
  } catch (err) {
    emitError(pi, ctx, `Update failed for ${name}: ${errMessage(err)}`);
    return;
  }
  const after = await runGit(["rev-parse", "HEAD"], target)
    .then((r) => r.stdout)
    .catch(() => "unknown");
  emitCard(pi, ctx, `Reference updated — ${name}: HEAD ${before} → ${after}`, `Reference ${name} updated`);
}

async function removeReference(
  pi: ExtensionApi,
  root: string,
  nameArg: string,
  ctx: CommandContext,
): Promise<void> {
  const name = nameArg.trim();
  const target = safeReferenceTarget(root, name);
  if (!target) {
    emitError(
      pi,
      ctx,
      `Refusing to remove "${nameArg.trim()}": name must be a plain directory inside .omp/references/`,
    );
    return;
  }
  if (!existsSync(target)) {
    emitError(pi, ctx, `.omp/references/${name} does not exist`);
    return;
  }
  rmSync(target, { recursive: true, force: true });
  emitCard(pi, ctx, `Removed .omp/references/${name}`, `Reference ${name} removed`);
}

async function listCorpus(pi: ExtensionApi, root: string, ctx: CommandContext): Promise<void> {
  const names = listReferences(root);
  if (names.length === 0) {
    emitCard(pi, ctx, "Reference corpus is empty — /reference add <url> starts it", "Reference corpus is empty");
    return;
  }
  const rows = await Promise.all(
    names.map(async (name) => {
      const dir = join(root, ".omp", "references", name);
      const [remote, head] = await Promise.all([
        runGit(["remote", "get-url", "origin"], dir)
          .then((r) => r.stdout)
          .catch(() => "?"),
        runGit(["rev-parse", "HEAD"], dir)
          .then((r) => r.stdout)
          .catch(() => "?"),
      ]);
      return `${name}: remote ${remote} · HEAD ${head}`;
    }),
  );
  const plural = names.length === 1 ? "entry" : "entries";
  emitCard(
    pi,
    ctx,
    `Reference corpus (${names.length} ${plural}):\n${rows.join("\n")}`,
    `Reference corpus: ${names.length} ${plural}`,
  );
}

/**
 * Entry point for the local handler. `root` is resolved by the caller
 * (index.ts honors the `MY_OMP_SKILLS_TEST_ROOT` test-only override there).
 * Never throws: every failure path becomes an error toast + error card.
 */
export async function runReferenceCommand(
  pi: ExtensionApi,
  root: string,
  args: string,
  ctx: CommandContext,
): Promise<void> {
  const argText = args.trim();
  const tokens = argText ? argText.split(/\s+/) : [];
  const head = (tokens[0] ?? "").toLowerCase();
  const rest = tokens.slice(1).join(" ");

  try {
    if (argText === "" || head === "list") {
      await listCorpus(pi, root, ctx);
      return;
    }
    if (head === "add") {
      await addReference(pi, root, rest, ctx);
      return;
    }
    if (head === "update") {
      await updateReference(pi, root, rest, ctx);
      return;
    }
    if (head === "remove") {
      await removeReference(pi, root, rest, ctx);
      return;
    }
    emitError(pi, ctx, `Unknown subcommand "${head}" — /reference add <url> | update <name> | remove <name> | list`);
  } catch (err) {
    emitError(pi, ctx, `Reference command failed: ${errMessage(err)}`);
  }
}

/** Transcript card renderer for `/reference` results (REFERENCE — …). */
export function installReferenceResultRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer(RESULT_CUSTOM_TYPE, (message, _options, _theme) => {
    const content =
      message && typeof message === "object" && "content" in message ? String(message.content ?? "") : "";
    return toolResultCard(content.split("\n").slice(0, 8), "REFERENCE", BORDER_COLORS.blue);
  });
}
