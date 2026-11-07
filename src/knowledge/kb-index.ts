// Full-text search index (SQLite FTS5, bm25 ranking) over the markdown
// knowledge base: records, pitfalls, research reports and audits.
//
// The markdown files stay the source of truth; the index is a rebuildable
// cache at `.omp/cache/kb-index.sqlite` (the directory ignores itself in
// git). Deleting it loses nothing.
//
// Freshness follows the "KB Search Index" machine in docs/state-machines.md
// §3. Each rule below is one a model checker found a counterexample
// without:
//   - the watermark `wm` is the mtime of a sentinel written BEFORE the files
//     are read, i.e. the filesystem's own clock (Date.now() can run ahead of
//     the clock mtimes are stamped with -- measured up to 4.6 ms here);
//   - a file is stale when mtime >= wm (same-tick writes are ambiguous);
//   - the indexed path set must equal the paths on disk (removals, and
//     restores that keep an old mtime, are invisible to the mtime check);
//   - rows and wm are written in one transaction;
//   - the check and the search read one database snapshot.

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type KbDocKind = "record" | "pitfall" | "research" | "audit";

export interface KbHit {
  kind: KbDocKind;
  /** Repo-relative path, forward slashes. */
  path: string;
  title: string;
  snippet: string;
}

export interface KbScan {
  wm: number;
  docs: Array<{ path: string; kind: KbDocKind; title: string; name: string; body: string; frontmatter: string }>;
}

interface CorpusFile {
  path: string;
  abs: string;
  kind: KbDocKind;
  mtimeMs: number;
}

const SCHEMA_VERSION = 2;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;
const MAX_TERMS = 32;

/** Lowercased word tokens, split the way FTS5's unicode61 tokenizer splits. */
export function searchTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}

export function extractEntryTitle(body: string, filename: string): string {
  // 1. Check YAML frontmatter title: "..."
  const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
  if (titleMatch && titleMatch[1]?.trim()) {
    return titleMatch[1].trim();
  }
  // 2. Check markdown heading # ...
  const headingMatch = body.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1]?.trim()) {
    return headingMatch[1].trim();
  }
  // 3. Check first non-frontmatter, non-empty line
  const lines = body.split("\n").map((l) => l.trim());
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i === 0 && l === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (l === "---") inFrontmatter = false;
      continue;
    }
    if (l.length > 0) {
      return l.slice(0, 120);
    }
  }
  // 4. Fallback to filename without .md
  return filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_?/, "");
}

function isMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "ENOENT";
}

function entries(abs: string): Array<{ name: string; dir: boolean }> {
  try {
    return readdirSync(abs, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({ name: e.name, dir: e.isDirectory() }));
  } catch (err) {
    if (isMissing(err) || (err as { code?: string }).code === "ENOTDIR") return [];
    throw err;
  }
}

/** Markdown files directly inside `rel`, with their mtimes. Listing and stat only. */
function markdownIn(root: string, rel: string, kind: KbDocKind, out: CorpusFile[]): void {
  for (const e of entries(join(root, rel))) {
    if (e.dir || !e.name.endsWith(".md")) continue;
    const path = `${rel}/${e.name}`;
    const abs = join(root, path);
    try {
      const st = statSync(abs);
      if (st.isFile()) out.push({ path, abs, kind, mtimeMs: st.mtimeMs });
    } catch (err) {
      if (!isMissing(err)) throw err; // removed since the listing
    }
  }
}

/**
 * The indexed corpus -- the same files `knowledge_read` has always searched:
 * records, pitfalls, research projects (one level, `.archive` excluded) and
 * audits (report, subtopics; `archive/` snapshots excluded).
 */
function listCorpus(root: string): CorpusFile[] {
  const out: CorpusFile[] = [];
  markdownIn(root, ".omp/knowledge/records", "record", out);
  markdownIn(root, ".omp/knowledge/pitfalls", "pitfall", out);
  markdownIn(root, ".omp/knowledge/research", "research", out);
  for (const e of entries(join(root, ".omp/knowledge/research"))) {
    if (e.dir) markdownIn(root, `.omp/knowledge/research/${e.name}`, "research", out);
  }
  markdownIn(root, ".omp/audits", "audit", out);
  for (const e of entries(join(root, ".omp/audits"))) {
    if (!e.dir) continue;
    markdownIn(root, `.omp/audits/${e.name}`, "audit", out);
    markdownIn(root, `.omp/audits/${e.name}/subtopics`, "audit", out);
  }
  return out;
}

function cacheDir(root: string): string {
  const dir = join(root, ".omp", "cache");
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/** Write the sentinel and return its mtime: "now" on the filesystem's clock. */
function touchStamp(sentinel: string): number {
  writeFileSync(sentinel, "kb-index scan\n");
  return statSync(sentinel).mtimeMs;
}

/** Open (creating or migrating) the index. Callers close it. */
export function openIndex(root: string): Database {
  const db = new Database(join(cacheDir(root), "kb-index.sqlite"));
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL"); // a rebuildable cache: no fsync per commit
  const version = () => db.query<{ user_version: number }>("PRAGMA user_version").get()?.user_version;
  if (version() !== SCHEMA_VERSION) {
    db.transaction(() => {
      if (version() === SCHEMA_VERSION) return; // another session migrated first
      db.exec("DROP TABLE IF EXISTS docs");
      db.exec("DROP TABLE IF EXISTS meta");
      db.exec(
        "CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, kind UNINDEXED, title, name, body, frontmatter, tokenize = 'porter unicode61')",
      );
      db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value REAL NOT NULL)");
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }).immediate();
  }
  return db;
}

/**
 * Scan: stamp the watermark first, then list and read the files. A file
 * written after the stamp carries mtime >= wm, so the next check catches it
 * even if this scan read the older content. `stamp` is a test seam for a
 * controlled filesystem clock.
 */
export function scanCorpus(root: string, stamp: (sentinel: string) => number = touchStamp): KbScan {
  const wm = stamp(join(cacheDir(root), "kb-index.stamp"));
  const docs: KbScan["docs"] = [];
  for (const f of listCorpus(root)) {
    let body: string;
    try {
      body = readFileSync(f.abs, "utf8");
    } catch (err) {
      if (isMissing(err)) continue; // removed since the listing
      throw err;
    }
    const filename = f.path.slice(f.path.lastIndexOf("/") + 1);
    const fm = body.match(FRONTMATTER_RE);
    docs.push({
      path: f.path,
      kind: f.kind,
      title: extractEntryTitle(body, filename),
      name: filename.replace(/\.md$/, ""),
      // Snippets come from the prose; frontmatter stays searchable on its own.
      body: fm ? body.slice(fm[0].length) : body,
      frontmatter: fm ? fm[1] : "",
    });
  }
  return { wm, docs };
}

function writeScan(db: Database, scan: KbScan): void {
  db.exec("DELETE FROM docs");
  const insert = db.query("INSERT INTO docs (path, kind, title, name, body, frontmatter) VALUES (?, ?, ?, ?, ?, ?)");
  for (const d of scan.docs) insert.run(d.path, d.kind, d.title, d.name, d.body, d.frontmatter);
  db.query("INSERT INTO meta (key, value) VALUES ('wm', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    scan.wm,
  );
}

/** Commit: rows and watermark replace the previous index in one transaction. */
export function commitScan(db: Database, scan: KbScan): void {
  db.transaction(() => writeScan(db, scan)).immediate();
}

/** The reader's check. False positives cost a rebuild; misses are bugs. */
export function indexIsStale(db: Database, root: string): boolean {
  const wm = db.query<{ value: number }>("SELECT value FROM meta WHERE key = 'wm'").get()?.value;
  if (wm === undefined) return true;
  const files = listCorpus(root);
  if (files.some((f) => f.mtimeMs >= wm)) return true;
  const indexed = db.query<{ path: string }>("SELECT path FROM docs").all();
  if (indexed.length !== files.length) return true;
  const onDisk = new Set(files.map((f) => f.path));
  return indexed.some((row) => !onDisk.has(row.path));
}

function runSearch(db: Database, match: string, limit: number, kinds?: readonly KbDocKind[]): KbHit[] {
  const kindFilter = kinds ? ` AND kind IN (${kinds.map(() => "?").join(", ")})` : "";
  const rows = db
    .query<KbHit>(
      `SELECT kind, path, title, snippet(docs, 4, '', '', '…', 12) AS snippet FROM docs
       WHERE docs MATCH ?${kindFilter} ORDER BY bm25(docs, 0, 0, 10.0, 5.0, 1.0, 0.5) LIMIT ?`,
    )
    .all(match, ...(kinds ?? []), limit);
  return rows.map((r) => ({ ...r, snippet: r.snippet.replace(/\s+/g, " ").trim().slice(0, 120) }));
}

/**
 * Rank corpus files by bm25 over any of `terms` (prefix match, porter
 * stemming), rebuilding the index first when the check says it is stale.
 * A repo without knowledge files gets no index file at all.
 */
export function searchKnowledge(
  root: string,
  terms: readonly string[],
  opts: { limit: number; kinds?: readonly KbDocKind[] },
): KbHit[] {
  if (terms.length === 0 || listCorpus(root).length === 0) return [];
  const match = terms
    .slice(0, MAX_TERMS)
    .map((t) => `"${t.replaceAll('"', '""')}"*`)
    .join(" OR ");
  const db = openIndex(root);
  try {
    const search = () => runSearch(db, match, opts.limit, opts.kinds);
    const fresh = db.transaction(() => (indexIsStale(db, root) ? null : search()))();
    if (fresh) return fresh;
    const scan = scanCorpus(root);
    return db.transaction(() => {
      writeScan(db, scan);
      return search();
    }).immediate();
  } finally {
    db.close();
  }
}
