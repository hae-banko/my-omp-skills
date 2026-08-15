// Research DAG Engine — Dependency-aware research graph execution.
//
// Allows research outline items in outline.yaml to declare dependency edges:
//
//   items:
//     - id: repo_discovery
//       name: "Find official codebase and spec"
//     - id: cipher_audit
//       name: "Audit encryption cipher"
//       depends_on: [repo_discovery]
//
// The DAG engine:
// 1. Validates graph topology (detects cycles via Kahn's algorithm).
// 2. Identifies unblocked frontier items ready for dispatch.
// 3. Extracts completed upstream JSON results to inject grounded context
//    into downstream subagent prompts (<upstream-context>).
// 4. Backward compatible with flat lists (items without dependencies are all roots).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResearchItemSpec } from "./research-renderer.ts";
import type { AgentEnvelope } from "../protocol/iap.ts";
import { synthesizeBlockedEnvelope, synthesizeCompletedEnvelope, synthesizeFailedEnvelope } from "../protocol/iap-hub.ts";

export type DagNodeStatus = "pending" | "ready" | "running" | "completed" | "blocked" | "failed";
export interface ResearchDagNode {
  id: string;
  name: string;
  category?: string;
  dependsOn: string[];
  status: DagNodeStatus;
  resultFile?: string;
  upstreamNodes: string[];
  downstreamNodes: string[];
  depth: number;
  height: number;
  transitiveDescendantsCount: number;
  priorityScore: number;
  epistemicHash?: string;
  isDirty?: boolean;
  blockedReason?: string;
  waitingFor?: string;
  lastEnvelope?: AgentEnvelope;
}
export interface ResearchDag {
  nodes: Map<string, ResearchDagNode>;
  roots: string[];
  leaves: string[];
  hasCycles: boolean;
  cycleNodes?: string[];
  topoOrder: string[];
  maxDepth: number;
  criticalPathLength: number;
}
export interface UpstreamEvidence {
  id: string;
  name: string;
  resultFile: string;
  evidenceText: string;
  sources: string[];
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

/**
 * Match an item name to an existing result JSON file in results/.
 */
export function findItemResultFile(resultsDir: string, itemId: string, itemName: string): string | undefined {
  if (!existsSync(resultsDir) || !statSync(resultsDir).isDirectory()) return undefined;
  try {
    const files = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
    const idLower = itemId.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const nameLower = itemName.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const slugName = slugifyItemId(itemName, 0);

    for (const f of files) {
      const fClean = f.toLowerCase().replace(/\.json$/, "").replace(/[^a-z0-9_]+/g, "_");
      if (fClean === idLower || fClean.endsWith(`_${idLower}`) || fClean.includes(idLower)) {
        return join(resultsDir, f);
      }
      if (fClean === nameLower || fClean.endsWith(`_${nameLower}`) || fClean.includes(nameLower)) {
        return join(resultsDir, f);
      }
      if (slugName && (fClean === slugName || fClean.endsWith(`_${slugName}`) || fClean.includes(slugName))) {
        return join(resultsDir, f);
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

/**
 * Deterministically compute an epistemic hash for a node given its definition,
 * category, dependencies, and upstream hashes (subgraph memoization).
 */
export function computeEpistemicNodeHash(
  nodeId: string,
  nodeName: string,
  dependsOn: string[],
  category?: string,
  upstreamHashes?: Record<string, string>,
): string {
  const hash = createHash("sha256");
  hash.update(`id:${nodeId.toLowerCase()}\n`);
  hash.update(`name:${nodeName.trim()}\n`);
  hash.update(`cat:${(category ?? "").trim()}\n`);

  const sortedDeps = [...dependsOn].map((d) => d.toLowerCase()).sort();
  hash.update(`deps:${sortedDeps.join(",")}\n`);

  if (upstreamHashes) {
    for (const dep of sortedDeps) {
      if (upstreamHashes[dep]) {
        hash.update(`upstream:${dep}:${upstreamHashes[dep]}\n`);
      }
    }
  }

  return hash.digest("hex").slice(0, 16);
}

/**
 * Build and validate the Research DAG from an outline's item list.
 */
export function buildResearchDag(items: ResearchItemSpec[], resultsDir?: string): ResearchDag {
  const nodes = new Map<string, ResearchDagNode>();
  const nameToId = new Map<string, string>();

  // 1. First pass: register node IDs
  items.forEach((item, idx) => {
    const rawId = item.id ? item.id.trim() : slugifyItemId(item.name, idx);
    const id = rawId.toLowerCase();
    nameToId.set(item.name.toLowerCase(), id);
    nameToId.set(id, id);

    let resultFile: string | undefined;
    if (resultsDir) {
      resultFile = findItemResultFile(resultsDir, id, item.name);
    }

    nodes.set(id, {
      id,
      name: item.name,
      category: item.category,
      dependsOn: [],
      status: resultFile ? "completed" : "pending",
      resultFile,
      upstreamNodes: [],
      downstreamNodes: [],
      depth: 0,
      height: 0,
      transitiveDescendantsCount: 0,
      priorityScore: 0,
    });
  });
  // 2. Second pass: wire dependencies
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
      if (resolvedId && resolvedId !== id && !node.dependsOn.includes(resolvedId)) {
        node.dependsOn.push(resolvedId);
      }
    }
  });

  // 3. Compute upstream and downstream connections
  for (const [id, node] of nodes.entries()) {
    for (const depId of node.dependsOn) {
      node.upstreamNodes.push(depId);
      const depNode = nodes.get(depId);
      if (depNode && !depNode.downstreamNodes.includes(id)) {
        depNode.downstreamNodes.push(id);
      }
    }
  }

  // 4. Cycle detection & topological sort via Kahn's algorithm
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

  // 5. Compute Transitive Descendants for each node
  for (const [id, node] of nodes.entries()) {
    const descendants = new Set<string>();
    const stack = [...node.downstreamNodes];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (!descendants.has(next) && next !== id) {
        descendants.add(next);
        const child = nodes.get(next);
        if (child) {
          for (const grandChild of child.downstreamNodes) {
            if (!descendants.has(grandChild)) stack.push(grandChild);
          }
        }
      }
    }
    node.transitiveDescendantsCount = descendants.size;
  }

  // 6. Compute Depth, Height, Epistemic Hash, and Priority Score along topological order
  const upstreamHashes: Record<string, string> = {};

  if (!hasCycles) {
    // Forward pass for depth & epistemic hash
    for (const id of topoOrder) {
      const node = nodes.get(id);
      if (!node) continue;
      if (node.upstreamNodes.length === 0) {
        node.depth = 0;
      } else {
        node.depth = Math.max(...node.upstreamNodes.map((u) => nodes.get(u)?.depth ?? 0)) + 1;
      }

      node.epistemicHash = computeEpistemicNodeHash(
        node.id,
        node.name,
        node.dependsOn,
        node.category,
        upstreamHashes,
      );
      upstreamHashes[node.id] = node.epistemicHash;
    }

    // Backward pass for height (critical-path length to leaves)
    for (let i = topoOrder.length - 1; i >= 0; i--) {
      const id = topoOrder[i];
      const node = nodes.get(id);
      if (!node) continue;
      if (node.downstreamNodes.length === 0) {
        node.height = 0;
      } else {
        node.height = Math.max(...node.downstreamNodes.map((d) => nodes.get(d)?.height ?? 0)) + 1;
      }
    }
  }

  // Calculate priority score for all nodes:
  // priority = (transitive_descendants * 10) + (height * 2) + depth
  for (const [, node] of nodes.entries()) {
    node.priorityScore = node.transitiveDescendantsCount * 10 + node.height * 2 + node.depth;

    // Check if result JSON holds an epistemic hash and if it matches
    if (node.resultFile && existsSync(node.resultFile)) {
      try {
        const raw = readFileSync(node.resultFile, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && parsed._epistemic_hash) {
          if (node.epistemicHash && parsed._epistemic_hash !== node.epistemicHash) {
            node.isDirty = true;
          }
        }
      } catch {
        // Ignore JSON read errors
      }
    }
  }

  // 7. Update statuses based on dependency resolution
  for (const [id, node] of nodes.entries()) {
    if (node.status === "completed") continue;
    if (node.dependsOn.length === 0) {
      node.status = "ready";
    } else {
      const allUpstreamCompleted = node.dependsOn.every((depId) => {
        const depNode = nodes.get(depId);
        return depNode && depNode.status === "completed";
      });
      node.status = allUpstreamCompleted ? "ready" : "pending";
    }
  }

  const roots = [...nodes.values()].filter((n) => n.upstreamNodes.length === 0).map((n) => n.id);
  const leaves = [...nodes.values()].filter((n) => n.downstreamNodes.length === 0).map((n) => n.id);
  const maxDepth = Math.max(0, ...[...nodes.values()].map((n) => n.depth));
  const criticalPathLength = Math.max(0, ...[...nodes.values()].map((n) => n.height));

  return {
    nodes,
    roots,
    leaves,
    hasCycles,
    cycleNodes,
    topoOrder,
    maxDepth,
    criticalPathLength,
  };
}

/**
 * Get all DAG nodes currently ready to be dispatched in the next wave,
 * prioritized by transitive bottleneck impact (descendants unblocked) and critical-path height.
 */
export function getReadyDagNodes(dag: ResearchDag): ResearchDagNode[] {
  return [...dag.nodes.values()]
    .filter((node) => node.status === "ready")
    .sort((a, b) => {
      // 1. Descending priority score (bottleneck impact + critical-path length)
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      // 2. Descending transitive descendants count
      if (b.transitiveDescendantsCount !== a.transitiveDescendantsCount) {
        return b.transitiveDescendantsCount - a.transitiveDescendantsCount;
      }
      // 3. Alphanumeric tiebreaker by ID
      return a.id.localeCompare(b.id);
    });
}
/**
 * Extract completed upstream evidence to pass to a downstream research agent.
 */
export function getUpstreamEvidence(dag: ResearchDag, nodeId: string): UpstreamEvidence[] {
  const targetNode = dag.nodes.get(nodeId.toLowerCase());
  if (!targetNode) return [];

  const evidenceList: UpstreamEvidence[] = [];
  const visited = new Set<string>();

  const collect = (depId: string): void => {
    if (visited.has(depId)) return;
    visited.add(depId);
    const depNode = dag.nodes.get(depId);
    if (!depNode || !depNode.resultFile || !existsSync(depNode.resultFile)) return;

    try {
      const raw = readFileSync(depNode.resultFile, "utf8");
      const parsed = JSON.parse(raw);
      const evidenceText =
        typeof parsed === "object" && parsed !== null
          ? Object.entries(parsed)
              .filter(([k]) => !k.startsWith("_"))
              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
              .join("\n")
          : raw;

      const sources: string[] = [];
      const urlMatches = raw.match(/https?:\/\/[^\s"'\)\]]+/g);
      if (urlMatches) {
        for (const u of urlMatches) {
          if (!sources.includes(u)) sources.push(u);
        }
      }

      evidenceList.push({
        id: depNode.id,
        name: depNode.name,
        resultFile: depNode.resultFile,
        evidenceText,
        sources,
      });
    } catch {
      // Ignore parse errors
    }

    // Recursively collect from deeper ancestors
    for (const ancestorId of depNode.dependsOn) {
      collect(ancestorId);
    }
  };

  for (const depId of targetNode.dependsOn) {
    collect(depId);
  }

  return evidenceList;
}

/**
 * Format upstream evidence into an injection block for the subagent prompt.
 */
export function formatUpstreamContextPrompt(evidenceList: UpstreamEvidence[]): string {
  if (evidenceList.length === 0) return "";

  const lines: string[] = [
    "<upstream-context>",
    "The following upstream dependency items have already been verified. Use their discovered repositories, URLs, and facts as grounded evidence rather than re-searching from scratch:",
  ];

  for (const ev of evidenceList) {
    lines.push(`\n### Upstream: ${ev.name} (${ev.id})`);
    lines.push(ev.evidenceText);
    if (ev.sources.length > 0) {
      lines.push(`Sources: ${ev.sources.join(", ")}`);
    }
  }

  lines.push("</upstream-context>\n");
  return lines.join("\n");
}
/**
 * Ingest an incoming IAP envelope into the active Research DAG.
 * Reactively updates node states, suspends blocked nodes, and unblocks downstream children.
 */
export function ingestIapEnvelope(
  dag: ResearchDag,
  envelope: AgentEnvelope,
): { updated: boolean; unblockedNodes: string[]; suspendedNodes: string[] } {
  const senderId = (envelope.sender.name || "").toLowerCase().trim();
  const node = dag.nodes.get(senderId);
  const unblockedNodes: string[] = [];
  const suspendedNodes: string[] = [];

  if (!node) {
    return { updated: false, unblockedNodes, suspendedNodes };
  }

  node.lastEnvelope = envelope;

  switch (envelope.performative) {
    case "COMPLETED":
    case "INFORM": {
      node.status = "completed";
      node.blockedReason = undefined;
      node.waitingFor = undefined;

      // Check downstream nodes for newly satisfied dependencies
      for (const nextId of node.downstreamNodes) {
        const nextNode = dag.nodes.get(nextId);
        if (!nextNode || nextNode.status === "completed" || nextNode.status === "running") continue;

        const allDepsMet = nextNode.dependsOn.every((depId) => {
          const dep = dag.nodes.get(depId);
          return dep && dep.status === "completed";
        });

        if (allDepsMet && nextNode.status !== "ready") {
          nextNode.status = "ready";
          unblockedNodes.push(nextId);
        }
      }
      return { updated: true, unblockedNodes, suspendedNodes };
    }

    case "BLOCKED": {
      node.status = "blocked";
      const payload = (envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {}) as Record<string, unknown>;
      node.waitingFor = typeof payload.waiting_for === "string" ? payload.waiting_for : undefined;
      node.blockedReason = typeof payload.reason === "string" ? payload.reason : "MISSING_PREREQUISITE";
      suspendedNodes.push(node.id);
      return { updated: true, unblockedNodes, suspendedNodes };
    }

    case "FAILED": {
      node.status = "failed";
      const payload = (envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {}) as Record<string, unknown>;
      node.blockedReason = typeof payload.error === "string" ? payload.error : "TERMINAL_ERROR";
      return { updated: true, unblockedNodes, suspendedNodes };
    }

    default:
      return { updated: false, unblockedNodes, suspendedNodes };
  }
}

/**
 * Synthesize IAP envelopes for all completed nodes in a DAG from disk blackboard files.
 */
export function synthesizeEnvelopesForDag(dag: ResearchDag, resultsDir: string): AgentEnvelope[] {
  const envelopes: AgentEnvelope[] = [];

  for (const node of dag.nodes.values()) {
    if (node.resultFile && existsSync(node.resultFile)) {
      try {
        const fileContent = readFileSync(node.resultFile, "utf8");
        const env = synthesizeCompletedEnvelope({
          filePath: node.resultFile,
          fileContent,
          senderName: node.id,
        });
        node.lastEnvelope = env;
        envelopes.push(env);
      } catch {
        // Ignore read errors
      }
    }
  }

  return envelopes;
}
