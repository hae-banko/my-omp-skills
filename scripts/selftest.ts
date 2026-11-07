// Master Selftest Suite Runner
// Aggregates modular domain suites: commands, knowledge, research, features, council, tools and cards.

import { createTestContext, getFailures } from "../tests/test-utils.ts";
import { runCommandsSuite } from "../tests/commands.test.ts";
import { runKnowledgeSuite } from "../tests/knowledge.test.ts";
import { runResearchSuite } from "../tests/research.test.ts";
import { runFeaturesSuite } from "../tests/features.test.ts";
import { runCouncilSuite } from "../tests/council.test.ts";
import { runCardTests } from "../tests/card.test.ts";
import { runToolsSuite } from "../tests/tools.test.ts";
import { runKbIndexSuite } from "../tests/kb-index.test.ts";

async function main(): Promise<void> {
  const ctx = createTestContext();

  console.log("Running my-omp-skills test suites...\n");

  // 1. Commands & Session Bootstrap Suite
  await runCommandsSuite(ctx);

  // 2. Knowledge Base, Policy Guard & Injector Suite
  await runKnowledgeSuite(ctx);

  // 2b. KB Search Index Suite (freshness invariants, docs/state-machines.md §3)
  await runKbIndexSuite();

  // 3. Research Subsystem Suite (DAG, Dashboard, Report Generator)
  await runResearchSuite(ctx);

  // 4. Features Suite (Timeline, Tilt, Clarify, Hindsight, Herdr, Routines)
  await runFeaturesSuite(ctx);

  // 5. Council Deliberation, Consensus & UX Suite (SPEC-002 / ADR-0008)
  await runCouncilSuite(ctx);

  // 6. Tools & Core Protocol Suite (Workspace, Routines, Herdr, References, Triage)
  await runToolsSuite(ctx);

  // 7. Native TUI Card Engine Suite (SPEC-003 / ADR-0007)
  runCardTests();

  const failures = getFailures();
  if (failures > 0) {
    console.error(`\n❌ ${failures} test failure(s) detected across suites.`);
    process.exit(1);
  }

  console.log("\n✅ OK — All test suites (commands, knowledge, research, features, council, tools, card) passed cleanly.");
}

main().catch((err) => {
  console.error("Fatal test runner exception:", err);
  process.exit(1);
});
