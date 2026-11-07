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
import { findRepoRoot } from "../src/core/locators.ts";
import {
  archiveResearchProject,
  getResearchDashboardMetrics,
  listResearchSummaries,
  readOutlineItemSpecs,
  readOutlineItems,
  readProject,
  removeResearchProject,
  unarchiveResearchProject,
} from "../src/research/research-store.ts";
import { derivePipelineStatus } from "../src/research/research-status.ts";
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
  createInteractiveCommandContext,
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

  // 7. Larger-frame render (120x40) keeps box widths intact.
  const wideFrame = overlay.render(120, 40);
  const wideChildren = wideFrame.children ?? [];
  if (!wideFrame || wideChildren.length === 0) {
    fail(`ResearchOverlay.render(120, 40) returned empty container`);
  }
  // Each non-empty child line must respect the 120-cell box budget (≤ 118
  // cells between the two │ borders after ANSI/stripping).
  for (const child of wideChildren) {
    if (!child || typeof child !== "object" || !("text" in child)) continue;
    const textValue = child.text;
    const raw = typeof textValue === "string" ? textValue : "";
    const stripped = stripAnsi(raw);
    const w = displayWidth(stripped);
    if (w > 118) {
      fail(`overlay.render(120x40): child line exceeds 118-cell box: width=${w} line=${JSON.stringify(stripped.slice(0, 40))}`);
    }
  }

  // 8. CJK / emoji display-width alignment. Topics with CJK characters must
  // still fit the box even though each ideograph = 2 cells.
  const cjkFixture = createTempFixture("cjk-research-overlay-");
  const cjkRoot = cjkFixture.dir;
  const cjkResearch = join(cjkRoot, ".omp", "knowledge", "research");
  mkdirSync(join(cjkResearch, "2026-08-15_深度学习-topic"), { recursive: true });
  writeFileSync(
    join(cjkResearch, "2026-08-15_深度学习-topic", "outline.yaml"),
    "topic: 深度学习 overview\nitems: [{name: 卷积神经网络, category: 视觉}, {name: Transformer, category: NLP}]",
  );
  const cjkOverlay = createResearchOverlay(cjkRoot, "2026-08-15_深度学习-topic", "overview");
  if (cjkOverlay.getState().activeTab !== "overview") {
    fail(`cjkOverlay: expected initial tab 'overview'`);
  }
  const cjkFrame = cjkOverlay.render(80, 24);
  const cjkChildren = cjkFrame.children ?? [];
  for (const child of cjkChildren) {
    if (!child || typeof child !== "object" || !("text" in child)) continue;
    const textValue = child.text;
    const raw = typeof textValue === "string" ? textValue : "";
    const stripped = stripAnsi(raw);
    const w = displayWidth(stripped);
    // 80-column overlay → ≤ 78 cells between borders (inner = width - 2).
    if (w > 78) {
      fail(`CJK overlay render: child exceeds 78-cell box: width=${w} line=${JSON.stringify(stripped.slice(0, 40))}`);
    }
  }
  // `displayWidth` itself must treat a CJK string as 2 cells per ideograph (4 chars = 8 cells).
  if (displayWidth("深度学习") !== 8) {
    fail(`displayWidth('深度学习') expected 8, got ${displayWidth("深度学习")}`);
  }
  // Emoji (`📊`) is wide (2 cells).
  if (displayWidth("📊") !== 2) {
    fail(`displayWidth('📊') expected 2, got ${displayWidth("📊")}`);
  }

  // Verify renderLines returns actual string array for pi-tui overlay compositor
  const overlayLines = cjkOverlay.renderLines(80, 24);
  if (!Array.isArray(overlayLines) || overlayLines.length === 0) {
    fail(`renderLines(80, 24): expected non-empty string array, got ${typeof overlayLines}`);
  }
  for (let i = 0; i < overlayLines.length; i++) {
    if (typeof overlayLines[i] !== "string") {
      fail(`renderLines row ${i} is not a string`);
    }
  }


  // --- State-Machine Audit Regression Tests ---

  // D01: Bare remove without slug must fail and leave projects untouched
  const d01Fixture = createTempFixture("d01-remove-");
  const d01Kb = join(d01Fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(d01Kb, "2026-08-01_keep-me"), { recursive: true });
  writeFileSync(join(d01Kb, "2026-08-01_keep-me", "outline.yaml"), "topic: Keep Me\nitems: [{name: i1}]");
  const d01Res = removeResearchProject(d01Fixture.dir, "");
  if (d01Res.ok) {
    fail("D01: removeResearchProject('', ...) succeeded when it must require explicit slug");
  }
  const d01SpaceRes = removeResearchProject(d01Fixture.dir, "   ");
  if (d01SpaceRes.ok) {
    fail("D01: removeResearchProject('   ', ...) succeeded when it must require explicit slug");
  }
  if (!existsSync(join(d01Kb, "2026-08-01_keep-me"))) {
    fail("D01: bare remove deleted the project from disk");
  }
  d01Fixture.cleanup();

  // D02: Bare archive without slug must fail and leave projects untouched
  const d02Fixture = createTempFixture("d02-archive-");
  const d02Kb = join(d02Fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(d02Kb, "2026-08-01_active-proj"), { recursive: true });
  writeFileSync(join(d02Kb, "2026-08-01_active-proj", "outline.yaml"), "topic: Active\nitems: [{name: i1}]");
  const d02Res = archiveResearchProject(d02Fixture.dir, "");
  if (d02Res.ok) {
    fail("D02: archiveResearchProject('', ...) succeeded when it must require explicit slug");
  }
  const d02SpaceRes = archiveResearchProject(d02Fixture.dir, "   ");
  if (d02SpaceRes.ok) {
    fail("D02: archiveResearchProject('   ', ...) succeeded when it must require explicit slug");
  }
  if (!existsSync(join(d02Kb, "2026-08-01_active-proj"))) {
    fail("D02: bare archive moved the project to archive");
  }
  d02Fixture.cleanup();

  // D03: Unarchive derives restored status from files
  const d03Fixture = createTempFixture("d03-unarchive-");
  const d03Kb = join(d03Fixture.dir, ".omp", "knowledge", "research");

  // Case A: Outline-only project (0 results) restores to OUTLINE (phase 1)
  const d03OutlineDir = join(d03Kb, "2026-08-01_outline-only");
  mkdirSync(d03OutlineDir, { recursive: true });
  writeFileSync(join(d03OutlineDir, "outline.yaml"), "topic: Outline Only\nitems:\n  - name: Item 1\n");
  writeFileSync(join(d03OutlineDir, "research.md"), "---\nstatus: OUTLINE\nphase: 1\n---\n# Research\n");
  archiveResearchProject(d03Fixture.dir, "2026-08-01_outline-only");
  const d03UnarchRes = unarchiveResearchProject(d03Fixture.dir, "2026-08-01_outline-only");
  if (!d03UnarchRes.ok) fail(`D03: unarchive outline project failed: ${d03UnarchRes.error}`);
  const d03Content = readFileSync(join(d03OutlineDir, "research.md"), "utf8");
  if (!d03Content.includes("status: OUTLINE")) {
    fail(`D03: unarchiving outline project rewrote status: expected OUTLINE, got: ${d03Content}`);
  }
  const d03Metrics = getResearchDashboardMetrics(d03OutlineDir, "2026-08-01_outline-only");
  if (d03Metrics.status !== "OUTLINE" || d03Metrics.current_phase !== 1) {
    fail(`D03: dashboard metrics for restored outline project: status=${d03Metrics.status}, phase=${d03Metrics.current_phase}`);
  }

  // Case B: Paused project with partial results restores to PAUSED
  const d03PausedDir = join(d03Kb, "2026-08-01_paused-proj");
  mkdirSync(join(d03PausedDir, "results"), { recursive: true });
  writeFileSync(join(d03PausedDir, "outline.yaml"), "topic: Paused\nitems:\n  - name: Item 1\n  - name: Item 2\n");
  writeFileSync(join(d03PausedDir, "results", "item_1.json"), JSON.stringify({ item: "item_1" }), "utf8");
  writeFileSync(join(d03PausedDir, "research.md"), "---\nstatus: PAUSED\nphase: 2\n---\n# Research\n");
  archiveResearchProject(d03Fixture.dir, "2026-08-01_paused-proj");
  unarchiveResearchProject(d03Fixture.dir, "2026-08-01_paused-proj");
  const d03PausedContent = readFileSync(join(d03PausedDir, "research.md"), "utf8");
  if (!d03PausedContent.includes("status: PAUSED")) {
    fail(`D03: unarchiving paused project rewrote status: expected PAUSED, got: ${d03PausedContent}`);
  }

  // Case C: Project with report.md restores to REPORT_READY
  const d03ReportDir = join(d03Kb, "2026-08-01_report-proj");
  mkdirSync(d03ReportDir, { recursive: true });
  writeFileSync(join(d03ReportDir, "outline.yaml"), "topic: Report\nitems:\n  - name: Item 1\n");
  writeFileSync(join(d03ReportDir, "report.md"), "# Final Report\n");
  writeFileSync(join(d03ReportDir, "research.md"), "---\nstatus: REPORT_READY\nphase: 3\n---\n# Research\n");
  archiveResearchProject(d03Fixture.dir, "2026-08-01_report-proj");
  unarchiveResearchProject(d03Fixture.dir, "2026-08-01_report-proj");
  const d03ReportContent = readFileSync(join(d03ReportDir, "research.md"), "utf8");
  if (!d03ReportContent.includes("status: REPORT_READY")) {
    fail(`D03: unarchiving report project rewrote status: expected REPORT_READY, got: ${d03ReportContent}`);
  }
  d03Fixture.cleanup();

  // D04: Empty research root produces notFound, no phantom 'unknown' project
  const d04Fixture = createTempFixture("d04-empty-");
  const d04Read = readProject(d04Fixture.dir, "");
  if (!d04Read.notFound) {
    fail("D04: readProject on empty directory returned notFound=false (phantom project)");
  }
  d04Fixture.cleanup();

  // D05: Archive / remove clears pinned status bar key
  const d05Root = findRepoRoot();
  const d05Kb = join(d05Root, ".omp", "knowledge", "research");
  const d05Proj = join(d05Kb, "2026-08-01_pinned-test-proj");
  mkdirSync(d05Proj, { recursive: true });
  writeFileSync(join(d05Proj, "outline.yaml"), "topic: Pinned\nitems: [{name: i1}]");
  const interactiveCtx = createInteractiveCommandContext();
  if (ctx.registered?.["research"]) {
    // Set status, then archive
    interactiveCtx.ui.setStatus("research", "Research: active-pinned-status");
    await ctx.registered["research"].handler("archive 2026-08-01_pinned-test-proj", interactiveCtx);
    if (interactiveCtx.statuses["research"] !== undefined) {
      fail(`D05: /research archive did not clear research status bar: ${interactiveCtx.statuses["research"]}`);
    }
    // Restore and set status, then remove
    unarchiveResearchProject(d05Root, "2026-08-01_pinned-test-proj");
    interactiveCtx.ui.setStatus("research", "Research: active-pinned-status");
    await ctx.registered["research"].handler("remove 2026-08-01_pinned-test-proj", interactiveCtx);
    if (interactiveCtx.statuses["research"] !== undefined) {
      fail(`D05: /research remove did not clear research status bar: ${interactiveCtx.statuses["research"]}`);
    }
    // Bare archive and bare remove must notify warning and not crash
    await ctx.registered["research"].handler("archive", interactiveCtx);
    await ctx.registered["research"].handler("remove", interactiveCtx);
  }
  // Clean up any remaining directories
  try {
    removeResearchProject(d05Root, "2026-08-01_pinned-test-proj");
  } catch {
    // ignore
  }

  // D12: Substring matching in findItemResultFile prematurely completes items
  const subFixture = createTempFixture("dag-substring-");
  const subResDir = join(subFixture.dir, "results");
  mkdirSync(subResDir, { recursive: true });
  writeFileSync(join(subResDir, "oauth.json"), JSON.stringify({ item: "oauth", auth_type: "bearer" }), "utf8");
  const subDag = buildResearchDag([
    { id: "auth", name: "Auth" },
    { id: "oauth", name: "OAuth" },
  ], subResDir);
  const authNode = subDag.nodes.get("auth");
  const oauthNode = subDag.nodes.get("oauth");
  if (authNode?.status === "completed") {
    fail("D12: 'auth' node was prematurely marked completed by 'oauth.json' substring match");
  }
  if (oauthNode?.status !== "completed") {
    fail("D12: 'oauth' node was not marked completed by 'oauth.json'");
  }
  subFixture.cleanup();

  // D13: Unparseable or 0-byte result JSON marked as completed DAG node
  const d13Fixture = createTempFixture("dag-corrupt-");
  const d13ResDir = join(d13Fixture.dir, "results");
  mkdirSync(d13ResDir, { recursive: true });
  writeFileSync(join(d13ResDir, "item_a.json"), "{ corrupt json ...", "utf8");
  writeFileSync(join(d13ResDir, "item_zero.json"), "", "utf8");
  const d13Dag = buildResearchDag([
    { id: "item_a", name: "Item A" },
    { id: "item_b", name: "Item B", depends_on: ["item_a"] },
    { id: "item_zero", name: "Item Zero" },
  ], d13ResDir);
  const nodeA = d13Dag.nodes.get("item_a");
  const nodeB = d13Dag.nodes.get("item_b");
  const nodeZero = d13Dag.nodes.get("item_zero");
  if (nodeA?.status === "completed") {
    fail("D13: corrupt JSON was marked as completed DAG node");
  }
  if (nodeZero?.status === "completed") {
    fail("D13: 0-byte JSON was marked as completed DAG node");
  }
  if (nodeB?.status === "ready") {
    fail("D13: downstream node B was prematurely unblocked by corrupt upstream node A");
  }
  d13Fixture.cleanup();

  // D14: Dangling / missing dependencies misclassified as circular graph cycles
  const d14Dag = buildResearchDag([
    { id: "item_a", name: "Item A" },
    { id: "item_b", name: "Item B", depends_on: ["missing_item"] },
  ]);
  if (d14Dag.hasCycles) {
    fail("D14: DAG with dangling dependency was misclassified as having circular cycles");
  }
  if (d14Dag.cycleNodes && d14Dag.cycleNodes.length > 0) {
    fail(`D14: cycleNodes populated for non-cyclic DAG: ${JSON.stringify(d14Dag.cycleNodes)}`);
  }
  const d14NodeA = d14Dag.nodes.get("item_a");
  const d14NodeB = d14Dag.nodes.get("item_b");
  if (d14NodeA?.depth !== 0 || !d14NodeA?.epistemicHash) {
    fail("D14: valid root node A did not compute depth / epistemic hash due to cycle suppression");
  }
  if (d14NodeB?.status === "ready") {
    fail("D14: node B with missing dependency was falsely marked ready");
  }

  // D15: YAML parser readOutlineItemSpecs swallows sibling items into depends_on
  const d15Fixture = createTempFixture("d15-yaml-");
  writeFileSync(
    join(d15Fixture.dir, "outline.yaml"),
    `items:
  - id: item_1
    name: Item One
    depends_on:
      - dep_1
  - id: item_2
    name: Item Two
`,
    "utf8",
  );
  const d15Specs = readOutlineItemSpecs(d15Fixture.dir);
  if (!d15Specs || d15Specs.length !== 2) {
    fail(`D15: readOutlineItemSpecs swallowed sibling item: expected 2 items, got ${d15Specs?.length ?? 0}`);
  } else {
    if (d15Specs[0].id !== "item_1" || d15Specs[0].name !== "Item One") {
      fail(`D15: item_1 corrupted: ${JSON.stringify(d15Specs[0])}`);
    }
    if (d15Specs[0].depends_on?.includes("id: item_2")) {
      fail(`D15: item_1.depends_on swallowed sibling item_2: ${JSON.stringify(d15Specs[0].depends_on)}`);
    }
    if (d15Specs[1].id !== "item_2" || d15Specs[1].name !== "Item Two") {
      fail(`D15: item_2 missing or corrupted: ${JSON.stringify(d15Specs[1])}`);
    }
  }
  d15Fixture.cleanup();

  // D16: YAML parser readOutlineItems prematurely exits on multi-line items
  const d16Fixture = createTempFixture("d16-yaml-");
  writeFileSync(
    join(d16Fixture.dir, "outline.yaml"),
    `items:
  - id: item_1
    name: Item One
  - id: item_2
    name: Item Two
`,
    "utf8",
  );
  const d16Items = readOutlineItems(d16Fixture.dir);
  if (!d16Items || d16Items.length !== 2) {
    fail(`D16: readOutlineItems dropped items: expected 2 items, got ${JSON.stringify(d16Items)}`);
  }
  d16Fixture.cleanup();

  // D48: ResearchOverlay Enter action on phase 3 project dispatches slash command, not prose
  const d48Fixture = createTempFixture("d48-overlay-");
  const d48Kb = join(d48Fixture.dir, ".omp", "knowledge", "research");
  const d48DoneDir = join(d48Kb, "2026-08-01_done-project");
  mkdirSync(d48DoneDir, { recursive: true });
  writeFileSync(join(d48DoneDir, "outline.yaml"), "topic: Done\nitems: [{name: i1}]");
  writeFileSync(join(d48DoneDir, "report.md"), "# Full Report\n");
  writeFileSync(join(d48DoneDir, "research.md"), "---\nstatus: REPORT_READY\nphase: 3\n---\n# Done\n");
  const d48Overlay = createResearchOverlay(d48Fixture.dir, "2026-08-01_done-project", "overview");
  const d48Enter = d48Overlay.handleInput("\r");
  if (d48Enter?.action === "run") {
    if (!d48Enter.command || !d48Enter.command.startsWith("/")) {
      fail(`D48: overlay Enter dispatched non-slash prose command: ${JSON.stringify(d48Enter.command)}`);
    }
  }
  d48Fixture.cleanup();

  // D49: Project switching in ResearchOverlay resets all scroll offsets
  const d49Fixture = createTempFixture("d49-scroll-");
  const d49Kb = join(d49Fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(d49Kb, "2026-08-01_p1"), { recursive: true });
  mkdirSync(join(d49Kb, "2026-08-02_p2"), { recursive: true });
  const p1Items = Array.from({ length: 25 }, (_, i) => `  - name: Item ${i + 1}`).join("\n");
  writeFileSync(join(d49Kb, "2026-08-01_p1", "outline.yaml"), `topic: P1\nitems:\n${p1Items}\n`);
  writeFileSync(join(d49Kb, "2026-08-02_p2", "outline.yaml"), `topic: P2\nitems:\n  - name: P2 Item 1\n`);
  const d49Overlay = createResearchOverlay(d49Fixture.dir, "2026-08-01_p1", "items");
  d49Overlay.getState().scrollOffsets.items = 7;
  d49Overlay.getState().scrollOffsets.fields = 4;
  d49Overlay.handleInput("1"); // switch to overview tab
  d49Overlay.handleInput("]"); // cycle project to p2
  const p2State = d49Overlay.getState();
  for (const tab of ["overview", "items", "fields", "artifacts"] as const) {
    if (p2State.scrollOffsets[tab] !== 0) {
      fail(`D49: tab '${tab}' retained stale scroll offset ${p2State.scrollOffsets[tab]} after project switch`);
    }
  }
  d49Fixture.cleanup();

  // D50: q and Ctrl+C dismiss overlay while project picker is open
  const d50Fixture = createTempFixture("d50-picker-");
  const d50Kb = join(d50Fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(d50Kb, "2026-08-01_picker-p1"), { recursive: true });
  mkdirSync(join(d50Kb, "2026-08-02_picker-p2"), { recursive: true });
  writeFileSync(join(d50Kb, "2026-08-01_picker-p1", "outline.yaml"), "topic: P1\nitems: [{name: i1}]");
  writeFileSync(join(d50Kb, "2026-08-02_picker-p2", "outline.yaml"), "topic: P2\nitems: [{name: i2}]");
  const d50Overlay = createResearchOverlay(d50Fixture.dir, "2026-08-01_picker-p1", "overview");
  d50Overlay.handleInput("p"); // open project picker
  if (!d50Overlay.getState().showProjectPicker) {
    fail("D50: test setup: 'p' did not open project picker");
  }
  const d50DismissQ = d50Overlay.handleInput("q");
  if (!d50DismissQ || d50DismissQ.action !== "dismiss") {
    fail(`D50: 'q' in project picker did not return dismiss action: ${JSON.stringify(d50DismissQ)}`);
  }
  // Re-open picker and test Ctrl+C
  d50Overlay.handleInput("p");
  const d50DismissCtrlC = d50Overlay.handleInput("\x03");
  if (!d50DismissCtrlC || d50DismissCtrlC.action !== "dismiss") {
    fail(`D50: Ctrl+C in project picker did not return dismiss action: ${JSON.stringify(d50DismissCtrlC)}`);
  }
  d50Fixture.cleanup();

  // X-RESEARCH-11: derivePipelineStatus prioritizes report.md over stale explicit status
  const x11Status1 = derivePipelineStatus({ hasReport: true, explicit: "CONVERGED" });
  if (x11Status1 !== "REPORT_READY") {
    fail(`X-RESEARCH-11: expected REPORT_READY when hasReport=true with explicit=CONVERGED, got ${x11Status1}`);
  }
  const x11Status2 = derivePipelineStatus({ hasReport: true, explicit: "RUNNING" });
  if (x11Status2 !== "REPORT_READY") {
    fail(`X-RESEARCH-11: expected REPORT_READY when hasReport=true with explicit=RUNNING, got ${x11Status2}`);
  }
  const x11Status3 = derivePipelineStatus({ hasReport: true, explicit: "OUTLINE" });
  if (x11Status3 !== "REPORT_READY") {
    fail(`X-RESEARCH-11: expected REPORT_READY when hasReport=true with explicit=OUTLINE, got ${x11Status3}`);
  }

  // X-COREDISPATCH-14: Review overlay handleInput wrapper returns action
  const x14Fixture = createTempFixture("x14-review-");
  const x14Kb = join(x14Fixture.dir, ".omp", "knowledge", "research");
  mkdirSync(join(x14Kb, "2026-08-01_x14"), { recursive: true });
  writeFileSync(join(x14Kb, "2026-08-01_x14", "outline.yaml"), "topic: X14\nitems: [{name: i1}]");
  const x14Ctx = createInteractiveCommandContext();
  if (ctx.registered?.["research"]) {
    await ctx.registered["research"].handler("review 2026-08-01_x14", x14Ctx);
    if (x14Ctx.customCalls.length > 0) {
      const call = x14Ctx.customCalls[0];
      const act = call.component.handleInput?.("d");
      const isRunAction =
        Boolean(act) &&
        typeof act === "object" &&
        act !== null &&
        "action" in act &&
        act.action === "run";
      if (!isRunAction) {
        fail(`X-COREDISPATCH-14: review overlay handleInput returned ${JSON.stringify(act)}, expected action object with action="run"`);
      }
    }
  }
  x14Fixture.cleanup();
  cjkFixture.cleanup();
  fixture.cleanup();
}
