// Master Selftest Suite Runner
// Aggregates modular domain suites: commands, knowledge, research, features, and protocol.

import { createTestContext, getFailures } from "../tests/test-utils.ts";
import { runCommandsSuite } from "../tests/commands.test.ts";
import { runKnowledgeSuite } from "../tests/knowledge.test.ts";
import { runResearchSuite } from "../tests/research.test.ts";
import { runFeaturesSuite } from "../tests/features.test.ts";
import { runProtocolSuite } from "../tests/protocol.test.ts";

async function main(): Promise<void> {
  const ctx = createTestContext();

  console.log("Running my-omp-skills test suites...\n");

  // 1. Commands & Session Bootstrap Suite
  await runCommandsSuite(ctx);

  // 2. Knowledge Base, Policy Guard & Injector Suite
  await runKnowledgeSuite(ctx);

  // 3. Research Subsystem Suite (DAG, Dashboard, Report Generator)
  await runResearchSuite(ctx);

  // 4. Features Suite (Timeline, Tilt, Clarify, Hindsight, Herdr, Routines)
  await runFeaturesSuite(ctx);

  // 5. Protocol Suite (OMP-IAP/v1, Hub Messaging, Subagent Contracts)
  await runProtocolSuite(ctx);

  const failures = getFailures();
  if (failures > 0) {
    console.error(`\n❌ ${failures} test failure(s) detected across suites.`);
    process.exit(1);
  }

  console.log("\n✅ OK — All test suites (commands, knowledge, research, features, protocol) passed cleanly.");
}

main().catch((err) => {
  console.error("Fatal test runner exception:", err);
  process.exit(1);
});
