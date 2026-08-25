// Multi-LLM Council Deliberation & Consensus Engine (SPEC-002)
//
// Implements multi-perspective agent deliberation, Star Chamber semantic consensus
// partitioning, and Ed25519-signed decision records (ADR-034) with zero external dependencies.

import { generateKeyPairSync, sign, verify, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceContext } from "../core/workspace.ts";
import type { CommandContext, ExtensionApi } from "../core/api.ts";
import {
  BORDER_COLORS,
  bold,
  boxLine,
  colorize,
  dim,
  displayWidth,
  italic,
  makeBottomBorder,
  makeDivider,
  makeTopBorder,
  truncateToWidth,
} from "../research/research-format.ts";
import type {
  CouncilOverlayAction,
  CouncilOverlayComponent,
} from "./council-overlay.ts";
import { createCouncilOverlay } from "./council-overlay.ts";

export type CouncilMode = "quick" | "deep" | "raw";

/** Custom message type for council verdict transcripts. */
export const COUNCIL_CUSTOM_TYPE = "council-verdict";

/** Unique key for the status-bar widget during deliberation. */
export const COUNCIL_STATUS_KEY = "council";

export interface CouncilPersona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  badgeColor: string;
  /** Optional tool allow-list surfaced in the subagent prompt so the persona
   *  knows it can read reference repos, execute web searches, or query the
   *  filesystem to back claims with primary sources. */
  tools?: string[];
}

export interface CouncilConfig {
  councils: Record<string, CouncilPersona[]>;
  defaultCouncil: string;
  defaultMode: CouncilMode;
  timeoutSeconds: number;
}

export interface CouncilOpinion {
  personaId: string;
  personaName: string;
  stance: string;
  recommendation: string;
  keyInvariants: string[];
  caveats: string[];
  confidence: number;
}

export interface CouncilVerdict {
  topic: string;
  mode: CouncilMode;
  councilName: string;
  opinions: CouncilOpinion[];
  consensusInvariants: string[];
  majorityRecommendations: string[];
  uniqueInsights: Array<{ persona: string; insight: string }>;
  criticalDivergences: Array<{ issue: string; positions: Record<string, string> }>;
  verdictSummary: string;
  snapshotId?: string;
  signature?: string;
  publicKey?: string;
  savedPath?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Default Persona Triad
// ---------------------------------------------------------------------------

export const DEFAULT_COUNCIL_TRIAD: CouncilPersona[] = [
  {
    id: "minimalist",
    name: "Minimalist",
    role: "YAGNI, platform-native simplicity, and line-count deletion",
    badgeColor: BORDER_COLORS.green,
    systemPrompt: [
      "You are the Minimalist Council Member (channeling 'ponytail').",
      "Your core mandate is aggressive simplification, YAGNI, standard library usage, and deleting dead weight.",
      "Identify unnecessary abstractions, single-caller wrappers, speculative flexibility, and extra dependencies.",
      "Recommend the shortest, simplest, most native solution that completely fulfills the core requirement.",
    ].join(" "),
  },
  {
    id: "architect",
    name: "Systems Architect",
    role: "Deep module boundaries, testable seams, and maintainability",
    badgeColor: BORDER_COLORS.blue,
    systemPrompt: [
      "You are the Systems Architect Council Member.",
      "Your core mandate is clean interface boundaries, type safety, modular seams, and maintainability 6 months out.",
      "Evaluate how the design affects system coupling, error propagation, testability, and future evolution.",
      "Recommend robust invariants and well-defined contracts that make the codebase easy to navigate and extend.",
    ].join(" "),
  },
  {
    id: "security",
    name: "Security Auditor",
    role: "Adversarial failure modes, boundary validation, and safety invariants",
    badgeColor: BORDER_COLORS.yellow,
    systemPrompt: [
      "You are the Security & Invariant Auditor Council Member.",
      "Your core mandate is identifying failure modes, untrusted boundary hazards, race conditions, and error resilience.",
      "Stress-test assumptions, input sanitization, capability leaks, and worst-case resource exhaustion.",
      "Recommend strict defense-in-depth boundaries and fail-safe defaults.",
    ].join(" "),
  },
];

// ---------------------------------------------------------------------------
// Domain-Specific Council Presets
// ---------------------------------------------------------------------------

/** ML research triad — model architecture, evaluation rigor, and inference
 *  economics. Surface `web_search` and `read` so the personas can pull primary
 *  sources (papers, docs, reference repos) before stating an invariant. */
export const ML_RESEARCH_TRIAD: CouncilPersona[] = [
  {
    id: "model-architect",
    name: "Model Architect",
    role: "Deep learning architectures, loss functions, representation learning, scaling laws",
    badgeColor: BORDER_COLORS.cyan,
    systemPrompt: [
      "You are the Model Architect Council Member.",
      "Your core mandate is deep learning model design: architectures, loss functions, representation learning objectives, and scaling-law trade-offs.",
      "Evaluate parameter count vs sample efficiency, inductive bias vs expressivity, training stability vs representational capacity.",
      "Cite primary sources (arXiv papers, official model repos, .omp/references/ entries) before stating an invariant.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read", "grep"],
  },
  {
    id: "eval-critic",
    name: "Eval Critic",
    role: "Benchmark rigor, data leakage, statistical significance, overfitting, ablation validity",
    badgeColor: BORDER_COLORS.yellow,
    systemPrompt: [
      "You are the Evaluation Critic Council Member.",
      "Your core mandate is benchmark rigor: data leakage, held-out contamination, statistical significance, multiple-comparison correction, overfitting to the validation set, and ablation validity.",
      "Demand concrete seeds, sample sizes, confidence intervals, and reproducibility artefacts before accepting a result.",
      "Cite primary sources (papers, leaderboards, .omp/references/) before stating an invariant.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read", "grep"],
  },
  {
    id: "inference-engineer",
    name: "Inference Engineer",
    role: "KV cache economics, memory footprint, quantization, throughput, latency budgeting",
    badgeColor: BORDER_COLORS.green,
    systemPrompt: [
      "You are the Inference Engineer Council Member.",
      "Your core mandate is serving economics: KV cache footprint, memory bandwidth, quantization trade-offs (INT8/INT4/FP8), batching, throughput vs latency SLOs, and tail-latency budgets.",
      "Reason in tokens/sec, GiB of VRAM, and ms p99; cite hardware specs, kernel benchmarks, and serving-framework docs.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read", "grep"],
  },
];

/** Embedded firmware triad — realtime ISR/DMA safety, register-level hardware
 *  correctness, and zero-cost C/Rust idioms. Surface `read`/`grep` so personas
 *  can inspect the relevant HAL, linker, and reference RM/AN docs. */
export const EMBEDDED_TRIAD: CouncilPersona[] = [
  {
    id: "realtime-auditor",
    name: "Realtime Auditor",
    role: "ISR latency, deterministic timing, memory constraints (DTCM/SRAM), zero-allocation invariants",
    badgeColor: BORDER_COLORS.yellow,
    systemPrompt: [
      "You are the Realtime Auditor Council Member.",
      "Your core mandate is deterministic timing: ISR entry-to-exit latency, priority inversion, memory barriers, DMA/DTCM/SRAM placement, and zero-allocation hot-path invariants.",
      "Verify worst-case execution time, jitter budgets, and stack/heap ceilings before stating an invariant.",
      "Cite datasheets, reference manuals, and linker docs before claiming a constraint.",
      "You may read reference repos (.omp/references/) and grep the codebase for HAL callsite invariants.",
    ].join(" "),
    tools: ["read", "grep", "glob"],
  },
  {
    id: "hardware-safety",
    name: "Hardware Safety",
    role: "Register configurations, DMA bus access, peripheral contention, brownout recovery",
    badgeColor: BORDER_COLORS.red,
    systemPrompt: [
      "You are the Hardware Safety Council Member.",
      "Your core mandate is register-level correctness: peripheral init order, DMA bus matrix access, clock-tree gating, brownout/reset recovery, watchdog cadence, and pin-mux conflicts.",
      "Validate that every peripheral transitions through its documented enable/disable sequence and that bus access rights are honoured on every path.",
      "Cite reference manuals and errata before stating an invariant.",
      "You may read reference repos (.omp/references/) and grep the codebase for register-level callsites.",
    ].join(" "),
    tools: ["read", "grep", "glob"],
  },
  {
    id: "baremetal-pragmatist",
    name: "Baremetal Pragmatist",
    role: "C/Rust zero-cost abstractions, compiler optimizations, minimal HAL dependencies",
    badgeColor: BORDER_COLORS.green,
    systemPrompt: [
      "You are the Baremetal Pragmatist Council Member.",
      "Your core mandate is zero-cost abstraction: prefer C/Rust stdlib and compiler intrinsics over heavy HAL layers, keep interrupt latency budgets, and minimize code size / RAM footprint.",
      "Delete unused HAL wrappers, prefer `static inline` over virtual dispatch, and gate debug code behind `#ifdef`.",
      "You may read reference repos (.omp/references/) to compare idioms before stating an invariant.",
    ].join(" "),
    tools: ["read", "grep"],
  },
];

/** Electrical engineering triad — SI/PI integrity, DFM part lifecycle, and
  *  safety/compliance. Surface `web_search`/`read` for datasheets and IPC/
  *  UL/IEC standards. */
export const ELECTRICAL_EE_TRIAD: CouncilPersona[] = [
  {
    id: "signal-power-integrity",
    name: "Signal & Power Integrity",
    role: "Decoupling, impedance matching, power plane topology, ground loops, noise margins",
    badgeColor: BORDER_COLORS.cyan,
    systemPrompt: [
      "You are the Signal & Power Integrity Council Member.",
      "Your core mandate is SI/PI: controlled-impedance routing, decoupling capacitor placement, power plane stackup, return-path continuity, ground loops, and noise margins.",
      "Quantify with mV ripple budgets, dB return loss targets, and V/us slew rates before stating an invariant.",
      "Cite IPC-2152, manufacturer app notes, and reference designs before stating an invariant.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read", "grep"],
  },
  {
    id: "component-dfm",
    name: "Component DFM",
    role: "Part lifecycle/availability, thermal dissipation, pin-mux conflicts, test points",
    badgeColor: BORDER_COLORS.magenta,
    systemPrompt: [
      "You are the Component DFM Council Member.",
      "Your core mandate is design-for-manufacturability: part lifecycle (NRND/EOL), distributor stock, thermal dissipation paths, pin-mux conflicts, and test-point access.",
      "Prefer parts in active production with ≥3 distributor sources; flag thermal bottlenecks before stating an invariant.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read"],
  },
  {
    id: "safety-compliance",
    name: "Safety & Compliance",
    role: "ESD protection, reverse polarity, overvoltage clamp, fail-safe power states",
    badgeColor: BORDER_COLORS.red,
    systemPrompt: [
      "You are the Safety & Compliance Council Member.",
      "Your core mandate is electrical safety: ESD protection (HBM/CDM), reverse-polarity guarding, overvoltage clamps, fuse/TVS selection, and fail-safe default power states.",
      "Map every conductor pair to its hazard class (SELV, limited energy, mains) before stating an invariant.",
      "Cite IEC 61010 / UL 60950 / IPC-9592 as appropriate before stating an invariant.",
      "You may execute web_search and read references to back claims.",
    ].join(" "),
    tools: ["web_search", "read"],
  },
];

/** Every built-in preset by canonical id. Aliases map to the same array. */
export const COUNCIL_PRESETS: Record<string, CouncilPersona[]> = {
  "default-triad": DEFAULT_COUNCIL_TRIAD,
  "ml-research": ML_RESEARCH_TRIAD,
  ml: ML_RESEARCH_TRIAD,
  embedded: EMBEDDED_TRIAD,
  firmware: EMBEDDED_TRIAD,
  "electrical-ee": ELECTRICAL_EE_TRIAD,
  ee: ELECTRICAL_EE_TRIAD,
  hardware: ELECTRICAL_EE_TRIAD,
};

/** Flat alias → canonical-id table (single source of truth for autocompletes). */
export const COUNCIL_PRESET_ALIASES: Record<string, string> = {
  "default-triad": "default-triad",
  software: "default-triad",
  "ml-research": "ml-research",
  ml: "ml-research",
  embedded: "embedded",
  firmware: "embedded",
  "electrical-ee": "electrical-ee",
  ee: "electrical-ee",
  hardware: "electrical-ee",
};

/** Sorted list of preset display names (canonical ids) for autocomplete/help. */
export const COUNCIL_PRESET_IDS: string[] = [
  "default-triad",
  "ml-research",
  "embedded",
  "electrical-ee",
];

/** Canonical ids + aliases merged into one ordered list for the `--preset`
 *  completer / `list` help card. Aliases come right after their canonical
 *  id so they autocomplete naturally. */
export function listCouncilPresets(): Array<{ id: string; aliasOf?: string }> {
  const out: Array<{ id: string; aliasOf?: string }> = [];
  for (const id of COUNCIL_PRESET_IDS) {
    out.push({ id });
    for (const [alias, target] of Object.entries(COUNCIL_PRESET_ALIASES)) {
      if (alias !== id && target === id) out.push({ id: alias, aliasOf: id });
    }
  }
  return out;
}

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = {
  councils: {
    ...COUNCIL_PRESETS,
  },
  defaultCouncil: "default-triad",
  defaultMode: "quick",
  timeoutSeconds: 30,
};

// ---------------------------------------------------------------------------
// Config & YAML Loader
// ---------------------------------------------------------------------------

/**
 * Load council configuration from `.omp/council.yaml` if present, or return defaults.
 *
 * Built-in presets (ml-research, embedded, electrical-ee and their aliases)
 * are always present in the returned config; a user-supplied YAML can add
 * additional councils or override built-in entries by redeclaring the same id.
 */
export function loadCouncilConfig(rootDir?: string): CouncilConfig {
  const root = rootDir ?? process.cwd();
  const configPath = join(root, ".omp", "council.yaml");
  // Seed with every built-in preset so the resolver always has a hit even
  // without a YAML file on disk.
  const councils: Record<string, CouncilPersona[]> = { ...COUNCIL_PRESETS };

  if (!existsSync(configPath)) {
    return DEFAULT_COUNCIL_CONFIG;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    // Lightweight parser for simple council.yaml without heavy dependencies
    const lines = raw.split("\n");
    let currentCouncil = "";
    let currentPersona: Partial<CouncilPersona> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const councilMatch = line.match(/^([a-z0-9_-]+):\s*$/i);
      if (councilMatch) {
        if (currentCouncil && currentPersona && currentPersona.id) {
          pushPersona(councils, currentCouncil, currentPersona);
        }
        currentCouncil = councilMatch[1];
        currentPersona = null;
        if (!councils[currentCouncil]) councils[currentCouncil] = [];
        continue;
      }

      if (currentCouncil && /^\s*-\s*id:\s*(.+)$/i.test(line)) {
        if (currentPersona && currentPersona.id) {
          pushPersona(councils, currentCouncil, currentPersona);
        }
        currentPersona = {
          id: line.replace(/^\s*-\s*id:\s*/i, "").trim().replace(/^['"]|['"]$/g, ""),
          name: "",
          role: "",
          systemPrompt: "",
          badgeColor: BORDER_COLORS.cyan,
          tools: [],
        };
      } else if (currentPersona) {
        if (/^\s*name:\s*(.+)$/i.test(line)) {
          currentPersona.name = line.replace(/^\s*name:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^\s*role:\s*(.+)$/i.test(line)) {
          currentPersona.role = line.replace(/^\s*role:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^\s*systemPrompt:\s*(.+)$/i.test(line)) {
          currentPersona.systemPrompt = line.replace(/^\s*systemPrompt:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^\s*badgeColor:\s*(.+)$/i.test(line)) {
          currentPersona.badgeColor = line.replace(/^\s*badgeColor:\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
        } else if (/^\s*-\s*(.+)$/i.test(line) && /^\s*tools:/i.test(line.replace(/-.*/, "")) === false) {
          // `- web_search` style under `tools:` list
          const tool = line.replace(/^\s*-\s*/i, "").trim().replace(/^['"]|['"]$/g, "");
          if (tool) currentPersona.tools = [...(currentPersona.tools ?? []), tool];
        }
      }
    }

    if (currentCouncil && currentPersona && currentPersona.id) {
      pushPersona(councils, currentCouncil, currentPersona);
    }

    return {
      councils,
      defaultCouncil: Object.keys(councils)[0] || "default-triad",
      defaultMode: "quick",
      timeoutSeconds: 30,
    };
  } catch {
    return DEFAULT_COUNCIL_CONFIG;
  }
}

/** Push a parsed persona into the council map; resets the slot after commit. */
function pushPersona(
  councils: Record<string, CouncilPersona[]>,
  councilId: string,
  persona: Partial<CouncilPersona>,
): void {
  const cleaned: CouncilPersona = {
    id: persona.id ?? "",
    name: persona.name ?? "",
    role: persona.role ?? "",
    systemPrompt: persona.systemPrompt ?? "",
    badgeColor: persona.badgeColor ?? BORDER_COLORS.cyan,
    ...(persona.tools && persona.tools.length > 0 ? { tools: persona.tools } : {}),
  };
  councils[councilId] = [...councils[councilId], cleaned];
}

// ---------------------------------------------------------------------------
// Council Listing & YAML Scaffold
// ---------------------------------------------------------------------------

/** Render a flat, multi-line summary of every council (built-in + user)
 *  for the `/council list` subcommand and the help card. */
export function listCouncils(rootDir?: string): Array<{
  id: string;
  builtin: boolean;
  aliases?: string[];
  personas: CouncilPersona[];
}> {
  const config = loadCouncilConfig(rootDir);
  const out: Array<{ id: string; builtin: boolean; aliases?: string[]; personas: CouncilPersona[] }> = [];
  // Built-ins first in canonical order, then any user-defined extras.
  // config.councils also contains every alias of every built-in (so the
  // resolver always has a hit), so we dedupe via the seen set.
  const seen = new Set<string>();
  for (const id of COUNCIL_PRESET_IDS) {
    const personas = config.councils[id];
    if (!personas) continue;
    seen.add(id);
    const aliases = Object.entries(COUNCIL_PRESET_ALIASES)
      .filter(([alias, target]) => target === id && alias !== id)
      .map(([alias]) => alias);
    out.push({ id, builtin: true, ...(aliases.length > 0 ? { aliases } : {}), personas });
  }
  for (const [id, personas] of Object.entries(config.councils)) {
    if (seen.has(id)) continue;
    // Skip built-in aliases — they map to a canonical id already shown.
    if (id in COUNCIL_PRESET_ALIASES && COUNCIL_PRESET_ALIASES[id] !== id) continue;
    out.push({ id, builtin: false, personas });
  }
  return out;
}

/** Render a `.omp/council.yaml` scaffold that documents every built-in
 *  preset and shows how to override / extend a council. The scaffold is
 *  idempotent: only writes the file when absent unless `force` is true. */
export function scaffoldCouncilYaml(rootDir?: string, options: { force?: boolean } = {}): {
  path: string;
  created: boolean;
} {
  const root = rootDir ?? process.cwd();
  const targetDir = join(root, ".omp");
  const targetPath = join(targetDir, "council.yaml");
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  if (existsSync(targetPath) && !options.force) {
    return { path: targetPath, created: false };
  }

  const lines: string[] = [
    "# .omp/council.yaml — custom council presets (extends the built-in triads).",
    "# ",
    "# Built-in presets (always available, no need to redeclare):",
    "#   default-triad       software (minimalist / architect / security)",
    "#   ml-research         model-architect / eval-critic / inference-engineer",
    "#   embedded            realtime-auditor / hardware-safety / baremetal-pragmatist",
    "#   electrical-ee       signal-power-integrity / component-dfm / safety-compliance",
    "# ",
    "# Aliases recognised on the CLI (--software, --ml, --embedded / --firmware,",
    "# --ee / --hardware) map to the same arrays.",
    "# ",
    "# Add your own council by giving it a unique slug, listing 3 personas, and",
    "# optionally surfacing tool capabilities (web_search, read, grep, glob, etc.).",
    "",
  ];

  // Add a copy-able sample user-defined council so the file is not empty.
  const exampleCouncil = DEFAULT_COUNCIL_TRIAD[0];
  if (exampleCouncil) {
    lines.push("my-domain-council:");
    lines.push("  - id: my-persona-a");
    lines.push(`    name: "${exampleCouncil.name} (Adapted)"`);
    lines.push(`    role: "${exampleCouncil.role}"`);
    lines.push(`    badgeColor: "${exampleCouncil.badgeColor}"`);
    lines.push("    systemPrompt: \"Your 1–3 sentence mandate goes here.\"");
    lines.push("    tools:");
    lines.push("      - web_search");
    lines.push("      - read");
    lines.push("      - grep");
    lines.push("  - id: my-persona-b");
    lines.push("    name: \"Specialist B\"");
    lines.push("    role: \"What this lens watches for\"");
    lines.push("    badgeColor: \"\\x1b[34m\"");
    lines.push("    systemPrompt: \"Your 1–3 sentence mandate goes here.\"");
    lines.push("  - id: my-persona-c");
    lines.push("    name: \"Specialist C\"");
    lines.push("    role: \"What this lens watches for\"");
    lines.push("    badgeColor: \"\\x1b[33m\"");
    lines.push("    systemPrompt: \"Your 1–3 sentence mandate goes here.\"");
    lines.push("");
  }

  writeFileSync(targetPath, lines.join("\n"));
  return { path: targetPath, created: true };
}

/** Convert a CouncilVerdict to a list of human-readable lines suitable for
 *  the `/council list` command output or the chat-rendered receipt card. */
export function summarizeVerdict(verdict: CouncilVerdict): string {
  const consensus = verdict.consensusInvariants.length;
  const majority = verdict.majorityRecommendations.length;
  const divergences = verdict.criticalDivergences.length;
  return [
    `Topic: ${verdict.topic}`,
    `Council: ${verdict.councilName} · Mode: ${verdict.mode.toUpperCase()}`,
    `Consensus: ${consensus} · Majority: ${majority} · Divergences: ${divergences}`,
    verdict.verdictSummary,
  ].join("\n");
}
// ---------------------------------------------------------------------------
// Star Chamber Semantic Consensus Partitioner
// ---------------------------------------------------------------------------

export interface PartitionResult {
  consensusInvariants: string[];
  majorityRecommendations: string[];
  uniqueInsights: Array<{ persona: string; insight: string }>;
  criticalDivergences: Array<{ issue: string; positions: Record<string, string> }>;
  verdictSummary: string;
}

/**
 * Partition council opinions into Star Chamber consensus buckets.
 */
export function partitionCouncilOpinions(opinions: CouncilOpinion[], topic: string): PartitionResult {
  const consensusInvariants: string[] = [];
  const majorityRecommendations: string[] = [];
  const uniqueInsights: Array<{ persona: string; insight: string }> = [];
  const criticalDivergences: Array<{ issue: string; positions: Record<string, string> }> = [];

  if (opinions.length === 0) {
    return {
      consensusInvariants: [],
      majorityRecommendations: [],
      uniqueInsights: [],
      criticalDivergences: [],
      verdictSummary: "No council opinions provided.",
    };
  }

  // 1. Collect all invariant statements across personas
  const invariantCounts = new Map<string, { count: number; personas: string[] }>();
  for (const op of opinions) {
    for (const inv of op.keyInvariants) {
      const normalized = inv.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const existing = invariantCounts.get(normalized) || { count: 0, personas: [] };
      existing.count += 1;
      existing.personas.push(op.personaName);
      invariantCounts.set(normalized, existing);
    }
  }

  // 2. Identify 3/3 Consensus vs 2/3 Majority
  const total = opinions.length;
  for (const op of opinions) {
    for (const inv of op.keyInvariants) {
      const normalized = inv.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const entry = invariantCounts.get(normalized);
      if (entry) {
        if (entry.count >= total && !consensusInvariants.includes(inv)) {
          consensusInvariants.push(inv);
        } else if (entry.count >= Math.ceil(total * 0.6) && entry.count < total && !majorityRecommendations.includes(inv)) {
          majorityRecommendations.push(`${inv} (supported by ${entry.personas.join(", ")})`);
        }
      }
    }
  }

  // 3. Fallback recommendations if no strict invariants matched
  if (consensusInvariants.length === 0 && majorityRecommendations.length === 0) {
    // Look at recommendations
    for (const op of opinions) {
      if (op.recommendation && !majorityRecommendations.includes(op.recommendation)) {
        majorityRecommendations.push(`[${op.personaName}] ${op.recommendation}`);
      }
    }
  }

  // 4. Extract unique insights (specialized single-persona observations/caveats)
  for (const op of opinions) {
    for (const caveat of op.caveats) {
      uniqueInsights.push({
        persona: op.personaName,
        insight: caveat,
      });
    }
  }

  // 5. Detect Critical Divergences (conflicting recommendations or stances)
  const stances = opinions.map((o) => o.stance.toLowerCase());
  const uniqueStances = Array.from(new Set(stances));
  if (uniqueStances.length > 1) {
    const posMap: Record<string, string> = {};
    for (const op of opinions) {
      posMap[op.personaName] = op.recommendation || op.stance;
    }
    criticalDivergences.push({
      issue: `Trade-off divergence on ${topic}`,
      positions: posMap,
    });
  }

  const verdictSummary = consensusInvariants.length > 0
    ? `Consensus established on ${consensusInvariants.length} core invariant(s).`
    : `Deliberation concluded with ${majorityRecommendations.length} majority recommendation(s) and ${criticalDivergences.length} trade-off divergence(s).`;

  return {
    consensusInvariants,
    majorityRecommendations,
    uniqueInsights,
    criticalDivergences,
    verdictSummary,
  };
}

// ---------------------------------------------------------------------------
// Cryptographic Verification & Ed25519 Signatures (ADR-034)
// ---------------------------------------------------------------------------

/**
 * Sign a council verdict using Ed25519 and bind to git commit SHA (ADR-034).
 */
export function signCouncilVerdict(
  verdict: Omit<CouncilVerdict, "signature" | "publicKey">,
  privateKeyPem?: string,
): { signature: string; publicKey: string } {
  let priv = privateKeyPem;
  let pub = "";

  if (!priv) {
    const keyPair = generateKeyPairSync("ed25519");
    priv = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    pub = keyPair.publicKey.export({ type: "spki", format: "pem" }) as string;
  }

  // Canonical JSON representation for deterministic signing
  const canonical = JSON.stringify({
    topic: verdict.topic,
    councilName: verdict.councilName,
    snapshotId: verdict.snapshotId ?? "HEAD",
    consensusInvariants: verdict.consensusInvariants,
    majorityRecommendations: verdict.majorityRecommendations,
    verdictSummary: verdict.verdictSummary,
    timestamp: verdict.timestamp,
  });

  const digest = createHash("sha256").update(canonical).digest();
  const signatureBuffer = sign(null, digest, priv);
  const signatureHex = signatureBuffer.toString("hex");

  return {
    signature: signatureHex,
    publicKey: pub || "ed25519-embedded",
  };
}

/**
 * Verify an Ed25519 signed council verdict.
 */
export function verifyCouncilSignature(verdict: CouncilVerdict, publicKeyPem: string): boolean {
  if (!verdict.signature || !publicKeyPem) return false;
  try {
    const canonical = JSON.stringify({
      topic: verdict.topic,
      councilName: verdict.councilName,
      snapshotId: verdict.snapshotId ?? "HEAD",
      consensusInvariants: verdict.consensusInvariants,
      majorityRecommendations: verdict.majorityRecommendations,
      verdictSummary: verdict.verdictSummary,
      timestamp: verdict.timestamp,
    });

    const digest = createHash("sha256").update(canonical).digest();
    const sigBuffer = Buffer.from(verdict.signature, "hex");
    return verify(null, digest, publicKeyPem, sigBuffer);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Persistence: Decision Records (.omp/scratch/debates/)
// ---------------------------------------------------------------------------

/**
 * Save a council verdict as a persistent decision record markdown file.
 */
export function saveCouncilRecord(rootDir: string, verdict: CouncilVerdict): string {
  const ctx = getWorkspaceContext(rootDir);
  const debatesDir = join(ctx.scratch, "debates");
  if (!existsSync(debatesDir)) {
    mkdirSync(debatesDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = verdict.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "deliberation";

  const filename = `${dateStr}_${slug}.md`;
  const targetPath = join(debatesDir, filename);

  const lines: string[] = [
    "---",
    `debate_id: ${dateStr}_${slug}`,
    `topic: "${verdict.topic.replace(/"/g, '\\"')}"`,
    `council: ${verdict.councilName}`,
    `mode: ${verdict.mode}`,
    `timestamp: "${verdict.timestamp}"`,
    ...(verdict.snapshotId ? [`snapshot_id: ${verdict.snapshotId}`] : []),
    ...(verdict.signature ? [`signature_ed25519: ${verdict.signature}`] : []),
    "consensus_invariants:",
    ...verdict.consensusInvariants.map((c) => `  - "${c.replace(/"/g, '\\"')}"`),
    "---",
    "",
    `# Council Verdict: ${verdict.topic}`,
    "",
    `**Council**: \`${verdict.councilName}\` · **Mode**: \`${verdict.mode}\` · **Timestamp**: ${verdict.timestamp}`,
    "",
    "## Summary",
    "",
    verdict.verdictSummary,
    "",
    "## 🟢 Consensus Invariants (3/3)",
    "",
    ...(verdict.consensusInvariants.length > 0
      ? verdict.consensusInvariants.map((c) => `- **${c}**`)
      : ["- *(No unanimous invariants established)*"]),
    "",
    "## 🟡 Majority Recommendations (2/3)",
    "",
    ...(verdict.majorityRecommendations.length > 0
      ? verdict.majorityRecommendations.map((m) => `- ${m}`)
      : ["- *(No majority recommendations)*"]),
    "",
    "## 🔵 Unique Insights & Specialized Caveats",
    "",
    ...(verdict.uniqueInsights.length > 0
      ? verdict.uniqueInsights.map((u) => `- **[${u.persona}]**: ${u.insight}`)
      : ["- *(No specialized caveats flagged)*"]),
    "",
    "## 🔴 Critical Divergences & Trade-offs",
    "",
    ...(verdict.criticalDivergences.length > 0
      ? verdict.criticalDivergences.flatMap((d) => [
          `### ${d.issue}`,
          ...Object.entries(d.positions).map(([p, pos]) => `- **${p}**: ${pos}`),
        ])
      : ["- *(No irreconcilable divergences)*"]),
    "",
    "## Deliberation Perspectives",
    "",
    ...verdict.opinions.flatMap((o) => [
      `### ${o.personaName}`,
      `**Stance**: ${o.stance} (Confidence: ${Math.round(o.confidence * 100)}%)`,
      "",
      `**Recommendation**: ${o.recommendation}`,
      "",
      "**Key Invariants**:",
      ...o.keyInvariants.map((k) => `- ${k}`),
      "",
      "**Caveats & Risks**:",
      ...o.caveats.map((c) => `- ${c}`),
      "",
    ]),
  ];

  writeFileSync(targetPath, lines.join("\n"));
  return targetPath;
}

// ---------------------------------------------------------------------------
// 76-Column ANSI Verdict Card Renderer
// ---------------------------------------------------------------------------

/**
 * Render a colorized 76-column ANSI Council Verdict Card for chat display.
 */
export function renderCouncilVerdictCard(verdict: CouncilVerdict): string {
  const borderColor = verdict.consensusInvariants.length > 0
    ? BORDER_COLORS.green
    : verdict.criticalDivergences.length > 0
    ? BORDER_COLORS.yellow
    : BORDER_COLORS.cyan;

  const inner = 74; // 76 - 2 border characters
  const lines: string[] = [makeTopBorder(borderColor)];

  // Header Title
  const titleText = `⚖️  ${bold("COUNCIL VERDICT")} ◄ ${verdict.councilName} (${verdict.mode.toUpperCase()}) ►`;
  lines.push(boxLine(titleText, borderColor));
  lines.push(makeDivider(borderColor));

  // Topic
  const topicLabel = truncateToWidth(`Topic: ${verdict.topic}`, inner - 2);
  lines.push(boxLine(` ${topicLabel}`, borderColor));
  lines.push(boxLine(` ${dim(`Status: Deliberation Concluded · ${verdict.timestamp.slice(0, 19)}`)}`, borderColor));

  // 1. Consensus Invariants
  lines.push(makeDivider(borderColor));
  lines.push(boxLine(` 🟢 ${bold("Consensus Invariants (3/3)")}`, borderColor));
  if (verdict.consensusInvariants.length > 0) {
    for (const inv of verdict.consensusInvariants.slice(0, 4)) {
      lines.push(boxLine(`    • ${colorize(truncateToWidth(inv, inner - 8), BORDER_COLORS.green)}`, borderColor));
    }
  } else {
    lines.push(boxLine(`    ${dim("(No unanimous invariants established)")}`, borderColor));
  }

  // 2. Majority Recommendations
  if (verdict.majorityRecommendations.length > 0) {
    lines.push(makeDivider(borderColor));
    lines.push(boxLine(` 🟡 ${bold("Majority Recommendations (2/3)")}`, borderColor));
    for (const maj of verdict.majorityRecommendations.slice(0, 3)) {
      lines.push(boxLine(`    • ${truncateToWidth(maj, inner - 8)}`, borderColor));
    }
  }

  // 3. Unique Insights
  if (verdict.uniqueInsights.length > 0) {
    lines.push(makeDivider(borderColor));
    lines.push(boxLine(` 🔵 ${bold("Unique Insights")}`, borderColor));
    for (const u of verdict.uniqueInsights.slice(0, 3)) {
      const insightText = `[${u.persona}] ${u.insight}`;
      lines.push(boxLine(`    • ${colorize(truncateToWidth(insightText, inner - 8), BORDER_COLORS.cyan)}`, borderColor));
    }
  }

  // 4. Critical Divergence
  if (verdict.criticalDivergences.length > 0) {
    lines.push(makeDivider(borderColor));
    lines.push(boxLine(` 🔴 ${bold("Critical Divergences")}`, borderColor));
    for (const div of verdict.criticalDivergences.slice(0, 2)) {
      lines.push(boxLine(`    ⚡ ${colorize(truncateToWidth(div.issue, inner - 8), BORDER_COLORS.yellow)}`, borderColor));
    }
  }

  // Footer / Saved record
  lines.push(makeDivider(borderColor));
  if (verdict.savedPath) {
    lines.push(boxLine(` 💾 ${dim(`Saved Record: ${verdict.savedPath}`)}`, borderColor));
  }
  lines.push(boxLine(` ${dim("⟨Enter: Run /implement⟩ ⟨s: Save Record⟩ ⟨Esc: Dismiss⟩")}`, borderColor));
  lines.push(makeBottomBorder(borderColor));

  return lines.join("\n");
}

/**
 * Register the custom message renderer for `customType: "council-verdict"`.
 *
 * Accepts a `CouncilVerdict` on either `message.details` (preferred) or
 * `message.payload`. Falls back to `undefined` if neither is a valid verdict
 * object, leaving the runtime's default formatting untouched.
 */
export function installCouncilVerdictRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer(COUNCIL_CUSTOM_TYPE, (message: unknown, _options: unknown, _theme: unknown) => {
    if (!message || typeof message !== "object") return undefined;
    const msg = message as { details?: unknown; payload?: unknown };
    const candidate: unknown = msg.details ?? msg.payload;
    if (!candidate || typeof candidate !== "object") return undefined;
    if (!("topic" in candidate) || !("opinions" in candidate)) return undefined;
    return renderCouncilVerdictCard(candidate as CouncilVerdict);
  });
}

// ---------------------------------------------------------------------------
// Council Command Handler (Stage orchestration entry-point)
// ---------------------------------------------------------------------------

/**
 * Flag-token + remainder parsing for the `/council` command line.
 *
 * Recognises:
 *  - mode flags: `--quick`, `--deep`/`--debate`, `--raw`
 *  - persistence: `--save`/`--record`, `--actionable`
 *  - presets: `--council <name>`, `--preset <name>`, plus the shortcut
 *    flags `--software`, `--ml`, `--embedded`/`--firmware`,
 *    `--ee`/`--hardware`
 *  - overlay toggle: `--overlay` / `--modal`
 * Unknown tokens fall through into the topic so the user can type proposals verbatim.
 */
export interface ParsedCouncilArgs {
  mode: CouncilMode;
  councilName?: string;
  save: boolean;
  actionable: boolean;
  overlay: boolean;
  topic: string;
}

/** Ergonomic preset flag → canonical council id. */
const PRESET_FLAG_ALIASES: Record<string, string> = {
  "--software": "default-triad",
  "--ml": "ml-research",
  "--embedded": "embedded",
  "--firmware": "embedded",
  "--ee": "electrical-ee",
  "--hardware": "electrical-ee",
};

export function parseCouncilArgs(rawArgs: string): ParsedCouncilArgs {
  const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
  let mode: CouncilMode = "quick";
  let councilName: string | undefined;
  let save = false;
  let actionable = false;
  let overlay = false;
  const topicParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "--quick") mode = "quick";
    else if (tok === "--deep" || tok === "--debate") mode = "deep";
    else if (tok === "--raw") mode = "raw";
    else if (tok === "--save" || tok === "--record") save = true;
    else if (tok === "--actionable") actionable = true;
    else if (tok === "--overlay" || tok === "--modal") overlay = true;
    else if (tok === "--council" || tok === "--preset") {
      const next = tokens[i + 1];
      if (next) {
        councilName = next;
        i += 1;
      }
    } else if (tok in PRESET_FLAG_ALIASES) {
      councilName = PRESET_FLAG_ALIASES[tok];
    } else topicParts.push(tok);
  }

  return { mode, councilName, save, actionable, overlay, topic: topicParts.join(" ") };
}
/** Detect `/council list` / `/council init` subcommands at the head of the args
 *  so the handler can short-circuit before invoking the default deliberation
 *  workflow. Returns the subcommand name (lowercase) and the trailing
 *  remainder, or `null` when the args describe a normal deliberation. */
export function parseCouncilSubcommand(rawArgs: string): { sub: "list" | "init"; rest: string } | null {
  const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
  const head = tokens[0]?.toLowerCase();
  if (head === "list" || head === "init") {
    return { sub: head, rest: tokens.slice(1).join(" ") };
  }
  return null;
}

/** Run the `/council` command: surface the workflow body, drive the status bar
 *  while the executing agent runs the council, and emit the verdict receipt.
 *
 *  Supports two subcommands at the head of the args:
 *    `/council list`  — print every built-in + user-defined council
 *    `/council init`  — scaffold `.omp/council.yaml` if absent
 *
 *  The function does NOT itself spawn the 3 persona subagents — that is the
 *  job of the executing model reading `commands/council.md`. This handler
 *  just turns on the live status indicator, hands the workflow body + topic
 *  to the executing agent, and queues the verdict receipt card.
 *
 *  Returns `true` when a subcommand consumed the call (caller should not
 *  also fire the default deliberation workflow); `false` otherwise.
 */
export function runCouncilCommand(
  pi: ExtensionApi,
  root: string,
  rawArgs: string,
  ctx: CommandContext,
  resources: { body: string; companionPaths: string[] },
): void {
  // Subcommand short-circuit: `/council list` and `/council init` resolve here
  // without spawning the deliberation workflow.
  const sub = parseCouncilSubcommand(rawArgs);
  if (sub) {
    if (sub.sub === "list") {
      runCouncilListSubcommand(pi, root, ctx);
      return;
    }
    if (sub.sub === "init") {
      runCouncilInitSubcommand(pi, root, ctx, sub.rest);
      return;
    }
  }

  const parsed = parseCouncilArgs(rawArgs);
  const topic = parsed.topic || "Untitled proposal";
  const mode = parsed.mode;

  // 1. Live status-bar indicator: announce deliberation started
  ctx.ui?.setStatus?.(
    COUNCIL_STATUS_KEY,
    `Council: ${mode.toUpperCase()} deliberating on "${truncateForStatus(topic)}"`,
  );
  ctx.ui?.notify?.(`Council deliberation started (${mode})`, "info");

  // 2. Resolve the council to use and load its personas for the receipt
  const config = loadCouncilConfig(root);
  const councilName = parsed.councilName && config.councils[parsed.councilName]
    ? parsed.councilName
    : config.defaultCouncil;
  const personas = config.councils[councilName] ?? DEFAULT_COUNCIL_TRIAD;

  // 3. Compose the workflow body with $ARGUMENTS + the user's raw flags + topic
  const argText = rawArgs.trim();
  let text = resources.body;
  if (argText) {
    text = text.replace(/\$ARGUMENTS/g, argText);
    text += `\n\n## Parsed flags\n- mode: \`${mode}\`\n- save: \`${parsed.save}\`\n- actionable: \`${parsed.actionable}\`\n- council: \`${councilName}\`\n- personas: ${personas.map((p) => `\`${p.id}\``).join(", ")}`;
  } else {
    text = text.replace(/\$ARGUMENTS/g, "");
  }
  if (resources.companionPaths.length > 0) {
    text += `\n\n## Companion reference files\nRead these files when the workflow refers to them:\n${resources.companionPaths.join("\n")}`;
  }

  // 4. Emit the workflow body (hidden) so the executing agent has full instructions
  pi.sendMessage({
    customType: `command:council`,
    content: text,
    display: false,
    attribution: "user",
  });

  // 5. Send the user prompt that triggers the executing agent to spawn the council
  const userPrompt = `/council${argText ? ` ${argText}` : ""}`;
  void pi.sendUserMessage(userPrompt);

  // 6. Queue the verdict receipt card so the user sees the structural placeholders
  //    immediately and the renderer fills in the live verdict once Stage 3 lands.
  pi.sendMessage(
    {
      customType: COUNCIL_CUSTOM_TYPE,
      content: `Council deliberation requested on "${truncateForStatus(topic)}" (${mode.toUpperCase()})`,
      display: true,
      attribution: "user",
      details: {
        topic,
        mode,
        councilName,
        opinions: [],
        consensusInvariants: [],
        majorityRecommendations: [],
        uniqueInsights: [],
        criticalDivergences: [],
        verdictSummary: "Deliberation in progress…",
        timestamp: new Date().toISOString(),
      },
    },
    { deliverAs: "followUp" },
  );

  // 7. If the user requested an interactive overlay, launch it on the verdict
  //    receipt card immediately so they can read the verdict while the executing
  //    agent runs Stage 1. The overlay auto-dismisses once they pick an action.
  if (parsed.overlay && ctx.hasUI && ctx.ui?.custom) {
    void launchCouncilOverlay(pi, root, ctx, topic, councilName, mode);
  }

  // 8. Clear the status widget; the executing agent will repopulate it on Stage transitions.
  ctx.ui?.setStatus?.(COUNCIL_STATUS_KEY, undefined);
}

/** `/council list` — print every built-in + user-defined council. */
function runCouncilListSubcommand(pi: ExtensionApi, root: string, ctx: CommandContext): void {
  const councils = listCouncils(root);
  if (councils.length === 0) {
    ctx.ui?.notify?.("No councils available", "info");
    return;
  }
  const lines: string[] = [
    "⚖️  Available councils",
    "",
  ];
  for (const c of councils) {
    const tag = c.builtin ? "·built-in" : "·user-defined";
    lines.push(`${bold(c.id)} ${dim(tag)}`);
    if (c.aliases && c.aliases.length > 0) {
      lines.push(`  ${dim("aliases:")} ${c.aliases.join(", ")}`);
    }
    for (const persona of c.personas) {
      const toolTag = persona.tools && persona.tools.length > 0
        ? dim(` [tools: ${persona.tools.join(", ")}]`)
        : "";
      lines.push(`  • ${bold(persona.name)} ${dim(`(${persona.id})`)} — ${persona.role}${toolTag}`);
    }
    lines.push("");
  }
  pi.sendMessage({
    customType: COUNCIL_CUSTOM_TYPE,
    content: lines.join("\n"),
    display: true,
    attribution: "user",
    details: {
      topic: "Council listing",
      mode: "raw" as CouncilMode,
      councilName: "__list__",
      opinions: [],
      consensusInvariants: [],
      majorityRecommendations: [],
      uniqueInsights: [],
      criticalDivergences: [],
      verdictSummary: `${councils.length} council(s) available`,
      timestamp: new Date().toISOString(),
    },
  });
  ctx.ui?.notify?.(`Listed ${councils.length} council(s)`, "info");
}

/** `/council init` — scaffold `.omp/council.yaml` if absent. Pass `force` in
 *  `rest` to overwrite an existing file. */
function runCouncilInitSubcommand(pi: ExtensionApi, root: string, ctx: CommandContext, rest: string): void {
  const force = /\s*--force\b/.test(rest);
  const result = scaffoldCouncilYaml(root, { force });
  if (result.created) {
    ctx.ui?.notify?.(`Scaffolded council config at ${result.path}`, "info");
  } else {
    ctx.ui?.notify?.(`Council config already exists at ${result.path} (pass --force to overwrite)`, "info");
  }
  pi.sendMessage({
    customType: COUNCIL_CUSTOM_TYPE,
    content: result.created
      ? `Created ${result.path}`
      : `Skipped (already exists): ${result.path}`,
    display: true,
    attribution: "user",
    details: {
      topic: "Council init",
      mode: "raw" as CouncilMode,
      councilName: "__init__",
      opinions: [],
      consensusInvariants: [],
      majorityRecommendations: [],
      uniqueInsights: [],
      criticalDivergences: [],
      verdictSummary: result.created
        ? `Scaffolded ${result.path}`
        : `Already exists: ${result.path}`,
      timestamp: new Date().toISOString(),
    },
  });
}

/** Launch the verdict overlay so the user can read the verdict, scroll per-
 *  persona detail, and dispatch Enter→/implement or s→save before dismissing.
 *  Returns once the user dismisses the overlay; the caller need not await. */
async function launchCouncilOverlay(
  _pi: ExtensionApi,
  _root: string,
  ctx: CommandContext,
  topic: string,
  councilName: string,
  mode: CouncilMode,
): Promise<void> {
  if (!ctx.ui?.custom) return;
  const verdict: CouncilVerdict = {
    topic,
    mode,
    councilName,
    opinions: [],
    consensusInvariants: [],
    majorityRecommendations: [],
    uniqueInsights: [],
    criticalDivergences: [],
    verdictSummary: "Deliberation in progress…",
    timestamp: new Date().toISOString(),
  };
  const overlay: CouncilOverlayComponent = createCouncilOverlay(verdict);
  const result = await ctx.ui.custom<CouncilOverlayAction | undefined>(
    (_tui, _theme, _keybindings, done) => ({
      render: (width = 84, height = 26) => overlay.render(width, height),
      handleInput: (data: string) => {
        const act = overlay.handleInput(data);
        if (act) done(act);
      },
    }),
    {
      overlay: true,
      overlayOptions: { width: "85%", maxHeight: "80%", anchor: "center" },
    },
  );
  // Result handling is intentionally minimal: the overlay's primary purpose is
  // to let the user inspect the verdict. Dispatch is delegated to follow-up
  // commands the user types after the overlay closes. Future work: surface
  // `s`/`Enter` actions through sendUserMessage.
  void result;
}
/** Truncate a string for use inside the status-bar widget (≈ 48 chars). */
function truncateForStatus(text: string, max = 48): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
