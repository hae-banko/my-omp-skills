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
}
