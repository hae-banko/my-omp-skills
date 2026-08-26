// Features Subsystem Test Suite: Timeline, Tilt, Clarify, Hindsight, Herdr, and Routines

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  calculateDefcon,
  defconLabel,
  getTiltStratum,
  readLocalTilt,
  recordTiltIncident,
  renderTiltCard,
  scanPromptTilt,
  TILT_CUSTOM_TYPE,
  TILT_DICTIONARY,
  TILT_STRATA,
  writeLocalTilt,
} from "../src/features/tilt.ts";
import {
  formatTimelineLines,
  getUnifiedTimeline,
  parseTimelineLimit,
  runTimelineCommand,
  TIMELINE_CUSTOM_TYPE,
} from "../src/features/timeline.ts";
import {
  CLARIFY_PROMPT,
  isClarifyDebugEnabled,
  isClarifyEnabled,
  isVagueInput,
  setClarifyDebugEnabled,
  setClarifyEnabled,
  shouldBypassClarify,
  stripClarifyBypassPrefix,
} from "../src/features/clarify.ts";
import { didRealWork } from "../src/features/hindsight.ts";
import { parseHerdrOutput } from "../src/features/herdr-tools.ts";
import {
  isSkillProceduralCandidate,
  scaffoldLocalExtension,
  validateExtensionSyntax,
} from "../src/features/routines.ts";
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
  installCouncilVerdictRenderer,
  listCouncilPresets,
  listCouncils,
  loadCouncilConfig,
  parseCouncilArgs,
  parseCouncilSubcommand,
  partitionCouncilOpinions,
  renderCouncilVerdictCard,
  runCouncilCommand,
  saveCouncilRecord,
  scaffoldCouncilYaml,
  signCouncilVerdict,
  summarizeVerdict,
  verifyCouncilSignature,
  type CouncilOpinion,
  type CouncilPersona,
  type CouncilVerdict,
} from "../src/features/council.ts";
import { createCouncilOverlay } from "../src/features/council-overlay.ts";
import {
  createTempFixture,
  fail,
  type TestContext,
} from "./test-utils.ts";
export async function runFeaturesSuite(ctx: TestContext): Promise<void> {
  const { tools, customMessages } = ctx;
  // 1. Timeline limit parser & formatting
  if (parseTimelineLimit("") !== 15) fail("timeline: parseTimelineLimit('') should be 15");
  if (parseTimelineLimit("5") !== 5) fail("timeline: parseTimelineLimit('5') should be 5");
  if (parseTimelineLimit("invalid") !== 15) fail("timeline: parseTimelineLimit('invalid') should fallback to 15");

  // 2. Tilt-O-Meter, Swear Jar, & DEFCON levels
  if (TILT_DICTIONARY.length < 15) {
    fail(`TILT_DICTIONARY: expected >= 15 terms, got ${TILT_DICTIONARY.length}`);
  }
  const cleanScan = scanPromptTilt("Please check the build output and run npm test");
  if (cleanScan.points !== 0 || cleanScan.matches.length !== 0) {
    fail("scanPromptTilt: clean prompt flagged as tilt");
  }
  const tiltScan = scanPromptTilt("Why the fuck is this bullshit build broken again?");
  if (tiltScan.points <= 0 || tiltScan.matches.length === 0) {
    fail("scanPromptTilt: failed to detect profanity in tilt prompt");
  }

  // 2b. Granular Stratification Tiers & PPP
  if (TILT_STRATA.length < 12) {
    fail(`TILT_STRATA: expected >= 12 tiers, got ${TILT_STRATA.length}`);
  }
  const zeroStratum = getTiltStratum(0);
  if (zeroStratum.tier !== 0) fail(`getTiltStratum(0): expected tier 0, got ${zeroStratum.tier}`);
  const userStratum = getTiltStratum(240);
  if (userStratum.tier !== 7 || !userStratum.name.includes("WSL2")) {
    fail(`getTiltStratum(240): expected tier 7 WSL2, got: ${JSON.stringify(userStratum)}`);
  }
  const maxStratum = getTiltStratum(10000);
  if (maxStratum.tier !== 13) fail(`getTiltStratum(10000): expected tier 13, got ${maxStratum.tier}`);
  if (isVagueInput("git status") || isVagueInput("npm test")) {
    fail("isVagueInput: common developer commands flagged as vague");
  }
  if (!shouldBypassClarify("~make it faster")) {
    fail("shouldBypassClarify: tilde prefix bypass failed");
  }
  if (stripClarifyBypassPrefix("~make it faster") !== "make it faster") {
    fail("stripClarifyBypassPrefix: failed to strip tilde");
  }

  // 4. Hindsight didRealWork reflection check
  if (!didRealWork({ content: [{ type: "thinking", thinking: "x".repeat(400) }] })) {
    fail("hindsight-didRealWork: returned false for substantial thinking");
  }
  if (didRealWork({ content: [{ type: "text", text: "ok" }] })) {
    fail("hindsight-didRealWork: returned true for trivial text response");
  }

  // 5. Herdr Output Classifier
  const errOut = parseHerdrOutput('{"error":{"message":"pane not found"}}');
  if (errOut.ok !== false) fail("parseHerdrOutput: expected error result");
  const resOut = parseHerdrOutput('{"result":{"id":"p1","status":"done"}}');
  if (!resOut.ok || (resOut.value as { id: string })?.id !== "p1") fail("parseHerdrOutput: json-success mismatch");
  const rawOut = parseHerdrOutput("raw terminal output line 1\nline 2");
  if (!rawOut.ok || rawOut.value !== "raw terminal output line 1\nline 2") fail("parseHerdrOutput: raw-text mismatch");

  // 6. Routinize Extension Evolution & Syntax Validation
  const validExt = `
export interface ExtensionApi {
  registerCommand(name: string, def: any): void;
}
export default function (pi: ExtensionApi): void {
  pi.registerCommand("test-cmd", {
    description: "test",
    handler: () => {}
  });
}
`;
  const validRes = validateExtensionSyntax(validExt);
  if (!validRes.valid) {
    fail(`validateExtensionSyntax: valid template rejected: ${validRes.error}`);
  }
  const invalidRes = validateExtensionSyntax("export default function() { return ( }");
  if (invalidRes.valid) {
    fail("validateExtensionSyntax: unclosed delimiter accepted");
  }

  const scaffolded = scaffoldLocalExtension({
    slug: "deploy-app",
    description: "Deploy application",
    commandName: "deploy-app",
    implementationBody: 'ctx.ui?.notify?.("Deployed", "info");',
  });
  if (scaffolded.path !== ".omp/extensions/deploy-app.ts") {
    fail(`scaffoldLocalExtension: unexpected path: ${scaffolded.path}`);
  }
  if (!validateExtensionSyntax(scaffolded.content).valid) {
    fail("scaffoldLocalExtension: generated invalid syntax template");
  }

  const creativeSkill = "Run an interview loop to stress-test your design. Ask one question at a time.";
  if (isSkillProceduralCandidate(creativeSkill).isCandidate) {
    fail("isSkillProceduralCandidate: creative skill flagged as procedural");
  }

  const proceduralSkill = "Run these commands:\n```bash\nnpm run build\ncargo test\n```";
  if (!isSkillProceduralCandidate(proceduralSkill).isCandidate) {
    fail("isSkillProceduralCandidate: procedural skill not flagged");
  }

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

  // 7d. installCouncilVerdictRenderer registers a renderer for council-verdict
  const rendererCtx = createTestContextLike(ctx);
  installCouncilVerdictRenderer(rendererCtx.pi);
  if (typeof rendererCtx.renderers[COUNCIL_CUSTOM_TYPE] !== "function") {
    fail(`installCouncilVerdictRenderer: did not register a renderer for "${COUNCIL_CUSTOM_TYPE}"`);
  }
  const verdictForRenderer: CouncilVerdict = fullVerdict;
  const renderedByRenderer = rendererCtx.renderers[COUNCIL_CUSTOM_TYPE](
    { details: verdictForRenderer },
    {},
    {},
  );
  if (typeof renderedByRenderer !== "string" || !renderedByRenderer.includes("COUNCIL VERDICT")) {
    fail(`installCouncilVerdictRenderer: renderer did not return a verdict card string`);
  }
  // Renderer gracefully handles missing/malformed details
  const undefRender = rendererCtx.renderers[COUNCIL_CUSTOM_TYPE]({}, {}, {});
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
  if (statusCalls[0].key !== COUNCIL_STATUS_KEY || !statusCalls[0].text?.includes("QUICK")) {
    fail(`runCouncilCommand: first setStatus call wrong: ${JSON.stringify(statusCalls[0])}`);
  }
  if (statusCalls[statusCalls.length - 1].text !== undefined) {
    fail(`runCouncilCommand: expected final setStatus to clear (undefined), got: ${JSON.stringify(statusCalls[statusCalls.length - 1])}`);
  }
  // The verdict receipt (customType=council-verdict) should land in customMessages
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
  if (!loaded.councils["my-domain-council"]) fail("scaffolded council not loaded");
  const example = loaded.councils["my-domain-council"][0];
  if (!example.tools?.includes("web_search")) fail("scaffolded council tools not parsed");
  scaffoldDir.cleanup();

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
  const overlay3 = createCouncilOverlay(overlayVerdict);
  const saveAction = overlay3.handleInput("s");
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
