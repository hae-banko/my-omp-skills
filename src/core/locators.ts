// Locators — every filesystem scan that feeds argument completions (and the
// research project resolver) lives here, behind small named functions.
//
// index.ts keeps only the omp registration seam: each completion becomes a
// thin consumer of one locator, so slug/spec/audit/reference/routine listing
// has a single implementation instead of a bespoke readdirSync+filter+sort per
// command. All scans take `root` (the repo root) and return repo-relative
// names/paths.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Dated research project dirs (`2026-08-07_<topic_slug>`). */
const DATED_SLUG_RE = /^\d{4}-\d{2}-\d{2}_/;

export interface ResearchProjectLocator {
  slug: string;
  projectDir: string;
  notFound: boolean;
}

/**
 * Research project directories under `<root>/.omp/knowledge/research/`:
 * dated dirs only, dot-dirs excluded, newest first (ISO dates sort
 * lexicographically, so sort().reverse() == newest first).
 */
export function listResearchProjects(root: string): string[] {
  const researchDir = join(root, ".omp", "knowledge", "research");
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
 * Resolve a research project slug argument against the research dir.
 * Semantics (kept from the original index.ts implementation):
 * - explicit slug: exact directory match wins; otherwise fuzzy match
 *   (contains/ends-with) against the dated listing; no match → notFound
 * - empty argument: most recent dated project directory
 */
export function resolveResearchProjectDir(root: string, slugArg: string): ResearchProjectLocator {
  const researchDir = join(root, ".omp", "knowledge", "research");
  let slug = slugArg.trim();
  let projectDir = "";
  const explicitSlug = slug.length > 0;
  if (slug && existsSync(join(researchDir, slug))) {
    projectDir = join(researchDir, slug);
  } else {
    const entries = listResearchProjects(root);
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
 * Spec markdown files: recursive `.md` under `.scratch/specs` and
 * `docs/specs`, plus each feature dir's `<dir>/spec.md` (the `.scratch`
 * `specs` dir itself and dot-dirs are excluded). Repo-relative, sorted.
 */
export function listSpecFiles(root: string): string[] {
  const files: string[] = [];
  const collect = (currentDir: string) => {
    try {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          collect(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(relative(root, fullPath));
        }
      }
    } catch {
      // ignore missing dirs
    }
  };
  for (const dir of [
    join(root, ".omp", "scratch", "specs"),
    join(root, ".scratch", "specs"),
    join(root, "docs", "specs"),
  ]) {
    collect(dir);
  }
  for (const scratchDir of [join(root, ".omp", "scratch"), join(root, ".scratch")]) {
    if (existsSync(scratchDir)) {
      try {
        for (const entry of readdirSync(scratchDir, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name !== "specs" && !entry.name.startsWith(".")) {
            const specFile = join(scratchDir, entry.name, "spec.md");
            if (existsSync(specFile) && statSync(specFile).isFile()) {
              files.push(relative(root, specFile));
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
 * Recursive `.md` under `.scratch` plus any extra roots (e.g. `docs/specs`
 * for /implement), dot-dirs skipped, deduped, repo-relative, sorted.
 */
export function listScratchMarkdown(root: string, extraRoots: string[] = []): string[] {
  const files: string[] = [];
  const collect = (currentDir: string) => {
    try {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          collect(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(relative(root, fullPath));
        }
      }
    } catch {
      // ignore missing dirs
    }
  };
  collect(join(root, ".omp", "scratch"));
  collect(join(root, ".scratch"));
  for (const extra of extraRoots) collect(extra);
  return Array.from(new Set(files)).sort();
}

/**
 * Audit report slugs under `<root>/.omp/audits/`: directories carrying
 * `overview.md`/`report.md`, plus bare `.md` report files (ext stripped).
 * readdir order preserved (matches the original completion behavior).
 */
export function listAuditSlugs(root: string): string[] {
  const auditsDir = join(root, ".omp", "audits");
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

/** Installed reference repos under `<root>/.omp/references/` (dirs with `.git`), sorted. */
export function listReferences(root: string): string[] {
  const dir = join(root, ".omp", "references");
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (ent) => ent.isDirectory() && !ent.name.startsWith(".") && existsSync(join(dir, ent.name, ".git")),
      )
      .map((ent) => ent.name)
      .sort();
  } catch {
    return [];
  }
}

/** Routine ids from `scripts/routines/manifest.json` plus `*.sh` files, sorted. */
export function listRoutines(root: string): string[] {
  const routinesDir = join(root, "scripts", "routines");
  const ids = new Set<string>();
  const manifestPath = join(routinesDir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const parsed: { routines?: Array<{ id?: string; file?: string }> } = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      );
      if (parsed && Array.isArray(parsed.routines)) {
        for (const r of parsed.routines) {
          if (r && typeof r.id === "string") ids.add(r.id);
          else if (r && typeof r.file === "string") ids.add(r.file);
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  try {
    for (const entry of readdirSync(routinesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".sh")) {
        ids.add(entry.name.slice(0, -3));
        ids.add(entry.name);
      }
    }
  } catch {
    // ignore missing routines directory
  }
  return Array.from(ids).sort();
}

export interface FeatureDirSpec {
  name: string;
  /** relBase of the first occurrence (feature dirs dedupe by name across roots). */
  relBase: string;
}

export interface FeatureSpecSurface {
  dirs: FeatureDirSpec[];
  files: string[];
}

/**
 * Feature/spec surface for grill-style completions: directory names under
 * `.scratch` + `docs` (deduped by name, dot-dirs skipped) and `.md` file
 * paths (repo-relative). Feeds /grill-me and /grill-with-docs.
 */
export function listFeatureSpecs(root: string): FeatureSpecSurface {
  const dirs = new Map<string, string>();
  const files = new Set<string>();
  const scan = (baseDir: string, relBase: string) => {
    if (!existsSync(baseDir)) return;
    try {
      for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          if (!dirs.has(entry.name)) dirs.set(entry.name, relBase);
          scan(join(baseDir, entry.name), join(relBase, entry.name));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.add(join(relBase, entry.name));
        }
      }
    } catch {
      // ignore
    }
  };
  scan(join(root, ".omp", "scratch"), join(".omp", "scratch"));
  scan(join(root, ".scratch"), ".scratch");
  scan(join(root, "docs"), "docs");
  return {
    dirs: Array.from(dirs, ([name, relBase]) => ({ name, relBase })).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
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

export function findFrontierTicket(root: string): FrontierTicket | null {
  const scratchBases = [
    { abs: join(root, ".omp", "scratch"), rel: join(".omp", "scratch") },
    { abs: join(root, ".scratch"), rel: ".scratch" },
  ];

  const allTickets: ParsedTicket[] = [];

  for (const { abs: scratchAbs, rel: scratchRel } of scratchBases) {
    if (!existsSync(scratchAbs) || !statSync(scratchAbs).isDirectory()) continue;
    try {
      const featEntries = readdirSync(scratchAbs, { withFileTypes: true });
      for (const featEnt of featEntries) {
        if (!featEnt.isDirectory() || featEnt.name.startsWith(".")) continue;
        const feature = featEnt.name;
        const issuesDir = join(scratchAbs, feature, "issues");
        if (!existsSync(issuesDir) || !statSync(issuesDir).isDirectory()) continue;

        const issueFiles = readdirSync(issuesDir, { withFileTypes: true });
        for (const fileEnt of issueFiles) {
          if (!fileEnt.isFile() || !fileEnt.name.endsWith(".md")) continue;
          const filename = fileEnt.name;
          const filePath = join(issuesDir, filename);
          const relPath = join(scratchRel, feature, "issues", filename);

          let body = "";
          try {
            body = readFileSync(filePath, "utf8");
          } catch {
            continue;
          }

          const titleMatch = body.match(/^(?:title|Title):\s*["']?([^"'\r\n]+)["']?/m);
          const headerMatch = body.match(/^#\s+(.+)$/m);
          const title =
            titleMatch?.[1]?.trim() ??
            headerMatch?.[1]?.trim() ??
            filename.replace(/\.md$/, "");

          const statusMatch = body.match(/^(?:status|Status):\s*["']?([^"'\r\n]+)["']?/m);
          const status = (statusMatch?.[1]?.trim() ?? "open").toLowerCase();

          const isResolved =
            status === "resolved" ||
            status === "done" ||
            status === "closed" ||
            status === "completed";

          const blockedBy: string[] = [];
          const arrayMatch = body.match(/^(?:blocked_by|blockedBy|Blocked by|Blocked-By):\s*\[(.*?)\]/m);
          if (arrayMatch) {
            const rawItems = arrayMatch[1].split(",");
            for (const item of rawItems) {
              const cleaned = item.trim().replace(/^["']|["']$/g, "");
              if (cleaned.length > 0) blockedBy.push(cleaned);
            }
          } else {
            const lineMatch = body.match(/^(?:blocked_by|blockedBy|Blocked by|Blocked-By):\s*(.+)$/m);
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

          const slug = filename.replace(/\.md$/, "");
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
        }
      }
    } catch {
      // ignore
    }
  }

  if (allTickets.length === 0) return null;

  const isBlockerResolved = (blockerStr: string, currentFeature: string): boolean => {
    const bLower = blockerStr.toLowerCase().replace(/\.md$/, "");
    const matches = allTickets.filter((t) => {
      if (t.feature !== currentFeature) return false;
      const tSlug = t.slug.toLowerCase();
      const tFile = t.filename.toLowerCase();
      const tTitle = t.title.toLowerCase();
      return (
        tSlug === bLower ||
        tSlug.startsWith(bLower) ||
        bLower.startsWith(tSlug) ||
        tFile === bLower ||
        tTitle.includes(bLower)
      );
    });

    if (matches.length === 0) {
      return true;
    }
    return matches.every((m) => m.isResolved);
  };

  allTickets.sort((a, b) => a.filename.localeCompare(b.filename));

  for (const t of allTickets) {
    if (t.isResolved) continue;
    const isOpenStatus =
      t.status === "open" ||
      t.status === "ready-for-agent" ||
      t.status === "unclaimed" ||
      !t.status;

    if (!isOpenStatus) continue;

    const unblocked = t.blockedBy.every((b) => isBlockerResolved(b, t.feature));
    if (unblocked) {
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
