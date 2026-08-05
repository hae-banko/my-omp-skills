// Repo-local knowledge base reader, shared by the knowledge_read tool and the
// record/pitfall message renderers. Anchors on the nearest `.omp/knowledge/`
// walking up from cwd — no git subprocess, so it works in worktrees and in
// plain directories alike.

import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { dirname, join } from "node:path";

export type KnowledgeType = "index" | "records" | "pitfalls" | "research" | "audits";

export interface KnowledgeQuery {
  type: KnowledgeType;
  slug?: string;
  limit?: number;
  full?: boolean;
}

export interface KnowledgeReadResult {
  found: boolean;
  text: string;
  details: {
    found: boolean;
    type: KnowledgeType;
    count: number;
    paths: string[];
  };
}

/** Nearest directory containing `.omp/knowledge/`, walking up from startDir. */
const knowledgeRootCache = new Map<string, string | null>();
export function findKnowledgeRoot(startDir: string): string | null {
  const cached = knowledgeRootCache.get(startDir);
  if (cached !== undefined) return cached;
  let dir = startDir;
  for (;;) {
    const candidateKb = join(dir, ".omp", "knowledge");
    const candidateAudits = join(dir, ".omp", "audits");
    if (
      (existsSync(candidateKb) && statSync(candidateKb).isDirectory()) ||
      (existsSync(candidateAudits) && statSync(candidateAudits).isDirectory())
    ) {
      knowledgeRootCache.set(startDir, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      knowledgeRootCache.set(startDir, null);
      return null;
    }
    dir = parent;
  }
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .reverse();
}

function firstLine(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("---"));
  return line ? line.slice(0, 120) : "";
}

export function readKnowledge(root: string, query: KnowledgeQuery): KnowledgeReadResult {
  const base = join(root, ".omp", "knowledge");
  const type = query.type;
  const limit = query.limit ?? 10;

  if (type === "index") {
    const indexPath = join(base, "INDEX.md");
    if (!existsSync(indexPath)) {
      return {
        found: true,
        text: "INDEX.md does not exist yet — no entries recorded.",
        details: { found: true, type, count: 0, paths: [] },
      };
    }
    const lines = readFileSync(indexPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
    return {
      found: true,
      text: lines.slice(0, limit).join("\n"),
      details: { found: true, type, count: lines.length, paths: [] },
    };
  }

  if (type === "records" || type === "pitfalls") {
    const dir = join(base, type);
    const files = listMarkdownFiles(dir);
    if (query.slug) {
      const match = files.find((f) => f.startsWith(query.slug ?? "") || f.includes(query.slug ?? ""));
      if (!match) {
        return {
          found: true,
          text: `No ${type} entry matching "${query.slug}".`,
          details: { found: true, type, count: 0, paths: [] },
        };
      }
      const full = readFileSync(join(dir, match), "utf8");
      return {
        found: true,
        text: full,
        details: { found: true, type, count: 1, paths: [join(dir, match)] },
      };
    }
    const picked = files.slice(0, limit);
    const lines = picked.map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      return query.full ? `## ${f}\n${body}` : `- ${f} — ${firstLine(body)}`;
    });
    return {
      found: true,
      text: lines.join("\n") || `No ${type} entries yet.`,
      details: {
        found: true,
        type,
        count: picked.length,
        paths: picked.map((f) => join(dir, f)),
      },
    };
  }

  // research projects
  if (type === "research") {
    const researchDir = join(base, "research");
    let projects: string[] = [];
    try {
      projects = readdirSync(researchDir, { withFileTypes: true })
        .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
        .map((ent) => ent.name)
        .sort()
        .reverse();
    } catch {
      projects = [];
    }
    if (query.slug) {
      const match = projects.find((p) => p.startsWith(query.slug ?? "") || p.includes(query.slug ?? ""));
      if (!match) {
        return {
          found: true,
          text: `No research project matching "${query.slug}".`,
          details: { found: true, type, count: 0, paths: [] },
        };
      }
      const projectDir = join(researchDir, match);
      const entries = existsSync(projectDir) ? readdirSync(projectDir).sort() : [];
      return {
        found: true,
        text: `Research project: ${match}\n${entries.map((e) => `- ${e}`).join("\n")}`,
        details: { found: true, type, count: entries.length, paths: [projectDir] },
      };
    }
    const picked = projects.slice(0, limit);
    return {
      found: true,
      text: picked.join("\n") || "No research projects yet.",
      details: {
        found: true,
        type,
        count: picked.length,
        paths: picked.map((p) => join(researchDir, p)),
      },
    };
  }
  // audits
  if (type === "audits") {
    const auditsDir = join(root, ".omp", "audits");
    interface AuditEntry {
      slug: string;
      path: string;
      body: string;
      version: string;
      title: string;
      status: string;
    }
    const auditsMap = new Map<string, AuditEntry>();
    if (existsSync(auditsDir)) {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(auditsDir, { withFileTypes: true });
      } catch {
        entries = [];
      }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        let filePath: string | null = null;
        let slug = "";
        if (ent.isDirectory()) {
          const reportPath = join(auditsDir, ent.name, "report.md");
          if (existsSync(reportPath)) {
            filePath = reportPath;
            slug = ent.name;
          }
        } else if (ent.isFile() && ent.name.endsWith(".md")) {
          filePath = join(auditsDir, ent.name);
          slug = ent.name.replace(/\.md$/, "");
        }
        if (filePath !== null && !auditsMap.has(slug)) {
          const resolvedPath = filePath;
          const body = readFileSync(resolvedPath, "utf8");
          const versionMatch = body.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
          const version = versionMatch?.[1]?.trim() ?? "v0.1.0";
          const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
          const title = titleMatch?.[1]?.trim() ?? firstLine(body);
          const statusMatch = body.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
          const status = statusMatch?.[1]?.trim() ?? "active";
          auditsMap.set(slug, { slug, path: resolvedPath, body, version, title, status });
        }
      }
    }
    const audits = Array.from(auditsMap.values()).sort((a, b) => b.slug.localeCompare(a.slug));

    if (typeof query.slug === "string" && query.slug.length > 0) {
      const qSlug = query.slug;
      const targetSlug = qSlug.toLowerCase();
      const match = audits.find(
        (a) => a.slug.toLowerCase().startsWith(targetSlug) || a.slug.toLowerCase().includes(targetSlug),
      );
      if (!match) {
        return {
          found: true,
          text: `No audit matching "${qSlug}".`,
          details: { found: true, type, count: 0, paths: [] },
        };
      }
      return {
        found: true,
        text: match.body,
        details: { found: true, type, count: 1, paths: [match.path] },
      };
    }

    const picked = audits.slice(0, limit);
    if (picked.length === 0) {
      return {
        found: true,
        text: "No audits yet.",
        details: { found: true, type, count: 0, paths: [] },
      };
    }

    const lines = picked.map((a) =>
      query.full ? `## ${a.slug} (${a.version})\n${a.body}` : `- ${a.slug} (${a.version}) — ${a.title}`,
    );
    return {
      found: true,
      text: lines.join("\n"),
      details: {
        found: true,
        type,
        count: picked.length,
        paths: picked.map((a) => a.path),
      },
    };
  }

  return {
    found: false,
    text: "Unknown knowledge type.",
    details: { found: false, type: query.type, count: 0, paths: [] },
  };
}
