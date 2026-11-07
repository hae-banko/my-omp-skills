// Full-text search index (SQLite FTS5, bm25 ranking) over the markdown
// knowledge base: records, pitfalls, research reports and audits.
//
// The markdown files stay the source of truth; the index is a rebuildable
// cache at `.omp/cache/kb-index.sqlite` (the directory ignores itself in
// git). Deleting it loses nothing.
//
// Freshness follows the "KB Search Index" machine in docs/state-machines.md
// §3: timestamp/path checks cheaply detect ordinary changes, while full-file
// SHA-256 digests detect replacements that preserve the old mtime.
// The filesystem watermark is stamped before reading; rows, digests and
// watermark commit atomically. Checking and searching use one DB snapshot.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { getWorkspaceContext } from "../core/workspace.ts";

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
  docs: Array<{ path: string; kind: KbDocKind; title: string; name: string; body: string; frontmatter: string; digest: string }>;
}

interface CorpusFile {
  path: string;
  abs: string;
  kind: KbDocKind;
  mtimeMs: number;
}

const SCHEMA_VERSION = 3;
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
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
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
  const ws = getWorkspaceContext(root);
  const add = (abs: string, kind: KbDocKind) => markdownIn(ws.root, relative(ws.root, abs).replaceAll("\\", "/"), kind, out);
  add(ws.knowledge.records, "record");
  add(ws.knowledge.pitfalls, "pitfall");
  add(ws.knowledge.research, "research");
  for (const e of entries(ws.knowledge.research)) {
    if (e.dir) add(join(ws.knowledge.research, e.name), "research");
  }
  add(ws.audits, "audit");
  for (const e of entries(ws.audits)) {
    if (!e.dir) continue;
    add(join(ws.audits, e.name), "audit");
    add(join(ws.audits, e.name, "subtopics"), "audit");
  }
  return out;
}

function cacheDir(root: string): string {
  const dir = join(getWorkspaceContext(root).root, ".omp", "cache");
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/** Write the sentinel and return its mtime: "now" on the filesystem's clock. */
function touchStamp(sentinel: string): number {
  mkdirSync(dirname(sentinel), { recursive: true });
  writeFileSync(sentinel, "kb-index scan\n");
  return statSync(sentinel).mtimeMs;
}

/** Open (creating or migrating) the index. Callers close it. */
export function openIndex(root: string): Database {
  const db = new Database(join(cacheDir(root), "kb-index.sqlite"));
  try {
    db.exec("PRAGMA busy_timeout = 100");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL"); // a rebuildable cache: no fsync per commit
    initializeIndex(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function initializeIndex(db: Database): void {
  const version = () => db.query<{ user_version: number }>("PRAGMA user_version").get()?.user_version;
  if (version() !== SCHEMA_VERSION) {
    db.transaction(() => {
      if (version() === SCHEMA_VERSION) return; // another session migrated first
      db.exec("DROP TABLE IF EXISTS docs");
      db.exec("DROP TABLE IF EXISTS meta");
      db.exec(
        "CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, kind UNINDEXED, title, name, body, frontmatter, digest UNINDEXED, tokenize = 'porter unicode61')",
      );
      db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value REAL NOT NULL)");
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }).immediate();
  }
}

/**
 * Scan: stamp the watermark first, then list and read the files. A file
 * written after the stamp carries mtime >= wm, so the next check catches it
 * even if this scan read the older content. `stamp` is a test seam for a
 * controlled filesystem clock.
 */
export function scanCorpus(root: string, stamp: (sentinel: string) => number = touchStamp): KbScan {
  const wm = stamp(join(getWorkspaceContext(root).root, ".omp", "cache", "kb-index.stamp"));
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
      digest: createHash("sha256").update(body).digest("hex"),
    });
  }
  return { wm, docs };
}

function writeScan(db: Database, scan: KbScan): void {
  db.exec("DELETE FROM docs");
  const insert = db.query("INSERT INTO docs (path, kind, title, name, body, frontmatter, digest) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const d of scan.docs) insert.run(d.path, d.kind, d.title, d.name, d.body, d.frontmatter, d.digest);
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
  const indexed = db.query<{ path: string; digest: string }>("SELECT path, digest FROM docs").all();
  if (indexed.length !== files.length) return true;
  const digests = new Map(indexed.map(row => [row.path, row.digest]));
  for (const file of files) {
    if (!digests.has(file.path)) return true;
    try {
      if (createHash("sha256").update(readFileSync(file.abs, "utf8")).digest("hex") !== digests.get(file.path)) return true;
    } catch (error) {
      if (isMissing(error)) return true; // removed since the listing
      throw error;
    }
  }
  return false;
}

function runSearch(db: Database, match: string, limit: number, kinds?: readonly KbDocKind[]): KbHit[] {
  const kindFilter = kinds ? ` AND kind IN (${kinds.map(() => "?").join(", ")})` : "";
  const rows = db
    .query<KbHit>(
      `SELECT kind, path, title, snippet(docs, 4, '', '', '…', 12) AS snippet FROM docs
       WHERE docs MATCH ?${kindFilter} ORDER BY bm25(docs, 0, 0, 10.0, 5.0, 1.0, 0.5), path COLLATE BINARY LIMIT ?`,
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
  root = getWorkspaceContext(root).root;
  if (terms.length === 0 || listCorpus(root).length === 0) return [];
  const match = terms
    .slice(0, MAX_TERMS)
    .map((t) => `"${t.replaceAll('"', '""')}"*`)
    .join(" OR ");
  let db: Database | undefined;
  try {
    const persistent = openIndex(root);
    db = persistent;
    const search = () => runSearch(persistent, match, opts.limit, opts.kinds);
    const fresh = persistent.transaction(() => (indexIsStale(persistent, root) ? null : search()))();
    if (fresh) return fresh;
    const scan = scanCorpus(root);
    return persistent.transaction(() => {
      writeScan(persistent, scan);
      return search();
    }).immediate();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? "";
    if (!/^(?:SQLITE_(?:BUSY|LOCKED|CANTOPEN|NOTADB|CORRUPT|READONLY|FULL|IOERR)(?:_|$)|EACCES$|EPERM$|EROFS$|ENOSPC$|EEXIST$|ENOTDIR$)/.test(code)) throw error;
    // Do not unlink a database another session may still have open. Recover
    // search from authoritative Markdown without touching the unusable cache.
    const memory = new Database(":memory:");
    try {
      initializeIndex(memory);
      commitScan(memory, scanCorpus(root, () => 0));
      return runSearch(memory, match, opts.limit, opts.kinds);
    } finally {
      memory.close();
    }
  } finally {
    db?.close();
  }
}
