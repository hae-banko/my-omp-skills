// Research DAG Engine — dependency-aware research outline.
//
// Research outline items in outline.yaml may declare dependency edges:
//
//   items:
//     - id: repo_discovery
//       name: "Find official codebase and spec"
//     - id: cipher_audit
//       name: "Audit encryption cipher"
//       depends_on: [repo_discovery]
//
// buildResearchDag validates the graph (cycles via Kahn's algorithm, dangling
// dependencies), marks items whose result file exists as completed and items
// whose upstream is all completed as ready, and measures depth and critical
// path. Flat lists (no dependencies) are all roots.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResearchItemSpec } from "./research-renderer.ts";

export type DagNodeStatus = "pending" | "ready" | "completed";
export interface ResearchDagNode {
  id: string;
  name: string;
  dependsOn: string[];
  status: DagNodeStatus;
  resultFile?: string;
  downstreamNodes: string[];
  depth: number;
  height: number;
}
export interface ResearchDag {
  nodes: Map<string, ResearchDagNode>;
  hasCycles: boolean;
  cycleNodes?: string[];
  maxDepth: number;
  criticalPathLength: number;
}

/**
 * Canonical ID derivation from an item name or index.
 */
export function slugifyItemId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `item_${String(index + 1).padStart(2, "0")}`;
}

function isValidResultJsonFile(filePath: string): boolean {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return false;
    const content = readFileSync(filePath, "utf8");
    if (!content.trim()) return false;
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * File-first lookup for an item's result JSON file.
 * 1. Checks direct deterministic paths (results/<slug>.json and results/<01>_<slug>.json).
 * 2. Scans results/ directory if exact or numbered prefix filename was used.
 */
export function findItemResultFile(resultsDir: string, itemId: string, itemName: string): string | undefined {
  if (!existsSync(resultsDir) || !statSync(resultsDir).isDirectory()) return undefined;

  const idSlug = slugifyItemId(itemId, 0);
  const nameSlug = slugifyItemId(itemName, 0);

  // 1. Direct O(1) existence checks for canonical paths
  const exactIdPath = join(resultsDir, `${idSlug}.json`);
  if (existsSync(exactIdPath) && isValidResultJsonFile(exactIdPath)) return exactIdPath;

  const exactNamePath = join(resultsDir, `${nameSlug}.json`);
  if (existsSync(exactNamePath) && isValidResultJsonFile(exactNamePath)) return exactNamePath;

  // 2. Scan directory for numbered prefix matches (e.g. 01_auth.json)
  try {
    const files = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const fClean = f.toLowerCase().replace(/\.json$/, "").replace(/[^a-z0-9_]+/g, "_");
      const isExact = fClean === idSlug || fClean === nameSlug;
      const isNumbered =
        /^\d+_.+$/.test(fClean) &&
        (fClean.replace(/^\d+_/, "") === idSlug || fClean.replace(/^\d+_/, "") === nameSlug);

      if (isExact || isNumbered) {
        const fullPath = join(resultsDir, f);
        if (isValidResultJsonFile(fullPath)) {
          return fullPath;
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

/**
 * Build and validate the Research DAG from an outline's item list.
 */
export function buildResearchDag(items: ResearchItemSpec[], resultsDir?: string): ResearchDag {
  const nodes = new Map<string, ResearchDagNode>();
  const nameToId = new Map<string, string>();

  // 1. First pass: register node IDs
  items.forEach((item, idx) => {
    const id = (item.id ? item.id.trim() : slugifyItemId(item.name, idx)).toLowerCase();
    nameToId.set(item.name.toLowerCase(), id);
    nameToId.set(id, id);
    const resultFile = resultsDir ? findItemResultFile(resultsDir, id, item.name) : undefined;
    nodes.set(id, {
      id,
      name: item.name,
      dependsOn: [],
      status: resultFile ? "completed" : "pending",
      resultFile,
      downstreamNodes: [],
      depth: 0,
      height: 0,
    });
  });
  const missing = new Set<string>();

  // 2. Second pass: wire dependencies; a dependency on no known item is dangling
  items.forEach((item, idx) => {
    const id = (item.id ? item.id.trim() : slugifyItemId(item.name, idx)).toLowerCase();
    const node = nodes.get(id);
    if (!node) return;

    const rawDeps = item.depends_on ?? item.dependsOn ?? [];
    const depsArray = Array.isArray(rawDeps) ? rawDeps : [rawDeps];

    for (const dep of depsArray) {
      if (typeof dep !== "string") continue;
      const depKey = dep.trim().toLowerCase();
      const resolvedId = nameToId.get(depKey) ?? depKey;
      if (!resolvedId || resolvedId === id) continue;
      const depNode = nodes.get(resolvedId);
      if (!depNode) {
        missing.add(id);
      } else if (!node.dependsOn.includes(resolvedId)) {
        node.dependsOn.push(resolvedId);
        depNode.downstreamNodes.push(id);
      }
    }
  });

  // 3. Cycle detection & topological sort via Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const [id, node] of nodes.entries()) {
    inDegree.set(id, node.dependsOn.length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    topoOrder.push(currId);
    const node = nodes.get(currId);
    if (!node) continue;
    for (const nextId of node.downstreamNodes) {
      const nextDeg = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) queue.push(nextId);
    }
  }

  const hasCycles = topoOrder.length < nodes.size;
  const cycleNodes = hasCycles
    ? [...nodes.keys()].filter((id) => (inDegree.get(id) ?? 0) > 0)
    : undefined;

  // 4. Depth (forward) and height = critical-path length to leaves (backward)
  if (!hasCycles) {
    for (const id of topoOrder) {
      const node = nodes.get(id)!;
      node.depth = Math.max(-1, ...node.dependsOn.map((u) => nodes.get(u)?.depth ?? 0)) + 1;
    }
    for (let i = topoOrder.length - 1; i >= 0; i--) {
      const node = nodes.get(topoOrder[i])!;
      node.height = Math.max(-1, ...node.downstreamNodes.map((d) => nodes.get(d)?.height ?? 0)) + 1;
    }
  }

  // 5. Ready once every upstream item is completed and nothing is dangling
  for (const [id, node] of nodes.entries()) {
    if (node.status === "completed" || missing.has(id)) continue;
    const allUpstreamCompleted = node.dependsOn.every((depId) => nodes.get(depId)?.status === "completed");
    node.status = allUpstreamCompleted ? "ready" : "pending";
  }

  return {
    nodes,
    hasCycles,
    cycleNodes,
    maxDepth: Math.max(0, ...[...nodes.values()].map((n) => n.depth)),
    criticalPathLength: Math.max(0, ...[...nodes.values()].map((n) => n.height)),
  };
}
