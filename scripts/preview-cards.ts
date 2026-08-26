// Visual preview & dogfooding script for native TUI cards
// Exercises createCouncilVerdictCard, createTiltCard, and createTimelineCard directly.

import { createCouncilVerdictCard, type CouncilVerdict } from "../src/council/council.ts";
import { createTiltCard, type TiltCardPayload, readLocalTilt, readGlobalTilt } from "../src/features/tilt.ts";
import { createTimelineCard } from "../src/features/timeline.ts";
import { createReferenceCard } from "../src/features/references.ts";
import { createTuiCard } from "../src/core/card.ts";
const sampleVerdict: CouncilVerdict = {
  snapshotId: "preview_snap_001",
  councilName: "default-triad",
  mode: "quick",
  topic: "Should we migrate from SQLite to Postgres for the write model?",
  timestamp: new Date().toISOString(),
  opinions: [
    {
      personaId: "minimalist",
      personaName: "Minimalist",
      stance: "neutral",
      recommendation: "Keep SQLite embedded",
      keyInvariants: ["SQLite is embedded, zero ops"],
      caveats: ["Single-writer concurrency limit"],
      confidence: 0.9,
    },
  ],
  consensusInvariants: [
    "ACID transactions must be preserved across session restarts",
    "Zero external daemon requirement in local developer mode",
  ],
  majorityRecommendations: [
    "Use SQLite WAL mode with 5000ms busy timeout",
    "Extract write operations behind an abstract repository interface",
  ],
  uniqueInsights: [
    {
      persona: "Security Auditor",
      insight: "Unencrypted local database files risk exposing authentication tokens",
    },
  ],
  criticalDivergences: [
    {
      issue: "Connection pooling overhead vs embedded performance",
      positions: {
        Minimalist: "Embedded is 10x faster with zero network hops",
        Architect: "Postgres allows multi-process concurrent writes",
      },
    },
  ],
  verdictSummary: "Keep SQLite for local development, abstract connection seam.",
  savedPath: ".omp/scratch/debates/2026-08-26_sqlite_vs_postgres.md",
  signature: "preview_sig",
  publicKey: "preview_key",
};

const tiltPayload: TiltCardPayload = {
  local: readLocalTilt(process.cwd()),
  global: readGlobalTilt(),
};

const sampleTimelineContent = [
  "TIMELINE DIGEST — my-omp-skills (5 events)",
  "2026-08-26 · [git] feat: unified native TUI card architecture (v0.75.0)",
  "2026-08-26 · [record] 2026-08-26_tui_card_architecture.md",
  "2026-08-25 · [git] feat(council): natural keyword CLI syntax",
  "2026-08-25 · [record] 2026-08-25_multi_llm_debate_consensus.md",
  "2026-08-24 · [pitfall] 2026-08-24_render_loop_not_a_function.md",
].join("\n");

function renderAllCards(width: number): void {
  console.log(`\n================================================================================`);
  console.log(`=== PREVIEW AT WIDTH: ${width} ===`);
  console.log(`================================================================================\n`);

  console.log("--- [1] Council Verdict Card ---");
  const councilBox = createCouncilVerdictCard(sampleVerdict);
  for (const line of councilBox.render(width)) {
    console.log(line);
  }
  console.log("\n--- [2] Tilt-O-Meter Card ---");
  const tiltBox = createTiltCard(tiltPayload);
  for (const line of tiltBox.render(width)) {
    console.log(line);
  }

  console.log("\n--- [3] Timeline Digest Card ---");
  const timelineBox = createTimelineCard(sampleTimelineContent);
  for (const line of timelineBox.render(width)) {
    console.log(line);
  }

  console.log("\n--- [4] Reference Corpus Card ---");
  const sampleRefContent = [
    "Reference corpus (3 entries):",
    "oh-my-pi: remote https://github.com/can1357/oh-my-pi.git · HEAD 7c94b2e",
    "skills: remote https://github.com/mattpocock/skills.git · HEAD a84f910",
    "ponytail: remote https://github.com/DietrichGebert/ponytail.git · HEAD e103b41",
  ].join("\n");
  const refBox = createReferenceCard(sampleRefContent);
  for (const line of refBox.render(width)) {
    console.log(line);
  }

  console.log("\n--- [5] Knowledge Card (/record --recent) ---");
  const kbCard = createTuiCard({
    title: "RECORD",
    intent: "neutral",
    badges: [{ label: "type", value: "durable records", intent: "neutral" }],
    sections: [
      {
        content: [
          "2026-08-26 · [architecture] Unified Native TUI Card Architecture",
          "2026-08-25 · [consensus] Multi-LLM Debate and Star Chamber Partitioning",
          "2026-08-24 · [policy] Append-only knowledge base enforcement",
        ],
      },
    ],
    footerActions: ["/record <title> to add", "Esc: Dismiss"],
  });
  for (const line of kbCard.render(width)) {
    console.log(line);
  }
}

renderAllCards(50);
renderAllCards(80);
