// KB search index suite. The interleaving test drives the real implementation
// through random writes, removals, restores, scans and commits and checks the
// freshness invariants of docs/state-machines.md §3 (KB Search Index):
// StalenessDetected after every step, Converges at the end.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import { commitScan, indexIsStale, openIndex, scanCorpus, searchKnowledge, type KbScan } from "../src/knowledge/kb-index.ts";
import { readKnowledge } from "../src/knowledge/knowledge.ts";
import { createTempFixture, fail } from "./test-utils.ts";

const FILES = [
  ".omp/knowledge/records/a.md",
  ".omp/knowledge/pitfalls/b.md",
  ".omp/knowledge/research/p1/c.md",
  ".omp/audits/x/overview.md",
];
const OPS = ["tick", "write", "write", "remove", "restore", "scan", "commit", "commit"] as const;
// Synthetic filesystem clock in whole seconds: coarse, so same-tick races are common.
const T0 = 1_700_000_000;

/** mulberry32 -- deterministic, so a failing seed replays exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function diskContents(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of FILES) {
    const abs = join(root, rel);
    if (existsSync(abs)) out.set(rel, readFileSync(abs, "utf8"));
  }
  return out;
}

function indexContents(db: Database): Map<string, string> {
  const rows = db.query<{ path: string; body: string }>("SELECT path, body FROM docs").all();
  return new Map(rows.map((r) => [r.path, r.body]));
}

function sameContents(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}

/** One random interleaving; returns a failure description or null. */
function runInterleaving(seed: number, steps: number): string | null {
  const fixture = createTempFixture("kb-index-pbt-");
  const root = fixture.dir;
  const rand = rng(seed);
  let tick = 0;
  let version = 0;
  const now = () => T0 + tick;
  const sessions = [openIndex(root), openIndex(root)];
  const pending: Array<KbScan | null> = [null, null];
  const trace: string[] = [];
  const writeFile = (f: number) => {
    const abs = join(root, FILES[f]);
    version++;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `# file ${f}\nversion ${version}\n`);
    utimesSync(abs, now(), now());
  };
  const quietStamp = (sentinel: string) => {
    writeFileSync(sentinel, "stamp");
    utimesSync(sentinel, now(), now());
    return statSync(sentinel).mtimeMs;
  };
  // The stamp is where a scan yields to its environment: a write (and a
  // tick) may land just before or just after it -- in the model, Write and
  // Tick steps between Stamp and ReadFiles, whichever order the code uses.
  const concurrentWrite = (where: string) => {
    if (rand() < 0.5) return;
    const f = Math.floor(rand() * FILES.length);
    writeFile(f);
    trace.push(`write(f${f})@${where}`);
    if (rand() < 0.5) trace.push(`tick->${++tick}`);
  };
  const racyStamp = (sentinel: string) => {
    concurrentWrite("before-stamp");
    const wm = quietStamp(sentinel);
    concurrentWrite("after-stamp");
    return wm;
  };
  try {
    for (let i = 0; i < steps; i++) {
      const f = Math.floor(rand() * FILES.length);
      const s = Math.floor(rand() * sessions.length);
      const op = OPS[Math.floor(rand() * OPS.length)];
      const abs = join(root, FILES[f]);
      const attic = join(root, "attic", String(f)); // outside the corpus
      if (op === "tick") tick++;
      else if (op === "write") writeFile(f);
      else if (op === "remove") {
        if (!existsSync(abs)) continue;
        mkdirSync(dirname(attic), { recursive: true });
        renameSync(abs, attic);
      } else if (op === "restore") {
        if (existsSync(abs) || !existsSync(attic)) continue;
        mkdirSync(dirname(abs), { recursive: true });
        renameSync(attic, abs); // keeps the old mtime, like `/research unarchive`
      } else if (op === "scan") {
        if (pending[s]) continue;
        pending[s] = scanCorpus(root, racyStamp);
      } else {
        const scan = pending[s];
        if (!scan) continue;
        commitScan(sessions[s], scan);
        pending[s] = null;
      }
      trace.push(op === "tick" ? `tick->${tick}` : `${op}(${op === "scan" || op === "commit" ? `s${s}` : `f${f}`})`);
      // StalenessDetected
      if (!sameContents(diskContents(root), indexContents(sessions[0])) && !indexIsStale(sessions[0], root)) {
        return `seed ${seed}: index differs from the files but the check says fresh after ${trace.join(" ")}`;
      }
    }
    // Converges: in-flight scans land late, then the reader rebuilds once.
    for (const [s, scan] of pending.entries()) if (scan) commitScan(sessions[s], scan);
    tick++;
    if (indexIsStale(sessions[0], root)) commitScan(sessions[0], scanCorpus(root, quietStamp));
    if (indexIsStale(sessions[0], root) || !sameContents(diskContents(root), indexContents(sessions[0]))) {
      return `seed ${seed}: index did not converge after ${trace.join(" ")}`;
    }
    return null;
  } finally {
    for (const db of sessions) db.close();
    fixture.cleanup();
  }
}

export async function runKbIndexSuite(): Promise<void> {
  console.log("Running KB search index suite...");

  // Random interleavings of writes, removals, restores, scans and commits by
  // two sessions on a coarse clock.
  for (let seed = 1; seed <= 300; seed++) {
    const failure = runInterleaving(seed, 30);
    if (failure) {
      fail(`KB index freshness: ${failure}`);
      break;
    }
  }

  // Search on the real clock: word order, stemming, title weight, removal,
  // restore with an old mtime, and a revision right after a search.
  {
    const fixture = createTempFixture("kb-index-search-");
    const root = fixture.dir;
    const records = join(root, ".omp", "knowledge", "records");
    const pitfalls = join(root, ".omp", "knowledge", "pitfalls");
    mkdirSync(records, { recursive: true });
    mkdirSync(pitfalls, { recursive: true });
    const sqlite = join(records, "2026-11-07_sqlite-locking.md");
    writeFileSync(sqlite, "---\ntitle: SQLite locking\n---\nWAL mode avoids writer starvation.\n");
    writeFileSync(join(pitfalls, "2026-11-01_misc.md"), "# Misc\nUnrelated note that mentions sqlite once.\n");

    const query = (q: string) => readKnowledge(root, { type: "index", query: q });
    const reversed = query("starvation writer");
    if (reversed.details.paths[0] !== ".omp/knowledge/records/2026-11-07_sqlite-locking.md") {
      fail(`KB index: words in a different order than the text were not matched: ${reversed.text}`);
    }
    if (!query("locks").text.includes("SQLite locking")) {
      fail(`KB index: "locks" did not match "locking" (stemming): ${query("locks").text}`);
    }
    const ranked = query("sqlite").details.paths;
    if (ranked[0] !== ".omp/knowledge/records/2026-11-07_sqlite-locking.md" || ranked.length !== 2) {
      fail(`KB index: a title match did not outrank a body match: ${JSON.stringify(ranked)}`);
    }
    // Snippets are prose (they land in the system prompt); frontmatter-only
    // terms still match.
    const [hit] = searchKnowledge(root, ["starvation"], { limit: 1 });
    if (!hit || hit.snippet.includes("title:") || hit.snippet.includes("---")) {
      fail(`KB index: snippet carries frontmatter: ${JSON.stringify(hit)}`);
    }
    writeFileSync(join(records, "2026-11-05_tagged.md"), "---\ntitle: Tagged\ntags: [wraparound]\n---\nBody.\n");
    if (!query("wraparound").text.includes("Tagged")) {
      fail("KB index: a term only in frontmatter did not match");
    }
    unlinkSync(join(records, "2026-11-05_tagged.md"));

    // Revision immediately after a search (same clock tick in practice).
    writeFileSync(sqlite, "---\ntitle: SQLite locking\n---\nUse busy_timeout with BEGIN IMMEDIATE.\n");
    if (!query("busy_timeout").text.includes("SQLite locking")) {
      fail("KB index: a revision written right after a search was not found by the next search");
    }

    // Remove (archive), then restore with the original old mtime.
    const old = statSync(sqlite).mtime;
    const attic = join(root, "attic.md");
    renameSync(sqlite, attic);
    if (query("busy_timeout").details.count !== 0) {
      fail("KB index: a removed record was still returned");
    }
    renameSync(attic, sqlite);
    utimesSync(sqlite, old, new Date(old.getTime() - 3_600_000));
    if (query("busy_timeout").details.count !== 1) {
      fail("KB index: a record restored with an old mtime was not found");
    }
    unlinkSync(sqlite);
    if (readFileSync(join(root, ".omp", "cache", ".gitignore"), "utf8").trim() !== "*") {
      fail("KB index: .omp/cache does not ignore itself in git");
    }
    fixture.cleanup();
  }

  // A repo without knowledge files gets no index file.
  {
    const fixture = createTempFixture("kb-index-empty-");
    if (searchKnowledge(fixture.dir, ["anything"], { limit: 3 }).length !== 0) {
      fail("KB index: search in an empty repo returned hits");
    }
    if (existsSync(join(fixture.dir, ".omp"))) {
      fail("KB index: search in a repo without a knowledge base created .omp/");
    }
    fixture.cleanup();
  }
}
