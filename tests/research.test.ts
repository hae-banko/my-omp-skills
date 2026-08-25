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
import {
  createResearchOverlay,
  ResearchOverlay,
} from "../src/research/research-overlay.ts";

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
  // 6. Interactive Research Dashboard Overlay (SPEC-001)
  // Create a second project for multi-project cycling
  mkdirSync(join(kbResearch, "2026-08-02_proj-b"), { recursive: true });
  writeFileSync(join(kbResearch, "2026-08-02_proj-b", "outline.yaml"), "topic: 深度学习 Proj B\nitems: [{name: i2, category: cat1}]");

  const overlay = createResearchOverlay(fixture.dir, "2026-08-01_proj-a", "overview");
  const state0 = overlay.getState();
  if (state0.activeTab !== "overview") {
    fail(`createResearchOverlay: expected initial tab 'overview', got ${state0.activeTab}`);
  }
  if (state0.projects.length < 2) {
    fail(`createResearchOverlay: expected at least 2 projects, got ${state0.projects.length}`);
  }
  // Multi-project cycling with '[' and ']'
  const initialIdx = state0.activeProjectIndex;
  overlay.handleInput("]");
  const nextIdx = overlay.getState().activeProjectIndex;
  if (nextIdx === initialIdx) {
    fail(`handleInput(']'): expected activeProjectIndex to change from ${initialIdx}`);
  }
  overlay.handleInput("[");
  if (overlay.getState().activeProjectIndex !== initialIdx) {
    fail(`handleInput('['): expected activeProjectIndex to return to ${initialIdx}, got ${overlay.getState().activeProjectIndex}`);
  }
  // Render check at 80x24 (includes CJK characters from topic)
  const frame80 = overlay.render(80, 24);
  if (!frame80 || !frame80.children || frame80.children.length === 0) {
    fail(`ResearchOverlay.render(80, 24) returned empty container`);
  }

  // Tab switching key tests
  overlay.handleInput("2");
  if (overlay.getState().activeTab !== "items") {
    fail(`handleInput('2'): expected tab 'items', got ${overlay.getState().activeTab}`);
  }

  overlay.handleInput("\t");
  if (overlay.getState().activeTab !== "fields") {
    fail(`handleInput('\\t'): expected tab 'fields', got ${overlay.getState().activeTab}`);
  }

  overlay.handleInput("\t");
  if (overlay.getState().activeTab !== "artifacts") {
    fail(`handleInput('\\t'): expected tab 'artifacts', got ${overlay.getState().activeTab}`);
  }

  overlay.handleInput("1");
  if (overlay.getState().activeTab !== "overview") {
    fail(`handleInput('1'): expected tab 'overview', got ${overlay.getState().activeTab}`);
  }

  // Action hotkeys: Enter (run next), d (deep waves), r (report), q / Ctrl+C (dismiss)
  const enterAct = overlay.handleInput("\r");
  if (!enterAct || enterAct.action !== "run" || !enterAct.command) {
    fail(`handleInput('\\r'): expected run action, got ${JSON.stringify(enterAct)}`);
  }

  const deepAct = overlay.handleInput("d");
  if (!deepAct || deepAct.action !== "run" || !deepAct.command?.startsWith("/research-deep")) {
    fail(`handleInput('d'): expected run /research-deep action, got ${JSON.stringify(deepAct)}`);
  }

  const reportAct = overlay.handleInput("r");
  if (!reportAct || reportAct.action !== "run" || !reportAct.command?.startsWith("/research-report")) {
    fail(`handleInput('r'): expected run /research-report action, got ${JSON.stringify(reportAct)}`);
  }

  const ctrlCAct = overlay.handleInput("\x03");
  if (!ctrlCAct || ctrlCAct.action !== "dismiss") {
    fail(`handleInput('\\x03'): expected dismiss action, got ${JSON.stringify(ctrlCAct)}`);
  }

  const dismissAct = overlay.handleInput("q");
  if (!dismissAct || dismissAct.action !== "dismiss") {
    fail(`handleInput('q'): expected dismiss action, got ${JSON.stringify(dismissAct)}`);
  }

  // Zero-projects empty state onboarding
  const emptyFixture = createTempFixture("empty-research-overlay-");
  const emptyOverlay = createResearchOverlay(emptyFixture.dir);
  if (emptyOverlay.getState().projects.length !== 0) {
    fail(`emptyOverlay: expected 0 projects, got ${emptyOverlay.getState().projects.length}`);
  }

  const emptyFrame = emptyOverlay.render(80, 24);
  if (!emptyFrame || !emptyFrame.children || emptyFrame.children.length === 0) {
    fail(`emptyOverlay.render(80, 24) returned empty container`);
  }

  const emptyDismiss = emptyOverlay.handleInput("\x1b");
  if (!emptyDismiss || emptyDismiss.action !== "dismiss") {
    fail(`emptyOverlay.handleInput('\\x1b'): expected dismiss, got ${JSON.stringify(emptyDismiss)}`);
  }
  emptyFixture.cleanup();
  fixture.cleanup();
}
