// Workspace Context — Single authoritative layout and directory resolver
// Unifies scattered path joins and filesystem walks across knowledge base, routines, ADRs, and research.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface KnowledgePaths {
  root: string;
  records: string;
  pitfalls: string;
  research: string;
  archive: string;
  index: string;
}

export interface RoutinesPaths {
  root: string;
  manifest: string;
}

export interface AdrPaths {
  root: string;
  relDir: string;
  isLegacy: boolean;
}

export interface WorkspaceContext {
  root: string;
  isRepo: boolean;
  knowledge: KnowledgePaths;
  routines: RoutinesPaths;
  scratch: string;
  adr: AdrPaths;
  audits: string;
  references: string;
  ensureKnowledgeDirs: () => KnowledgePaths;
  ensureRoutinesDirs: () => RoutinesPaths;
  ensureScratchDirs: () => string;
  ensureAdrDir: () => string;
}

const workspaceCache = new Map<string, WorkspaceContext>();

export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, ".omp")) ||
      existsSync(join(dir, ".scratch")) ||
      existsSync(join(dir, "scripts", "routines"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return resolve(startDir);
    }
    dir = parent;
  }
}

/**
 * Resolve the unified workspace context for the current working directory or given root.
 */
export function getWorkspaceContext(startDir: string = process.cwd()): WorkspaceContext {
  const resolvedStart = resolve(startDir);
  const root = findRepoRoot(resolvedStart);
  const isRepo = existsSync(join(root, ".git")) || existsSync(join(root, ".omp"));
  const kbRoot = join(root, ".omp", "knowledge");
  const knowledge: KnowledgePaths = {
    root: kbRoot,
    records: join(kbRoot, "records"),
    pitfalls: join(kbRoot, "pitfalls"),
    research: join(kbRoot, "research"),
    archive: join(kbRoot, "research", ".archive"),
    index: join(kbRoot, "INDEX.md"),
  };

  // Routines Paths
  const routinesRoot = join(root, "scripts", "routines");
  const routines: RoutinesPaths = {
    root: routinesRoot,
    manifest: join(routinesRoot, "manifest.json"),
  };

  // Scratch Path
  const scratch = join(root, ".omp", "scratch");

  // ADR Paths (support .omp/adr/ with docs/adr/ legacy fallback)
  const ompAdr = join(root, ".omp", "adr");
  const docsAdr = join(root, "docs", "adr");
  let adr: AdrPaths;
  if (existsSync(docsAdr) && !existsSync(ompAdr)) {
    adr = { root: docsAdr, relDir: "docs/adr", isLegacy: true };
  } else {
    adr = { root: ompAdr, relDir: ".omp/adr", isLegacy: false };
  }

  // Audits & References
  const audits = join(root, ".omp", "audits");
  const references = join(root, ".omp", "references");

  const ensureKnowledgeDirs = (): KnowledgePaths => {
    try {
      mkdirSync(knowledge.records, { recursive: true });
      mkdirSync(knowledge.pitfalls, { recursive: true });
      mkdirSync(knowledge.research, { recursive: true });
      if (!existsSync(knowledge.index)) {
        writeFileSync(knowledge.index, "# Knowledge Base Index\n\n", "utf8");
      }
    } catch {
      // Ignore write errors on restricted roots
    }
    return knowledge;
  };

  const ensureRoutinesDirs = (): RoutinesPaths => {
    try {
      mkdirSync(routines.root, { recursive: true });
      if (!existsSync(routines.manifest)) {
        writeFileSync(routines.manifest, JSON.stringify({ routines: [] }, null, 2) + "\n", "utf8");
      }
    } catch {
      // Ignore write errors
    }
    return routines;
  };

  const ensureScratchDirs = (): string => {
    try {
      mkdirSync(scratch, { recursive: true });
    } catch {
      // Ignore write errors
    }
    return scratch;
  };

  const ensureAdrDir = (): string => {
    try {
      mkdirSync(adr.root, { recursive: true });
    } catch {
      // Ignore write errors
    }
    return adr.root;
  };

  const ctx: WorkspaceContext = {
    root,
    isRepo,
    knowledge,
    routines,
    scratch,
    adr,
    audits,
    references,
    ensureKnowledgeDirs,
    ensureRoutinesDirs,
    ensureScratchDirs,
    ensureAdrDir,
  };

  workspaceCache.set(resolvedStart, ctx);
  return ctx;
}
