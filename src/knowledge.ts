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
  query?: string;
}

export interface RelevantKnowledgeItem {
  title: string;
  path: string;
  snippet: string;
  kind: "pitfall" | "record" | "index";
}

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "here", "some", "what", "when", "where", "which",
  "will", "would", "could", "should", "about", "there", "their", "them", "then", "than",
  "also", "into", "only", "other", "such", "these", "they", "thing", "think", "time",
  "very", "your", "just", "more", "make", "like", "know", "take", "head", "need",
  "used", "using", "user", "path", "file", "files", "code", "done", "work", "mode",
  "test", "tests", "run", "runs", "type", "types", "call", "calls", "tool", "tools",
  "turn", "agent", "prompt", "please", "help", "want", "look", "find", "check"
]);

export function findRelevantKnowledge(
  root: string,
  promptText: string,
  limit = 3,
): RelevantKnowledgeItem[] {
  const rawTokens = promptText.toLowerCase().match(/\b[a-z0-9_-]+\b/g) ?? [];
  const terms = Array.from(
    new Set(
      rawTokens.filter((t) => t.length >= 4 && !STOP_WORDS.has(t)),
    ),
  );
  if (terms.length === 0) return [];

  const base = join(root, ".omp", "knowledge");
  const items: Array<RelevantKnowledgeItem & { score: number }> = [];
  const seenPaths = new Set<string>();

  const parseMd = (body: string, defaultTitle: string) => {
    const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
    const title = titleMatch?.[1]?.trim() ?? firstLine(body) ?? defaultTitle;
    const tagsMatch = body.match(/^tags:\s*\[?(.*?)\]?$/m);
    const tags = tagsMatch?.[1]
      ? tagsMatch[1].split(",").map((s) => s.trim().toLowerCase())
      : [];
    return { title, tags, body };
  };

  for (const kind of ["pitfall", "record"] as const) {
    const dirName = kind === "pitfall" ? "pitfalls" : "records";
    const dir = join(base, dirName);
    const files = listMarkdownFiles(dir);
    for (const f of files) {
      const filePath = join(dir, f);
      if (seenPaths.has(filePath)) continue;
      if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
      const body = readFileSync(filePath, "utf8");
      const { title, tags } = parseMd(body, f.replace(/\.md$/, ""));
      const relPath = `.omp/knowledge/${dirName}/${f}`;

      let score = 0;
      const titleLower = title.toLowerCase();
      const fileLower = f.toLowerCase();
      const bodyLower = body.toLowerCase();
      const firstL = firstLine(body);

      for (const term of terms) {
        if (titleLower.includes(term) || fileLower.includes(term) || tags.some((t) => t.includes(term))) {
          score += 10;
        } else if (firstL.toLowerCase().includes(term)) {
          score += 5;
        } else if (bodyLower.includes(term)) {
          score += 2;
        }
      }

      if (score > 0) {
        seenPaths.add(filePath);
        items.push({
          title,
          path: relPath,
          snippet: firstL || title,
          kind,
          score,
        });
      }
    }
  }

  const indexPath = join(base, "INDEX.md");
  if (existsSync(indexPath) && statSync(indexPath).isFile()) {
    const indexBody = readFileSync(indexPath, "utf8");
    const lines = indexBody.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (lineLower.includes(term)) {
          score += 3;
        }
      }
      if (score > 0) {
        const pathMatch = line.match(/\.omp\/knowledge\/(pitfalls|records)\/[^\s)]+/);
        const refPath = pathMatch ? pathMatch[0] : ".omp/knowledge/INDEX.md";
        if (!seenPaths.has(refPath)) {
          seenPaths.add(refPath);
          const kind = refPath.includes("/pitfalls/") ? "pitfall" : refPath.includes("/records/") ? "record" : "index";
          items.push({
            title: line.replace(/^-\s*/, "").slice(0, 80),
            path: refPath,
            snippet: line.replace(/^-\s*/, "").slice(0, 100),
            kind,
            score,
          });
        }
      }
    }
  }

  items.sort((a, b) => b.score - a.score);
  return items.slice(0, limit).map(({ title, path, snippet, kind }) => ({
    title,
    path,
    snippet,
    kind,
  }));
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

  if (query.query && query.query.trim().length > 0) {
    const searchStr = query.query.trim().toLowerCase();
    const matches: Array<{
      kind: string;
      title: string;
      path: string;
      snippet: string;
      score: number;
    }> = [];

    const searchFile = (kind: string, title: string, path: string, body: string, filename: string) => {
      const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
      const resolvedTitle = titleMatch?.[1]?.trim() ?? title ?? firstLine(body) ?? filename;
      const tagsMatch = body.match(/^tags:\s*\[?(.*?)\]?$/m);
      const tags = tagsMatch?.[1]
        ? tagsMatch[1].split(",").map((s) => s.trim().toLowerCase())
        : [];

      const titleLower = resolvedTitle.toLowerCase();
      const fileLower = filename.toLowerCase();
      const bodyLower = body.toLowerCase();

      let score = 0;
      if (titleLower.includes(searchStr) || fileLower.includes(searchStr) || tags.some((t) => t.includes(searchStr))) {
        score = 2;
      } else if (bodyLower.includes(searchStr)) {
        score = 1;
      }

      if (score > 0) {
        let snippet = firstLine(body);
        const matchIdx = bodyLower.indexOf(searchStr);
        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 30);
          const end = Math.min(body.length, matchIdx + searchStr.length + 50);
          snippet = body.slice(start, end).replace(/[\r\n]+/g, " ").trim();
        }
        matches.push({
          kind,
          title: resolvedTitle,
          path,
          snippet: snippet.slice(0, 120),
          score,
        });
      }
    };

    for (const typeKey of ["records", "pitfalls"] as const) {
      const dir = join(base, typeKey);
      for (const f of listMarkdownFiles(dir)) {
        const filePath = join(dir, f);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
        const body = readFileSync(filePath, "utf8");
        searchFile(typeKey, f.replace(/\.md$/, ""), filePath, body, f);
      }
    }

    const researchDir = join(base, "research");
    if (existsSync(researchDir) && statSync(researchDir).isDirectory()) {
      try {
        const projDirs = readdirSync(researchDir, { withFileTypes: true });
        for (const pEnt of projDirs) {
          if (pEnt.name.startsWith(".")) continue;
          const pPath = join(researchDir, pEnt.name);
          if (pEnt.isDirectory()) {
            for (const subF of listMarkdownFiles(pPath)) {
              const subPath = join(pPath, subF);
              if (existsSync(subPath) && statSync(subPath).isFile()) {
                const body = readFileSync(subPath, "utf8");
                searchFile("research", `${pEnt.name}/${subF}`, subPath, body, subF);
              }
            }
          } else if (pEnt.isFile() && pEnt.name.endsWith(".md")) {
            const body = readFileSync(pPath, "utf8");
            searchFile("research", pEnt.name, pPath, body, pEnt.name);
          }
        }
      } catch {}
    }

    const auditsDir = join(root, ".omp", "audits");
    if (existsSync(auditsDir) && statSync(auditsDir).isDirectory()) {
      try {
        const auditDirs = readdirSync(auditsDir, { withFileTypes: true });
        for (const aEnt of auditDirs) {
          if (aEnt.name.startsWith(".")) continue;
          const aPath = join(auditsDir, aEnt.name);
          if (aEnt.isDirectory()) {
            for (const subF of listMarkdownFiles(aPath)) {
              const subPath = join(aPath, subF);
              if (existsSync(subPath) && statSync(subPath).isFile()) {
                const body = readFileSync(subPath, "utf8");
                searchFile("audits", `${aEnt.name}/${subF}`, subPath, body, subF);
              }
            }
            const subtopicsDir = join(aPath, "subtopics");
            if (existsSync(subtopicsDir) && statSync(subtopicsDir).isDirectory()) {
              for (const subF of listMarkdownFiles(subtopicsDir)) {
                const subPath = join(subtopicsDir, subF);
                if (existsSync(subPath) && statSync(subPath).isFile()) {
                  const body = readFileSync(subPath, "utf8");
                  searchFile("audits", `${aEnt.name}/subtopics/${subF}`, subPath, body, subF);
                }
              }
            }
          } else if (aEnt.isFile() && aEnt.name.endsWith(".md")) {
            const body = readFileSync(aPath, "utf8");
            searchFile("audits", aEnt.name, aPath, body, aEnt.name);
          }
        }
      } catch {}
    }

    matches.sort((a, b) => b.score - a.score);
    const picked = matches.slice(0, limit);
    const textLines = picked.map((m) => `- [${m.kind.toUpperCase()}] ${m.title} (${m.path}) — ${m.snippet}`);
    return {
      found: true,
      text: textLines.join("\n") || `No knowledge entries found matching "${query.query}".`,
      details: {
        found: true,
        type,
        count: picked.length,
        paths: picked.map((m) => m.path),
      },
    };
  }
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
