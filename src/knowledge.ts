// Repo-local knowledge base reader, shared by the knowledge_read tool and the
// record/pitfall message renderers. Anchors on the nearest `.omp/knowledge/`
// walking up from cwd — no git subprocess, so it works in worktrees and in
// plain directories alike.

import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
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
    if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
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
      const matchPath = join(dir, match);
      if (!existsSync(matchPath) || !statSync(matchPath).isFile()) {
        return {
          found: true,
          text: `No ${type} entry matching "${query.slug}".`,
          details: { found: true, type, count: 0, paths: [] },
        };
      }
      const full = readFileSync(matchPath, "utf8");
      return {
        found: true,
        text: full,
        details: { found: true, type, count: 1, paths: [matchPath] },
      };
    }
    const picked = files.slice(0, limit);
    const lines: string[] = [];
    const validPaths: string[] = [];
    for (const f of picked) {
      const filePath = join(dir, f);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
      const body = readFileSync(filePath, "utf8");
      lines.push(query.full ? `## ${f}\n${body}` : `- ${f} — ${firstLine(body)}`);
      validPaths.push(filePath);
    }
    return {
      found: true,
      text: lines.join("\n") || `No ${type} entries yet.`,
      details: {
        found: true,
        type,
        count: validPaths.length,
        paths: validPaths,
      },
    };
  }

  // research projects
  if (type === "research") {
    const researchDir = join(base, "research");
    let projects: string[] = [];
    if (existsSync(researchDir) && statSync(researchDir).isDirectory()) {
      try {
        projects = readdirSync(researchDir, { withFileTypes: true })
          .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
          .map((ent) => ent.name)
          .sort()
          .reverse();
      } catch {
        projects = [];
      }
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
      const entries =
        existsSync(projectDir) && statSync(projectDir).isDirectory()
          ? readdirSync(projectDir).sort()
          : [];
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
    interface SubtopicEntry {
      slug: string;
      relPath: string;
      path: string;
      body: string;
      title: string;
    }
    interface AuditEntry {
      slug: string;
      path: string;
      body: string;
      version: string;
      title: string;
      status: string;
      subtopics: SubtopicEntry[];
    }
    const auditsMap = new Map<string, AuditEntry>();
    if (existsSync(auditsDir) && statSync(auditsDir).isDirectory()) {
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
        const subtopics: SubtopicEntry[] = [];
        const seenSubPaths = new Set<string>();

        if (ent.isDirectory()) {
          slug = ent.name;
          const auditDir = join(auditsDir, ent.name);
          const overviewPath = join(auditDir, "overview.md");
          const reportPath = join(auditDir, "report.md");
          if (existsSync(overviewPath) && statSync(overviewPath).isFile()) {
            filePath = overviewPath;
          } else if (existsSync(reportPath) && statSync(reportPath).isFile()) {
            filePath = reportPath;
          }

          if (filePath !== null) {
            // Scan subtopics directory if exists
            const subtopicsDir = join(auditDir, "subtopics");
            if (existsSync(subtopicsDir) && statSync(subtopicsDir).isDirectory()) {
              try {
                const subEntries = readdirSync(subtopicsDir, { withFileTypes: true });
                for (const subEnt of subEntries) {
                  if (subEnt.isFile() && subEnt.name.endsWith(".md")) {
                    const subPath = join(subtopicsDir, subEnt.name);
                    if (existsSync(subPath) && statSync(subPath).isFile()) {
                      const relPath = `./subtopics/${subEnt.name}`;
                      const subBody = readFileSync(subPath, "utf8");
                      const subTitleMatch = subBody.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
                      const subTitle =
                        (subTitleMatch?.[1]?.trim() ?? firstLine(subBody)) || subEnt.name.replace(/\.md$/, "");
                      subtopics.push({
                        slug: subEnt.name.replace(/\.md$/, ""),
                        relPath,
                        path: subPath,
                        body: subBody,
                        title: subTitle,
                      });
                      seenSubPaths.add(subPath);
                    }
                  }
                }
              } catch {}
            }

            // Scan direct subtopic files under audit directory (excluding overview.md and report.md)
            if (existsSync(auditDir) && statSync(auditDir).isDirectory()) {
              try {
                const directEntries = readdirSync(auditDir, { withFileTypes: true });
                for (const dEnt of directEntries) {
                  if (
                    dEnt.isFile() &&
                    dEnt.name.endsWith(".md") &&
                    dEnt.name !== "overview.md" &&
                    dEnt.name !== "report.md"
                  ) {
                    const subPath = join(auditDir, dEnt.name);
                    if (!seenSubPaths.has(subPath) && existsSync(subPath) && statSync(subPath).isFile()) {
                      const relPath = `./${dEnt.name}`;
                      const subBody = readFileSync(subPath, "utf8");
                      const subTitleMatch = subBody.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
                      const subTitle =
                        (subTitleMatch?.[1]?.trim() ?? firstLine(subBody)) || dEnt.name.replace(/\.md$/, "");
                      subtopics.push({
                        slug: dEnt.name.replace(/\.md$/, ""),
                        relPath,
                        path: subPath,
                        body: subBody,
                        title: subTitle,
                      });
                      seenSubPaths.add(subPath);
                    }
                  }
                }
              } catch {}
            }
          }
        } else if (ent.isFile() && ent.name.endsWith(".md")) {
          filePath = join(auditsDir, ent.name);
          slug = ent.name.replace(/\.md$/, "");
        }

        if (filePath !== null && !auditsMap.has(slug) && existsSync(filePath) && statSync(filePath).isFile()) {
          const resolvedPath = filePath;
          const body = readFileSync(resolvedPath, "utf8");

          // Parse markdown hyperlinks for subtopic references in root report body
          if (ent.isDirectory()) {
            const auditDir = join(auditsDir, ent.name);
            const linkRegex = /\[([^\]]+)\]\(\.\/((?:subtopics\/)?[^)]+\.md)\)/g;
            let match: RegExpExecArray | null;
            while ((match = linkRegex.exec(body)) !== null) {
              const linkTitle = match[1];
              const linkRel = match[2];
              const absPath = resolve(auditDir, linkRel);
              if (existsSync(absPath) && statSync(absPath).isFile() && !seenSubPaths.has(absPath)) {
                try {
                  const subBody = readFileSync(absPath, "utf8");
                  subtopics.push({
                    slug: linkRel.replace(/^(?:subtopics\/)?/, "").replace(/\.md$/, ""),
                    relPath: `./${linkRel}`,
                    path: absPath,
                    body: subBody,
                    title: linkTitle || firstLine(subBody),
                  });
                  seenSubPaths.add(absPath);
                } catch {}
              }
            }
          }

          const versionMatch = body.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
          const version = versionMatch?.[1]?.trim() ?? "v0.1.0";
          const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
          const title = titleMatch?.[1]?.trim() ?? firstLine(body);
          const statusMatch = body.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
          const status = statusMatch?.[1]?.trim() ?? "active";
          auditsMap.set(slug, { slug, path: resolvedPath, body, version, title, status, subtopics });
        }
      }
    }
    const audits = Array.from(auditsMap.values()).sort((a, b) => b.slug.localeCompare(a.slug));

    if (typeof query.slug === "string" && query.slug.length > 0) {
      const qSlug = query.slug;
      const targetSlug = qSlug.toLowerCase();

      // Check for direct match on audit slug or if targetSlug starts with audit slug
      const matchedAudit = audits.find(
        (a) =>
          a.slug.toLowerCase().startsWith(targetSlug) ||
          a.slug.toLowerCase().includes(targetSlug) ||
          targetSlug.startsWith(a.slug.toLowerCase()),
      );

      if (matchedAudit) {
        // Check if query.slug is specifically requesting a subtopic within matchedAudit
        const targetSubtopicName = targetSlug.includes("/") ? targetSlug.split("/").pop()! : targetSlug;
        const specificSubtopic = matchedAudit.subtopics.find(
          (s) =>
            s.slug.toLowerCase() === targetSubtopicName ||
            s.relPath.toLowerCase().includes(targetSubtopicName) ||
            s.title.toLowerCase().includes(targetSubtopicName),
        );

        if (specificSubtopic && targetSlug !== matchedAudit.slug.toLowerCase()) {
          return {
            found: true,
            text: specificSubtopic.body,
            details: { found: true, type, count: 1, paths: [specificSubtopic.path] },
          };
        }

        let text = matchedAudit.body;
        const paths = [matchedAudit.path];

        if (query.full) {
          if (matchedAudit.subtopics.length > 0) {
            text +=
              "\n\n" +
              matchedAudit.subtopics
                .map((s) => `### Subtopic: ${s.title} (${s.relPath})\n${s.body}`)
                .join("\n\n");
            for (const s of matchedAudit.subtopics) {
              paths.push(s.path);
            }
          }
        }

        return {
          found: true,
          text,
          details: { found: true, type, count: paths.length, paths },
        };
      }

      // If no audit matched directly by slug, check if query.slug matches a subtopic across any audit
      for (const a of audits) {
        const targetSubName = targetSlug.includes("/") ? targetSlug.split("/").pop()! : targetSlug;
        const sub = a.subtopics.find(
          (s) =>
            s.slug.toLowerCase() === targetSubName ||
            s.slug.toLowerCase().includes(targetSubName) ||
            s.relPath.toLowerCase().includes(targetSubName) ||
            s.title.toLowerCase().includes(targetSubName),
        );
        if (sub) {
          return {
            found: true,
            text: sub.body,
            details: { found: true, type, count: 1, paths: [sub.path] },
          };
        }
      }

      return {
        found: true,
        text: `No audit matching "${qSlug}".`,
        details: { found: true, type, count: 0, paths: [] },
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

    const lines = picked.map((a) => {
      if (query.full) {
        let fullText = `## ${a.slug} (${a.version})\n${a.body}`;
        if (a.subtopics.length > 0) {
          fullText +=
            "\n\n" +
            a.subtopics.map((s) => `### ${a.slug}/${s.slug}\n${s.body}`).join("\n\n");
        }
        return fullText;
      }
      let summary = `- ${a.slug} (${a.version}) — ${a.title}`;
      if (a.subtopics.length > 0) {
        summary += ` (${a.subtopics.length} subtopic${a.subtopics.length > 1 ? "s" : ""}: ${a.subtopics.map((s) => s.title).join(", ")})`;
      }
      return summary;
    });

    const allPaths: string[] = [];
    for (const a of picked) {
      allPaths.push(a.path);
      if (query.full) {
        for (const s of a.subtopics) {
          allPaths.push(s.path);
        }
      }
    }

    return {
      found: true,
      text: lines.join("\n"),
      details: {
        found: true,
        type,
        count: allPaths.length,
        paths: allPaths,
      },
    };
  }

  return {
    found: false,
    text: "Unknown knowledge type.",
    details: { found: false, type: query.type, count: 0, paths: [] },
  };
}
