// Locators — every filesystem scan that feeds argument completions (and the
// research project resolver) lives here, behind small named functions.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findRepoRoot, getWorkspaceContext, type KnowledgePaths, type RoutinesPaths, type WorkspaceContext } from "./workspace.ts";

export { findRepoRoot, getWorkspaceContext, type WorkspaceContext };

/** Dated research project dirs (`2026-08-07_<topic_slug>`). */
const DATED_SLUG_RE = /^\d{4}-\d{2}-\d{2}_/;

export interface ResearchProjectLocator {
  slug: string;
  projectDir: string;
  notFound: boolean;
}

/**
 * Research project directories under `<root>/.omp/knowledge/research/`:
 * dated dirs only, dot-dirs excluded, newest first.
 */
export function listResearchProjects(root?: string | null): string[] {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const researchDir = ws.knowledge.research;
  try {
    return readdirSync(researchDir, { withFileTypes: true })
      .filter(
        (ent) => ent.isDirectory() && !ent.name.startsWith(".") && DATED_SLUG_RE.test(ent.name),
      )
      .map((ent) => ent.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Archived research project directories under `<root>/.omp/knowledge/research/.archive/`.
 */
export function listArchivedResearchProjects(root?: string | null): string[] {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const archiveDir = ws.knowledge.archive;
  try {
    return readdirSync(archiveDir, { withFileTypes: true })
      .filter(
        (ent) => ent.isDirectory() && !ent.name.startsWith(".") && DATED_SLUG_RE.test(ent.name),
      )
      .map((ent) => ent.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Resolve an archived research project slug argument against the .archive/ dir.
 */
export function resolveArchivedResearchProjectDir(root: string | null | undefined, slugArg: string): ResearchProjectLocator {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const archiveDir = ws.knowledge.archive;
  let slug = slugArg.trim();
  let projectDir = "";
  const explicitSlug = slug.length > 0;
  if (slug && existsSync(join(archiveDir, slug))) {
    projectDir = join(archiveDir, slug);
  } else {
    const entries = listArchivedResearchProjects(ws.root);
    if (slug) {
      const match = entries.find((e) => e === slug || e.includes(slug) || e.endsWith(slug));
      if (match) {
        slug = match;
        projectDir = join(archiveDir, match);
      }
    }
    if (!projectDir && !explicitSlug && entries.length > 0) {
      slug = entries[0];
      projectDir = join(archiveDir, entries[0]);
    }
  }
  const notFound = explicitSlug && projectDir === "";
  return { slug: (slug || slugArg || "unknown").trim(), projectDir, notFound };
}

/**
 * Safe research target resolver preventing path traversal outside .omp/knowledge/research/.
 */
export function safeResearchTarget(root: string, slug: string): string | null {
  const clean = slug.trim();
  if (!clean || clean.includes("..") || clean.startsWith("/") || clean.startsWith("\\") || clean.includes("/") || clean.includes("\\")) {
    return null;
  }
  const ws = getWorkspaceContext(root);
  const target = join(ws.knowledge.research, clean);
  return existsSync(target) && statSync(target).isDirectory() ? target : null;
}

/**
 * Resolve a research project directory by slug.
 */
export function resolveResearchProjectDir(root: string | null | undefined, slugArg: string): ResearchProjectLocator {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const researchDir = ws.knowledge.research;
  let slug = slugArg.trim();
  let projectDir = "";
  const explicitSlug = slug.length > 0;
  if (slug && existsSync(join(researchDir, slug))) {
    projectDir = join(researchDir, slug);
  } else {
    const entries = listResearchProjects(ws.root);
    if (slug) {
      const match = entries.find((e) => e === slug || e.includes(slug) || e.endsWith(slug));
      if (match) {
        slug = match;
        projectDir = join(researchDir, match);
      }
    }
    if (!projectDir && !explicitSlug && entries.length > 0) {
      slug = entries[0];
      projectDir = join(researchDir, entries[0]);
    }
  }
  const notFound = explicitSlug && projectDir === "";
  return { slug: (slug || slugArg || "unknown").trim(), projectDir, notFound };
}

/**
 * Spec markdown files under .scratch/specs and docs/specs.
 */
export function listSpecFiles(root?: string | null): string[] {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const files: string[] = [];
  const collect = (currentDir: string) => {
    try {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          collect(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(relative(safeRoot, fullPath));
        }
      }
    } catch {
      // ignore missing dirs
    }
  };
  for (const dir of [
    join(safeRoot, ".omp", "scratch", "specs"),
    join(safeRoot, ".scratch", "specs"),
    join(safeRoot, "docs", "specs"),
  ]) {
    collect(dir);
  }
  for (const scratchDir of [join(safeRoot, ".omp", "scratch"), join(safeRoot, ".scratch")]) {
    if (existsSync(scratchDir)) {
      try {
        for (const entry of readdirSync(scratchDir, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name !== "specs" && !entry.name.startsWith(".")) {
            const specFile = join(scratchDir, entry.name, "spec.md");
            if (existsSync(specFile) && statSync(specFile).isFile()) {
              files.push(relative(safeRoot, specFile));
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return Array.from(new Set(files)).sort();
}

/**
 * Recursive `.md` under `.scratch` plus any extra roots.
 */
export function listScratchMarkdown(root?: string | null, extraRoots: string[] = []): string[] {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const files: string[] = [];
  const collect = (currentDir: string) => {
    try {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          collect(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(relative(safeRoot, fullPath));
        }
      }
    } catch {
      // ignore missing dirs
    }
  };
  collect(join(safeRoot, ".omp", "scratch"));
  collect(join(safeRoot, ".scratch"));
  for (const extra of extraRoots) collect(extra);
  return Array.from(new Set(files)).sort();
}

/**
 * Audit report slugs under `<root>/.omp/audits/`.
 */
export function listAuditSlugs(root?: string | null): string[] {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const auditsDir = ws.audits;
  const slugs: string[] = [];
  if (!existsSync(auditsDir)) return slugs;
  try {
    for (const ent of readdirSync(auditsDir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isDirectory()) {
        if (
          existsSync(join(auditsDir, ent.name, "overview.md")) ||
          existsSync(join(auditsDir, ent.name, "report.md"))
        ) {
          slugs.push(ent.name);
        }
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        slugs.push(ent.name.replace(/\.md$/, ""));
      }
    }
  } catch {
    // ignore read error
  }
  return slugs;
}

/**
 * Installed reference repos under `<root>/.omp/references/`.
 */
export function listReferences(root?: string | null): string[] {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const dir = ws.references;
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((ent) => ent.isDirectory() && existsSync(join(dir, ent.name, ".git")))
      .map((ent) => ent.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Routine ids from `scripts/routines/manifest.json` plus `*.sh` files.
 */
export function listRoutines(root?: string | null): string[] {
  const ws = getWorkspaceContext(root ?? process.cwd());
  const routinesDir = ws.routines.root;
  const ids = new Set<string>();
  const manifestPath = ws.routines.manifest;
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Array.isArray(manifest?.routines)) {
        for (const r of manifest.routines) {
          if (typeof r?.id === "string" && r.id.length > 0) {
            ids.add(r.id);
          }
          if (typeof r?.file === "string" && r.file.length > 0) {
            ids.add(r.file);
          }
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }
  if (existsSync(routinesDir)) {
    try {
      for (const name of readdirSync(routinesDir)) {
        if (name.endsWith(".sh") || name.endsWith(".ts") || name.endsWith(".js")) {
          ids.add(name.replace(/\.(sh|ts|js)$/, ""));
          ids.add(name);
        }
      }
    } catch {
      // ignore readdir error
    }
  }
  return Array.from(ids).sort();
}

export interface FeatureDirSpec {
  name: string;
  relBase: string;
  dir: string;
}

/**
 * Feature/spec surface for grill-style completions.
 */
export function listFeatureSpecs(root?: string | null): { dirs: FeatureDirSpec[]; files: string[] } {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const dirs: FeatureDirSpec[] = [];
  const files: Set<string> = new Set();
  const docsDir = join(safeRoot, "docs");

  const scanDocs = (currentDir: string) => {
    try {
      for (const ent of readdirSync(currentDir, { withFileTypes: true })) {
        if (ent.name.startsWith(".")) continue;
        const full = join(currentDir, ent.name);
        if (ent.isDirectory()) {
          dirs.push({ name: ent.name, relBase: "docs", dir: full });
          scanDocs(full);
        } else if (ent.isFile() && ent.name.endsWith(".md")) {
          files.add(relative(safeRoot, full));
        }
      }
    } catch {
      // ignore missing dirs
    }
  };

  if (existsSync(docsDir)) {
    scanDocs(docsDir);
  }

  for (const scratchDir of [join(safeRoot, ".omp", "scratch"), join(safeRoot, ".scratch")]) {
    if (!existsSync(scratchDir)) continue;
    try {
      for (const ent of readdirSync(scratchDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
        const full = join(scratchDir, ent.name);
        dirs.push({ name: ent.name, relBase: relative(safeRoot, scratchDir), dir: full });
        try {
          for (const sub of readdirSync(full, { withFileTypes: true })) {
            if (sub.isFile() && sub.name.endsWith(".md")) {
              files.add(relative(safeRoot, join(full, sub.name)));
            }
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    dirs,
    files: Array.from(files).sort((a, b) => a.localeCompare(b)),
  };
}

export interface FrontierTicket {
  feature: string;
  file: string;
  title: string;
  blockedBy: string[];
}

interface ParsedTicket {
  feature: string;
  relPath: string;
  filename: string;
  slug: string;
  title: string;
  status: string;
  blockedBy: string[];
  isResolved: boolean;
}

export function findFrontierTicket(root?: string | null): FrontierTicket | null {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const scratchBases = [
    { abs: join(safeRoot, ".omp", "scratch"), rel: join(".omp", "scratch") },
    { abs: join(safeRoot, ".scratch"), rel: ".scratch" },
  ];

  const allTickets: ParsedTicket[] = [];

  for (const { abs: scratchAbs, rel: scratchRel } of scratchBases) {
    if (!existsSync(scratchAbs) || !statSync(scratchAbs).isDirectory()) continue;
    try {
      const featEntries = readdirSync(scratchAbs);
      for (const featName of featEntries) {
        if (featName.startsWith(".")) continue;
        const featurePath = join(scratchAbs, featName);
        if (!existsSync(featurePath) || !statSync(featurePath).isDirectory()) continue;
        const feature = featName;
        const issuesDir = join(scratchAbs, feature, "issues");
        if (!existsSync(issuesDir) || !statSync(issuesDir).isDirectory()) continue;

        const issueFiles = readdirSync(issuesDir);
        for (const filename of issueFiles) {
          if (filename.startsWith(".") || !filename.endsWith(".md")) continue;
          const filePath = join(issuesDir, filename);
          if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
          const relPath = join(scratchRel, feature, "issues", filename);
          try {
            const content = readFileSync(filePath, "utf8");
            const slug = filename.replace(/\.md$/, "");

            const titleMatch = content.match(/^(?:title|Title):\s*["']?([^"'\r\n]+)["']?/m);
            const headerMatch = content.match(/^#\s+(.+)$/m);
            const title =
              titleMatch?.[1]?.trim() ??
              headerMatch?.[1]?.trim() ??
              slug;

            const statusMatch = content.match(/^(?:status|Status):\s*["']?([^"'\r\n]+)["']?/m);
            const status = (statusMatch?.[1]?.trim() ?? "open").toLowerCase();

            const isResolved =
              status === "resolved" ||
              status === "done" ||
              status === "closed" ||
              status === "completed";

            const blockedBy: string[] = [];
            const arrayMatch = content.match(/^(?:blocked_by|blockedBy|Blocked by|Blocked-By):\s*\[(.*?)\]/im);
            if (arrayMatch) {
              const rawItems = arrayMatch[1].split(",");
              for (const item of rawItems) {
                const cleaned = item.trim().replace(/^["']|["']$/g, "");
                if (cleaned.length > 0) blockedBy.push(cleaned);
              }
            } else {
              const lineMatch = content.match(/^(?:blocked_by|blockedBy|Blocked by|Blocked-By):\s*(.+)$/im);
              if (lineMatch) {
                const rawItems = lineMatch[1].split(",");
                for (const item of rawItems) {
                  const cleaned = item.trim().replace(/^["']|["']$/g, "");
                  if (cleaned.length > 0 && cleaned !== "[]" && cleaned !== "none") {
                    blockedBy.push(cleaned);
                  }
                }
              }
            }
            allTickets.push({
              feature,
              relPath,
              filename,
              slug,
              title,
              status,
              blockedBy,
              isResolved,
            });
          } catch {
            // Ignore parse errors on individual ticket files
          }
        }
      }
    } catch {
      // Ignore scratch directory access errors
    }
  }

  if (allTickets.length === 0) return null;
  const resolvedSlugs = new Set(allTickets.filter((t) => t.isResolved).map((t) => t.slug));

  for (const t of allTickets) {
    if (t.isResolved) continue;
    const isUnblocked = t.blockedBy.every((dep) => resolvedSlugs.has(dep));
    if (isUnblocked) {
      return {
        feature: t.feature,
        file: t.relPath,
        title: t.title,
        blockedBy: t.blockedBy,
      };
    }
  }

  return null;
}

export interface AdrDirLocator {
  dir: string;
  relDir: string;
  isNew: boolean;
}

export function resolveAdrDir(root?: string | null): AdrDirLocator {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const ws = getWorkspaceContext(safeRoot);
  ws.ensureAdrDir();
  return { dir: ws.adr.root, relDir: ws.adr.relDir, isNew: !ws.adr.isLegacy };
}

export function listAdrFiles(root?: string | null): string[] {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const { dir } = resolveAdrDir(safeRoot);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md") && !name.startsWith("."))
      .sort();
  } catch {
    return [];
  }
}

export interface KnowledgeDirs {
  rootDir: string;
  recordsDir: string;
  pitfallsDir: string;
  researchDir: string;
  indexPath: string;
}

export function ensureKnowledgeDirs(root?: string | null): KnowledgeDirs {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const ws = getWorkspaceContext(safeRoot);
  const kb = ws.ensureKnowledgeDirs();
  return {
    rootDir: kb.root,
    recordsDir: kb.records,
    pitfallsDir: kb.pitfalls,
    researchDir: kb.research,
    indexPath: kb.index,
  };
}

export interface RoutinesDirs {
  routinesDir: string;
  manifestPath: string;
}

export function ensureRoutinesDirs(root?: string | null): RoutinesDirs {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const ws = getWorkspaceContext(safeRoot);
  const r = ws.ensureRoutinesDirs();
  return { routinesDir: r.root, manifestPath: r.manifest };
}

export function ensureScratchDirs(root?: string | null): string {
  const safeRoot = typeof root === "string" && root ? root : process.cwd();
  const ws = getWorkspaceContext(safeRoot);
  return ws.ensureScratchDirs();
}
