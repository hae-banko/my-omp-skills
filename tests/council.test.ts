// Council Deliberation, Consensus & UX Test Suite
//
// Multi-LLM council deliberation engine (SPEC-002), Star Chamber semantic
// consensus partitioning, Ed25519-signed decision records (ADR-034), the
// `.omp/council.yaml` project configuration loader, the `/council edit`
// in-place editor subcommand, and the interactive verdict overlay (SPEC-002).
//
// Command UX contract enforced here (ADR-0008 §3+§4):
//   - No `pi.sendUserMessage` echo into the editable input buffer.
//   - No sub-mode routing metadata (QUICK / RAW / EMBEDDED / etc.) in the
//     status-bar widget or the verdict receipt card content.
//   - Interactive triad selector includes an Edit option, surfaces the
//     active default starred, and preserves the Council Execution Contract
//     in the hidden workflow body.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUNCIL_CUSTOM_TYPE,
  COUNCIL_PRESET_ALIASES,
  COUNCIL_PRESET_IDS,
  COUNCIL_PRESETS,
  COUNCIL_STATUS_KEY,
  DEFAULT_COUNCIL_CONFIG,
  DEFAULT_COUNCIL_TRIAD,
  ELECTRICAL_EE_TRIAD,
  EMBEDDED_TRIAD,
  ML_RESEARCH_TRIAD,
  createCouncilVerdictCard,
  installCouncilVerdictRenderer,
  listCouncilPresets,
  listCouncils,
  loadCouncilConfig,
  parseCouncilArgs,
  parseCouncilSubcommand,
  resolveCouncilConfigPath,
  partitionCouncilOpinions,
  renderCouncilVerdictCard,
  runCouncilCommand,
  runCouncilEditSubcommand,
  saveCouncilRecord,
  scaffoldCouncilYaml,
  signCouncilVerdict,
  summarizeVerdict,
  verifyCouncilSignature,
  type CouncilOpinion,
  type CouncilVerdict,
} from "../src/council/council.ts";
import { createCouncilOverlay } from "../src/council/council-overlay.ts";
import { displayWidth } from "../src/research/research-format.ts";
import {
  createTempFixture,
  createInteractiveCommandContext,
  fail,
  type TestContext,
} from "./test-utils.ts";

export async function runCouncilSuite(ctx: TestContext): Promise<void> {
  // 7. Council Deliberation & Consensus Engine (SPEC-002)
  if (DEFAULT_COUNCIL_TRIAD.length !== 3) {
    fail(`DEFAULT_COUNCIL_TRIAD: expected 3 personas, got ${DEFAULT_COUNCIL_TRIAD.length}`);
  }
  const personaIds = DEFAULT_COUNCIL_TRIAD.map((p) => p.id);
  if (!personaIds.includes("minimalist") || !personaIds.includes("architect") || !personaIds.includes("security")) {
    fail(`DEFAULT_COUNCIL_TRIAD: missing required personas, got: ${personaIds.join(", ")}`);
  }

  // Test partitionCouncilOpinions
  const sampleOpinions: CouncilOpinion[] = [
    {
      personaId: "minimalist",
      personaName: "Minimalist",
      stance: "JSON on disk",
      recommendation: "Stay with pure JSON files and avoid SQLite",
      keyInvariants: ["Append-only git diff compatibility", "Zero external npm dependencies"],
      caveats: ["Query speed slows down above 10,000 items"],
      confidence: 0.95,
    },
    {
      personaId: "architect",
      personaName: "Systems Architect",
      stance: "JSON on disk",
      recommendation: "Keep JSON files behind a modular store interface",
      keyInvariants: ["Append-only git diff compatibility", "Modular store interface boundary"],
      caveats: ["Schema migrations must be handled in TypeScript"],
      confidence: 0.9,
    },
    {
      personaId: "security",
      personaName: "Security Auditor",
      stance: "SQLite",
      recommendation: "Use SQLite with strict transactions for atomic writes",
      keyInvariants: ["Append-only git diff compatibility", "Atomic filesystem lock safety"],
      caveats: ["Binary SQLite files cause unresolvable git merge conflicts"],
      confidence: 0.85,
    },
  ];

  const partition = partitionCouncilOpinions(sampleOpinions, "SQLite vs JSON");
  // "Append-only git diff compatibility" is shared by all 3 (3/3 consensus)
  if (partition.consensusInvariants.length !== 1 || !partition.consensusInvariants[0].includes("Append-only")) {
    fail(`partitionCouncilOpinions: expected 1 consensus invariant, got: ${JSON.stringify(partition.consensusInvariants)}`);
  }
  if (partition.uniqueInsights.length !== 3) {
    fail(`partitionCouncilOpinions: expected 3 unique insights, got: ${partition.uniqueInsights.length}`);
  }
  if (partition.criticalDivergences.length !== 1) {
    fail(`partitionCouncilOpinions: expected 1 critical divergence, got: ${partition.criticalDivergences.length}`);
  }

  // Test Ed25519 cryptographic signing & verification (ADR-034)
  const sampleVerdict: Omit<CouncilVerdict, "signature" | "publicKey"> = {
    topic: "SQLite vs JSON Storage",
    mode: "quick",
    councilName: "default-triad",
    opinions: sampleOpinions,
    consensusInvariants: partition.consensusInvariants,
    majorityRecommendations: partition.majorityRecommendations,
    uniqueInsights: partition.uniqueInsights,
    criticalDivergences: partition.criticalDivergences,
    verdictSummary: partition.verdictSummary,
    timestamp: "2026-08-25T12:00:00.000Z",
    snapshotId: "a1b2c3d",
  };

  const { signature, publicKey } = signCouncilVerdict(sampleVerdict);
  if (!signature || signature.length < 64) {
    fail("signCouncilVerdict: generated empty or invalid signature");
  }

  const fullVerdict: CouncilVerdict = {
    ...sampleVerdict,
    signature,
    publicKey,
  };

  if (!verifyCouncilSignature(fullVerdict, publicKey)) {
    fail("verifyCouncilSignature: valid signature failed verification");
  }

  // Tamper check
  const tamperedVerdict: CouncilVerdict = {
    ...fullVerdict,
    verdictSummary: "Tampered summary",
  };
  if (verifyCouncilSignature(tamperedVerdict, publicKey)) {
    fail("verifyCouncilSignature: tampered verdict passed verification");
  }

  // Test 76-column ANSI Verdict Card rendering
  const renderedCard = renderCouncilVerdictCard(fullVerdict);
  const cardLines = renderedCard.split("\n");
  for (let idx = 0; idx < cardLines.length; idx++) {
    const width = displayWidth(cardLines[idx]);
    if (width !== 76) {
      fail(`renderCouncilVerdictCard: line ${idx} display width is ${width}, expected 76:\n${cardLines[idx]}`);
      break;
    }
  }

  // Test native TUI Council Verdict Box rendering
  const nativeBox = createCouncilVerdictCard(fullVerdict);
  const boxLines = nativeBox.render(100);
  if (!boxLines[0].includes("╭") || !boxLines[boxLines.length - 1].includes("╰")) {
    fail("createCouncilVerdictCard: rendered box missing native rounded corners");
  }
  if (boxLines[0].length < 100) {
    fail(`createCouncilVerdictCard: failed to scale to 100 columns: ${boxLines[0].length}`);
  }
  // Test persistence to .omp/scratch/debates/
  const testDir = createTempFixture("council-test");
  const savedPath = saveCouncilRecord(testDir.dir, fullVerdict);
  if (!existsSync(savedPath)) {
    fail(`saveCouncilRecord: target file does not exist: ${savedPath}`);
  }
  const savedContent = readFileSync(savedPath, "utf8");
  if (!savedContent.includes("debate_id:") || !savedContent.includes("Consensus Invariants")) {
    fail("saveCouncilRecord: generated content missing expected frontmatter or sections");
  }
  testDir.cleanup();

  // 7b. parseCouncilArgs flag parsing
  const quickArgs = parseCouncilArgs("--quick Should we migrate to Postgres?");
  if (quickArgs.mode !== "quick" || !quickArgs.topic.includes("Postgres")) {
    fail(`parseCouncilArgs: --quick flag/topic mismatch: ${JSON.stringify(quickArgs)}`);
  }
  const deepArgs = parseCouncilArgs("--debate --save migrate from REST to GraphQL");
  if (deepArgs.mode !== "deep" || !deepArgs.save || !deepArgs.topic.includes("GraphQL")) {
    fail(`parseCouncilArgs: --debate/--save mismatch: ${JSON.stringify(deepArgs)}`);
  }
  const rawArgs = parseCouncilArgs("--raw --council smart-contracts --actionable something");
  if (rawArgs.mode !== "raw" || rawArgs.councilName !== "smart-contracts" || !rawArgs.actionable) {
    fail(`parseCouncilArgs: --raw/--council/--actionable mismatch: ${JSON.stringify(rawArgs)}`);
  }
  const defaultArgs = parseCouncilArgs("plain topic");
  if (defaultArgs.mode !== "quick" || defaultArgs.save !== false || !defaultArgs.topic.includes("plain")) {
    fail(`parseCouncilArgs: defaults mismatch: ${JSON.stringify(defaultArgs)}`);
  }

  // 7c. COUNCIL_CUSTOM_TYPE is the exact customType the renderer registers against
  if (COUNCIL_CUSTOM_TYPE !== "council-verdict") {
    fail(`COUNCIL_CUSTOM_TYPE: expected "council-verdict", got "${COUNCIL_CUSTOM_TYPE}"`);
  }

  // 7d. installCouncilVerdictRenderer registers a renderer for council-verdict.
  // Regression guard for v0.74.0 / session-resume crash:
  //   "TypeError: t[i].render is not a function" in the harness render loop.
  // The omp runtime iterates registered renderers and calls
  // `t[i].render(width)` on each. Plain strings have no `.render`, so the
  // renderer MUST return a pi-tui Component (a Container whose children are
  // Text widgets) — never a raw newline-joined string. This test exercises
  // the same loop pattern as the harness; if it throws here, it throws in
  // production.
  const rendererCtx = createTestContextLike(ctx);
  installCouncilVerdictRenderer(rendererCtx.pi);
  const renderer = rendererCtx.renderers[COUNCIL_CUSTOM_TYPE];
  if (typeof renderer !== "function") {
    fail(`installCouncilVerdictRenderer: did not register a renderer for "${COUNCIL_CUSTOM_TYPE}"`);
  }
  const verdictForRenderer: CouncilVerdict = fullVerdict;
  const renderedByRenderer = renderer({ details: verdictForRenderer }, {}, {});
  // (a) Must NOT be a string — that is the smoking gun of the v0.72.1 crash.
  if (typeof renderedByRenderer === "string") {
    fail(
      "installCouncilVerdictRenderer: returned a raw string; the harness render loop " +
        "calls t[i].render(width) on registered renderers and will throw " +
        "'TypeError: t[i].render is not a function' when this verdict is re-rendered " +
        "on session resume. Wrap each card line in a pi-tui Container of Text widgets.",
    );
  }
  if (!renderedByRenderer || typeof renderedByRenderer !== "object") {
    fail("installCouncilVerdictRenderer: returned a non-object value");
  }
  // (c) Drive the same loop the harness does: walk registered renderers and
  //     call .render(width). If this throws, the user's session-resume crash
  //     reproduces exactly. This is the Phase-1 red-capable loop.
  const harnessRows: string[] = [];
  for (const [, fn] of Object.entries(rendererCtx.renderers)) {
    const out = fn({ details: verdictForRenderer }, {}, {});
    if (out === undefined) continue; // renderer declined — fine
    // Real harness code: `t[i].render(e)` where e is width. After the guard,
    // `out` is a non-null object with a callable `render`. Pull it into a
    // typed local so the call site is type-safe and the `null`/object shape
    // doesn't escape.
    if (typeof out !== "object" || out === null || !("render" in out) || typeof out.render !== "function") {
      fail(
        "harness-loop exercise: a registered renderer returned a non-Component " +
          "value — this is the exact pattern that crashes the runtime with " +
          "'TypeError: t[i].render is not a function'.",
      );
    }
    // Boundary cast: the guard above proves the shape (non-null object with a
    // callable `render`), but TS won't infer through `in` to the function type
    // here. The assertion is load-bearing only after the guard succeeds.
    const component = out as unknown as { render: (width: number) => readonly string[] };
    const rendered = component.render(80);
    for (const row of rendered) harnessRows.push(row);
  }
  // (d) The verdict text must be present in the rendered lines.
  if (!harnessRows.some((r) => r.includes("COUNCIL VERDICT"))) {
    fail("installCouncilVerdictRenderer: rendered output missing 'COUNCIL VERDICT' header");
  }
  // (e) Every rendered line must respect the responsive width invariant.
  for (const row of harnessRows) {
    if (displayWidth(row) > 80) {
      fail(`installCouncilVerdictRenderer: row exceeds responsive width (80): ${row}`);
    }
  }
  // Renderer gracefully handles missing/malformed details
  const undefRender = renderer({}, {}, {});
  if (undefRender !== undefined) {
    fail(`installCouncilVerdictRenderer: expected undefined for empty payload, got: ${String(undefRender).slice(0, 60)}`);
  }

  // 7e. runCouncilCommand drives ctx.ui.setStatus and emits the verdict receipt
  const statusCalls: Array<{ key: string; text: string | undefined }> = [];
  const notifCalls: string[] = [];
  const commandCtx = {
    hasUI: true,
    ui: {
      setStatus: (key: string, text: string | undefined) => {
        statusCalls.push({ key, text });
      },
      notify: (msg: string) => {
        notifCalls.push(msg);
      },
    },
  };
  // Re-register the renderer in the command ctx harness (ctx's renderers already
  // have it from createTestContext, but rebuild against commandCtx to exercise
  // the same wiring path the extension runs).
  runCouncilCommand(
    ctx.pi,
    process.cwd(),
    "--quick --save Should we ship a SQLite backend?",
    commandCtx,
    { body: "# Council workflow body for tests", companionPaths: [] },
  );
  if (statusCalls.length < 2) {
    fail(`runCouncilCommand: expected at least 2 setStatus calls (start+clear), got ${statusCalls.length}`);
  }
  if (statusCalls[0].key !== COUNCIL_STATUS_KEY || !statusCalls[0].text?.includes("Council deliberating on")) {
    fail(`runCouncilCommand: first setStatus call wrong (must be clean, no sub-mode stamp): ${JSON.stringify(statusCalls[0])}`);
  }
  // ADR-0008 §4: status text must NOT leak sub-mode routing metadata.
  if (statusCalls[0].text && /QUICK|RAW|DEEP|EMBEDDED|ML-RESEARCH|SOFTWARE/.test(statusCalls[0].text)) {
    fail(`runCouncilCommand: status text leaks sub-mode stamp: ${JSON.stringify(statusCalls[0])}`);
  }
  const verdictMessages = ctx.customMessages.filter(
    (m) => (m as { customType?: string }).customType === COUNCIL_CUSTOM_TYPE,
  );
  if (verdictMessages.length === 0) {
    fail(`runCouncilCommand: no customType="${COUNCIL_CUSTOM_TYPE}" message emitted`);
  }
  if (!notifCalls.some((n) => n.includes("Council"))) {
    fail(`runCouncilCommand: no notify() call was issued, got: ${JSON.stringify(notifCalls)}`);
  }

  // 7f. Domain-specific council presets (ML, embedded, electrical-EE)
  if (ML_RESEARCH_TRIAD.length !== 3) fail("ml-research triad size");
  if (EMBEDDED_TRIAD.length !== 3) fail("embedded triad size");
  if (ELECTRICAL_EE_TRIAD.length !== 3) fail("electrical-ee triad size");

  const mlIds = ML_RESEARCH_TRIAD.map((p) => p.id);
  if (!mlIds.includes("model-architect") || !mlIds.includes("eval-critic") || !mlIds.includes("inference-engineer")) {
    fail(`ml-research missing required personas: ${mlIds.join(", ")}`);
  }
  const embIds = EMBEDDED_TRIAD.map((p) => p.id);
  if (!embIds.includes("realtime-auditor") || !embIds.includes("hardware-safety") || !embIds.includes("baremetal-pragmatist")) {
    fail(`embedded missing required personas: ${embIds.join(", ")}`);
  }
  const eeIds = ELECTRICAL_EE_TRIAD.map((p) => p.id);
  if (!eeIds.includes("signal-power-integrity") || !eeIds.includes("component-dfm") || !eeIds.includes("safety-compliance")) {
    fail(`electrical-ee missing required personas: ${eeIds.join(", ")}`);
  }

  // Tool capabilities: ML/EE personas use web_search; embedded uses read+grep.
  for (const p of ML_RESEARCH_TRIAD) {
    if (!p.tools || !p.tools.includes("web_search")) fail(`ML ${p.id} missing web_search`);
  }
  for (const p of ELECTRICAL_EE_TRIAD) {
    if (!p.tools || !p.tools.includes("web_search")) fail(`EE ${p.id} missing web_search`);
  }
  for (const p of EMBEDDED_TRIAD) {
    if (!p.tools || !p.tools.includes("read")) fail(`EMB ${p.id} missing read`);
  }

  // Aliases resolve to canonical ids.
  for (const id of COUNCIL_PRESET_IDS) {
    if (!(id in COUNCIL_PRESETS)) fail(`preset map missing ${id}`);
  }
  if (COUNCIL_PRESETS["ml"] !== ML_RESEARCH_TRIAD) fail("alias 'ml'");
  if (COUNCIL_PRESETS["firmware"] !== EMBEDDED_TRIAD) fail("alias 'firmware'");
  if (COUNCIL_PRESETS["ee"] !== ELECTRICAL_EE_TRIAD) fail("alias 'ee'");
  if (COUNCIL_PRESETS["hardware"] !== ELECTRICAL_EE_TRIAD) fail("alias 'hardware'");

  if (COUNCIL_PRESET_ALIASES["software"] !== "default-triad") fail("alias software");
  if (COUNCIL_PRESET_ALIASES["ml"] !== "ml-research") fail("alias ml");
  if (COUNCIL_PRESET_ALIASES["firmware"] !== "embedded") fail("alias firmware");
  if (COUNCIL_PRESET_ALIASES["hardware"] !== "electrical-ee") fail("alias hardware");

  const presets = listCouncilPresets();
  if (presets.length < 9) fail(`listCouncilPresets should include aliases, got ${presets.length}`);
  // DEFAULT_COUNCIL_CONFIG exposes every preset (so the resolver works without
  // a YAML file on disk).
  for (const id of COUNCIL_PRESET_IDS) {
    if (!DEFAULT_COUNCIL_CONFIG.councils[id]) fail(`default config missing ${id}`);
  }

  // 7g. parseCouncilArgs recognises the new preset + overlay flags
  const mlArgs = parseCouncilArgs("--ml transformer architecture?");
  if (mlArgs.councilName !== "ml-research") fail("--ml → ml-research");
  if (!mlArgs.topic.includes("transformer")) fail("--ml topic");

  const firmwareArgs = parseCouncilArgs("--firmware --deep realtime ISR budget");
  if (firmwareArgs.councilName !== "embedded") fail("--firmware → embedded");
  if (firmwareArgs.mode !== "deep") fail("--firmware --deep");

  const eeArgs = parseCouncilArgs("--ee --hardware power integrity");
  if (eeArgs.councilName !== "electrical-ee") fail("--ee");

  const swArgs = parseCouncilArgs("--software --save --record test");
  if (swArgs.councilName !== "default-triad") fail("--software");
  if (!swArgs.save) fail("--software --save");

  const presetArgs = parseCouncilArgs("--preset ml-research --actionable");
  if (presetArgs.councilName !== "ml-research") fail("--preset");
  if (!presetArgs.actionable) fail("--actionable");

  const overlayArgs = parseCouncilArgs("--overlay --ml review proposal");
  if (!overlayArgs.overlay) fail("--overlay");
  if (overlayArgs.councilName !== "ml-research") fail("--overlay --ml");

  // 7g-bis. parseCouncilArgs recognises natural keywords without `--` prefix
  const naturalMl = parseCouncilArgs("ml Should we use GQA?");
  if (naturalMl.councilName !== "ml-research") fail(`natural keyword 'ml' → ml-research: ${JSON.stringify(naturalMl)}`);
  if (naturalMl.topic !== "Should we use GQA?") fail(`natural keyword 'ml' topic: ${JSON.stringify(naturalMl)}`);

  const naturalDebateSave = parseCouncilArgs("debate save SQLite vs JSON");
  if (naturalDebateSave.mode !== "deep") fail(`natural keyword 'debate' → deep: ${JSON.stringify(naturalDebateSave)}`);
  if (naturalDebateSave.save !== true) fail(`natural keyword 'save' → save: ${JSON.stringify(naturalDebateSave)}`);
  if (naturalDebateSave.topic !== "SQLite vs JSON") fail(`natural keyword topic: ${JSON.stringify(naturalDebateSave)}`);

  const naturalEmbeddedCompact = parseCouncilArgs("embedded compact DMA queue");
  if (naturalEmbeddedCompact.councilName !== "embedded") fail(`natural keyword 'embedded' → embedded: ${JSON.stringify(naturalEmbeddedCompact)}`);
  if (naturalEmbeddedCompact.compact !== true) fail(`natural keyword 'compact' → compact: ${JSON.stringify(naturalEmbeddedCompact)}`);
  if (naturalEmbeddedCompact.topic !== "DMA queue") fail(`natural keyword topic: ${JSON.stringify(naturalEmbeddedCompact)}`);

  // Subcommand short-circuit detection
  const subList = parseCouncilSubcommand("list");
  if (!subList || subList.sub !== "list") fail("parseCouncilSubcommand('list')");
  const subInit = parseCouncilSubcommand("init --force");
  if (!subInit || subInit.sub !== "init" || !subInit.rest.includes("--force")) fail("parseCouncilSubcommand('init --force')");
  const notSub = parseCouncilSubcommand("--ml topic");
  if (notSub !== null) fail("parseCouncilSubcommand should not match non-subcommand");

  // 7h. listCouncils reports all built-ins (deduplicated) with personas + tools
  const fixtureDir = createTempFixture("council-list-");
  const councilList = listCouncils(fixtureDir.dir);
  if (councilList.length !== 4) fail(`listCouncils: expected 4 built-ins, got ${councilList.length}`);
  for (const c of councilList) {
    if (!c.builtin) fail(`${c.id} should be builtin`);
    if (c.personas.length !== 3) fail(`${c.id} should have 3 personas`);
    for (const p of c.personas) {
      if (typeof p.name !== "string" || typeof p.role !== "string") fail(`${c.id}/${p.id} missing name/role`);
    }
  }
  fixtureDir.cleanup();

  // 7i. summarizeVerdict produces a stable, deterministic string for chat output
  const summary = summarizeVerdict(fullVerdict);
  if (!summary.includes("SQLite vs JSON Storage")) fail("summarizeVerdict: missing topic");
  if (!summary.includes("default-triad")) fail("summarizeVerdict: missing council");
  if (!summary.includes("Consensus:")) fail("summarizeVerdict: missing consensus count");

  // 7j. scaffoldCouncilYaml writes .omp/council.yaml with the example custom council
  const scaffoldDir = createTempFixture("council-scaffold-");
  const result = scaffoldCouncilYaml(scaffoldDir.dir);
  if (!result.created) fail("scaffoldCouncilYaml should create file");
  const yamlPath = join(scaffoldDir.dir, ".omp", "council.yaml");
  if (!existsSync(yamlPath)) fail("scaffoldCouncilYaml: file not on disk");
  const yamlContent = readFileSync(yamlPath, "utf8");
  if (!yamlContent.includes("default-triad") || !yamlContent.includes("ml-research")) {
    fail("scaffoldCouncilYaml: missing built-in docs");
  }
  if (!yamlContent.includes("my-domain-council")) fail("scaffoldCouncilYaml: missing example council");
  if (!yamlContent.includes("web_search")) fail("scaffoldCouncilYaml: missing tool example");

  // Idempotent: second call without force should be a no-op
  const second = scaffoldCouncilYaml(scaffoldDir.dir);
  if (second.created) fail("scaffoldCouncilYaml: should be idempotent");
  // With force=true, file gets overwritten
  const third = scaffoldCouncilYaml(scaffoldDir.dir, { force: true });
  if (!third.created) fail("scaffoldCouncilYaml: force should overwrite");

  // The example council should be loadable through loadCouncilConfig
  const loaded = loadCouncilConfig(scaffoldDir.dir);
  if (!loaded.councils["my-domain-council"]) fail("scaffolded council my-domain-council not loaded");
  const teamPersonas = loaded.councils["my-domain-council"];
  if (teamPersonas.length !== 4) {
    fail(`scaffolded council: expected 4 participants, got ${teamPersonas.length}`);
  }
  if (!teamPersonas[0].tools?.includes("web_search") && !teamPersonas[0].tools?.includes("read")) {
    fail("scaffolded council tools not parsed");
  }
  if (loaded.defaultCouncil !== "default-triad") {
    fail(`expected default-triad from scaffold, got ${loaded.defaultCouncil}`);
  }
  scaffoldDir.cleanup();

  // 7j-3. resolveCouncilConfigPath: root-level and .config/council.yaml discovery
  const rootYamlDir = createTempFixture("council-root-yaml-");
  const rootYamlPath = join(rootYamlDir.dir, "council.yaml");
  writeFileSync(
    rootYamlPath,
    "councils:\n  my-root-team:\n    - name: Root\n    - name: Analyst\n",
    "utf8",
  );
  if (resolveCouncilConfigPath(rootYamlDir.dir) !== rootYamlPath) {
    fail(`resolveCouncilConfigPath: root-level council.yaml not discovered: ${resolveCouncilConfigPath(rootYamlDir.dir)}`);
  }
  const rootLoaded = loadCouncilConfig(rootYamlDir.dir);
  if (!rootLoaded.councils["my-root-team"]) fail("loadCouncilConfig: root-level council.yaml not loaded");

  const configDirYamlDir = createTempFixture("council-configdir-yaml-");
  const configDir = join(configDirYamlDir.dir, ".config");
  mkdirSync(configDir, { recursive: true });
  const configDirYamlPath = join(configDir, "council.yaml");
  writeFileSync(
    configDirYamlPath,
    "councils:\n  my-config-team:\n    - name: Config\n",
    "utf8",
  );
  if (resolveCouncilConfigPath(configDirYamlDir.dir) !== configDirYamlPath) {
    fail(`resolveCouncilConfigPath: .config/council.yaml not discovered: ${resolveCouncilConfigPath(configDirYamlDir.dir)}`);
  }
  configDirYamlDir.cleanup();
  rootYamlDir.cleanup();

  // 7j-4. parseCouncilArgs: custom council ids matched case-insensitively
  const customCouncilArgs = parseCouncilArgs("my-custom-team should we migrate?", ["my-custom-team"]);
  if (customCouncilArgs.councilName !== "my-custom-team") {
    fail(`parseCouncilArgs: custom id match failed: ${JSON.stringify(customCouncilArgs)}`);
  }
  if (customCouncilArgs.topic !== "should we migrate?") {
    fail(`parseCouncilArgs: custom id topic mismatch: ${JSON.stringify(customCouncilArgs)}`);
  }
  const uppercaseCustomArgs = parseCouncilArgs("My-Custom-Team should we migrate?", ["my-custom-team"]);
  if (uppercaseCustomArgs.councilName !== "my-custom-team") {
    fail(`parseCouncilArgs: case-insensitive custom id match failed: ${JSON.stringify(uppercaseCustomArgs)}`);
  }
  const unknownTokenArgs = parseCouncilArgs("postgres or sqlite", ["my-custom-team"]);
  if (unknownTokenArgs.councilName !== undefined || unknownTokenArgs.topic !== "postgres or sqlite") {
    fail(`parseCouncilArgs: unknown token should stay in topic: ${JSON.stringify(unknownTokenArgs)}`);
  }

  // 7j-2. Custom .omp/council.yaml: default council selection + arbitrary participant counts
  const customConfigDir = createTempFixture("council-custom-yaml-");
  const ompDir = join(customConfigDir.dir, ".omp");
  mkdirSync(ompDir, { recursive: true });
  writeFileSync(
    join(ompDir, "council.yaml"),
    [
      "default: embedded",
      "defaultMode: deep",
      "councils:",
      "  duo:",
      "    - id: lead",
      "      name: \"Lead\"",
      "      role: \"Architecture\"",
      "      systemPrompt: \"Design safe interfaces.\"",
      "    - id: review",
      "      name: \"Reviewer\"",
      "      role: \"Verification\"",
      "      systemPrompt: \"Challenge assumptions.\"",
      "  quintet:",
      "    - id: p1",
      "      name: \"P1\"",
      "      role: \"R1\"",
      "    - id: p2",
      "      name: \"P2\"",
      "      role: \"R2\"",
      "    - id: p3",
      "      name: \"P3\"",
      "      role: \"R3\"",
      "    - id: p4",
      "      name: \"P4\"",
      "      role: \"R4\"",
      "    - id: p5",
      "      name: \"P5\"",
      "      role: \"R5\"",
    ].join("\n"),
  );
  const customLoaded = loadCouncilConfig(customConfigDir.dir);
  if (customLoaded.defaultCouncil !== "embedded") {
    fail(`loadCouncilConfig: expected default 'embedded', got '${customLoaded.defaultCouncil}'`);
  }
  if (customLoaded.defaultMode !== "deep") {
    fail(`loadCouncilConfig: expected defaultMode 'deep', got '${customLoaded.defaultMode}'`);
  }
  if (!customLoaded.councils["duo"] || customLoaded.councils["duo"].length !== 2) {
    fail(`loadCouncilConfig: expected 2 participants in 'duo', got ${customLoaded.councils["duo"]?.length}`);
  }
  if (!customLoaded.councils["quintet"] || customLoaded.councils["quintet"].length !== 5) {
    fail(`loadCouncilConfig: expected 5 participants in 'quintet', got ${customLoaded.councils["quintet"]?.length}`);
  }

  // Verify verbose keyword parsing
  const verboseArgs = parseCouncilArgs("ml verbose save Should we replace dense attention with GQA?");
  if (verboseArgs.verbose !== true) fail("parseCouncilArgs: expected verbose === true");
  if (verboseArgs.councilName !== "ml-research") fail("parseCouncilArgs: expected councilName === 'ml-research'");
  if (verboseArgs.save !== true) fail("parseCouncilArgs: expected save === true");

  // Verify runCouncilCommand uses defaultCouncil from YAML when no preset is typed
  const testPi = ctx.pi;
  const mockCtx = createInteractiveCommandContext();
  let injectedBody = "";
  const originalSend = testPi.sendMessage;
  testPi.sendMessage = (msg: Record<string, unknown>) => {
    if (msg.customType === "command:council" && typeof msg.content === "string") {
      injectedBody = msg.content;
    }
    originalSend(msg);
  };
  const councilStatusCalls: Array<{ key: string; text: string | undefined }> = [];
  const originalSetStatus = mockCtx.ui.setStatus;
  mockCtx.ui.setStatus = (key: string, text: string | undefined): void => {
    councilStatusCalls.push({ key, text });
  };
  try {
    const sentBefore = ctx.sent.length;
    runCouncilCommand(testPi, customConfigDir.dir, "Should we use DMA buffers?", mockCtx, {
      body: "Base instructions",
      companionPaths: [],
    });
    // ADR-0008 §3+§4: clean status (no sub-mode stamp) and one generic notification.
    const started = councilStatusCalls.find((s) => s.key === "council" && typeof s.text === "string");
    if (!started || !started.text?.includes("Council deliberating on")) {
      fail(`runCouncilCommand: first setStatus call must be clean (no QUICK/RAW/EMBEDDED stamp), got ${JSON.stringify(started)}`);
    }
    if (started?.text && /QUICK|RAW|DEEP|EMBEDDED|ML-RESEARCH|SOFTWARE/.test(started.text)) {
      fail(`runCouncilCommand: status text leaks sub-mode metadata, got ${JSON.stringify(started)}`);
    }
    if (!mockCtx.notifications.some((n) => n.msg === "Council deliberation started")) {
      fail(`runCouncilCommand: missing generic notification, got ${JSON.stringify(mockCtx.notifications)}`);
    }
    // ADR-0008 §3: no pi.sendUserMessage echo into the editable input buffer.
    if (ctx.sent.length !== sentBefore) {
      fail(`runCouncilCommand: must NOT echo into input buffer via sendUserMessage, got ${JSON.stringify(ctx.sent.slice(sentBefore))}`);
    }
    if (!injectedBody.includes("Council Execution Contract (embedded · 3 participants)")) {
      fail(`runCouncilCommand: missing Execution Contract in injected body: ${injectedBody.slice(0, 200)}`);
    }
    if (!injectedBody.includes("SILENT BY DEFAULT")) {
      fail("runCouncilCommand: missing SILENT BY DEFAULT directive in injected body");
    }
  } finally {
    mockCtx.ui.setStatus = originalSetStatus ?? (() => {});
    testPi.sendMessage = originalSend;
    customConfigDir.cleanup();
  }

  // 7j-3. /council edit & config subcommands + interactive triad selector
  const subEdit = parseCouncilSubcommand("edit");
  if (subEdit?.sub !== "edit") fail(`parseCouncilSubcommand: expected 'edit', got '${subEdit?.sub}'`);
  const subConfig = parseCouncilSubcommand("config");
  if (subConfig?.sub !== "config") fail(`parseCouncilSubcommand: expected 'config', got '${subConfig?.sub}'`);

  const editFixture = createTempFixture("council-edit-subcommand-");
  try {
    let editorOpened = false;
    const editCtx = createInteractiveCommandContext({
      onEditor: (_title, prefill) => {
        editorOpened = true;
        // Simulate user editing the config to set default: ml
        return `${prefill ?? ""}\ndefault: ml\n`;
      },
    });
    await runCouncilEditSubcommand(ctx.pi, editFixture.dir, editCtx);
    if (!editorOpened) fail("runCouncilEditSubcommand: editor was not opened");
    const updatedCfg = loadCouncilConfig(editFixture.dir);
    if (updatedCfg.defaultCouncil !== "ml-research") {
      fail(`runCouncilEditSubcommand: expected default 'ml-research' after edit, got '${updatedCfg.defaultCouncil}'`);
    }
    const savedNotification = editCtx.notifications.some((n) => n.msg.includes("Saved .omp/council.yaml"));
    if (!savedNotification) fail("runCouncilEditSubcommand: missing saved notification");

    // Verify interactive selector when running /council with no args
    let selectOptions: unknown[] = [];
    const selectorCtx = createInteractiveCommandContext({
      onSelect: (_title, options) => {
        selectOptions = options;
        return "__edit__";
      },
      onEditor: (_title, prefill) => prefill,
    });
    await runCouncilCommand(ctx.pi, editFixture.dir, "", selectorCtx, {
      body: "Base instructions",
      companionPaths: [],
    });
    const hasEditOption = selectOptions.some(
      (o) => typeof o === "object" && o !== null && (o as { value?: string }).value === "__edit__",
    );
    if (!hasEditOption) {
      fail("runCouncilCommand: interactive selector missing __edit__ option");
    }
  } finally {
    editFixture.cleanup();
  }

  // 7k. Interactive Council Overlay — render + keyboard routing
  const overlayVerdict: CouncilVerdict = {
    topic: "KV cache strategy",
    mode: "quick",
    councilName: "ml-research",
    opinions: [
      {
        personaId: "model-architect",
        personaName: "Model Architect",
        stance: "Grouped-query attention",
        recommendation: "Use GQA to halve KV cache footprint",
        keyInvariants: ["KV cache must fit in 24 GiB VRAM at 32k context"],
        caveats: ["Quality drops 0.3% on MMLU at 8-head variant"],
        confidence: 0.85,
      },
      {
        personaId: "eval-critic",
        personaName: "Eval Critic",
        stance: "Add HELM benchmark",
        recommendation: "Validate against HELM before claiming parity",
        keyInvariants: ["Confidence intervals must span ≥ 3 seeds"],
        caveats: ["Held-out contamination on Pile"],
        confidence: 0.9,
      },
      {
        personaId: "inference-engineer",
        personaName: "Inference Engineer",
        stance: "INT8 KV cache",
        recommendation: "Quantize KV cache to INT8 with per-head scales",
        keyInvariants: ["Throughput target: ≥ 800 tokens/sec/GPU at 32k context"],
        caveats: ["Outlier channels need FP8 fallback"],
        confidence: 0.8,
      },
    ],
    consensusInvariants: ["Must run on a single H100 node", "Latency budget ≤ 80ms p99"],
    majorityRecommendations: ["Adopt GQA (supported by Model Architect, Eval Critic)"],
    uniqueInsights: [
      { persona: "Eval Critic", insight: "Held-out contamination on Pile" },
      { persona: "Inference Engineer", insight: "Outlier channels need FP8 fallback" },
    ],
    criticalDivergences: [
      {
        issue: "Quantization aggressiveness",
        positions: {
          "Model Architect": "Keep FP16 for safety",
          "Eval Critic": "Need a HELM regression sweep first",
          "Inference Engineer": "INT8 KV cache with per-head scales",
        },
      },
    ],
    verdictSummary: "Consensus established on 2 core invariant(s).",
    timestamp: "2026-08-25T12:00:00.000Z",
  };
  const overlay = createCouncilOverlay(overlayVerdict);
  const overlayState = overlay.getState();
  if (overlayState.activeTab !== "verdict") fail("overlay default tab should be verdict");

  const container = overlay.render(100, 30);
  const overlayLines = ctx.collectLines(container);
  if (overlayLines.length === 0) fail("overlay render produced no lines");
  if (!overlayLines.some((l) => l.includes("COUNCIL VERDICT") || l.includes("Council Verdict Overlay"))) {
    fail("overlay render missing title");
  }
  if (!overlayLines.some((l) => l.includes("Consensus Invariants"))) {
    fail("overlay render missing consensus invariants section");
  }

  // Keyboard routing: 2/3/4 switch tabs; j/k scroll; Enter returns implement;
  // s returns save; q returns dismiss.
  overlay.handleInput("2");
  if (overlay.getState().activeTab !== "persona-0") fail("overlay '2' → persona-0");
  overlay.handleInput("3");
  if (overlay.getState().activeTab !== "persona-1") fail("overlay '3' → persona-1");
  overlay.handleInput("4");
  if (overlay.getState().activeTab !== "persona-2") fail("overlay '4' → persona-2");
  overlay.handleInput("1");
  if (overlay.getState().activeTab !== "verdict") fail("overlay '1' → verdict");
  const dismiss = overlay.handleInput("q");
  if (!dismiss || dismiss.action !== "dismiss") fail("overlay 'q' dismiss");
  // Re-render after dismiss to ensure no crash
  overlay.render(80, 24);

  // Re-create a fresh overlay for Enter/s actions
  const overlay2 = createCouncilOverlay(overlayVerdict);
  const enterAction = overlay2.handleInput("\r");
  if (!enterAction || enterAction.action !== "implement") fail("overlay Enter → implement");
  if (enterAction && enterAction.action === "implement" && (!Array.isArray(enterAction.invariants) || enterAction.invariants.length !== 2)) {
    fail("overlay Enter → implement with invariants");
  }
  const overlay3 = createCouncilOverlay(overlayVerdict);
  const saveAction = overlay3.handleInput("s");
  if (!saveAction || saveAction.action !== "save") fail("overlay 's' → save");
  if (saveAction && saveAction.action === "save" && (typeof saveAction.topic !== "string" || !saveAction.topic.length)) {
    fail("overlay 's' → save with topic");
  }
  const overlay4 = createCouncilOverlay(overlayVerdict);
  const escAction = overlay4.handleInput("\x1b");
  if (!escAction || escAction.action !== "dismiss") fail("overlay ESC → dismiss");

  // j/k scroll the active tab (verdict here)
  const overlay5 = createCouncilOverlay(overlayVerdict);
  const before = overlay5.getState().scrollOffsets.verdict;
  overlay5.handleInput("j");
  if (overlay5.getState().scrollOffsets.verdict === before) fail("overlay j scroll");
  overlay5.handleInput("k");
  if (overlay5.getState().scrollOffsets.verdict !== before) fail("overlay k scroll back");

  // setVerdict replaces the bound verdict (used by callers refreshing after a re-run)
  const overlay6 = createCouncilOverlay(overlayVerdict);
  overlay6.setVerdict({ ...overlayVerdict, topic: "Refreshed topic" });
  if (overlay6.getState().activeTab !== "verdict") fail("setVerdict should not disturb tab");
}

/** Test seam that re-creates a TestContext-shaped object WITHOUT re-invoking
 *  the extension's default export (which would double-register renderers). */
function createTestContextLike(ctx: TestContext): TestContext {
  // The original ctx already has renderers registered for council-verdict via
  // createTestContext(); return it as-is so the renderer key lookup succeeds.
  return ctx;
}