// Research Subsystem Test Suite: DAG Engine, Dashboard, Renderer, and Report Generator

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildResearchDag,
  canonicalResultPath,
  computeEpistemicNodeHash,
  formatUpstreamContextPrompt,
  getReadyDagNodes,
  getUpstreamEvidence,
  slugifyItemId,
} from "../src/research/research-dag.ts";
import { generateResearchReport } from "../src/research/research-report.ts";
import {
  archiveResearchProject,
  getResearchDashboardMetrics,
  listResearchSummaries,
  removeResearchProject,
  unarchiveResearchProject,
} from "../src/research/research-store.ts";
import {
  renderResearchDashboardCard,
  type ResearchDashboardPayload,
  type ResearchItemSpec,
} from "../src/research/research-renderer.ts";
import {
  BORDER_COLORS,
  bold,
  boxLine,
  colorize,
  dim,
  displayWidth,
  italic,
  makeTopBorder,
  statusBorderColor,
  stripAnsi,
} from "../src/research/research-format.ts";
import {
  createTempFixture,
  fail,
  type TestContext,
} from "./test-utils.ts";

export async function runResearchSuite(ctx: TestContext): Promise<void> {
  const { collectLines } = ctx;

  // 1. Slugify helper
  if (slugifyItemId("Protocol Specification", 0) !== "protocol_specification") {
    fail("slugifyItemId: failed to normalize title");
  }

  // 2. Canonical Result Path
  const fixture = createTempFixture("research-suite-");
  const resDir = join(fixture.dir, "results");
  mkdirSync(resDir, { recursive: true });

  const cPath = canonicalResultPath(resDir, "crypto_audit", "Crypto Audit", 0);
  if (!cPath.endsWith("results/crypto_audit.json")) {
    fail(`canonicalResultPath: unexpected path ${cPath}`);
  }

  // 3. Research DAG Engine: Linear & Cascading dependencies
  const items: ResearchItemSpec[] = [
    { id: "repo_discovery", name: "Find Repo" },
    { id: "cipher_audit", name: "Audit Cipher", depends_on: ["repo_discovery"] },
    { id: "fuzz_testing", name: "Run Fuzzing", depends_on: ["cipher_audit"] },
  ];

  const emptyDag = buildResearchDag(items, resDir);
  const readyNodes1 = getReadyDagNodes(emptyDag);
  if (readyNodes1.length !== 1 || readyNodes1[0].id !== "repo_discovery") {
    fail(`buildResearchDag: expected only repo_discovery ready, got: ${readyNodes1.map((n) => n.id)}`);
  }

  // Complete repo_discovery by writing its canonical output file
  writeFileSync(join(resDir, "repo_discovery.json"), JSON.stringify({ item: "repo_discovery", repo_url: "https://github.com/test/repo" }), "utf8");
  const dagStep2 = buildResearchDag(items, resDir);
  const readyNodes2 = getReadyDagNodes(dagStep2);
  if (readyNodes2.length !== 1 || readyNodes2[0].id !== "cipher_audit") {
    fail(`buildResearchDag: expected cipher_audit ready after repo_discovery complete, got: ${readyNodes2.map((n) => n.id)}`);
  }

  const upstreamEv = getUpstreamEvidence(dagStep2, "cipher_audit");
  if (upstreamEv.length !== 1 || !upstreamEv[0].evidenceText.includes("https://github.com/test/repo")) {
    fail(`getUpstreamEvidence: failed to extract upstream evidence: ${JSON.stringify(upstreamEv)}`);
  }

  const promptBlock = formatUpstreamContextPrompt(upstreamEv);
  if (!promptBlock.includes("<upstream-context>") || !promptBlock.includes("https://github.com/test/repo")) {
    fail(`formatUpstreamContextPrompt: missing expected upstream block: ${promptBlock}`);
  }

  // 4. Zero-Dependency TypeScript Report Generator
  writeFileSync(
    join(resDir, "cipher_audit.json"),
    JSON.stringify({
      name: "Audit Cipher",
      summary: "AES-256-GCM validated",
      severity: "low",
      sources: ["https://example.com/crypto-spec"],
    }),
    "utf8",
  );

  const reportRes = generateResearchReport({ projectDir: fixture.dir });
  if (!reportRes.ok || reportRes.itemCount !== 2 || reportRes.sourcesCount !== 1) {
    fail(`generateResearchReport: failed or incorrect counts: ${JSON.stringify(reportRes)}`);
  }
  if (!existsSync(reportRes.reportPath) || !existsSync(reportRes.summaryPath)) {
    fail(`generateResearchReport: files missing on disk`);
  }

  // 5. Research Project Archiving & Summaries
  const kbResearch = join(fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(kbResearch, "2026-08-01_proj-a"), { recursive: true });
  writeFileSync(join(kbResearch, "2026-08-01_proj-a", "outline.yaml"), "topic: Proj A\nitems: [{name: i1}]");

  const summaries = listResearchSummaries(fixture.dir, false);
  if (summaries.length === 0 || !summaries.some((s) => s.slug === "2026-08-01_proj-a")) {
    fail(`listResearchSummaries: missing proj-a: ${JSON.stringify(summaries)}`);
  }

  const archRes = archiveResearchProject(fixture.dir, "2026-08-01_proj-a");
  if (!archRes.ok) {
    fail(`archiveResearchProject failed: ${archRes.error}`);
  }

  const unarchRes = unarchiveResearchProject(fixture.dir, "2026-08-01_proj-a");
  if (!unarchRes.ok) {
    fail(`unarchiveResearchProject failed: ${unarchRes.error}`);
  }

  fixture.cleanup();
}
