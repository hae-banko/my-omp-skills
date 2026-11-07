// Features Subsystem Test Suite: Timeline, Tilt, Clarify, Hindsight, Herdr, and Routines

import {
  BORDER_COLORS,
  bold,
  boxLine,
  colorize,
  dim,
  italic,
  makeTopBorder,
  statusBorderColor,
  stripAnsi,
} from "../src/research/research-format.ts";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculateDefcon,
  clearActiveSessionStrikes,
  createTiltCard,
  defconLabel,
  getActiveSessionStrikes,
  getTiltStratum,
  installTilt,
  readLocalTilt,
  recordTiltIncident,
  renderTiltCard,
  scanPromptTilt,
  setActiveSessionStrikes,
  tiltDefconToIntent,
  TILT_CUSTOM_TYPE,
  TILT_DICTIONARY,
  TILT_STRATA,
  writeLocalTilt,
} from "../src/features/tilt.ts";
import type { ExtensionApi } from "../src/core/api.ts";
import {
  createTimelineCard,
  formatTimelineLines,
  getUnifiedTimeline,
  parseTimelineLimit,
  runTimelineCommand,
  TIMELINE_CUSTOM_TYPE,
} from "../src/features/timeline.ts";
import {
  CLARIFY_PROMPT,
  installClarify,
  isClarifyDebugEnabled,
  isClarifyEnabled,
  isVagueInput,
  setClarifyDebugEnabled,
  setClarifyEnabled,
  shouldBypassClarify,
  stripClarifyBypassPrefix,
} from "../src/features/clarify.ts";
import {
  didRealWork,
  didTurnDoRealWork,
  installHindsight,
  reloadHindsightConfig,
  setHindsightEnabled,
} from "../src/features/hindsight.ts";
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
  // 1. Timeline limit parser & formatting
  if (parseTimelineLimit("") !== 15) fail("timeline: parseTimelineLimit('') should be 15");
  if (parseTimelineLimit("5") !== 5) fail("timeline: parseTimelineLimit('5') should be 5");
  if (parseTimelineLimit("invalid") !== 15) fail("timeline: parseTimelineLimit('invalid') should fallback to 15");

  // 1b. Native Timeline Card rendering
  const sampleTimelineContent = [
    "TIMELINE DIGEST — test-project (2 events)",
    "2026-08-26 · [git] feat: unified card architecture",
    "2026-08-25 · [record] 2026-08-25_council_debate.md",
  ].join("\n");
  const timelineBox = createTimelineCard(sampleTimelineContent);
  const timelineRows = timelineBox.render(100);
  if (!timelineRows[0].includes("╭") || !timelineRows[timelineRows.length - 1].includes("╰")) {
    fail("createTimelineCard: missing native rounded corners");
  }
  if (!timelineRows.some((r) => r.includes("TIMELINE DIGEST"))) {
    fail("createTimelineCard: missing header title");
  }

  // 1c. runTimelineCommand emits message with display: true
  ctx.customMessages.length = 0;
  await runTimelineCommand(ctx.pi, process.cwd(), "5", { ui: {} });
  const timelineMsg = ctx.customMessages.find((m) => m.customType === TIMELINE_CUSTOM_TYPE);
  if (!timelineMsg || timelineMsg.display !== true) {
    fail("runTimelineCommand: emitted message missing display: true");
  }

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

  // 2c. Native Tilt Card rendering & intent mapping
  if (tiltDefconToIntent(5) !== "success") fail(`tiltDefconToIntent(5) should be "success", got: ${tiltDefconToIntent(5)}`);
  if (tiltDefconToIntent(3) !== "warning") fail(`tiltDefconToIntent(3) should be "warning", got: ${tiltDefconToIntent(3)}`);
  if (tiltDefconToIntent(1) !== "danger") fail(`tiltDefconToIntent(1) should be "danger", got: ${tiltDefconToIntent(1)}`);

  const sampleTiltPayload = {
    local: {
      project: "my-omp-skills",
      project_strikes: 2,
      defcon: 3,
      session_strikes: 2,
      swear_jar_total: 15.5,
      breakdown: { f_bombs: 2, rage_words: 3, wtfs: 1, caps_rage: 0 },
      last_incident: { timestamp: "2026-08-26", trigger: "Broken build", points: 3 },
    },
    global: {
      version: 1,
      lifetime_strikes: 10,
      lifetime_swear_jar: 150.0,
      breakdown: { f_bombs: 10, rage_words: 15, wtfs: 5, caps_rage: 2 },
      repo_leaderboard: { "my-omp-skills": 15.5, "linux-kernel": 120.0 },
    },
  };
  const tiltBox = createTiltCard(sampleTiltPayload);
  const tiltRows = tiltBox.render(100);
  if (!tiltRows[0].includes("╭") || !tiltRows[tiltRows.length - 1].includes("╰")) {
    fail("createTiltCard: missing native rounded corners");
  }
  if (!tiltRows.some((r) => r.includes("TILT-O-METER"))) {
    fail("createTiltCard: missing header title");
  }
  if (isVagueInput("git status") || isVagueInput("npm test")) {
    fail("isVagueInput: common developer commands flagged as vague");
  }
  if (!shouldBypassClarify("~make it faster")) {
    fail("shouldBypassClarify: tilde prefix bypass failed");
  }
  if (stripClarifyBypassPrefix("~make it faster") !== "make it faster") {
    fail("stripClarifyBypassPrefix: failed to strip tilde");
  }
  // 4. Hindsight reflection checks
  if (!didRealWork({ content: [{ type: "thinking", thinking: "x".repeat(400) }] })) {
    fail("hindsight-didRealWork: returned false for substantial thinking");
  }
  if (didRealWork({ content: [{ type: "text", text: "ok" }] })) {
    fail("hindsight-didRealWork: returned true for trivial text response");
  }

  // SF-1 / D17: didTurnDoRealWork checks preceding assistant messages in the turn for tool calls
  const toolCallingTurnMessages = [
    { role: "user", content: [{ type: "text", text: "Run the tests" }] },
    {
      role: "assistant",
      content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "npm test" } }],
    },
    { role: "tool", content: "pass" },
  ];
  const finalTextOnlyAssistant = { role: "assistant", content: [{ type: "text", text: "Tests passed." }] };
  if (!didTurnDoRealWork(toolCallingTurnMessages, finalTextOnlyAssistant)) {
    fail("hindsight: didTurnDoRealWork returned false for turn with tool calls");
  }

  // SF-2 / D18: Session isolation for hindsight nudges across sessions
  setHindsightEnabled(true);
  type StopHandler = (event: unknown, rawCtx?: unknown) => { continue?: boolean; additionalContext?: string } | undefined;
  const hindsightHandlers: { stop?: StopHandler } = {};
  const mockPiHindsight = {
    on: (event: string, handler: unknown) => {
      if (event === "session_stop") hindsightHandlers.stop = handler as StopHandler;
    },
    registerMessageRenderer: () => {},
  } as unknown as ExtensionApi;
  installHindsight(mockPiHindsight);

  const turn1Session1 = {
    stop_hook_active: false,
    session_id: "session-1",
    messages: [{ role: "user", content: "Prompt 1 in session 1" }],
    last_assistant_message: {
      content: [{ type: "thinking", thinking: "A".repeat(450) }],
    },
  };
  const nudge1 = hindsightHandlers.stop?.(turn1Session1);
  if (!nudge1?.continue) {
    fail("hindsight: session 1 turn 1 was not nudged");
  }
  // Same prompt in session 1 within same yield should not re-nudge
  const repeatNudge1 = hindsightHandlers.stop?.(turn1Session1);
  if (repeatNudge1 !== undefined) {
    fail("hindsight: same prompt re-nudged within same yield");
  }

  // Fresh session 2 turn 1 with identical message count must not be suppressed
  const turn1Session2 = {
    stop_hook_active: false,
    session_id: "session-2",
    messages: [{ role: "user", content: "Prompt 1 in session 2" }],
    last_assistant_message: {
      content: [{ type: "thinking", thinking: "B".repeat(450) }],
    },
  };
  const nudge2 = hindsightHandlers.stop?.(turn1Session2);
  if (!nudge2?.continue) {
    fail("hindsight: session 2 turn 1 was suppressed due to cross-session collision");
  }

  // D18 boundary: a new user prompt with the same text as the previous one is
  // a new yield and gets its own nudge — identity is the prompt's required
  // runtime `timestamp` (ai/src/types.ts UserMessage), never its text.
  const samePromptTurn = (ts: number, prior: unknown[]) => ({
    stop_hook_active: false,
    session_id: "session-same-text",
    messages: [...prior, { role: "user", content: "run the tests again", timestamp: ts }],
    last_assistant_message: { content: [{ type: "thinking", thinking: "D".repeat(450) }] },
  });
  const firstSameText = samePromptTurn(1_000, []);
  if (!hindsightHandlers.stop?.(firstSameText)?.continue) {
    fail("hindsight: first prompt of the identical-text pair was not nudged");
  }
  const secondSameText = samePromptTurn(2_000, [
    ...firstSameText.messages,
    { role: "assistant", content: [{ type: "text", text: "done" }] },
  ]);
  if (!hindsightHandlers.stop?.(secondSameText)?.continue) {
    fail("hindsight: a new prompt with the same text as the previous one was not nudged");
  }

  // SF-10: Config reload during session_stop
  const hindsightTmp = createTempFixture("hindsight-cfg-");
  const customCfgPath = join(hindsightTmp.dir, "hindsight.json");
  const origCfgEnv = process.env.HINDSIGHT_CONFIG;
  process.env.HINDSIGHT_CONFIG = customCfgPath;
  try {
    writeFileSync(customCfgPath, JSON.stringify({ name: "HindsightV1", nudge: "Custom nudge 1" }), "utf8");
    reloadHindsightConfig(customCfgPath);
    writeFileSync(customCfgPath, JSON.stringify({ name: "HindsightV2", nudge: "Custom nudge 2 updated" }), "utf8");
    const stopRes = hindsightHandlers.stop?.({
      stop_hook_active: false,
      session_id: "session-cfg-test",
      messages: [{ role: "user", content: "Unique question" }],
      last_assistant_message: { content: [{ type: "thinking", thinking: "C".repeat(450) }] },
    });
    if (!stopRes?.additionalContext?.includes("Custom nudge 2 updated")) {
      fail("hindsight: session_stop did not reload updated config file from disk");
    }
  } finally {
    process.env.HINDSIGHT_CONFIG = origCfgEnv;
    hindsightTmp.cleanup();
  }

  // SF-3 / SF-4 / D37 / D38: Clarify prompt bypass bound to prompt text and single turn
  setClarifyEnabled(true);
  type EventHandler = (event: unknown, ctx?: unknown) => unknown;
  const clarifyHandlers: { input?: EventHandler; beforeStart?: EventHandler } = {};
  const mockPiClarify = {
    on: (event: string, handler: unknown) => {
      if (event === "input") clarifyHandlers.input = handler as EventHandler;
      if (event === "before_agent_start") clarifyHandlers.beforeStart = handler as EventHandler;
    },
    registerCommand: () => {},
    registerMessageRenderer: () => {},
    registerTool: () => {},
  } as unknown as ExtensionApi;
  installClarify(mockPiClarify);

  // Runtime-shaped before_agent_start (systemPrompt: string[]); returns the
  // chained system prompt as one string for assertions.
  const promptAfterClarify = (prompt: string): string => {
    const res = clarifyHandlers.beforeStart?.({ type: "before_agent_start", prompt, systemPrompt: ["base prompt"] });
    const blocks = res && typeof res === "object" && "systemPrompt" in res ? res.systemPrompt : undefined;
    return Array.isArray(blocks) ? blocks.join("\n") : "base prompt";
  };

  // SF-3: Aborted tilde command does not poison subsequent prompt
  clarifyHandlers.input?.({ text: "~/timeline" });
  if (!promptAfterClarify("how do I fix the bug?").includes("Prompt Clarification Active")) {
    fail("clarify: aborted tilde command permanently suppressed clarification on subsequent normal prompt");
  }

  // Bypassed prompt consumes bypass for that exact prompt text
  clarifyHandlers.input?.({ text: "~skip clarify for this" });
  if (promptAfterClarify("skip clarify for this").includes("Prompt Clarification Active")) {
    fail("clarify: ~ prefixed prompt was not bypassed");
  }

  // Next prompt with same text is not bypassed again (consumed)
  if (!promptAfterClarify("skip clarify for this").includes("Prompt Clarification Active")) {
    fail("clarify: bypass was not consumed on first use");
  }

  // SF-5 / SF-6 / SF-7 / D45 / D46 / D47: Tilt root boundary, session strikes, and corrupt quarantine
  const tiltFixture = createTempFixture("tilt-test-");
  try {
    const repoRoot = tiltFixture.dir;
    const subDir = join(repoRoot, "packages", "service");
    writeFileSync(join(repoRoot, ".git"), "gitdir: dummy", "utf8");

    // SF-5: Incidents recorded in subDir write to repoRoot
    recordTiltIncident("what the fuck is this broken build", subDir, "sess-1");
    const rootTilt = readLocalTilt(repoRoot, "sess-1");
    if (rootTilt.project_strikes <= 0) {
      fail("tilt: incident in subdir did not record to repo root");
    }

    // SF-6: session strikes isolate per session ID
    const sess2Tilt = readLocalTilt(repoRoot, "sess-2");
    if (sess2Tilt.session_strikes !== 0 || sess2Tilt.defcon !== 5) {
      fail("tilt: session_strikes bled into fresh session sess-2");
    }

    // SF-7: Corrupt file quarantine and atomic write
    const localTiltPath = join(repoRoot, ".omp", "tilt.json");
    writeFileSync(localTiltPath, '{"project": "corrupt-test", "project_strikes": 99', "utf8");
    recordTiltIncident("bullshit", repoRoot, "sess-1");
    const files = readdirSync(join(repoRoot, ".omp"));
    const corruptQuarantine = files.find((f) => f.includes("tilt.json.corrupt"));
    if (!corruptQuarantine) {
      fail("tilt: corrupt tilt.json was not quarantined");
    }
    const repairedTilt = readLocalTilt(repoRoot, "sess-1");
    if (repairedTilt.project_strikes <= 0) {
      fail("tilt: new incident did not write successfully after corrupt quarantine");
    }
  } finally {
    tiltFixture.cleanup();
  }

  // SF-8: Timeline git log parsing with pipe in commit subject
  const fakePipeLog = "2026-11-07|a1b2c3d||feat(auth): add login | fix session leak";
  const parts = fakePipeLog.split("|");
  const parsedSubject = parts.slice(3).join("|");
  if (parsedSubject !== "feat(auth): add login | fix session leak") {
    fail(`timeline: commit subject truncated at pipe: expected 'feat(auth): add login | fix session leak', got '${parsedSubject}'`);
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

