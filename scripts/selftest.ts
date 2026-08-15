// Selftest for the my-omp-skills extension entry point.
//
// Imports the extension with a mock `pi`, then asserts:
// 1. Every command registers with a description and a non-empty workflow body,
//    companions disclosed, args passed through, frontmatter stripped.
// 2. The session bootstrap injects exactly once per session (session_start →
//    context → dedup → agent_end clears it), after leading compaction summaries.
// 3. The tool_call policy blocks rewrites of the append-only knowledge base
//    while letting new files, research working files, and INDEX.md appends pass.
// 4. The kb-guard-status widget surfaces block count via setStatus and
//    shadows/un-shadows the status bar based on .omp/knowledge presence.
//
// Run: bun run scripts/selftest.ts

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bundled via esbuild alias to scripts/stubs/pi-tui.ts; the real module is
// served at runtime by the omp binary.
import { Container as TuiContainer } from "@oh-my-pi/pi-tui";

// Real zod. The extension authors its tool parameter schemas through the
// `pi.zod` slot at module load (see src/{knowledge-tool,herdr-tools,routines}.ts),
// so the mock slot is the real `z` — the chains the extension builds run
// against the actual runtime, not a hand-rolled fake. The extension only
// uses object/enum/string/record/number().int().min().max()/boolean with
// `.optional()`/`.default()`, which real zod v4 implements.
import { z } from "zod";

import extension from "../src/index.ts";
import { __resetBootstrapForTests } from "../src/core/bootstrap.ts";
// parseHerdrOutput is a PURE parser with no registered seam of its own (the
// herdr tools themselves are the registered surface, gated below), so the
// harness imports it directly — the one deliberate direct import left in.
import { parseHerdrOutput } from "../src/features/herdr-tools.ts";
import type { ExtensionApi, ToolResult } from "../src/core/api.ts";
import {
  __setStatusFnForTests,
  formatStatusText,
  getBlockCount,
  getBlockDetails,
  installKbGuardStatus,
  recordBlock,
  resetSession,
  STATUS_KEY,
  type KbBlockDetail,
} from "../src/knowledge/kb-guard-status.ts";
import { didRealWork, isHindsightEnabled, reloadHindsightConfig } from "../src/features/hindsight.ts";
import {
  formatIndexSection,
  installKbIndexInjector,
  SECTION_MARKER,
  systemPromptHasSection,
} from "../src/knowledge/kb-index-injector.ts";
import { getPitfallCount, getRecordCount, recordIngest, resetSession as resetKbIngestSession } from "../src/knowledge/kb-ingest-status.ts";
import { DEFAULT_LIMIT, isRecentArgs, MAX_LIMIT, parseRecentCount, runRecentCommand } from "../src/features/recent-command.ts";
import { findKnowledgeRoot, findRelevantKnowledge, readKnowledge } from "../src/knowledge/knowledge.ts";
import { formatTimelineLines, getUnifiedTimeline, parseTimelineLimit, runTimelineCommand, TIMELINE_CUSTOM_TYPE } from "../src/features/timeline.ts";
import { extractDiscoveredReferences } from "../src/research/research-store.ts";
import {
  ensureKnowledgeDirs,
  ensureRoutinesDirs,
  ensureScratchDirs,
  findFrontierTicket,
  findRepoRoot,
  listAdrFiles,
  resolveAdrDir,
} from "../src/core/locators.ts";
import {
  generateSubagentFileContract,
  parseFileContract,
} from "../src/features/subagent-contract.ts";
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
  renderResearchDashboardCard,
  type ResearchReviewPayload,
  type ResearchWaveProgressPayload,
  type ResearchReportPreviewPayload,
  type ResearchDashboardPayload,
  type ResearchHelpPayload,
} from "../src/research/research-renderer.ts";
import {
  installAuditCardRenderer,
  installTicketBreakdownRenderer,
  installTriageStatusRenderer,
  type AuditCardPayload,
  type AuditSubtopicSpec,
  type TicketBreakdownPayload,
  type TriageStatusPayload,
} from "../src/features/telemetry-renderer.ts";
import {
  calculateDefcon,
  defconLabel,
  readLocalTilt,
  recordTiltIncident,
  renderTiltCard,
  scanPromptTilt,
  TILT_CUSTOM_TYPE,
  TILT_DICTIONARY,
  writeLocalTilt,
} from "../src/features/tilt.ts";
import {
  findRoutinesRepoRoot,
  graduateSkillToExtension,
  isSkillProceduralCandidate,
  scaffoldLocalExtension,
  validateExtensionSyntax,
} from "../src/features/routines.ts";
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
  archiveResearchProject,
  extractFindingsPreview,
  getResearchDashboardMetrics,
  listResearchSummaries,
  readExecutionBlock,
  readFieldNames,
  readOutlineItems,
  readOutlineItemSpecs,
  removeResearchProject,
  unarchiveResearchProject,
} from "../src/research/research-store.ts";
import {
  listArchivedResearchProjects,
  listResearchProjects,
  safeResearchTarget,
} from "../src/core/locators.ts";
import {
  buildResearchDag,
  canonicalResultPath,
  computeEpistemicNodeHash,
  formatUpstreamContextPrompt,
  getReadyDagNodes,
  getUpstreamEvidence,
  ingestIapEnvelope,
  slugifyItemId,
  synthesizeEnvelopesForDag,
} from "../src/research/research-dag.ts";
import {
  buildEnvelope,
  computeSha256,
  isPointerEnvelope,
  parseEnvelope,
  resolveEnvelopePayload,
  validateEnvelope,
  IAP_PROTOCOL_VERSION,
} from "../src/protocol/iap.ts";
import {
  extractEnvelopesFromHubInbox,
  serializeEnvelopeForHub,
  synthesizeBlockedEnvelope,
  synthesizeCompletedEnvelope,
  synthesizeFailedEnvelope,
} from "../src/protocol/iap-hub.ts";
interface HandlerContext {
  ui?: {
    notify?(message: string, level?: string): void;
  };
}

interface RegisteredCommand {
  description: string;
  getArgumentCompletions?: (argumentPrefix: string) => Array<{
    value: string;
    label: string;
    description?: string;
  }> | null;
  handler: (args: string, ctx: HandlerContext) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  description: string;
  parameters?: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd: string; hasUI?: boolean; ui?: unknown; abort?: () => void },
  ): Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
  renderCall?: (
    args: Record<string, unknown>,
    options: { expanded: boolean },
    theme: unknown,
  ) => unknown;
  renderResult?: (
    result: { content: Array<{ type: string; text: string }>; details?: unknown },
    options: { expanded: boolean },
    theme: unknown,
    args?: Record<string, unknown>,
  ) => unknown;
}

const EXPECTED: Record<string, { companions?: number; silent?: boolean }> = {
  "ask-me": {},
  "grill-me": {},
  "grill-with-docs": {},
  hindsight: { silent: true },
  clarify: { silent: true },
  math: {},
  audit: { companions: 1 },
  triage: { companions: 2 },
  "improve-codebase-architecture": { companions: 1 },
  "omp-setup": { companions: 5 },
  "to-spec": {},
  "to-tickets": {},
  implement: {},
  wayfinder: {},
  "omp-handoff": {},
  "plugin-issue": {},
  // /reference is a LOCAL command (runs git itself, never queues a user
  // message) — the generic "clean user prompt" loop must skip it, exactly
  // like /hindsight. Its silence + card emission are asserted in the
  // dedicated reference block below.
  reference: { silent: true },
  timeline: { silent: true },
  tilt: { silent: true },
  record: { companions: 1 },
  pitfall: { companions: 1 },
  routinize: { companions: 2 },
  research: { companions: 7 },
  "research-add-items": { companions: 1 },
  "research-add-fields": { companions: 1 },
  "research-deep": { companions: 7 },
  "research-report": { companions: 1 },
  teach: { companions: 4 },
  "writing-great-skills": { companions: 1 },
};

let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};

const registered: Record<string, RegisteredCommand> = {};
const sent: string[] = [];
const customMessages: Array<Record<string, unknown>> = [];
const handlers: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
const eventListeners: Record<string, Array<(event: unknown, ctx?: unknown) => unknown>> = {};
const tools: RegisteredTool[] = [];
const renderers: Record<string, (message: unknown, options: unknown, theme: unknown) => unknown> = {};
/**
 * Children text lines of a stub Container (the pi-tui stub exposes `.text`
 * on each Text child). Renderer unit checks invoke the REGISTERED renderer
 * (renderers[customType]) and assert on these lines. Accepts `unknown` and
 * narrows via instanceof so callers never cast the seam's return value.
 */
const collectLines = (container: unknown): string[] => {
  if (!(container instanceof TuiContainer)) return [];
  return (container.children ?? []).map((c) => {
    if (c && typeof c === "object" && "text" in c) {
      return String(c.text ?? "");
    }
    return "";
  });
};

const mockPi = {
  registerCommand(
    name: string,
    def: { description: string; handler: RegisteredCommand["handler"]; getArgumentCompletions?: RegisteredCommand["getArgumentCompletions"] },
  ): void {
    registered[name] = def;
  },
  async sendUserMessage(content: string): Promise<void> {
    sent.push(content);
  },
  sendMessage(message: Record<string, unknown>): void {
    customMessages.push(message);
  },
  on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
    if (event === "input") {
      if (!eventListeners["input"]) eventListeners["input"] = [];
      eventListeners["input"].push(handler);
      handlers["input"] = (evt: unknown, ctx?: unknown) => {
        let lastResult: unknown = undefined;
        for (const listener of eventListeners["input"]) {
          const res = listener(evt, ctx);
          if (res !== undefined && res !== null) {
            if (
              typeof res === "object" &&
              "action" in (res as Record<string, unknown>) &&
              (res as Record<string, unknown>).action !== "continue"
            ) {
              return res;
            }
            lastResult = res;
          }
        }
        return lastResult ?? { action: "continue" };
      };
      return;
    }
    handlers[event] = handler;
  },
  registerTool(def: RegisteredTool): void {
    tools.push(def);
  },
  registerMessageRenderer(
    customType: string,
    renderer: (message: unknown, options: unknown, theme: unknown) => unknown,
  ): void {
    renderers[customType] = renderer;
  },
  // Real zod (see the import comment above). The extension's chain surface is
  // a structural subset of real z, so this slot passes the real runtime.
  zod: z,
};

extension(mockPi);

// --- Commands (unchanged surface) -----------------------------------------

// 1. Every expected command registered, and no extras.
for (const name of Object.keys(EXPECTED)) {
  if (!registered[name]) fail(`command not registered: ${name}`);
}
const extras = Object.keys(registered).filter((n) => !(n in EXPECTED));
if (extras.length > 0) fail(`unexpected commands registered: ${extras.join(", ")}`);
console.log(`registered: ${Object.keys(registered).sort().join(", ")}`);

// 2. Every command has a description, injects a hidden workflow body, and sends a clean user prompt.
for (const name of Object.keys(registered)) {
  const def = registered[name];
  if (!def.description) fail(`${name}: missing description`);
  // Silent commands (e.g. /hindsight toggle) intentionally send no user
  // message — the model must not reply. They are checked for silence below.
  if (EXPECTED[name]?.silent) continue;
  sent.length = 0;
  customMessages.length = 0;
  await def.handler("", {});
  const userPrompt = sent[0] ?? "";
  if (userPrompt !== `/${name}`) fail(`${name}: expected clean user prompt "/${name}", got "${userPrompt}"`);
  const hiddenMsg = customMessages.find((m) => m.display === false);
  const injected = (hiddenMsg?.content as string) ?? "";
  if (injected.length === 0) fail(`${name}: empty injected workflow body in custom message`);
  const expectedCompanions = EXPECTED[name]?.companions ?? 0;
  const hasPointer = injected.includes("Companion reference files");
  if (expectedCompanions > 0 && !hasPointer) fail(`${name}: companion pointer missing`);
  if (expectedCompanions === 0 && hasPointer) fail(`${name}: unexpected companion pointer`);
}

// 3. Argument passthrough: args land in the hidden workflow body and visible user prompt.
sent.length = 0;
customMessages.length = 0;
await registered["omp-handoff"].handler("finish the auth flow", {});
if (!sent[0]?.includes("/omp-handoff finish the auth flow")) fail("omp-handoff: args not in visible prompt");
const handoffHidden = customMessages.find((m) => m.display === false);
if (!((handoffHidden?.content as string) ?? "").includes("finish the auth flow")) {
  fail("omp-handoff: args not injected into hidden workflow body");
}

// 4. No command body is a frontmatter-stripping casualty.
for (const name of Object.keys(registered)) {
  customMessages.length = 0;
  await registered[name].handler("", {});
  const hiddenMsg = customMessages.find((m) => m.display === false);
  const injected = (hiddenMsg?.content as string) ?? "";
  if (injected.startsWith("---")) fail(`${name}: frontmatter not stripped`);
}

// --- Bootstrap -------------------------------------------------------------

const baseMessages: unknown[] = [
  { role: "compactionSummary", content: [{ type: "text", text: "compacted" }] },
  { role: "user", content: [{ type: "text", text: "hello" }] },
];

/** Extract the messages array from a context-handler result, or null. */
function asMessagesResult(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object" || !("messages" in value)) return null;
  return Array.isArray(value.messages) ? value.messages : null;
}

/** Extract the text of the first text block of a message, or "". */
function textOfMessage(message: unknown): string {
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content: unknown = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) return "";
  const first = content[0];
  if (!first || typeof first !== "object" || !("text" in first)) return "";
  return typeof first.text === "string" ? first.text : "";
}

__resetBootstrapForTests();
await handlers["session_start"]({});
const injected = asMessagesResult(await handlers["context"]({ messages: baseMessages }));
if (!injected || injected.length !== 3) {
  fail("bootstrap: context handler did not return 3 messages");
} else {
  const first = injected[0];
  if (!first || typeof first !== "object" || !("role" in first) || first.role !== "compactionSummary") {
    fail("bootstrap: compaction summary not preserved at index 0");
  }
  const bootText = textOfMessage(injected[1]);
  if (!bootText.includes("my-omp-skills:available-commands")) {
    fail("bootstrap: injected message missing marker");
  }
  if (!bootText.includes("/record") || !bootText.includes("/pitfall")) {
    fail("bootstrap: injected message does not list commands");
  }
  if (injected[2] !== baseMessages[1]) {
    fail("bootstrap: original user message not preserved");
  }
}

// Dedup: same messages again → no second injection.
const second = await handlers["context"]({ messages: injected ?? baseMessages });
if (second !== undefined) fail("bootstrap: injected twice in one session");

// agent_end clears the flag.
await handlers["agent_end"]({});
const afterEnd = await handlers["context"]({ messages: baseMessages });
if (afterEnd !== undefined) fail("bootstrap: injected after agent_end");

// Issue #7 — subagent leak guard. After an agent_end has fired, a follow-on
// session_start (e.g. a `task` subagent dispatched by the main loop) MUST
// NOT re-arm the bootstrap. The main session already received its
// bootstrap before it ended; injecting again would burn tokens in the
// subagent transcript and pollute it with instructions the subagent will
// never act on. session_compact must also stay disarmed (still subagent-
// shaped; main session already injected).
await handlers["session_start"]({});
const subagentContext = await handlers["context"]({ messages: baseMessages });
if (subagentContext !== undefined) {
  fail("bootstrap: re-armed on session_start after agent_end (subagent leak)");
}
await handlers["session_compact"]({});
const subagentAfterCompact = await handlers["context"]({ messages: baseMessages });
if (subagentAfterCompact !== undefined) {
  fail("bootstrap: re-armed on session_compact after agent_end (subagent leak)");
}

// After the test seam resets the module state, a fresh main session is
// simulated: session_start should re-arm injection and the next context
// event should inject the bootstrap into a transcript that doesn't yet
// contain it.
__resetBootstrapForTests();
await handlers["session_start"]({});
const postReset = asMessagesResult(await handlers["context"]({ messages: baseMessages }));
if (!postReset || postReset.length !== 3) {
  fail("bootstrap: post-reset session_start + context did not inject (3 messages expected)");
} else {
  const bootText = textOfMessage(postReset[1]);
  if (!bootText.includes("my-omp-skills:available-commands")) {
    fail("bootstrap: post-reset injection missing marker");
  }
}


// --- kb-guard-status widget ------------------------------------------------
resetSession();
if (getBlockCount() !== 0) fail(`kb-guard-status: post-reset count=${getBlockCount()}, expected 0`);
if (getBlockDetails().length !== 0) fail(`kb-guard-status: post-reset details=${getBlockDetails().length}, expected 0`);

recordBlock("edit", ".omp/knowledge/records/foo.md", "knowledge");
if (getBlockCount() !== 1) fail(`kb-guard-status: count after 1 recordBlock=${getBlockCount()}, expected 1`);
const d1 = getBlockDetails();
if (d1.length !== 1) fail(`kb-guard-status: details after 1 recordBlock=${d1.length}, expected 1`);
else {
  const blk = d1[0] as KbBlockDetail;
  if (blk.tool !== "edit" || blk.path !== ".omp/knowledge/records/foo.md" || blk.reason !== "knowledge") {
    fail(`kb-guard-status: detail shape wrong: ${JSON.stringify(blk)}`);
  }
  if (typeof blk.ts !== "number" || blk.ts <= 0) fail(`kb-guard-status: detail ts not numeric: ${blk.ts}`);
}

recordBlock("write", ".omp/knowledge/INDEX.md", "knowledge");
recordBlock("bash", "<bash>", "audit");
if (getBlockCount() !== 3) fail(`kb-guard-status: count after 3 recordBlock=${getBlockCount()}, expected 3`);
if (getBlockDetails().length !== 3) fail(`kb-guard-status: details after 3 recordBlock=${getBlockDetails().length}, expected 3`);

// 10 recordBlocks: count is uncapped, detail ring retains last 8.
for (let i = 0; i < 7; i += 1) recordBlock("edit", `.omp/knowledge/records/extra${i}.md`, "knowledge");
if (getBlockCount() !== 10) fail(`kb-guard-status: count after 10 recordBlock=${getBlockCount()}, expected 10`);
const finalDetails = getBlockDetails();
if (finalDetails.length !== 8) fail(`kb-guard-status: details cap=8, observed length=${finalDetails.length}`);
// FIFO ring keeps the most recent 8. Push order: foo, INDEX, bash, extra0..extra6.
// Oldest retained = bash (3rd push, index 2). Newest retained = extra6 (10th push).
const oldestRetained = finalDetails[0] as KbBlockDetail;
const newestRetained = finalDetails[finalDetails.length - 1] as KbBlockDetail;
if (oldestRetained.tool !== "bash" || oldestRetained.path !== "<bash>") {
  fail(`kb-guard-status: ring buffer oldest should be '<bash>', observed=${JSON.stringify(oldestRetained)}`);
}
if (newestRetained.path !== ".omp/knowledge/records/extra6.md") {
  fail(`kb-guard-status: ring buffer newest should be extra6.md, observed=${newestRetained.path}`);
}

resetSession();
if (getBlockCount() !== 0) fail(`kb-guard-status: resetSession count=${getBlockCount()}, expected 0`);
if (getBlockDetails().length !== 0) fail(`kb-guard-status: resetSession details=${getBlockDetails().length}, expected 0`);

if (formatStatusText(null) !== undefined) {
  fail("kb-guard-status: formatStatusText(null) returned non-undefined");
}
const noKbDir = mkdtempSync(join(tmpdir(), "my-omp-kb-status-"));
if (formatStatusText(noKbDir) !== undefined) {
  fail("kb-guard-status: formatStatusText(dir-without-kb) returned non-undefined");
}
rmSync(noKbDir, { recursive: true, force: true });

const kbDir = mkdtempSync(join(tmpdir(), "my-omp-kb-status-"));
mkdirSync(join(kbDir, ".omp", "knowledge"), { recursive: true });
resetSession();
const t0 = formatStatusText(kbDir);
if (t0 !== "KB append-only · 0 blocks") {
  fail(`kb-guard-status: formatStatusText(kbDir) with 0 blocks = ${JSON.stringify(t0)}`);
}
recordBlock("edit", "x", "knowledge");
recordBlock("edit", "y", "knowledge");
const t2 = formatStatusText(kbDir);
if (t2 !== "KB append-only · 2 blocks") {
  fail(`kb-guard-status: formatStatusText(kbDir) with 2 blocks = ${JSON.stringify(t2)}`);
}
resetSession();
recordBlock("edit", "z", "knowledge");
const t1 = formatStatusText(kbDir);
if (t1 !== "KB append-only · 1 block") {
  fail(`kb-guard-status: formatStatusText(kbDir) with 1 block = ${JSON.stringify(t1)}`);
}
// Keep kbDir alive — subscription tests below reuse it for the .omp/knowledge subdir.

// installKbGuardStatus: registers session_start (caches cwd, resetSession,
// render) and agent_end (re-render). Fresh mock so the shared
// handlers["session_start"] slot used by bootstrap tests above doesn't
// shadow these assertions.
const kbGuardStatusCalls: Array<[string, string | undefined]> = [];
const kbMockHandlers: Record<string, (event: unknown) => unknown> = {};
const kbMock = {
  registerCommand(): void {},
  sendUserMessage: async (): Promise<void> => {},
  sendMessage(): void {},
  registerTool(): void {},
  registerMessageRenderer(): void {},
  zod: z,
  on(event: string, handler: (event: unknown) => unknown): void {
    kbMockHandlers[event] = handler;
  },
};
const captureSetStatus = (key: string, text: string | undefined): void => {
  kbGuardStatusCalls.push([key, text]);
};
__setStatusFnForTests(captureSetStatus);
installKbGuardStatus(kbMock as unknown as ExtensionApi);
if (STATUS_KEY !== "kb-guardrail") {
  fail(`kb-guard-status: STATUS_KEY=${STATUS_KEY}, expected 'kb-guardrail'`);
}
resetSession();
kbGuardStatusCalls.length = 0;

const startHandler = kbMockHandlers["session_start"];
const endHandler = kbMockHandlers["agent_end"];
if (typeof startHandler !== "function" || typeof endHandler !== "function") {
  fail("kb-guard-status: installKbGuardStatus did not register session_start/agent_end");
} else {
  // session_start with dir lacking .omp/knowledge → setStatus(undefined).
  const kbnoneDir = mkdtempSync(join(tmpdir(), "my-omp-kb-status-"));
  startHandler({ cwd: kbnoneDir });
  const lastNoKb = kbGuardStatusCalls[kbGuardStatusCalls.length - 1] as [string, string | undefined] | undefined;
  if (!lastNoKb) fail("kb-guard-status: session_start did not trigger setStatus");
  else if (lastNoKb[0] !== STATUS_KEY) fail(`kb-guard-status: setStatus key=${lastNoKb[0]}, expected ${STATUS_KEY}`);
  else if (lastNoKb[1] !== undefined) {
    fail(`kb-guard-status: setStatus on dir-without-kb = ${JSON.stringify(lastNoKb[1])}, expected undefined`);
  }
  rmSync(kbnoneDir, { recursive: true, force: true });

  // session_start with kbDir → KB present → setStatus renders text.
  startHandler({ cwd: kbDir });
  const lastKb = kbGuardStatusCalls[kbGuardStatusCalls.length - 1] as [string, string | undefined] | undefined;
  if (!lastKb) fail("kb-guard-status: session_start with KB did not trigger setStatus");
  else if (lastKb[1] !== "KB append-only · 0 blocks") {
    fail(`kb-guard-status: setStatus on KB dir = ${JSON.stringify(lastKb[1])}`);
  }

  // agent_end triggers re-render so late recordBlock() hits the bar.
  const callsBeforeEnd = kbGuardStatusCalls.length;
  endHandler({});
  if (kbGuardStatusCalls.length <= callsBeforeEnd) {
    fail("kb-guard-status: agent_end did not re-render");
  }
}
__setStatusFnForTests(undefined);
rmSync(kbDir, { recursive: true, force: true });

// --- Policy: append-only knowledge base ------------------------------------

const fixtureRoot = mkdtempSync(join(tmpdir(), "my-omp-skills-test-"));
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "records"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "pitfalls"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-08-01_demo"), {
  recursive: true,
});
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-31_has-report"), { recursive: true });
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-31_has-report", "research.md"),
  "---\ntopic: Has Report Topic\nstatus: REPORT_READY\ncounts:\n  items: 2\n  fields: 4\n---\n",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-31_has-report", "report.md"),
  "# Research Report Content\nDetailed research conclusions.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-31_has-report", "outline.yaml"),
  "topic: Has Report Topic\nitems:\n  - name: item 1\n  - name: item 2\n",
);

mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-30_no-report"), { recursive: true });
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-30_no-report", "research.md"),
  "---\ntopic: No Report Topic\nstatus: OUTLINE\ncounts:\n  items: 3\n  fields: 6\n---\n",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-30_no-report", "outline.yaml"),
  "topic: No Report Topic\nitems:\n  - name: item A\n  - name: item B\n  - name: item C\n",
);
mkdirSync(join(fixtureRoot, ".omp", "audits", "demo-audit", "archive"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "audits", "complex-audit", "subtopics"), { recursive: true });
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-03_dtcm.md"),
  "---\ntitle: DTCM\n---\nfound it",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "pitfalls", "2026-08-01_dma.md"),
  "---\ntitle: DMA DTCM Transfer Bug\ntags: [dma, dtcm]\n---\nGPDMA cannot access DTCM memory buffers on STM32.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "INDEX.md"),
  "- 2026-08-03 DTCM — .omp/knowledge/records/2026-08-03_dtcm.md\n- 2026-08-01 DMA — .omp/knowledge/pitfalls/2026-08-01_dma.md\n",
);
mkdirSync(join(fixtureRoot, ".scratch", "my-feature", "issues"), { recursive: true });
writeFileSync(
  join(fixtureRoot, ".scratch", "my-feature", "issues", "001-setup.md"),
  "---\ntitle: Setup database schema\nstatus: resolved\n---\nDone setting up database schema.",
);
writeFileSync(
  join(fixtureRoot, ".scratch", "my-feature", "issues", "002-api.md"),
  "---\ntitle: Implement REST API endpoints\nstatus: open\nblocked_by: [001-setup]\n---\nImplement REST API.",
);
writeFileSync(
  join(fixtureRoot, ".scratch", "my-feature", "issues", "003-ui.md"),
  "---\ntitle: Build Web UI\nstatus: open\nblocked_by: [002-api]\n---\nBuild frontend UI components.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "audits", "demo-audit", "report.md"),
  "---\ntitle: Demo Audit Report\nslug: demo-audit\nversion: v0.1.0\nstatus: active\n---\n## Executive Summary\nSummary here.\n## Revision History\n- **v0.1.0**: Initial report.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "audits", "demo-audit", "archive", "v0.1.0.md"),
  "---\nversion: v0.1.0\n---\nSnapshot",
);
writeFileSync(
  join(fixtureRoot, ".omp", "audits", "complex-audit", "overview.md"),
  "---\ntitle: Complex Audit Overview\nslug: complex-audit\nversion: v0.1.0\nstatus: active\n---\n## Executive Summary\nOverview of complex audit.\n## Subtopics & Detailed Reports\n- [Frontend Subtopic](./subtopics/frontend.md)\n- [Backend Subtopic](./backend.md)\n## Revision History\n- **v0.1.0**: Initial report.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "audits", "complex-audit", "subtopics", "frontend.md"),
  "---\ntitle: Frontend Subtopic\n---\nDetailed frontend findings.",
);
writeFileSync(
  join(fixtureRoot, ".omp", "audits", "complex-audit", "backend.md"),
  "---\ntitle: Backend Subtopic\n---\nDetailed backend findings.",
);

const toolCall = (toolName: string, input: Record<string, unknown>) =>
  handlers["tool_call"]({ toolName, input }, { cwd: fixtureRoot });

const isBlocked = (result: unknown): boolean =>
  !!result && typeof result === "object" && "block" in result && result.block === true;

const cases: Array<[string, string, Record<string, unknown>, boolean]> = [
  ["edit record", "edit", { path: ".omp/knowledge/records/2026-08-03_dtcm.md", old_string: "a", new_string: "b" }, true],
  ["edit pitfall", "edit", { path: ".omp/knowledge/pitfalls/2026-08-02_oops.md", old_string: "a", new_string: "b" }, true],
  ["edit INDEX", "edit", { path: ".omp/knowledge/INDEX.md", old_string: "a", new_string: "b" }, true],
  ["edit research outline", "edit", { path: ".omp/knowledge/research/2026-08-01_demo/outline.yaml", old_string: "a", new_string: "b" }, false],
  ["write new record", "write", { path: ".omp/knowledge/records/2026-08-04_new.md", content: "new" }, false],
  ["overwrite record", "write", { path: ".omp/knowledge/records/2026-08-03_dtcm.md", content: "changed" }, true],
  ["bash append INDEX", "bash", { command: "echo '- 2026-08-04 New — .omp/knowledge/records/2026-08-04_new.md' >> .omp/knowledge/INDEX.md" }, false],
  ["bash sed record", "bash", { command: "sed -i 's/a/b/' .omp/knowledge/records/2026-08-03_dtcm.md" }, true],
  ["bash rm record", "bash", { command: "rm .omp/knowledge/records/2026-08-03_dtcm.md" }, true],
  ["edit outside KB", "edit", { path: "src/index.ts", old_string: "a", new_string: "b" }, false],
  ["audit: write new report", "write", { path: ".omp/audits/new-audit/report.md", content: "---\nversion: v0.1.0\n---" }, false],
  ["audit: write existing report without version bump", "write", { path: ".omp/audits/demo-audit/report.md", content: "---\nversion: v0.1.0\n---\n## Revision History" }, true],
  ["audit: write existing report without revision history", "write", { path: ".omp/audits/demo-audit/report.md", content: "---\nversion: v0.2.0\n---" }, true],
  ["audit: controlled write update", "write", { path: ".omp/audits/demo-audit/report.md", content: "---\nversion: v0.2.0\n---\n## Revision History\n- **v0.2.0**: updated" }, false],
  ["audit: write existing archive file", "write", { path: ".omp/audits/demo-audit/archive/v0.1.0.md", content: "new snapshot" }, true],
  ["audit: edit existing report without version bump", "edit", { path: ".omp/audits/demo-audit/report.md", input: "PUT 1:\n+no version bump" }, true],
  ["audit: controlled edit update", "edit", { path: ".omp/audits/demo-audit/report.md", input: "PUT 1:\n+version: v0.1.1\n+## Revision History\n+- **v0.1.1**: patch update" }, false],
  ["audit: write existing overview.md without version bump", "write", { path: ".omp/audits/complex-audit/overview.md", content: "---\nversion: v0.1.0\n---\n## Revision History" }, true],
  ["audit: controlled write overview.md update", "write", { path: ".omp/audits/complex-audit/overview.md", content: "---\nversion: v0.2.0\n---\n## Revision History\n- **v0.2.0**: updated" }, false],
  ["audit: controlled edit subtopic file", "edit", { path: ".omp/audits/complex-audit/subtopics/frontend.md", input: "PUT 1:\n+version: v0.1.1\n+## Revision History\n+- **v0.1.1**: patch" }, false],
  ["audit: bash rm audit dir", "bash", { command: "rm -rf .omp/audits/demo-audit" }, true],
  ["edit record via input header", "edit", { input: "[.omp/knowledge/records/2026-08-03_dtcm.md#A1B2]\nPUT 1.=1:\n+hacked" }, true],
  ["edit pitfall via input header", "edit", { input: "[.omp/knowledge/pitfalls/2026-08-02_oops.md#C3D4]\nPUT 1.=1:\n+hacked" }, true],
  ["edit INDEX via input header", "edit", { input: "[.omp/knowledge/INDEX.md#E5F6]\nPUT 1.=1:\n+hacked" }, true],
  ["edit audit via input header", "edit", { input: "[.omp/audits/demo-audit/report.md#1234]\nPUT 1:\n+no version bump" }, true],
  ["bash python -c rm record", "bash", { command: "python3 -c \"import os; os.remove('.omp/knowledge/records/2026-08-03_dtcm.md')\"" }, true],
  ["bash node -e unlink record", "bash", { command: "node -e \"fs.unlinkSync('.omp/knowledge/records/2026-08-03_dtcm.md')\"" }, true],
  ["bash git rm record", "bash", { command: "git rm .omp/knowledge/records/2026-08-03_dtcm.md" }, true],
  ["bash find delete record", "bash", { command: "find .omp/knowledge/records -name '*.md' -delete" }, true],
  ["bash rm double slash record", "bash", { command: "rm .omp//knowledge/records/2026-08-03_dtcm.md" }, true],
  ["bash rm dot slash record", "bash", { command: "rm .omp/knowledge/./records/2026-08-03_dtcm.md" }, true],
];

for (const [label, toolName, input, expectBlock] of cases) {
  const result = await toolCall(toolName, input);
  const blocked = isBlocked(result);
  if (blocked !== expectBlock) {
    fail(`policy: ${label} → blocked=${blocked}, expected ${expectBlock}`);
  }
}
// Integration: policy.ts blocks record into the kb-guard-status counter.
const expectedBlocks = cases.filter((c) => c[3] === true).length;
if (getBlockCount() !== expectedBlocks) {
  fail(`policy: kb-guard-status count=${getBlockCount()}, expected ${expectedBlocks} from policy cases`);
}

// --- knowledge_read tool + renderers + receipts -----------------------------

// The tool's details field is our own shape ({found, type, count, paths}).
function isFoundDetails(details: unknown): boolean | undefined {
  if (!details || typeof details !== "object") return undefined;
  const d = details as { found?: boolean };
  return d.found;
}

const knowledgeTool = tools.find((t) => t.name === "knowledge_read");
if (!knowledgeTool) {
  fail("tool: knowledge_read not registered");
} else {
  const res = await knowledgeTool.execute(
    "t1",
    { type: "records", limit: 10 },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const text = res.content.map((b) => b.text).join("");
  if (isFoundDetails(res.details) !== true) fail("tool: records read not found");
  if (!text.includes("2026-08-03_dtcm.md")) fail("tool: records read missing entry");

  const idx = await knowledgeTool.execute(
    "t2",
    { type: "index" },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  if (!idx.content.map((b) => b.text).join("").includes("2026-08-03 DTCM")) {
    fail("tool: index read missing line");
  }

  const none = await knowledgeTool.execute("t3", { type: "index" }, undefined, undefined, { cwd: "/" });
  if (isFoundDetails(none.details) !== false) fail("tool: no-KB case not reported");

  const auditsRes = await knowledgeTool.execute(
    "t4",
    { type: "audits", limit: 10 },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const auditsText = auditsRes.content.map((b) => b.text).join("");
  if (isFoundDetails(auditsRes.details) !== true) fail("tool: audits read not found");
  if (!auditsText.includes("demo-audit") || !auditsText.includes("v0.1.0")) {
    fail("tool: audits read missing entry or version");
  }

  const singleAuditRes = await knowledgeTool.execute(
    "t5",
    { type: "audits", slug: "demo-audit" },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const singleText = singleAuditRes.content.map((b) => b.text).join("");
  if (!singleText.includes("Demo Audit Report")) {
    fail("tool: audits slug read missing full content");
  }
  const complexRes = await knowledgeTool.execute(
    "t6",
    { type: "audits", slug: "complex-audit" },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const complexText = complexRes.content.map((b) => b.text).join("");
  if (!complexText.includes("Overview of complex audit")) {
    fail("tool: audits overview.md discovery failed");
  }

  const complexFullRes = await knowledgeTool.execute(
    "t7",
    { type: "audits", slug: "complex-audit", full: true },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const complexFullText = complexFullRes.content.map((b) => b.text).join("");
  if (
    !complexFullText.includes("Detailed frontend findings.") ||
    !complexFullText.includes("Detailed backend findings.")
  ) {
    fail("tool: audits subtopic hyperlink/file parsing in full text failed");
  }

  const subtopicRes = await knowledgeTool.execute(
    "t8",
    { type: "audits", slug: "complex-audit/frontend" },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const subtopicText = subtopicRes.content.map((b) => b.text).join("");
  if (!subtopicText.includes("Detailed frontend findings.")) {
    fail("tool: audits subtopic direct retrieval failed");
  }
  const rendered = knowledgeTool.renderResult?.(
    { content: [{ type: "text", text: "a record\nsecond line" }], details: { found: true, type: "records", count: 2, paths: [] } },
    { expanded: false },
    null,
  );
  if (!(rendered instanceof TuiContainer)) fail("tool: renderResult did not produce a component");

  // --- v0.34.0 Optimizations Coverage ---

  // 1. readKnowledge with query: "dma"
  const dmaDirect = readKnowledge(fixtureRoot, { type: "index", query: "dma" });
  if (!dmaDirect.found || !dmaDirect.text.includes("DMA DTCM Transfer Bug")) {
    fail("readKnowledge: query parameter failed to match title/tags for dma");
  }

  const dmaToolRes = await knowledgeTool.execute(
    "t_q1",
    { type: "index", query: "dma" },
    undefined,
    undefined,
    { cwd: fixtureRoot },
  );
  const dmaToolText = dmaToolRes.content.map((b) => b.text).join("");
  if (!dmaToolText.includes("DMA DTCM Transfer Bug")) {
    fail("knowledge_read tool: query parameter failed to return dma match");
  }

  // 2. findRelevantKnowledge & findRelevantKnowledge-dedup-and-fast-index
  const rel = findRelevantKnowledge(fixtureRoot, "Fix the dma dtcm buffer issue on stm32");
  if (rel.length === 0 || !rel.some((r) => r.title.includes("DMA DTCM Transfer Bug"))) {
    fail("findRelevantKnowledge: failed to extract terms and match pitfall file");
  }

  // Deduplication check: item in both INDEX.md and records/ must appear exactly once
  const dtcmDedup = findRelevantKnowledge(fixtureRoot, "dtcm");
  const dtcmPaths = dtcmDedup.map((r) => r.path);
  if (new Set(dtcmPaths).size !== dtcmPaths.length) {
    fail("findRelevantKnowledge-dedup-and-fast-index: returned duplicate paths");
  }
  if (dtcmPaths.filter((p) => p === ".omp/knowledge/records/2026-08-03_dtcm.md").length !== 1) {
    fail("findRelevantKnowledge-dedup-and-fast-index: expected .omp/knowledge/records/2026-08-03_dtcm.md exactly once");
  }
  // Relative path normalization check
  if (!dtcmPaths.every((p) => p.startsWith(".omp/knowledge/"))) {
    fail("findRelevantKnowledge-dedup-and-fast-index: paths in result are not relative");
  }
  // Index-First search check: items in INDEX.md are matched and retrieved
  if (dtcmDedup.length === 0 || !dtcmDedup.some((r) => r.title === "DTCM")) {
    fail("findRelevantKnowledge-dedup-and-fast-index: Index-First search failed to match item");
  }
  // Fallback scan for unindexed files
  writeFileSync(
    join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-10_unindexed_cache.md"),
    "---\ntitle: Unindexed Cache Optimization\n---\nTesting unindexed fallback scan.",
  );
  const unindexedRel = findRelevantKnowledge(fixtureRoot, "unindexed optimization");
  if (!unindexedRel.some((r) => r.title === "Unindexed Cache Optimization" && r.path === ".omp/knowledge/records/2026-08-10_unindexed_cache.md")) {
    fail("findRelevantKnowledge-dedup-and-fast-index: fallback scan failed to find unindexed record");
  }
  // 3. before_agent_start auto-surfacing
  const beforeFn = handlers["before_agent_start"];
  if (!beforeFn) {
    fail("before_agent_start: handler not registered");
  } else {
    const evt: { prompt: string; systemPrompt: string } = {
      prompt: "I am seeing a dma dtcm transfer issue",
      systemPrompt: "Base prompt.",
    };
    await beforeFn(evt, { cwd: fixtureRoot });
    if (!evt.systemPrompt.includes("<relevant-knowledge>")) {
      fail("before_agent_start: failed to auto-surface relevant knowledge block");
    }
    if (!evt.systemPrompt.includes("DMA DTCM Transfer Bug")) {
      fail("before_agent_start: auto-surfaced knowledge missing matched title");
    }
    // Deduplication check
    const lenBefore = evt.systemPrompt.length;
    await beforeFn(evt, { cwd: fixtureRoot });
    if (evt.systemPrompt.length !== lenBefore) {
      fail("before_agent_start: double-injected relevant-knowledge block on second turn");
    }
  }

  // 4. findFrontierTicket
  const frontier = findFrontierTicket(fixtureRoot);
  if (!frontier) {
    fail("findFrontierTicket: failed to locate frontier ticket");
  } else {
    if (frontier.feature !== "my-feature") {
      fail(`findFrontierTicket: expected feature 'my-feature', got '${frontier.feature}'`);
    }
    if (!frontier.file.includes("002-api.md")) {
      fail(`findFrontierTicket: expected 002-api.md, got '${frontier.file}'`);
    }
    if (frontier.title !== "Implement REST API endpoints") {
      fail(`findFrontierTicket: expected title 'Implement REST API endpoints', got '${frontier.title}'`);
    }
    if (!frontier.blockedBy.includes("001-setup")) {
      fail("findFrontierTicket: expected blockedBy to contain '001-setup'");
    }
  }
  // --- knowledge_read-research-enhancement tests ---
  // 1. type: "research" with no slug given: returns list of projects with rich status/metrics lines
  const resNoSlug = readKnowledge(fixtureRoot, { type: "research" });
  if (!resNoSlug.found) fail("readKnowledge research (no slug): expected found true");
  if (!resNoSlug.text.includes("2026-07-31_has-report") || !resNoSlug.text.includes("REPORT_READY")) {
    fail("readKnowledge research (no slug): missing 2026-07-31_has-report status line");
  }
  if (!resNoSlug.text.includes("[report.md]")) {
    fail("readKnowledge research (no slug): missing [report.md] marker");
  }
  if (!resNoSlug.text.includes("2026-07-30_no-report") || !resNoSlug.text.includes("OUTLINE")) {
    fail("readKnowledge research (no slug): missing 2026-07-30_no-report status line");
  }

  // 2. type: "research" and slug when report.md exists
  const resReportExists = readKnowledge(fixtureRoot, { type: "research", slug: "2026-07-31_has-report" });
  if (!resReportExists.found) fail("readKnowledge research (report exists): expected found true");
  if (!resReportExists.text.includes("Research project: 2026-07-31_has-report")) {
    fail("readKnowledge research (report exists): missing project header");
  }
  if (!resReportExists.text.includes("# Research Report Content")) {
    fail("readKnowledge research (report exists): missing report.md content");
  }
  if (!resReportExists.details.paths.some((p) => p.endsWith("report.md"))) {
    fail("readKnowledge research (report exists): details.paths does not contain report.md path");
  }

  // 3. type: "research" and slug when report.md does NOT exist
  const resNoReport = readKnowledge(fixtureRoot, { type: "research", slug: "2026-07-30_no-report" });
  if (!resNoReport.found) fail("readKnowledge research (no report): expected found true");
  if (!resNoReport.text.includes("Report: pending")) {
    fail("readKnowledge research (no report): missing Report: pending label");
  }
  if (!resNoReport.text.includes("Outline items:") || !resNoReport.text.includes("- item A")) {
    fail("readKnowledge research (no report): missing outline items list");
  }
  if (!resNoReport.text.includes("Available files:") || !resNoReport.text.includes("- outline.yaml")) {
    fail("readKnowledge research (no report): missing available files list");
  }
  if (!resNoReport.details.paths.some((p) => p.includes("2026-07-30_no-report"))) {
    fail("readKnowledge research (no report): details.paths missing project dir");
  }

  // 4. type: "research" and subfile slug
  const resSubfile = readKnowledge(fixtureRoot, { type: "research", slug: "2026-07-31_has-report/outline.yaml" });
  if (!resSubfile.found) fail("readKnowledge research (subfile): expected found true");
  if (!resSubfile.text.includes("item 1")) {
    fail("readKnowledge research (subfile): missing outline.yaml content");
  }
  if (resSubfile.details.count !== 1 || !resSubfile.details.paths.some((p) => p.endsWith("outline.yaml"))) {
    fail("readKnowledge research (subfile): invalid details.paths/count");
  }

  // 5. type: "research" and invalid slug
  const resInvalidSlug = readKnowledge(fixtureRoot, { type: "research", slug: "nonexistent-slug-xyz" });
  if (!resInvalidSlug.found || resInvalidSlug.details.count !== 0) {
    fail("readKnowledge research (invalid slug): expected count 0");
  }
  if (!resInvalidSlug.text.includes('No research project matching "nonexistent-slug-xyz".')) {
    fail("readKnowledge research (invalid slug): unexpected text response");
  }
  // Clean up research test directories so completion tests later in selftest pass
  rmSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-31_has-report"), { recursive: true, force: true });
  rmSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-07-30_no-report"), { recursive: true, force: true });
}
if (!renderers["knowledge-record"] || !renderers["knowledge-pitfall"]) {
  fail("renderers: knowledge-record/pitfall not registered");
} else {
  const card = renderers["knowledge-record"]({ content: "remember the DTCM thing" }, {}, null);
  if (!(card instanceof TuiContainer)) fail("renderer: knowledge-record did not produce a component");
}
if (!renderers["hindsight"]) {
  fail("renderers: hindsight receipt renderer not registered");
} else {
  const card = renderers["hindsight"]({ content: "hindsight on" }, {}, null);
  if (!(card instanceof TuiContainer)) fail("renderer: hindsight did not produce a component");
}
if (!renderers["research-review"]) {
  fail("renderers: research-review not registered");
} else {
  const samplePayload: ResearchReviewPayload = {
    slug: "ai-agents-selftest",
    status: "DRAFT REVIEW",
    items: [
      { name: "AutoGPT", category: "open-source", description: "Autonomous GPT agent" },
      { name: "LangGraph", category: "orchestration", description: "Graph framework" },
      { name: "CrewAI", category: "multi-agent", description: "Role-based multi-agent" },
      { name: "BabyAGI", category: "open-source", description: "Task loop" },
      { name: "MetaGPT", category: "multi-agent", description: "Software company" },
      { name: "ChatDev", category: "multi-agent", description: "Virtual company" },
    ],
    fields: [
      { name: "architecture", category: "Tech", detail_level: "detailed", description: "Control flow" },
      { name: "license", category: "Basic", detail_level: "brief", description: "OSS License" },
      { name: "memory", category: "Tech", detail_level: "moderate", description: "Memory strategy" },
      { name: "tools", category: "Tech", detail_level: "moderate", description: "Tool use" },
      { name: "eval", category: "Eval", detail_level: "detailed", description: "Evaluation" },
    ],
    modules: ["general-web", "github-debug", "academic-papers"],
    execution: {
      preset: "medium",
      agents_per_wave: 4,
      max_waves: 3,
      approval_mode: "auto",
    },
  };

  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["research-review"](
    { customType: "research-review", details: samplePayload },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered research-review renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("RESEARCH DRAFT REVIEW")) {
    fail("research-review: output missing RESEARCH DRAFT REVIEW header");
  }
  if (!texts.includes("Section 1: Living Outline")) {
    fail("research-review: output missing Section 1 title");
  }
  if (!texts.includes("Section 2: Execution Settings")) {
    fail("research-review: output missing Section 2 title");
  }
  if (!texts.includes("Section 3: Next Commands")) {
    fail("research-review: output missing Section 3 title");
  }
}

if (!renderers["research-wave-progress"]) {
  fail("renderers: research-wave-progress not registered");
} else {
  const wavePayload: ResearchWaveProgressPayload = {
    slug: "wave-selftest",
    wave: 2,
    max_waves: 3,
    field_completion: 0.5,
    completed_fields: 6,
    total_fields: 12,
    active_subagents: ["academic-agent", "github-agent"],
    active_modules: ["academic-papers", "github-debug"],
    uncertainty_delta: "-0.25",
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["research-wave-progress"](
    { customType: "research-wave-progress", details: wavePayload },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered research-wave-progress renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("RESEARCH WAVE PROGRESS")) {
    fail("research-wave-progress: output missing header");
  }
  if (!texts.includes("[WAVE 2/3]")) {
    fail("research-wave-progress: output missing wave badge");
  }
  if (!texts.includes("[████░░░░]")) {
    fail("research-wave-progress: output missing progress bar");
  }
  if (!texts.includes("Uncertainty Reduction (ΔU)")) {
    fail("research-wave-progress: output missing ΔU metric");
  }
}

if (!renderers["research-report-preview"]) {
  fail("renderers: research-report-preview not registered");
} else {
  const reportPayload: ResearchReportPreviewPayload = {
    slug: "report-selftest",
    coverage: 0.85,
    verified_sources_count: 18,
    executive_summary: "Comprehensive survey of agentic workflows and tool execution.",
    unresolved_provenance: [
      { field: "eval_benchmark", attempts: 3, reason: "No standardized benchmark dataset found" },
    ],
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["research-report-preview"](
    { customType: "research-report-preview", details: reportPayload },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered research-report-preview renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("RESEARCH REPORT PREVIEW")) {
    fail("research-report-preview: output missing header");
  }
  if (!texts.includes("Coverage:")) {
    fail("research-report-preview: output missing coverage");
  }
  if (!texts.includes("Verified Sources Count:")) {
    fail("research-report-preview: output missing verified sources count");
  }
  if (!texts.includes("Executive Summary Preview:")) {
    fail("research-report-preview: output missing summary preview");
  }
  if (!texts.includes("Unresolved Field Provenance:")) {
    fail("research-report-preview: output missing unresolved field provenance");
  }
}

if (!renderers["research-dashboard"]) {
  fail("renderers: research-dashboard not registered");
} else {
  const dashPayload: ResearchDashboardPayload = {
    slug: "dashboard-selftest",
    current_phase: 2,
    global_metrics: {
      total_items: 10,
      completed_items: 6,
      total_fields: 12,
      completed_fields: 8,
      coverage: 0.6,
    },
    artifacts: {
      outline_yaml: true,
      fields_yaml: true,
      results_json: 6,
      report_md: false,
    },
    recommended_next_step: "Run /research-deep medium dashboard-selftest",
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["research-dashboard"](
    { customType: "research-dashboard", details: dashPayload },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered research-dashboard renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("RESEARCH DASHBOARD")) {
    fail("research-dashboard: output missing header");
  }
  if (!texts.includes("Pipeline:")) {
    fail("research-dashboard: output missing pipeline stepper");
  }
  if (
    !texts.includes("1. Outline ✓") ||
    !texts.includes("[2. OODA]") ||
    !texts.includes("3. Report")
  ) {
    fail("research-dashboard: output missing phase stepper marks");
  }
  if (!texts.includes("Global Completion Metrics:")) {
    fail("research-dashboard: output missing global completion metrics");
  }
  if (!texts.includes("Project Artifacts Status:")) {
    fail("research-dashboard: output missing project artifacts status");
  }
  if (!texts.includes("Next:")) {
    fail("research-dashboard: output missing next step section");
  }
}

if (!renderers["my-omp-research-help"]) {
  fail("renderers: my-omp-research-help not registered");
} else {
  const card = renderers["my-omp-research-help"](
    { customType: "my-omp-research-help", details: { slug: "research", commands: [] } },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) fail("renderer: my-omp-research-help did not produce a component");
}
if (!renderers["my-omp-research-error"]) {
  fail("renderers: my-omp-research-error not registered");
} else {
  const card = renderers["my-omp-research-error"](
    {
      customType: "my-omp-research-error",
      details: { slug: "s", code: "E1", message: "boom", hint: "try again" },
    },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) fail("renderer: my-omp-research-error did not produce a component");
}

// --- Research Dashboard Field Metrics & Inline YAML Comment Stripping Fixes (Issue #14) ---
{
  const researchFixDir = mkdtempSync(join(tmpdir(), "my-omp-research-fix-"));
  const projectDir = join(researchFixDir, ".omp", "knowledge", "research", "issue-14-test");
  const resultsDir = join(projectDir, "results");
  mkdirSync(resultsDir, { recursive: true });

  // 1. Outline with 2 items and inline YAML comments
  writeFileSync(
    join(projectDir, "outline.yaml"),
    `topic: Issue 14 Test # inline comment for topic
items:
  - name: item_one # first item comment
  - name: item_two # second item comment
execution:
  preset: small # preset comment
`,
  );

  // 2. Fields with 3 fields per item (total expected across 2 items = 6) and inline comments
  writeFileSync(
    join(projectDir, "fields.yaml"),
    `categories:
  category_one:
    - name: field_a # field a comment
    - name: field_b # field b comment
    - name: field_c # field c comment
`,
  );
  writeFileSync(
    join(resultsDir, "item_one.json"),
    JSON.stringify({
      field_a: "value_a",
      field_b: "value_b",
      field_c: "value_c",
      uncertain: [],
    }),
  );

  // Assert YAML comment stripping
  const outlineItems = readOutlineItems(projectDir);
  if (!outlineItems || outlineItems.length !== 2 || outlineItems[0] !== "item_one" || outlineItems[1] !== "item_two") {
    fail(`readOutlineItems inline comment stripping failed: ${JSON.stringify(outlineItems)}`);
  }

  const fieldNames = readFieldNames(projectDir);
  if (!fieldNames || fieldNames.length !== 3 || fieldNames[0] !== "field_a" || fieldNames[1] !== "field_b" || fieldNames[2] !== "field_c") {
    fail(`readFieldNames inline comment stripping failed: ${JSON.stringify(fieldNames)}`);
  }

  const execBlock = readExecutionBlock(projectDir);
  if (execBlock.preset !== "small") {
    fail(`readExecutionBlock inline comment stripping failed: preset=${JSON.stringify(execBlock.preset)}`);
  }

  // Assert metric calculations without frontMatter.counts.fields
  const metrics = getResearchDashboardMetrics(projectDir, "issue-14-test");
  if (!metrics.global_metrics) {
    fail("metrics: global_metrics missing");
  } else {
    if (metrics.global_metrics.total_items !== 2) {
      fail(`metrics: total_items=${metrics.global_metrics.total_items}, expected 2`);
    }
    if (metrics.global_metrics.completed_items !== 1) {
      fail(`metrics: completed_items=${metrics.global_metrics.completed_items}, expected 1`);
    }
    if (metrics.global_metrics.total_fields !== 6) {
      fail(`metrics: total_fields=${metrics.global_metrics.total_fields}, expected 6`);
    }
    if (metrics.global_metrics.completed_fields !== 3) {
      fail(`metrics: completed_fields=${metrics.global_metrics.completed_fields}, expected 3`);
    }
    if (metrics.global_metrics.coverage !== 0.5) {
      fail(`metrics: coverage=${metrics.global_metrics.coverage}, expected 0.5`);
    }
  }

  rmSync(researchFixDir, { recursive: true, force: true });
}
// --- Renderer unit checks: 76-cell width budget + content contracts ---------

// Every line of every research card must fit the fixed 76-cell box. The
// renderers measure in display cells (CJK/emoji = 2), so this must hold even
// for the CJK-slug dashboard below. All cards render through the REGISTERED
// seam (renderers[customType] — see collectLines above).

const cardsUnderTest: Array<{ label: string; render: () => unknown }> = [];

cardsUnderTest.push({
  label: "research-dashboard (RUNNING/stale/CJK)",
  render: () =>
    renderers["research-dashboard"](
      {
        details: {
          slug: "2026-08-07_研究",
          status: "RUNNING",
          topic: "UX improvements",
          as_of: "2026-08-07T12:00:00Z",
          freshness: "stale",
          global_metrics: {
            total_items: 21,
            completed_items: 12,
            total_fields: 18,
            completed_fields: 18,
            coverage: 12 / 21,
          },
          next_step_command: "/research-deep 2026-08-07_研究",
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-wave-progress (indeterminate)",
  render: () =>
    renderers["research-wave-progress"](
      {
        details: {
          wave: 1,
          max_waves: 3,
          status: "RUNNING",
          indeterminate: true,
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-wave-progress (elapsed/eta/statuses)",
  render: () =>
    renderers["research-wave-progress"](
      {
        details: {
          elapsed_seconds: 192,
          eta_seconds: 240,
          per_item_status: [
            { name: "a", status: "landed" },
            { name: "b", status: "failed" },
          ],
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-report-preview (toc/counts)",
  render: () =>
    renderers["research-report-preview"](
      {
        details: {
          toc: [{ name: "Alpha", summary: "P1" }],
          total_items: 21,
          resolved_items: 21,
          unresolved_fields_count: 0,
          coverage: 1,
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-review (full/detailed field)",
  render: () =>
    renderers["research-review"](
      {
        details: {
          slug: "s",
          detail: "full",
          items: Array.from({ length: 12 }, (_, i) => ({ name: `item-${i + 1}` })),
          fields: [{ name: "f", detail_level: "detailed" }],
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-help",
  render: () =>
    renderers["my-omp-research-help"](
      {
        details: {
          slug: "research",
          status: "RUNNING",
          commands: [{ command: "/research dashboard", description: "Open the dashboard" }],
          shortcuts: [{ key: "F1", description: "Open help" }],
          env: { TERM: "xterm-256color", CI: "" },
        },
      },
      {},
      null,
    ),
});

cardsUnderTest.push({
  label: "research-error",
  render: () =>
    renderers["my-omp-research-error"](
      {
        details: {
          slug: "s",
          code: "PROJECT_NOT_FOUND",
          message: 'Project "s" not found under .omp/knowledge/research/',
          hint: "Run '/research status' to list projects.",
        },
      },
      {},
      null,
    ),
});

for (const { label, render } of cardsUnderTest) {
  let rendered: unknown;
  try {
    rendered = render();
  } catch (err) {
    fail(`unit: ${label} threw: ${err}`);
    continue;
  }
  if (!(rendered instanceof TuiContainer)) {
    fail(`unit: ${label} did not return a Container`);
    continue;
  }
  const card = rendered;
  for (const line of collectLines(card)) {
    if (displayWidth(line) > 76) {
      fail(`unit: ${label} line exceeds 76 cells (${displayWidth(line)}): ${JSON.stringify(line)}`);
    }
  }
}

// Content contracts per card (all rendered through the REGISTERED seam).
{
  const card = renderers["research-dashboard"](
    {
      details: {
        slug: "2026-08-07_研究",
        status: "RUNNING",
        topic: "UX improvements",
        as_of: "2026-08-07T12:00:00Z",
        freshness: "stale",
        global_metrics: {
          total_items: 21,
          completed_items: 12,
          total_fields: 18,
          completed_fields: 18,
          coverage: 12 / 21,
        },
        next_step_command: "/research-deep 2026-08-07_研究",
      },
    },
    {},
    null,
  );
  const dashText = collectLines(card).join("\n");
  for (const needle of ["[RUNNING]", "STALE", "Next:", "Topic:"]) {
    if (!dashText.includes(needle)) fail(`unit: dashboard missing "${needle}"`);
  }
}

{
  const card = renderers["research-wave-progress"](
    { details: { wave: 1, max_waves: 3, status: "RUNNING", indeterminate: true } },
    {},
    null,
  );
  const text = collectLines(card).join("\n");
  if (!text.includes("indeterminate")) fail("unit: wave(indeterminate) missing 'indeterminate'");
  if (text.includes("-0.15")) fail("unit: wave(indeterminate) fabricated a ΔU default (-0.15)");
}

{
  const card = renderers["research-wave-progress"](
    {
      details: {
        elapsed_seconds: 192,
        eta_seconds: 240,
        per_item_status: [
          { name: "a", status: "landed" },
          { name: "b", status: "failed" },
        ],
      },
    },
    {},
    null,
  );
  const text = collectLines(card).join("\n");
  if (!text.includes("3m12s")) fail("unit: wave elapsed 192s did not render 3m12s");
  if (!text.includes("ETA ≈ 4m")) fail("unit: wave eta 240s did not render 'ETA ≈ 4m'");
  if (!text.includes("landed")) fail("unit: wave per-item status 'landed' missing");
}

{
  const card = renderers["research-report-preview"](
    {
      details: {
        toc: [{ name: "Alpha", summary: "P1" }],
        total_items: 21,
        resolved_items: 21,
        unresolved_fields_count: 0,
        coverage: 1,
      },
    },
    {},
    null,
  );
  const text = collectLines(card).join("\n");
  if (!text.includes("Table of Contents")) fail("unit: report preview missing 'Table of Contents'");
  if (!text.includes("items 21")) fail("unit: report preview missing 'items 21'");
}

{
  const card = renderers["research-review"](
    {
      details: {
        slug: "s",
        detail: "full",
        items: Array.from({ length: 12 }, (_, i) => ({ name: `item-${i + 1}` })),
        fields: [{ name: "f", detail_level: "detailed" }],
      },
    },
    {},
    null,
  );
  const text = collectLines(card).join("\n");
  if (!text.includes("★★★")) fail("unit: review detailed field missing ★★★");
  if (!text.includes("Next Commands")) fail("unit: review missing 'Next Commands' section");
  if (text.includes("[1] Launch Deep Waves")) {
    fail("unit: review still shows fake '[1] Launch Deep Waves' affordance");
  }
}

if (!renderers["audit-card"]) {
  fail("renderers: audit-card not registered");
} else {
  const auditPayload: AuditCardPayload = {
    title: "Codebase Security Audit",
    slug: "security-audit",
    version: "v0.1.0",
    status: "active",
    root_report_path: ".omp/audits/security-audit/overview.md",
    subtopics_count: 2,
    latest_revision: "v0.1.0 (Initial draft)",
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["audit-card"]({ details: auditPayload }, {}, null);
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered audit-card renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("AUDIT REPORT")) fail("audit-card: output missing header");
  if (!texts.includes("security-audit")) fail("audit-card: output missing slug");
  if (!texts.includes("v0.1.0")) fail("audit-card: output missing version");
  if (!texts.includes("active")) fail("audit-card: output missing status");
  if (!texts.includes(".omp/audits/security-audit/overview.md")) fail("audit-card: output missing root report path");
  if (!texts.includes("Subtopics Count: 2")) fail("audit-card: output missing subtopics count");
  if (!texts.includes("Initial draft")) fail("audit-card: output missing latest revision");
}

if (!renderers["ticket-breakdown"]) {
  fail("renderers: ticket-breakdown not registered");
} else {
  const ticketPayload: TicketBreakdownPayload = {
    feature: "auth-flow",
    ticket_count: 2,
    ready_status: "ready-for-agent",
    tickets: [
      { id: "01", title: "DB Schema", blocked_by: [] },
      { id: "02", title: "API Handler", blocked_by: ["01"] },
    ],
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["ticket-breakdown"]({ details: ticketPayload }, {}, null);
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered ticket-breakdown renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("TICKET BREAKDOWN")) fail("ticket-breakdown: output missing header");
  if (!texts.includes(".omp/scratch/auth-flow/issues/")) fail("ticket-breakdown: output missing tracker path");
  if (!texts.includes("Ticket Count: 2")) fail("ticket-breakdown: output missing ticket count");
  if (!texts.includes("ready-for-agent")) fail("ticket-breakdown: output missing ready status");
  if (!texts.includes("Ticket 01 -> Ticket 02")) {
    fail("ticket-breakdown: output missing blocking dependency arrow");
  }
}

if (!renderers["triage-status"]) {
  fail("renderers: triage-status not registered");
} else {
  const triagePayload: TriageStatusPayload = {
    total_items: 6,
    backlog: {
      unlabeled: 2,
      needs_triage: 3,
      agent_ready: 1,
    },
    next_action: "Categorize unlabeled issues",
  };
  // Through the REGISTERED seam (customType → callback), never a direct import.
  const card = renderers["triage-status"]({ details: triagePayload }, {}, null);
  if (!(card instanceof TuiContainer)) {
    fail("renderer: registered triage-status renderer did not return a Container");
  }
  const texts = collectLines(card).join("\n");
  if (!texts.includes("TRIAGE STATUS")) fail("triage-status: output missing header");
  if (!texts.includes("Total Items: 6")) fail("triage-status: output missing total items");
  if (!texts.includes("unlabeled: 2")) fail("triage-status: output missing unlabeled count");
  if (!texts.includes("needs-triage: 3")) fail("triage-status: output missing needs-triage count");
  if (!texts.includes("agent-ready: 1")) fail("triage-status: output missing agent-ready count");
  if (!texts.includes("Categorize unlabeled issues")) fail("triage-status: output missing next action");
}

// --- Telemetry card resilience & file stat checks ---------------------------

const malformedPayloads: unknown[] = [
  null,
  undefined,
  123,
  "string payload",
  true,
  {},
  { items: [null, undefined, 456, {}], subtopics: [null], tickets: [null, {}] },
  { fields: [null, "str"], modules: [null], active_subagents: [null, { name: null }] },
  { global_metrics: { coverage: NaN, total_items: "abc" }, artifacts: [null, 123] },
];

// All seven registered renderers must stay Container-producing for malformed
// payloads. Through the REGISTERED seam: the message carries `details`, which
// is exactly how the runtime delivers custom messages to the renderers.
const resilienceCards: Array<[string, string]> = [
  ["audit-card", "renderAuditCard"],
  ["ticket-breakdown", "renderTicketBreakdownCard"],
  ["triage-status", "renderTriageStatusCard"],
  ["research-review", "renderResearchReviewCard"],
  ["research-wave-progress", "renderResearchWaveProgressCard"],
  ["research-report-preview", "renderResearchReportPreviewCard"],
  ["research-dashboard", "renderResearchDashboardCard"],
];
for (const bad of malformedPayloads) {
  for (const [customType, cardName] of resilienceCards) {
    try {
      const card = renderers[customType]({ details: bad }, {}, null);
      if (!(card instanceof TuiContainer)) {
        fail(`resilience: ${cardName} failed to return Container for malformed payload`);
      }
    } catch (err) {
      fail(`resilience: ${cardName} threw exception for malformed payload: ${err}`);
    }
  }
}

const filePathAsDir = join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-03_dtcm.md");
if (knowledgeTool) {
  try {
    const resFileAsDir = await knowledgeTool.execute(
      "t_stat1",
      { type: "records" },
      undefined,
      undefined,
      { cwd: filePathAsDir },
    );
    if (!resFileAsDir) fail("stat-check: knowledgeTool returned falsy for file path as cwd");
  } catch (err) {
    fail(`stat-check: knowledgeTool threw exception when cwd is a file path: ${err}`);
  }
}
// Receipts: /record and /pitfall emit a custom message with the right type.
customMessages.length = 0;
await registered["record"].handler("remember the DTCM thing", {});
const recordReceipt = customMessages.find((m) => m.display === true);
if (!recordReceipt || recordReceipt.customType !== "knowledge-record") {
  fail("record: receipt custom message missing or wrong type");
} else if (!String(recordReceipt.content ?? "").includes("remember the DTCM thing")) {
  fail("record: receipt content missing the finding");
}
customMessages.length = 0;
await registered["pitfall"].handler("memory backend was off", {});
const pitfallReceipt = customMessages.find((m) => m.display === true);
if (!pitfallReceipt || pitfallReceipt.customType !== "knowledge-pitfall") {
  fail("pitfall: receipt custom message missing or wrong type");
}

// Pure TUI view/status handlers: /research dashboard, /research review, /audit status, /triage status
// MUST NOT queue user messages to agent (sent.length === 0) and MUST emit custom TUI messages & toasts.

sent.length = 0;
customMessages.length = 0;
let notifyCalls: string[] = [];
await registered["research"].handler("dashboard", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("research dashboard: queued a user message to agent");
if (!notifyCalls.includes("Research Dashboard loaded")) {
  fail(`research dashboard: toast "Research Dashboard loaded" missing, got: ${JSON.stringify(notifyCalls)}`);
}
const dashCard = customMessages.find((m) => m.customType === "research-dashboard");
if (!dashCard || dashCard.display !== true) {
  fail("research dashboard: custom card research-dashboard missing or display false");
}

sent.length = 0;
customMessages.length = 0;
notifyCalls = [];
await registered["research"].handler("review", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("research review: queued a user message to agent");
if (!notifyCalls.includes("Research Review Window loaded")) {
  fail(`research review: toast "Research Review Window loaded" missing, got: ${JSON.stringify(notifyCalls)}`);
}
const reviewCard = customMessages.find((m) => m.customType === "research-review");
if (!reviewCard || reviewCard.display !== true) {
  fail("research review: custom card research-review missing or display false");
}

sent.length = 0;
customMessages.length = 0;
notifyCalls = [];
await registered["research"].handler("help", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("research help: queued a user message to agent");
if (!notifyCalls.includes("Research Help loaded")) {
  fail(`research help: toast "Research Help loaded" missing, got: ${JSON.stringify(notifyCalls)}`);
}
const helpCard = customMessages.find((m) => m.customType === "my-omp-research-help");
if (!helpCard || helpCard.display !== true) {
  fail("research help: custom card my-omp-research-help missing or display false");
}

sent.length = 0;
customMessages.length = 0;
notifyCalls = [];
await registered["research"].handler("envcheck", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("research envcheck: queued a user message to agent");
if (!notifyCalls.includes("Research environment diagnostics loaded")) {
  fail(
    `research envcheck: toast "Research environment diagnostics loaded" missing, got: ${JSON.stringify(notifyCalls)}`,
  );
}
const envCard = customMessages.find((m) => m.customType === "my-omp-research-help");
if (!envCard || envCard.display !== true) {
  fail("research envcheck: custom card my-omp-research-help missing or display false");
}

sent.length = 0;
customMessages.length = 0;
notifyCalls = [];
await registered["audit"].handler("status", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("audit status: queued a user message to agent");
if (!notifyCalls.includes("Audit status loaded")) {
  fail(`audit status: toast "Audit status loaded" missing, got: ${JSON.stringify(notifyCalls)}`);
}
const auditCard = customMessages.find((m) => m.customType === "audit-card");
if (!auditCard || auditCard.display !== true) {
  fail("audit status: custom card audit-card missing or display false");
}

// Finding 3.1: explicit slugs that do NOT exist must emit a warning notify
// and skip the custom card, instead of silently falling back to entries[0].
{
  const prevCwd2 = process.cwd();
  process.chdir(fixtureRoot);
  try {
    const captureNotify = (): { msgs: string[]; levels: string[] } => {
      const msgs: string[] = [];
      const levels: string[] = [];
      return {
        msgs,
        levels,
        // The mock will be installed by each handler call below.
      };
    };

    // /research dashboard typo-slug
    sent.length = 0;
    customMessages.length = 0;
    const dashNotify: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["research"].handler("dashboard typo-slug", {
      ui: {
        notify: (msg: string, level?: string) => {
          dashNotify.msgs.push(msg);
          dashNotify.levels.push(level ?? "");
        },
      },
    });
    if (sent.length !== 0) fail("research dashboard (bad slug): queued a user message to agent");
    if (!dashNotify.levels.includes("warning")) {
      fail(`research dashboard (bad slug): expected warning notify, got levels: ${JSON.stringify(dashNotify.levels)}`);
    }
    if (!dashNotify.msgs.some((m) => m.includes("typo-slug"))) {
      fail(`research dashboard (bad slug): notify message must include the slug, got: ${JSON.stringify(dashNotify.msgs)}`);
    }
    if (customMessages.some((m) => m.customType === "research-dashboard")) {
      fail("research dashboard (bad slug): custom card should not be emitted on missing slug");
    }

    // /research review typo-slug
    sent.length = 0;
    customMessages.length = 0;
    const reviewNotify: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["research"].handler("review typo-slug", {
      ui: {
        notify: (msg: string, level?: string) => {
          reviewNotify.msgs.push(msg);
          reviewNotify.levels.push(level ?? "");
        },
      },
    });
    if (sent.length !== 0) fail("research review (bad slug): queued a user message to agent");
    if (!reviewNotify.levels.includes("warning")) {
      fail(`research review (bad slug): expected warning notify, got levels: ${JSON.stringify(reviewNotify.levels)}`);
    }
    if (!reviewNotify.msgs.some((m) => m.includes("typo-slug"))) {
      fail(`research review (bad slug): notify message must include the slug, got: ${JSON.stringify(reviewNotify.msgs)}`);
    }
    if (customMessages.some((m) => m.customType === "research-review")) {
      fail("research review (bad slug): custom card should not be emitted on missing slug");
    }

    // /audit status typo-slug
    sent.length = 0;
    customMessages.length = 0;
    const auditNotify: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["audit"].handler("status typo-slug", {
      ui: {
        notify: (msg: string, level?: string) => {
          auditNotify.msgs.push(msg);
          auditNotify.levels.push(level ?? "");
        },
      },
    });
    if (sent.length !== 0) fail("audit status (bad slug): queued a user message to agent");
    if (!auditNotify.levels.includes("warning")) {
      fail(`audit status (bad slug): expected warning notify, got levels: ${JSON.stringify(auditNotify.levels)}`);
    }
    if (!auditNotify.msgs.some((m) => m.includes("typo-slug"))) {
      fail(`audit status (bad slug): notify message must include the slug, got: ${JSON.stringify(auditNotify.msgs)}`);
    }
    if (customMessages.some((m) => m.customType === "audit-card")) {
      fail("audit status (bad slug): custom card should not be emitted on missing slug");
    }

    void captureNotify;
  } finally {
    process.chdir(prevCwd2);
  }
}

sent.length = 0;
customMessages.length = 0;
notifyCalls = [];
await registered["triage"].handler("status", {
  ui: { notify: (msg: string) => notifyCalls.push(msg) },
});
if (sent.length !== 0) fail("triage status: queued a user message to agent");
if (!notifyCalls.includes("Triage status loaded")) {
  fail(`triage status: toast "Triage status loaded" missing, got: ${JSON.stringify(notifyCalls)}`);
}
const triageCard = customMessages.find((m) => m.customType === "triage-status");
if (!triageCard || triageCard.display !== true) {
  fail("triage status: custom card triage-status missing or display false");
}

// --- Hindsight: settle-time reflection pass --------------------------------
// hindsight-didRealWork unit tests (Issue #17)
if (!didRealWork({ content: [{ type: "thinking", thinking: "x".repeat(400) }] })) {
  fail("hindsight-didRealWork: returned false for thinking block >= 400");
}
if (didRealWork({ content: [{ type: "thinking", thinking: "x".repeat(399) }] })) {
  fail("hindsight-didRealWork: returned true for thinking block < 400");
}
if (!didRealWork({ content: [{ type: "tool_use", id: "1", name: "edit" }] })) {
  fail("hindsight-didRealWork: returned false for tool_use");
}
if (!didRealWork({ content: [{ type: "toolCall", id: "1", name: "edit" }] })) {
  fail("hindsight-didRealWork: returned false for toolCall");
}
if (didRealWork({ content: [{ type: "text", text: "Hello" }] })) {
  fail("hindsight-didRealWork: returned true for plain text message");
}


// The handler runs bare (no args) in the command-surface checks above, which
// toggles state — set it explicitly so these assertions are order-independent.
const sessionStop = handlers["session_stop"];
if (!sessionStop) {
  fail("hindsight: session_stop handler not registered");
} else {
  const toolTurn = {
    stop_hook_active: false,
    last_assistant_message: {
      role: "assistant",
      content: [
        { type: "text", text: "found it" },
        { type: "toolCall", id: "t1", name: "bash", input: {} },
      ],
    },
  };
  const thinkingTurn = {
    stop_hook_active: false,
    last_assistant_message: {
      role: "assistant",
      content: [
        { type: "thinking", text: "x".repeat(900) },
        { type: "text", text: "the answer" },
      ],
    },
  };
  const trivialTurn = {
    stop_hook_active: false,
    last_assistant_message: {
      role: "assistant",
      content: [{ type: "text", text: "you're welcome" }],
    },
  };

  // Disabled → no continuation, even for a tool-heavy turn.
  await registered["hindsight"].handler("off", {});
  if (await sessionStop(toolTurn) !== undefined) fail("hindsight: nudged while disabled");

  // Enabled → tool turn gets a { continue: true } continuation with the nudge.
  await registered["hindsight"].handler("on", {});
  const toolResult = await sessionStop(toolTurn);
  if (
    !toolResult ||
    typeof toolResult !== "object" ||
    !("continue" in toolResult) ||
    (toolResult as { continue?: unknown }).continue !== true
  ) {
    fail("hindsight: no continuation for a tool turn");
  } else if (
    !String((toolResult as { additionalContext?: unknown }).additionalContext ?? "").includes(
      "design-level",
    )
  ) {
    fail("hindsight: nudge text missing");
  }

  // Continuation turn (stop_hook_active) → never re-nudged.
  if (await sessionStop({ ...toolTurn, stop_hook_active: true }) !== undefined) {
    fail("hindsight: nudged a continuation turn");
  }

  // Substantial thinking without tools → nudged.
  if (await sessionStop(thinkingTurn) === undefined) {
    fail("hindsight: no nudge for substantial thinking");
  }

  // Trivial turn → passes through.
  if (await sessionStop(trivialTurn) !== undefined) {
    fail("hindsight: nudged a trivial turn");
  }

  // Once per yield: a second session_stop within the same user message (e.g.
  // after an advisor card or reminder turn) must not re-nudge; only a NEW
  // user message re-arms the pass.
  const yieldMessages = [
    { role: "user", content: "first prompt" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "found it" },
        { type: "toolCall", id: "t1", name: "bash", input: {} },
      ],
    },
  ];
  const yieldTurn = {
    stop_hook_active: false,
    last_assistant_message: yieldMessages[1],
    messages: yieldMessages,
  };
  if (await sessionStop(yieldTurn) === undefined) {
    fail("hindsight: no nudge for a fresh user yield");
  }
  if (await sessionStop(yieldTurn) !== undefined) {
    fail("hindsight: re-nudged within the same user yield");
  }
  const newUserTurn = {
    ...yieldTurn,
    messages: [
      ...yieldMessages,
      { role: "user", content: "second prompt" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "t2", name: "bash", input: {} }],
      },
    ],
  };
  if (await sessionStop(newUserTurn) === undefined) {
    fail("hindsight: no nudge for a new user yield");
  }

  // Toggled off again → no continuation.
  await registered["hindsight"].handler("off", {});
  if (await sessionStop(toolTurn) !== undefined) fail("hindsight: nudged after toggle off");

  // Bare toggle flips state and reports the new state in the receipt.
  customMessages.length = 0;
  await registered["hindsight"].handler("", {});
  if (customMessages.length !== 1 || customMessages[0].customType !== "hindsight") {
    fail("hindsight: receipt custom message missing or wrong type");
  } else if (!String(customMessages[0].content ?? "").includes("on")) {
    fail("hindsight: bare toggle did not enable");
  }

  // Status: reports the state without toggling and without a user message.
  sent.length = 0;
  customMessages.length = 0;
  const notifyCalls: string[] = [];
  await registered["hindsight"].handler("status", {
    ui: { notify: (message: string) => notifyCalls.push(message) },
  });
  if (sent.length !== 0) fail("hindsight: status emitted a user message");
  if (customMessages.length !== 1 || !String(customMessages[0].content ?? "").includes("on")) {
    fail("hindsight: status receipt does not report the on state");
  }
  if (notifyCalls.length !== 1) {
    fail("hindsight: status did not toast");
  }
  if (!isHindsightEnabled()) fail("hindsight: status toggled the state");

  // TUI options: typing "/hindsight" surfaces the live state as a dim header
  // before the subcommands, then "on"/"off"/"status" with the state in
  // descriptions. The header (empty value) is a read-only hint.
  const completions = registered["hindsight"].getArgumentCompletions?.("") ?? null;
  if (!completions || completions.length !== 4) {
    fail("hindsight: expected header + on/off/status argument completions");
  } else {
    const header = completions[0];
    if (header.value !== "" || !String(header.label).includes("currently on")) {
      fail("hindsight: header item missing or wrong state");
    }
    const rest = completions.slice(1).map((c) => c.label).sort().join(",");
    if (rest !== "off,on,status") fail(`hindsight: unexpected completion labels: ${rest}`);
    if (!String(completions[1].description ?? "").includes("currently on")) {
      fail("hindsight: completion descriptions do not carry the live state");
    }
  }
  const offOnly = registered["hindsight"].getArgumentCompletions?.("of") ?? null;
  if (!offOnly || offOnly.length !== 1 || offOnly[0]?.label !== "off") {
    fail("hindsight: prefix-filtered completions wrong");
  }
  if (registered["hindsight"].getArgumentCompletions?.("on x") !== null) {
    fail("hindsight: completions offered past the subcommand");
  }

  await registered["hindsight"].handler("off", {});

  // --- Configurable: name, nudge, leadIn, and toggle messages ---------------

  const cfgDir = mkdtempSync(join(tmpdir(), "my-omp-skills-hindsight-cfg-"));
  const cfgPath = join(cfgDir, "hindsight.json");
  // The toggle handler re-reads the config file itself; point it at the temp
  // file via the HINDSIGHT_CONFIG override so the two stay in sync.
  const prevConfigEnv = process.env.HINDSIGHT_CONFIG;
  process.env.HINDSIGHT_CONFIG = cfgPath;
  writeFileSync(
    cfgPath,
    JSON.stringify({
      name: "Second Look",
      nudge: "Did you hit walls that design changes would simplify?",
      leadIn: "Rethinking…",
      onMessage: "Reflection armed",
      offMessage: "Reflection off",
    }),
  );
  reloadHindsightConfig(cfgPath);

  sent.length = 0;
  customMessages.length = 0;
  notifyCalls.length = 0;
  await registered["hindsight"].handler("on", {
    ui: { notify: (message: string) => notifyCalls.push(message) },
  });
  if (sent.length !== 0) fail("hindsight: toggle emitted a user message (model would reply)");
  if (customMessages.length !== 1 || customMessages[0].customType !== "hindsight") {
    fail("hindsight: toggle receipt custom message missing or wrong type");
  } else if (!String(customMessages[0].content ?? "").includes("on")) {
    fail("hindsight: receipt does not report the on state");
  }
  if (notifyCalls.length !== 1 || notifyCalls[0] !== "Reflection armed") {
    fail("hindsight: custom onMessage not used for the toast");
  }
  const customNudge = await sessionStop(toolTurn);
  const nudgeText = String(
    (customNudge as { additionalContext?: unknown } | undefined)?.additionalContext ?? "",
  );
  if (!nudgeText.includes("Second Look")) fail("hindsight: custom name not in nudge");
  if (!nudgeText.includes("Rethinking…")) fail("hindsight: custom leadIn not in nudge");
  if (!nudgeText.includes("Did you hit walls")) fail("hindsight: custom nudge not used");

  // Invalid JSON → defaults; the nudge must not go down, and the toggle stays silent.
  writeFileSync(cfgPath, "{ not json");
  reloadHindsightConfig(cfgPath);
  sent.length = 0;
  await registered["hindsight"].handler("on", {});
  if (sent.length !== 0) fail("hindsight: invalid-config toggle emitted a user message");
  const fallbackNudge = await sessionStop(toolTurn);
  if (
    !String(
      (fallbackNudge as { additionalContext?: unknown } | undefined)?.additionalContext ?? "",
    ).includes("design-level")
  ) {
    fail("hindsight: invalid config broke the default nudge");
  }

  await registered["hindsight"].handler("off", {});
  if (prevConfigEnv === undefined) {
    delete process.env.HINDSIGHT_CONFIG;
  } else {
    process.env.HINDSIGHT_CONFIG = prevConfigEnv;
  }
  reloadHindsightConfig(); // restore the real default path
}

// --- herdr tools (layout / pane / agent) -----------------------------------

// The selftest runs outside herdr, so each tool must (a) be registered with a
// description and zod parameters, and (b) return the gate message instead of
// failing cryptically when HERDR_ENV/HERDR_PANE_ID are unset.
const HERDR_TOOLS = ["herdr_layout", "herdr_pane", "herdr_agent"] as const;
for (const name of HERDR_TOOLS) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    fail(`${name}: not registered`);
    continue;
  }
  if (!tool.description) fail(`${name}: missing description`);
  if (!tool.parameters) fail(`${name}: missing zod parameters`);
  const res = await tool.execute(
    "selftest",
    { action: "list" },
    undefined,
    undefined,
    { cwd: "/tmp" },
  );
  const text = (res.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");
  if (!text.includes("herdr")) {
    fail(`${name}: gate message missing (got: ${text.slice(0, 60)})`);
  }
}

// --- herdr output parsing (JSON envelope vs raw terminal text) -------------

// `pane read`/`agent read` print raw terminal content, everything else prints
// {"id":…,"result":…} / {"error":…}. The parser must classify all three.
{
  const envelope = parseHerdrOutput('{"id":"cli:agent:list","result":{"agents":[]}}');
  if (!envelope.ok || (envelope.value as { agents?: unknown[] })?.agents === undefined) {
    fail("herdr parse: JSON envelope not unwrapped");
  }
  const raw = parseHerdrOutput("base) user@host:~$ echo hi\nhi\n");
  if (!raw.ok || typeof raw.value !== "string" || !raw.value.includes("echo hi")) {
    fail("herdr parse: raw terminal text not passed through");
  }
  const error = parseHerdrOutput('{"error":{"code":"agent_not_found","message":"nope"},"id":"cli:agent:get"}');
  if (error.ok || error.value !== "nope") {
    fail("herdr parse: error envelope not surfaced");
  }
}

// --- run_routine tool + renderer -------------------------------------------
{
  const runRoutineTool = tools.find((t) => t.name === "run_routine");
  if (!runRoutineTool) {
    fail("tool: run_routine not registered");
  } else {
    if (!runRoutineTool.description) fail("run_routine: missing description");
    if (!runRoutineTool.parameters) fail("run_routine: missing zod parameters");

    const routinesDir = join(fixtureRoot, "scripts", "routines");
    mkdirSync(routinesDir, { recursive: true });
    writeFileSync(
      join(routinesDir, "manifest.json"),
      JSON.stringify({
        routines: [
          {
            id: "echo-test",
            name: "Echo Test",
            file: "echo_test.sh",
            description: "Test routine script",
            parameters: [{ name: "MSG", default: "hello", description: "Message" }],
          },
          {
            id: "echo_args",
            name: "Echo Args",
            file: "echo_args.sh",
            description: "Test routine args",
            parameters: [{ name: "output_dir", default: "dist" }],
          },
        ],
      }),
    );
    writeFileSync(
      join(routinesDir, "echo_test.sh"),
      `#!/usr/bin/env bash\nMSG="\${MSG:-hello}"\necho "Routine MSG: \${MSG}"\n`,
    );
    writeFileSync(
      join(routinesDir, "echo_args.sh"),
      `#!/usr/bin/env bash\necho "ARGS: $@"\n`,
    );

    const res = await runRoutineTool.execute(
      "selftest-routine",
      { routineId: "echo-test", args: { MSG: "world" } },
      undefined,
      undefined,
      { cwd: fixtureRoot },
    );

    const resContentText = (res.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");
    if (!resContentText.includes("Routine MSG: world")) {
      fail(`run_routine: execution stdout missing expected output (got: ${resContentText})`);
    }

    interface DetailsResult {
      routineId?: string;
      exitCode?: number;
      success?: boolean;
    }
    const details = res.details as DetailsResult | undefined;
    if (!details || details.exitCode !== 0 || details.success !== true) {
      fail(`run_routine: execution details failed (exitCode: ${details?.exitCode})`);
    }

    if (runRoutineTool.renderResult) {
      const card = runRoutineTool.renderResult(res, { expanded: false }, {}) as TuiContainer;
      if (!card || !(card instanceof TuiContainer)) {
        fail("run_routine: renderResult did not return a Container");
      }
    } else {
      fail("run_routine: missing renderResult renderer");
    }
    const pathTraversalRes = await runRoutineTool.execute(
      "selftest-traversal",
      { routineId: "../../etc/passwd" },
      undefined,
      undefined,
      { cwd: fixtureRoot },
    );
    const traversalText = (pathTraversalRes.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");
    if (!traversalText.includes("Path traversal attempt detected")) {
      fail(`run_routine: path traversal attempt not rejected (got: ${traversalText})`);
    }
    // Parameter defaults test (Issue #18)
    const defaultRes = await runRoutineTool.execute(
      "selftest-routine-default-args",
      { routineId: "echo_args" },
      undefined,
      undefined,
      { cwd: fixtureRoot },
    );
    const defaultText = (defaultRes.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const defaultDetails = defaultRes.details as { args?: Record<string, string> } | undefined;
    if (defaultDetails?.args?.output_dir !== "dist") {
      fail(`run_routine: default args missing output_dir=dist (got: ${JSON.stringify(defaultDetails?.args)})`);
    }
    if (!defaultText.includes("--output-dir dist")) {
      fail(`run_routine: CLI flags missing --output-dir dist (got: ${defaultText})`);
    }

    const overrideRes = await runRoutineTool.execute(
      "selftest-routine-override-args",
      { routineId: "echo_args", args: { output_dir: "custom_out" } },
      undefined,
      undefined,
      { cwd: fixtureRoot },
    );
    const overrideText = (overrideRes.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const overrideDetails = overrideRes.details as { args?: Record<string, string> } | undefined;
    if (overrideDetails?.args?.output_dir !== "custom_out") {
      fail(`run_routine: explicit args override failed (got: ${JSON.stringify(overrideDetails?.args)})`);
    }
    if (!overrideText.includes("--output-dir custom_out")) {
      fail(`run_routine: explicit args CLI flags missing --output-dir custom_out (got: ${overrideText})`);
    }
  }
}

// --- Command Argument Completions -------------------------------------------

{
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-a"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-a", ".git"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-b"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-b", ".git"), { recursive: true });
  // Non-reference directory (no .git) — must NOT appear in update/remove completions.
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-c"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-08-02_deep-demo"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "other-slug"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "scratch", "specs"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".scratch", "specs"), { recursive: true });
  mkdirSync(join(fixtureRoot, "docs", "specs"), { recursive: true });
  writeFileSync(join(fixtureRoot, ".omp", "scratch", "specs", "spec-a.md"), "# Spec A");
  writeFileSync(join(fixtureRoot, ".scratch", "specs", "spec-b.md"), "# Spec B");
  writeFileSync(join(fixtureRoot, "docs", "specs", "spec-c.md"), "# Spec C");
  // /to-spec Finding 4.1 fixture: a feature dir whose spec.md is a *directory*
  // (not a file). The completion must NOT add it as a suggestion.
  mkdirSync(join(fixtureRoot, ".omp", "scratch", "spec-d", "spec.md", "nested"), { recursive: true });
  const prevCwd = process.cwd();
  process.chdir(fixtureRoot);
  try {
    // 1. /reference
    const refSub = registered["reference"].getArgumentCompletions?.("") ?? null;
    if (!refSub || refSub.length !== 5 || refSub[0].value !== "") {
      fail("reference: expected header line (value '') + 4 subcommands for empty prefix");
    } else {
      if (!refSub[0].label.includes("● References:")) {
        fail(`reference: expected live status header, got: ${refSub[0].label}`);
      }
      const labels = refSub.slice(1).map((c) => c.label).sort().join(",");
      if (labels !== "add,list,remove,update") fail(`reference: unexpected subcommand labels: ${labels}`);
    }
    const refUpdate = registered["reference"].getArgumentCompletions?.("update ") ?? null;
    if (!refUpdate || refUpdate.length !== 2) {
      fail("reference: expected 2 reference names for 'update '");
    } else {
      const labels = refUpdate.map((c) => c.label).sort().join(",");
      if (labels !== "ref-a,ref-b") fail(`reference: unexpected update completion labels: ${labels}`);
      if (refUpdate[0].value !== "update ref-a") fail(`reference: unexpected completion value: ${refUpdate[0].value}`);
    }

    const refRemoveFiltered = registered["reference"].getArgumentCompletions?.("remove ref-a") ?? null;
    if (!refRemoveFiltered || refRemoveFiltered.length !== 1 || refRemoveFiltered[0].label !== "ref-a") {
      fail("reference: remove prefix filtering failed");
    }

    if (registered["reference"].getArgumentCompletions?.("add ") !== null) {
      fail("reference: add offered unexpected completions");
    }
    // Finding 4.2: directories without a .git subdirectory must NOT be
    // suggested for /reference update or /reference remove (ref-c lacks .git).
    if (refUpdate && refUpdate.some((c) => c.label === "ref-c")) {
      fail(`reference: ref-c (no .git) leaked into update completions`);
    }
    const refRemoveAny = registered["reference"].getArgumentCompletions?.("remove ") ?? null;
    if (refRemoveAny && refRemoveAny.some((c) => c.label === "ref-c")) {
      fail(`reference: ref-c (no .git) leaked into remove completions`);
    }
    // 1b. /audit
    const auditEmpty = registered["audit"].getArgumentCompletions?.("") ?? null;
    if (
      !auditEmpty ||
      auditEmpty[0].value !== "" ||
      !auditEmpty[0].label.includes("● Audits:") ||
      !auditEmpty.some((c) => c.label === "demo-audit") ||
      !auditEmpty.some((c) => c.label === "complex-audit") ||
      !auditEmpty.some((c) => c.label === "--recent") ||
      !auditEmpty.some((c) => c.label === "status") ||
      !auditEmpty.some((c) => c.label === "list") ||
      !auditEmpty.some((c) => c.label === "view") ||
      !auditEmpty.some((c) => c.label === "subtopics")
    ) {
      fail("audit: expected header (value '') + demo-audit, complex-audit, subcommands (status, list, view, subtopics), and --recent completions for empty prefix");
    }
    const auditFlags = registered["audit"].getArgumentCompletions?.("--") ?? null;
    if (!auditFlags || auditFlags.length !== 2 || !auditFlags.some((c) => c.label === "--recent") || !auditFlags.some((c) => c.label === "--version")) {
      fail("audit: expected --recent and --version for '--'");
    }
    const auditSlugMatch = registered["audit"].getArgumentCompletions?.("demo") ?? null;
    if (!auditSlugMatch || !auditSlugMatch.some((c) => c.label === "demo-audit")) {
      fail("audit: expected demo-audit completion for prefix 'demo'");
    }


    // 1c. /research
    const researchEmpty = registered["research"].getArgumentCompletions?.("") ?? null;
    if (!researchEmpty || researchEmpty.length < 10 || researchEmpty[0].value !== "") {
      fail(`research: expected header (value '') + subcommands and project slugs for empty prefix, got ${researchEmpty?.length}`);
    } else {
      if (!researchEmpty[0].label.includes("● Active research:") && !researchEmpty[0].label.includes("○ No research projects")) {
        fail(`research: expected live status header, got: ${researchEmpty[0].label}`);
      }
      const labels = researchEmpty.map((c) => c.label);
      for (const sub of ["1", "2", "3", "dashboard", "review", "add-items", "add-fields", "status", "run", "off"]) {
        if (!labels.includes(sub)) {
          fail(`research: missing expected subcommand label ${sub}`);
        }
      }
    }

    const researchRev = registered["research"].getArgumentCompletions?.("rev") ?? null;
    if (!researchRev || researchRev.length !== 1 || researchRev[0].label !== "review") {
      fail("research: expected review completion for 'rev'");
    }

    const researchSubSpace = registered["research"].getArgumentCompletions?.("review ") ?? null;
    if (!researchSubSpace || researchSubSpace.length < 2) {
      fail(`research: expected research slugs for 'review ', got ${researchSubSpace?.length}`);
    } else {
      // C3: completions list dated research dirs only, newest first.
      if (researchSubSpace[0].value !== "review 2026-08-02_deep-demo") {
        fail(`research: unexpected completion value for subcommand space: ${researchSubSpace[0].value}`);
      }
      if (researchSubSpace.some((c) => c.label === "other-slug")) {
        fail("research: non-dated research slug was not filtered out");
      }
    }
    // 2. /research-deep
    const deepEmpty = registered["research-deep"].getArgumentCompletions?.("") ?? null;
    if (!deepEmpty || deepEmpty.length < 5) {
      fail("research-deep: expected presets and dated research slugs for empty prefix");
    } else {
      const labels = deepEmpty.map((c) => c.label);
      if (!labels.includes("small") || !labels.includes("medium") || !labels.includes("high")) {
        fail("research-deep: missing preset completions");
      }
      if (!labels.includes("2026-08-01_demo") || !labels.includes("2026-08-02_deep-demo")) {
        fail("research-deep: missing dated research slug completions");
      }
      if (labels.includes("other-slug")) {
        fail("research-deep: non-dated research slug was not filtered out");
      }
    }

    const deepPresetSpace = registered["research-deep"].getArgumentCompletions?.("small ") ?? null;
    if (!deepPresetSpace || deepPresetSpace.length !== 2) {
      fail("research-deep: expected 2 research slugs for 'small '");
    } else {
      if (deepPresetSpace[0].value !== "small 2026-08-02_deep-demo") {
        fail(`research-deep: unexpected completion value for preset space: ${deepPresetSpace[0].value}`);
      }
    }

    // 3. /research-report
    const reportEmpty = registered["research-report"].getArgumentCompletions?.("") ?? null;
    if (!reportEmpty || reportEmpty.length !== 2) {
      fail("research-report: expected dated research slugs for empty prefix");
    } else {
      // C3: completions list dated research dirs only (other-slug is filtered).
      const labels = reportEmpty.map((c) => c.label);
      if (!labels.includes("2026-08-01_demo") || !labels.includes("2026-08-02_deep-demo")) {
        fail("research-report: expected dated research slugs");
      }
      if (labels.includes("other-slug")) {
        fail("research-report: non-dated research slug was not filtered out");
      }
    }

    if (registered["research-report"].getArgumentCompletions?.("slug ") !== null) {
      fail("research-report: completions offered past single slug argument");
    }

    // 4. /record
    const recordEmpty = registered["record"].getArgumentCompletions?.("") ?? null;
    if (!recordEmpty || recordEmpty.length !== 1 || recordEmpty[0].label !== "--recent") {
      fail("record: expected --recent completion");
    }
    if (registered["record"].getArgumentCompletions?.("--recent ") !== null) {
      fail("record: completions offered past --recent");
    }

    // 5. /pitfall
    const pitfallEmpty = registered["pitfall"].getArgumentCompletions?.("") ?? null;
    if (!pitfallEmpty || pitfallEmpty.length !== 1 || pitfallEmpty[0].label !== "--recent") {
      fail("pitfall: expected --recent completion");
    }

    // 6. /triage
    const triageEmpty = registered["triage"].getArgumentCompletions?.("") ?? null;
    if (!triageEmpty || triageEmpty.length !== 2) {
      fail("triage: expected --unlabeled and --needs-triage completions");
    } else {
      const labels = triageEmpty.map((c) => c.label).sort().join(",");
      if (labels !== "--needs-triage,--unlabeled") fail(`triage: unexpected completion labels: ${labels}`);
    }

    // 7. /to-tickets
    const toTicketsEmpty = registered["to-tickets"].getArgumentCompletions?.("") ?? null;
    if (!toTicketsEmpty || toTicketsEmpty.length !== 3) {
      fail(`to-tickets: expected 3 spec markdown files, got ${toTicketsEmpty?.length}`);
    } else {
      const values = toTicketsEmpty.map((c) => c.value).sort().join(",");
      if (values !== ".omp/scratch/specs/spec-a.md,.scratch/specs/spec-b.md,docs/specs/spec-c.md") {
        fail(`to-tickets: unexpected spec file completion values: ${values}`);
      }
    }

    // 8. /routinize
    const routinizeEmpty = registered["routinize"].getArgumentCompletions?.("") ?? null;
    if (!routinizeEmpty || routinizeEmpty.length !== 4 || routinizeEmpty[0].value !== "") {
      fail("routinize: expected header line (value '') + 3 subcommands (scan, run, list) for empty prefix");
    } else {
      if (!routinizeEmpty[0].label.includes("● Routines:") && !routinizeEmpty[0].label.includes("○ No routines")) {
        fail(`routinize: expected live status header, got: ${routinizeEmpty[0].label}`);
      }
      const labels = routinizeEmpty.slice(1).map((c) => c.label).sort().join(",");
      if (labels !== "list,run,scan") fail(`routinize: unexpected subcommand labels: ${labels}`);
    }

    const routinizeRunSpace = registered["routinize"].getArgumentCompletions?.("run ") ?? null;
    if (!routinizeRunSpace || routinizeRunSpace.length === 0) {
      fail("routinize: expected routine ID completions for 'run '");
    } else {
      const labels = routinizeRunSpace.map((c) => c.label).sort();
      if (!labels.includes("echo-test")) {
        fail(`routinize: expected 'echo-test' routine ID in completions (got: ${labels.join(",")})`);
      }
    }

    const routinizeRunFilter = registered["routinize"].getArgumentCompletions?.("run echo") ?? null;
    if (!routinizeRunFilter || routinizeRunFilter.length === 0) {
      fail("routinize: expected filtered routine ID completion for 'run echo'");
    } else {
      if (routinizeRunFilter[0].value !== "run echo-test") {
        fail(`routinize: unexpected completion value for 'run echo': ${routinizeRunFilter[0].value}`);
      }
    }

    // 9. /implement
    const implementEmpty = registered["implement"].getArgumentCompletions?.("") ?? null;
    if (!implementEmpty || implementEmpty.length < 2) {
      fail("implement: expected ticket/spec markdown files for empty prefix");
    } else {
      const labels = implementEmpty.map((c) => c.label);
      if (!labels.includes(".omp/scratch/specs/spec-a.md") || !labels.includes(".scratch/specs/spec-b.md") || !labels.includes("docs/specs/spec-c.md")) {
        fail(`implement: missing expected markdown files (got: ${labels.join(",")})`);
      }
    }

    // 10. /to-spec
    const toSpecEmpty = registered["to-spec"].getArgumentCompletions?.("") ?? null;
    if (!toSpecEmpty || toSpecEmpty.length < 2) {
      fail("to-spec: expected spec markdown files for empty prefix");
    } else {
      const values = toSpecEmpty.map((c) => c.value).sort().join(",");
      if (values !== ".omp/scratch/specs/spec-a.md,.scratch/specs/spec-b.md,docs/specs/spec-c.md") {
        fail(`to-spec: unexpected spec file completion values: ${values}`);
      }
      // Finding 4.1: a directory named spec.md (fixture .omp/scratch/spec-d/spec.md/)
      // must NOT appear in completions.
      if (values.includes("spec-d")) {
        fail(`to-spec: directory named spec.md should be excluded (got: ${values})`);
      }
    }

    // 11. /wayfinder
    // In fixtureRoot, an active ticket exists (my-feature / Implement REST API endpoints)
    const wayfinderWithTicket = registered["wayfinder"].getArgumentCompletions?.("") ?? null;
    if (!wayfinderWithTicket || wayfinderWithTicket.length !== 5 || wayfinderWithTicket[0].value !== "") {
      fail("wayfinder: expected header line (value '') + 4 subcommands when ticket exists");
    } else {
      if (!wayfinderWithTicket[0].label.includes("● Active frontier: my-feature / Implement REST API endpoints")) {
        fail(`wayfinder: expected active frontier header, got: ${wayfinderWithTicket[0].label}`);
      }
      const labels = wayfinderWithTicket.slice(1).map((c) => c.label).sort().join(",");
      if (labels !== "list,map,resolve,status") {
        fail(`wayfinder: unexpected subcommand labels: ${labels}`);
      }
    }

    const wayfinderS = registered["wayfinder"].getArgumentCompletions?.("s") ?? null;
    if (!wayfinderS || wayfinderS.length !== 1 || wayfinderS[0].label !== "status" || wayfinderS[0].value !== "status") {
      fail("wayfinder: expected 'status' completion without header for prefix 's'");
    }

    // Verify wayfinder header when no ticket exists
    const emptyDir = mkdtempSync(join(tmpdir(), "omp-wayfinder-empty-"));
    try {
      process.chdir(emptyDir);
      const wayfinderNoTicket = registered["wayfinder"].getArgumentCompletions?.("") ?? null;
      if (!wayfinderNoTicket || wayfinderNoTicket.length !== 5 || wayfinderNoTicket[0].value !== "") {
        fail("wayfinder: expected header (value '') + 4 subcommands when no ticket exists");
      } else {
        if (!wayfinderNoTicket[0].label.includes("○ No active frontier ticket")) {
          fail(`wayfinder: expected '○ No active frontier ticket' header, got: ${wayfinderNoTicket[0].label}`);
        }
      }
    } finally {
      process.chdir(fixtureRoot);
      rmSync(emptyDir, { recursive: true, force: true });
    }

    // 12. /omp-setup
    const setupEmpty = registered["omp-setup"].getArgumentCompletions?.("") ?? null;
    if (!setupEmpty || setupEmpty.length !== 5) {
      fail("omp-setup: expected 5 setup target completions for empty prefix");
    } else {
      const labels = setupEmpty.map((c) => c.label).sort().join(",");
      if (labels !== "domain,github,gitlab,labels,local") {
        fail(`omp-setup: unexpected setup target labels: ${labels}`);
      }
    }

    // 13. /ask-me
    const askMeEmpty = registered["ask-me"].getArgumentCompletions?.("") ?? null;
    if (!askMeEmpty || askMeEmpty.length < 31) {
      fail(`ask-me: expected 26 command names + 5 category keywords for empty prefix, got ${askMeEmpty?.length}`);
    } else {
      const labels = askMeEmpty.map((c) => c.label);
      for (const cat of ["plan", "ship", "research", "knowledge", "upkeep"]) {
        if (!labels.includes(cat)) fail(`ask-me: missing expected category keyword ${cat}`);
      }
      for (const cmd of ["audit", "implement", "to-spec", "wayfinder", "omp-setup"]) {
        if (!labels.includes(cmd)) fail(`ask-me: missing expected command ${cmd}`);
      }
    }

    // 14. /grill-me & /grill-with-docs
    const grillMeEmpty = registered["grill-me"].getArgumentCompletions?.("") ?? null;
    if (!grillMeEmpty || grillMeEmpty.length === 0) {
      fail("grill-me: expected spec filenames / feature names for empty prefix");
    } else {
      const labels = grillMeEmpty.map((c) => c.label);
      if (!labels.includes(".omp/scratch/specs/spec-a.md") || !labels.includes(".scratch/specs/spec-b.md") || !labels.includes("docs/specs/spec-c.md")) {
        fail(`grill-me: missing expected spec file completions (got: ${labels.join(",")})`);
      }
    }

    const grillDocsEmpty = registered["grill-with-docs"].getArgumentCompletions?.("") ?? null;
    if (!grillDocsEmpty || grillDocsEmpty.length === 0) {
      fail("grill-with-docs: expected spec filenames / feature names for empty prefix");
    } else {
      const labels = grillDocsEmpty.map((c) => c.label);
      if (!labels.includes(".omp/scratch/specs/spec-a.md") || !labels.includes(".scratch/specs/spec-b.md") || !labels.includes("docs/specs/spec-c.md")) {
        fail(`grill-with-docs: missing expected spec file completions (got: ${labels.join(",")})`);
      }
    }
  } finally {
    process.chdir(prevCwd);
  }
}

// --- /reference: LOCAL deterministic handler --------------------------------
// The command runs git itself and must NEVER queue a user message (zero
// agent turns). Each subcommand reports via a reference-result card + UI
// toast. The MY_OMP_SKILLS_TEST_ROOT override points the write paths at a
// temp fixture so the real .omp/references/ is never touched. The seed is a
// real git repo cloned through a file:// URL; `git init -b main` becomes
// init + symbolic-ref for git < 2.28 compatibility.
{
  const refFixture = mkdtempSync(join(tmpdir(), "my-omp-reference-test-"));
  const seedRepo = join(refFixture, "seed");
  const refRoot = join(refFixture, "root");
  // Identity via env vars, never repo-level config: this machine's git init
  // template ships a pre-commit hook that rejects commits with local
  // user.name/user.email (identity must inherit the global config).
  const git = (args: string[], cwd: string): string => {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "selftest",
        GIT_AUTHOR_EMAIL: "selftest@example.com",
        GIT_COMMITTER_NAME: "selftest",
        GIT_COMMITTER_EMAIL: "selftest@example.com",
      },
    });
    return out.trim();
  };
  mkdirSync(seedRepo, { recursive: true }); // execFileSync cwd must exist before git init runs
  git(["init"], seedRepo);
  git(["symbolic-ref", "HEAD", "refs/heads/main"], seedRepo);
  writeFileSync(join(seedRepo, "seed.txt"), "hello");
  git(["add", "seed.txt"], seedRepo);
  git(["commit", "-m", "seed"], seedRepo);
  const seedUrl = `file://${seedRepo}`;
  const refResultCard = (): string =>
    String(customMessages.find((m) => m.customType === "reference-result")?.content ?? "");

  const prevRefEnv = process.env.MY_OMP_SKILLS_TEST_ROOT;
  process.env.MY_OMP_SKILLS_TEST_ROOT = refRoot;
  try {
    // add: clones, creates .gitignore line, reports remote + HEAD, no user message.
    sent.length = 0;
    customMessages.length = 0;
    const addToasts: string[] = [];
    await registered["reference"].handler(`add ${seedUrl}`, { ui: { notify: (m: string) => addToasts.push(m) } });
    if (sent.length !== 0) fail("reference add: queued a user message to agent");
    if (!existsSync(join(refRoot, ".omp", "references", "seed", "seed.txt"))) {
      fail("reference add: committed file missing after clone");
    }
    const gitignoreContent = existsSync(join(refRoot, ".gitignore"))
      ? readFileSync(join(refRoot, ".gitignore"), "utf8")
      : "";
    if (!gitignoreContent.includes(".omp/references/")) {
      fail("reference add: .gitignore missing the .omp/references/ line");
    }
    if (!addToasts.some((t) => t.includes("Cloning"))) fail("reference add: no cloning toast");
    const addContent = refResultCard();
    if (!addContent.includes("seed") || !addContent.includes(seedUrl) || !addContent.includes("HEAD")) {
      fail(`reference add: card missing name/remote/HEAD: ${addContent}`);
    }
    const seedHead1 = git(["rev-parse", "HEAD"], seedRepo);

    // add duplicate → error toast mentioning /reference update; nothing re-cloned.
    sent.length = 0;
    customMessages.length = 0;
    const dupToasts: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["reference"].handler(`add ${seedUrl}`, {
      ui: { notify: (m: string, l?: string) => { dupToasts.msgs.push(m); dupToasts.levels.push(l ?? ""); } },
    });
    if (sent.length !== 0) fail("reference add (duplicate): queued a user message to agent");
    if (!dupToasts.levels.includes("error")) fail("reference add (duplicate): expected error toast");
    if (!dupToasts.msgs.some((m) => m.includes("update"))) {
      fail("reference add (duplicate): error does not mention /reference update");
    }

    // update: new upstream commit → HEAD before → after moves.
    writeFileSync(join(seedRepo, "seed2.txt"), "world");
    git(["add", "seed2.txt"], seedRepo);
    git(["commit", "-m", "second"], seedRepo);
    const seedHead2 = git(["rev-parse", "HEAD"], seedRepo);
    sent.length = 0;
    customMessages.length = 0;
    const updToasts: string[] = [];
    await registered["reference"].handler("update seed", { ui: { notify: (m: string) => updToasts.push(m) } });
    if (sent.length !== 0) fail("reference update: queued a user message to agent");
    if (!refResultCard().includes(`${seedHead1} → ${seedHead2}`)) {
      fail(`reference update: HEAD did not move ${seedHead1} → ${seedHead2}, card: ${refResultCard()}`);
    }
    if (!updToasts.some((t) => t.includes("seed"))) fail("reference update: toast missing name");

    // list: fixture corpus with remote + HEAD.
    sent.length = 0;
    customMessages.length = 0;
    await registered["reference"].handler("list", { ui: { notify: () => {} } });
    if (sent.length !== 0) fail("reference list: queued a user message to agent");
    const listContent = refResultCard();
    if (!listContent.includes("seed") || !listContent.includes(seedUrl) || !listContent.includes(seedHead2)) {
      fail(`reference list: corpus card missing name/remote/HEAD: ${listContent}`);
    }

    // remove: directory gone, toast reports it.
    sent.length = 0;
    customMessages.length = 0;
    const rmToasts: string[] = [];
    await registered["reference"].handler("remove seed", { ui: { notify: (m: string) => rmToasts.push(m) } });
    if (sent.length !== 0) fail("reference remove: queued a user message to agent");
    if (existsSync(join(refRoot, ".omp", "references", "seed"))) {
      fail("reference remove: directory still present after removal");
    }
    if (!rmToasts.some((t) => t.includes("seed"))) fail("reference remove: toast missing name");

    // remove refusal: traversal must be refused and delete nothing.
    sent.length = 0;
    customMessages.length = 0;
    const refuseToasts: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["reference"].handler("remove ../escape", {
      ui: { notify: (m: string, l?: string) => { refuseToasts.msgs.push(m); refuseToasts.levels.push(l ?? ""); } },
    });
    if (sent.length !== 0) fail("reference remove (traversal): queued a user message to agent");
    if (!refuseToasts.levels.includes("error")) fail("reference remove (traversal): expected error toast");
    if (existsSync(join(refFixture, "escape")) || existsSync(join(refRoot, ".omp", "references", "escape"))) {
      fail("reference remove (traversal): escaped the corpus");
    }

    // list (bare = list) on the now-empty corpus → empty message.
    sent.length = 0;
    customMessages.length = 0;
    await registered["reference"].handler("", { ui: { notify: () => {} } });
    if (sent.length !== 0) fail("reference list (bare): queued a user message to agent");
    if (!refResultCard().includes("empty")) fail("reference list (bare): missing empty-corpus message");

    // bad URL → error toast, no throw, no stray directory.
    sent.length = 0;
    customMessages.length = 0;
    const badToasts: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["reference"].handler("add file:///nonexistent/no-such-repo", {
      ui: { notify: (m: string, l?: string) => { badToasts.msgs.push(m); badToasts.levels.push(l ?? ""); } },
    });
    if (sent.length !== 0) fail("reference add (bad url): queued a user message to agent");
    if (!badToasts.levels.includes("error")) fail("reference add (bad url): expected error toast");
    if (existsSync(join(refRoot, ".omp", "references", "no-such-repo"))) {
      fail("reference add (bad url): stray directory created on failure");
    }

    // unknown subcommand → error toast, no throw.
    sent.length = 0;
    customMessages.length = 0;
    const unknownToasts: { msgs: string[]; levels: string[] } = { msgs: [], levels: [] };
    await registered["reference"].handler("frobnicate", {
      ui: { notify: (m: string, l?: string) => { unknownToasts.msgs.push(m); unknownToasts.levels.push(l ?? ""); } },
    });
    if (sent.length !== 0) fail("reference unknown subcommand: queued a user message to agent");
    if (!unknownToasts.levels.includes("error")) fail("reference unknown subcommand: expected error toast");
  } finally {
    if (prevRefEnv === undefined) delete process.env.MY_OMP_SKILLS_TEST_ROOT;
    else process.env.MY_OMP_SKILLS_TEST_ROOT = prevRefEnv;
    rmSync(refFixture, { recursive: true, force: true });
  }
}
// --- Prompt Clarification Unit Tests ---
{
  // 1. isVagueInput
  const falseVague = ["git status", "npm test", "/math", "cargo check", "ls -la", "fix typo in README"];
  for (const str of falseVague) {
    if (isVagueInput(str)) fail(`isVagueInput('${str}') should be false`);
  }

  const trueVague = ["", "a", "???", "fix it", "do this", "make it better", "optimize this"];
  for (const str of trueVague) {
    if (!isVagueInput(str)) fail(`isVagueInput('${str}') should be true`);
  }

  // 2. shouldBypassClarify
  if (!shouldBypassClarify("~ fix the bug")) fail("shouldBypassClarify('~ fix the bug') should be true");
  if (!shouldBypassClarify("  ~~do this")) fail("shouldBypassClarify('  ~~do this') should be true");
  if (shouldBypassClarify("fix the bug")) fail("shouldBypassClarify('fix the bug') should be false");

  // 3. stripClarifyBypassPrefix
  if (stripClarifyBypassPrefix("~ fix the bug") !== "fix the bug") {
    fail(`stripClarifyBypassPrefix mismatch: ${stripClarifyBypassPrefix("~ fix the bug")}`);
  }
  if (stripClarifyBypassPrefix("~~fix the bug") !== "fix the bug") {
    fail(`stripClarifyBypassPrefix mismatch for ~~: ${stripClarifyBypassPrefix("~~fix the bug")}`);
  }
  if (stripClarifyBypassPrefix("  ~~~ fix the bug") !== "fix the bug") {
    fail(`stripClarifyBypassPrefix mismatch for ~~~: ${stripClarifyBypassPrefix("  ~~~ fix the bug")}`);
  }
  if (stripClarifyBypassPrefix("fix the bug") !== "fix the bug") {
    fail(`stripClarifyBypassPrefix mismatch for non-prefixed: ${stripClarifyBypassPrefix("fix the bug")}`);
  }

  // 4. State & System Prompt Injection
  setClarifyEnabled(false);
  setClarifyDebugEnabled(false);
  if (isClarifyDebugEnabled()) fail("setClarifyDebugEnabled(false) failed");
  setClarifyDebugEnabled(true);
  if (!isClarifyDebugEnabled()) fail("setClarifyDebugEnabled(true) failed");
  // Completion surface (Issue #6): header + on/off/debug/status with trailing
  // spaces, header only when no argument is typed, prefix filtering on label.
  setClarifyEnabled(false);
  setClarifyDebugEnabled(false);
  const clarifyEmpty = registered["clarify"].getArgumentCompletions?.("") ?? null;
  if (!clarifyEmpty) {
    fail("clarify: expected completions for empty prefix");
  } else {
    if (clarifyEmpty.length !== 5) {
      fail(`clarify: expected 5 entries (1 header + 4 options) for empty prefix, got ${clarifyEmpty.length}`);
    }
    const expectedLabels = ["on", "off", "debug", "status"].sort().join(",");
    const actualLabels = clarifyEmpty.slice(1).map((c) => c.label).sort().join(",");
    if (actualLabels !== expectedLabels) {
      fail(`clarify: unexpected option labels: ${actualLabels}`);
    }
    // Header state indicator mirrors the live state (currently off).
    const header = clarifyEmpty[0];
    if (header.value !== "") fail("clarify: header should have empty value");
    if (!header.label.includes("○") || !header.label.toLowerCase().includes("off")) {
      fail(`clarify: header state indicator should reflect off state, got: ${header.label}`);
    }
    // Trailing-space convention on every option value.
    for (const opt of clarifyEmpty.slice(1)) {
      if (opt.value !== `${opt.label} `) {
        fail(`clarify: option value should be "${opt.label} " (trailing space), got: "${opt.value}"`);
      }
    }
  }
  // Prefix filter "d" matches label.startsWith('d') — only debug qualifies;
  // status starts with 's', so it's filtered out (matches /hindsight).
  const clarifyD = registered["clarify"].getArgumentCompletions?.("d") ?? null;
  if (!clarifyD || clarifyD.length !== 1 || clarifyD[0].label !== "debug") {
    fail(`clarify: expected 1 match 'debug' for 'd', got ${JSON.stringify(clarifyD?.map((c) => c.label))}`);
  } else {
    if (!clarifyD[0].value.endsWith(" ")) {
      fail("clarify: 'debug' option must carry trailing space in value");
    }
    if (clarifyD[0].value === "") {
      fail("clarify: prefix 'd' must NOT include the header (empty value)");
    }
  }
  // Prefix filter "s" matches label.startsWith('s') — only status qualifies.
  const clarifyS = registered["clarify"].getArgumentCompletions?.("s") ?? null;
  if (!clarifyS || clarifyS.length !== 1 || clarifyS[0].label !== "status") {
    fail(`clarify: expected 1 match 'status' for 's', got ${JSON.stringify(clarifyS?.map((c) => c.label))}`);
  }
  // Past the subcommand: return null (subcommands take no further argument).
  if (registered["clarify"].getArgumentCompletions?.("debug ") !== null) {
    fail("clarify: completions offered past 'debug ' (subcommands take no further argument)");
  }
  if (registered["clarify"].getArgumentCompletions?.("on ") !== null) {
    fail("clarify: completions offered past 'on ' (subcommands take no further argument)");
  }
  // No match for a nonsense prefix.
  if (registered["clarify"].getArgumentCompletions?.("xyz") !== null) {
    fail("clarify: completions offered for unknown prefix 'xyz'");
  }
  // Header tracks live state: enable, header should show ● on.
  setClarifyEnabled(true);
  const clarifyEnabled = registered["clarify"].getArgumentCompletions?.("") ?? null;
  if (!clarifyEnabled || !clarifyEnabled[0]?.label.includes("●") || !clarifyEnabled[0]?.label.toLowerCase().includes("on")) {
    fail(`clarify: header state indicator should reflect on state, got: ${clarifyEnabled?.[0]?.label}`);
  }
  // Restore the baseline state for the rest of the tests.
  setClarifyEnabled(false);
  setClarifyDebugEnabled(false);

  const notifyMsgs: string[] = [];
  const testCtx = { ui: { notify: (m: string) => notifyMsgs.push(m) } };

  // Toggle on
  registered["clarify"].handler("on", testCtx);
  if (!isClarifyEnabled()) fail("/clarify on failed to enable clarification");
  if (!notifyMsgs.some((m) => m.includes("enabled"))) fail("/clarify on missing notify enabled");

  // Toggle off
  notifyMsgs.length = 0;
  registered["clarify"].handler("off", testCtx);
  if (isClarifyEnabled()) fail("/clarify off failed to disable clarification");
  if (!notifyMsgs.some((m) => m.includes("disabled"))) fail("/clarify off missing notify disabled");

  // Toggle debug on / off / toggle / status
  notifyMsgs.length = 0;
  registered["clarify"].handler("debug on", testCtx);
  if (!isClarifyDebugEnabled()) fail("/clarify debug on failed to enable debug mode");
  if (!notifyMsgs.some((m) => m.includes("debug mode enabled"))) fail("/clarify debug on missing notify");

  notifyMsgs.length = 0;
  registered["clarify"].handler("debug off", testCtx);
  if (isClarifyDebugEnabled()) fail("/clarify debug off failed to disable debug mode");
  if (!notifyMsgs.some((m) => m.includes("debug mode disabled"))) fail("/clarify debug off missing notify");

  notifyMsgs.length = 0;
  registered["clarify"].handler("debug", testCtx);
  if (!isClarifyDebugEnabled()) fail("/clarify debug failed to toggle debug mode");
  if (!notifyMsgs.some((m) => m.includes("debug mode enabled"))) fail("/clarify debug missing notify");

  notifyMsgs.length = 0;
  registered["clarify"].handler("status", testCtx);
  if (!notifyMsgs.some((m) => m.includes("Prompt clarification is") && m.includes("debug: enabled"))) {
    fail(`/clarify status notification missing/mismatched: ${notifyMsgs.join("; ")}`);
  }

  // Toggle (bare)
  registered["clarify"].handler("", testCtx);
  if (!isClarifyEnabled()) fail("bare /clarify failed to toggle to enabled");

  // Input hook & source check
  const inputFn = handlers["input"];
  const extensionInputEvent = { source: "extension", text: "~ fix the bug" };
  if (inputFn) {
    const resExt = inputFn(extensionInputEvent) as { action?: string } | undefined;
    if (resExt?.action !== "continue" || extensionInputEvent.text !== "~ fix the bug") {
      fail("input hook did not return { action: 'continue' } for event with source='extension'");
    }

    const normEvent = { text: "normal request" };
    const resNorm = inputFn(normEvent) as { action?: string } | undefined;
    if (resNorm?.action !== "continue") {
      fail("input hook did not return { action: 'continue' } for normal request");
    }
  }

  const inputEvent = { text: "~ fix the bug" };
  const inputResult = inputFn ? (inputFn(inputEvent) as { action?: string; text?: string } | undefined) : undefined;
  if (inputEvent.text !== "fix the bug" || inputResult?.action !== "transform" || inputResult?.text !== "fix the bug") {
    fail(`input hook did not return { action: 'transform', text }: action=${inputResult?.action}, text=${inputResult?.text}`);
  }
  // System prompt injection when bypassed: should NOT inject
  const startEventBypassed = { systemPrompt: "BASE_PROMPT" };
  const beforeStartFn = handlers["before_agent_start"];
  if (beforeStartFn) beforeStartFn(startEventBypassed);
  if (startEventBypassed.systemPrompt.includes("Prompt Clarification Active")) {
    fail("systemPrompt injected clarification prompt even when turn was bypassed");
  }

  // System prompt injection when enabled & not bypassed: SHOULD inject
  const startEventActive = { systemPrompt: "BASE_PROMPT" };
  if (beforeStartFn) {
    beforeStartFn(startEventActive);
    // Deduplication check: call twice, should not double-append
    beforeStartFn(startEventActive);
  }
  const injectCount = (startEventActive.systemPrompt.match(/Prompt Clarification Active/g) || []).length;
  if (injectCount !== 1) {
    fail(`systemPrompt deduplication failed: expected 1 injection, got ${injectCount}`);
  }

  // selectedTools filtering check
  setClarifyEnabled(true);
  const startEventFiltered = {
    systemPrompt: "BASE_PROMPT",
    systemPromptOptions: { selectedTools: ["read"] },
  };
  if (beforeStartFn) beforeStartFn(startEventFiltered);
  if (startEventFiltered.systemPrompt.includes("Prompt Clarification Active")) {
    fail("systemPrompt injected prompt clarification despite selectedTools excluding clarify_prompt");
  }

  const startEventIncluded = {
    systemPrompt: "BASE_PROMPT",
    systemPromptOptions: { selectedTools: ["clarify_prompt", "read"] },
  };
  if (beforeStartFn) beforeStartFn(startEventIncluded);
  if (!startEventIncluded.systemPrompt.includes("Prompt Clarification Active")) {
    fail("systemPrompt missing prompt clarification when selectedTools includes clarify_prompt");
  }

  // Debug card emission test
  setClarifyEnabled(true);
  setClarifyDebugEnabled(true);
  customMessages.length = 0;

  const startEventDebug = { promptText: "please fix it", systemPrompt: "BASE_PROMPT" };
  if (beforeStartFn) beforeStartFn(startEventDebug);
  const debugMsg = customMessages.find((m) => m.customType === "clarify-debug");
  if (!debugMsg || typeof debugMsg.content !== "string" || !debugMsg.content.includes("please fix it")) {
    fail(`clarify-debug message not sent in before_agent_start: ${JSON.stringify(debugMsg)}`);
  }

  // Render clarify-debug message
  const clarifyDebugRenderer = renderers["clarify-debug"];
  if (!clarifyDebugRenderer) {
    fail("clarify-debug message renderer not registered");
  } else {
    const renderedCard = clarifyDebugRenderer(
      { content: "- System Prompt Injection: ACTIVE\n- Prompt Text: fix it\n- Injected Guidelines: Present" },
      {},
      {},
    ) as { children?: Array<{ text?: string }> };
    if (!renderedCard || !renderedCard.children) {
      fail("clarify-debug message renderer returned invalid Container");
    }
  }
  // 5. clarify_prompt tool execution and renderers
  const clarifyTool = tools.find((t) => t.name === "clarify_prompt");
  if (!clarifyTool) {
    fail("clarify_prompt tool not registered");
  } else {
    // Non-interactive fallback check
    const resNonInteractive = await clarifyTool.execute(
      "call_non_interactive",
      { question: "Which option?", options: ["Opt 1"] },
      undefined,
      undefined,
      { cwd: process.cwd(), hasUI: false },
    );
    if (
      !(resNonInteractive.details as Record<string, unknown> | undefined)?.nonInteractive ||
      !resNonInteractive.content[0]?.text.includes("Non-interactive session")
    ) {
      fail(`clarify_prompt non-interactive fallback failed: ${JSON.stringify(resNonInteractive)}`);
    }

    // Option padding check (passing 1 option pads to 3+ choices plus custom option)
    let optionsSeenBySelect: string[] = [];
    const mockPaddingCtx = {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        select: async (_q: string, opts: string[]) => {
          optionsSeenBySelect = opts;
          return opts[0];
        },
      },
    };
    await clarifyTool.execute(
      "call_pad",
      { question: "Choose:", options: ["Single Option"] },
      undefined,
      undefined,
      mockPaddingCtx,
    );
    if (optionsSeenBySelect.length < 4) {
      fail(
        `clarify_prompt option padding failed: expected at least 4 choices (3 options + custom), got ${optionsSeenBySelect.length}`,
      );
    }

    // Select option 1
    let selectedOption: string | undefined = "Option 1";
    let inputAnswer: string | undefined = undefined;

    const mockToolCtx = {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        select: async (_q: string, _opts: string[]) => selectedOption,
        input: async (_t: string) => inputAnswer,
      },
      abort: () => {},
    };

    const res1 = await clarifyTool.execute(
      "call_1",
      { question: "Which approach?", options: ["Option 1", "Option 2", "Option 3"] },
      undefined,
      undefined,
      mockToolCtx,
    );
    if (!res1.content[0]?.text.includes("Option 1")) {
      fail(`clarify_prompt execute result mismatch: ${res1.content[0]?.text}`);
    }

    // Select custom answer
    selectedOption = "Your answer...";
    inputAnswer = "Custom response";
    const res2 = await clarifyTool.execute(
      "call_2",
      { question: "Which approach?", options: ["Option 1", "Option 2", "Option 3"] },
      undefined,
      undefined,
      mockToolCtx,
    );
    if (!res2.content[0]?.text.includes("Custom response")) {
      fail(`clarify_prompt execute custom answer mismatch: ${res2.content[0]?.text}`);
    }

    // Cancellation via select
    selectedOption = undefined;
    let aborted = false;
    const resCancel = await clarifyTool.execute(
      "call_3",
      { question: "Which approach?", options: ["Option 1", "Option 2", "Option 3"] },
      undefined,
      undefined,
      { ...mockToolCtx, abort: () => { aborted = true; } },
    );
    if (!aborted || !resCancel.content[0]?.text.includes("skipped")) {
      fail(`clarify_prompt cancellation failed: aborted=${aborted}, text=${resCancel.content[0]?.text}`);
    }

    // Aborted signal check
    const resAbortedSignal = await clarifyTool.execute(
      "call_signal",
      { question: "Which approach?", options: ["Option 1"] },
      { aborted: true } as unknown as AbortSignal,
      undefined,
      mockToolCtx,
    );
    if (!(resAbortedSignal.details as Record<string, unknown> | undefined)?.cancelled) {
      fail("clarify_prompt aborted signal check failed");
    }

    // Renderers
    const mockTheme = {
      fg: (color: string, text: string) => `<fg color="${color}">${text}</fg>`,
      bold: (text: string) => `<b>${text}</b>`,
    };

    // Renderers
    if (clarifyTool.renderCall) {
      const renderedCall = clarifyTool.renderCall(
        { question: "Which approach?", options: ["Option 1", "Option 2", "Option 3"] },
        { expanded: true },
        {},
      ) as { children: Array<{ text: string }> };
      if (!renderedCall || !renderedCall.children) {
        fail("clarify_prompt renderCall returned invalid Container");
      }

      const renderedThemedCall = clarifyTool.renderCall(
        { question: "Which approach?", options: ["Option 1"] },
        { expanded: true },
        mockTheme,
      ) as { children: Array<{ text: string }> };
      const callText = renderedThemedCall.children.map((c) => c.text).join("\n");
      if (!callText.includes('<fg color="toolTitle"><b>CLARIFY</b></fg>')) {
        fail(`renderCall theme styling failed: ${callText}`);
      }

      // Defensive tests for renderCall
      const rCallNull = clarifyTool.renderCall(null as unknown as Record<string, unknown>, { expanded: true }, {});
      if (!rCallNull) fail("renderCall(null) returned falsy");
      const rCallEmpty = clarifyTool.renderCall({}, { expanded: true }, {});
      if (!rCallEmpty) fail("renderCall({}) returned falsy");
      const rCallInvalid = clarifyTool.renderCall({ question: 123, options: "not-an-array" }, { expanded: true }, {});
      if (!rCallInvalid) fail("renderCall(invalid) returned falsy");
    }

    if (clarifyTool.renderResult) {
      const renderedResult = clarifyTool.renderResult(
        res1,
        { expanded: true },
        {},
      ) as { children: Array<{ text: string }> };
      if (!renderedResult || !renderedResult.children) {
        fail("clarify_prompt renderResult returned invalid Container");
      }

      const renderedSuccessResult = clarifyTool.renderResult(
        res1,
        { expanded: true },
        mockTheme,
      ) as { children: Array<{ text: string }> };
      const successText = renderedSuccessResult.children.map((c) => c.text).join("\n");
      if (!successText.includes('<fg color="success"><b>CLARIFY ANSWER</b></fg>')) {
        fail(`renderResult success theme styling failed: ${successText}`);
      }

      const renderedCancelResult = clarifyTool.renderResult(
        resCancel,
        { expanded: true },
        mockTheme,
      ) as { children: Array<{ text: string }> };
      const cancelText = renderedCancelResult.children.map((c) => c.text).join("\n");
      if (!cancelText.includes('<fg color="warning"><b>CLARIFY ANSWER</b></fg>')) {
        fail(`renderResult cancellation theme styling failed: ${cancelText}`);
      }

      // Defensive tests for renderResult
      const rResNull = clarifyTool.renderResult(null as unknown as ToolResult, { expanded: true }, {});
      if (!rResNull) fail("renderResult(null) returned falsy");
      const rResEmpty = clarifyTool.renderResult({} as ToolResult, { expanded: true }, {});
      if (!rResEmpty) fail("renderResult({}) returned falsy");
      const rResMissingText = clarifyTool.renderResult({ content: [{ type: "other" }] } as unknown as ToolResult, { expanded: true }, {});
      if (!rResMissingText) fail("renderResult(missing text) returned falsy");
    }
  }

  // Reset clarify state back to disabled
  setClarifyEnabled(false);
}

// --- kb-index-injector ------------------------------------------------------

// Pure-function dedup helper checks. These are independent of any mock state
// and run first.
if (systemPromptHasSection("")) fail("kb-index-injector: systemPromptHasSection(\"\") must be false");
if (systemPromptHasSection("foo")) fail("kb-index-injector: systemPromptHasSection(\"foo\") must be false");
if (!systemPromptHasSection(SECTION_MARKER)) {
  fail("kb-index-injector: systemPromptHasSection(SECTION_MARKER) must be true");
}
if (!systemPromptHasSection("prefix " + SECTION_MARKER + " suffix")) {
  fail("kb-index-injector: substring match must succeed for wrapped marker");
}

// formatIndexSection with a non-existent cwd → "" (no FS work to do).
if (formatIndexSection("/nonexistent-kb-index-path-" + Date.now()) !== "") {
  fail("kb-index-injector: formatIndexSection(nonexistent) must return \"\"");
}

// Seed a tmpdir with 3 records + 2 pitfalls. Bump mtime deterministically so
// the most-recent ordering is predictable.
const kbIndexDir = mkdtempSync(join(tmpdir(), "my-omp-kb-index-"));
mkdirSync(join(kbIndexDir, ".omp", "knowledge", "records"), { recursive: true });
mkdirSync(join(kbIndexDir, ".omp", "knowledge", "pitfalls"), { recursive: true });
const seededRecordNames = ["2026-08-01_first.md", "2026-08-02_second.md", "2026-08-03_third.md"];
const seededPitfallNames = ["2026-08-04_alpha.md", "2026-08-05_beta.md"];
for (const name of seededRecordNames) {
  writeFileSync(join(kbIndexDir, ".omp", "knowledge", "records", name), "stub");
}
for (const name of seededPitfallNames) {
  writeFileSync(join(kbIndexDir, ".omp", "knowledge", "pitfalls", name), "stub");
}
// Bump mtime so records[2] is newest, records[0] is oldest; same for pitfalls.
const now = Date.now();
for (let i = 0; i < seededRecordNames.length; i += 1) {
  const ts = (now / 1000) - (seededRecordNames.length - i);
  utimesSync(join(kbIndexDir, ".omp", "knowledge", "records", seededRecordNames[i]), ts, ts);
}
for (let i = 0; i < seededPitfallNames.length; i += 1) {
  const ts = (now / 1000) - (seededPitfallNames.length - i);
  utimesSync(join(kbIndexDir, ".omp", "knowledge", "pitfalls", seededPitfallNames[i]), ts, ts);
}

// formatIndexSection with seeded KB but zero counters → still produces a
// section listing the files. Counter text reflects getRecordCount/getPitfallCount.
resetKbIngestSession();
recordIngest("record");
recordIngest("record");
recordIngest("record");
recordIngest("pitfall");
recordIngest("pitfall");
const sectionWithSeeds = formatIndexSection(kbIndexDir);
if (!sectionWithSeeds.includes(SECTION_MARKER)) {
}
for (const name of seededRecordNames) {
  if (!sectionWithSeeds.includes(name)) {
    fail(`kb-index-injector: formatIndexSection missing record ${name}`);
  }
}
for (const name of seededPitfallNames) {
  if (!sectionWithSeeds.includes(name)) {
    fail(`kb-index-injector: formatIndexSection missing pitfall ${name}`);
  }
}
if (!sectionWithSeeds.includes("You have ingested 3 records and 2 pitfalls this session.")) {
  fail(`kb-index-injector: counter text wrong; got: ${JSON.stringify(sectionWithSeeds)}`);
}

// Cap: 7 record files → only 5 listed in the section. The counter line
// still reflects whatever session counters are set (1 record here).
resetKbIngestSession();
const kbIndexCapDir = mkdtempSync(join(tmpdir(), "my-omp-kb-index-cap-"));
mkdirSync(join(kbIndexCapDir, ".omp", "knowledge", "records"), { recursive: true });
for (let i = 0; i < 7; i += 1) {
  const name = `2026-08-${String(i + 1).padStart(2, "0")}_cap.md`;
  writeFileSync(join(kbIndexCapDir, ".omp", "knowledge", "records", name), "stub");
  const ts = (now / 1000) - (7 - i);
  utimesSync(join(kbIndexCapDir, ".omp", "knowledge", "records", name), ts, ts);
}
recordIngest("record");
const cappedSection = formatIndexSection(kbIndexCapDir);
const recordBullets = cappedSection.split("\n").filter((l) => l.startsWith("- records/"));
if (recordBullets.length !== 5) {
  fail(`kb-index-injector: cap should be 5 record bullets, observed=${recordBullets.length}`);
}
rmSync(kbIndexCapDir, { recursive: true, force: true });

// installKbIndexInjector integration: simulate a fresh mock so the
// `before_agent_start` slot in the shared `handlers` registry is not
// clobbered (clarify already wrote its own handler there).
const kbIndexMockHandlers: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
const kbIndexMock = {
  registerCommand(): void {},
  sendUserMessage: async (): Promise<void> => {},
  sendMessage(): void {},
  registerTool(): void {},
  registerMessageRenderer(): void {},
  zod: z,
  on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
    kbIndexMockHandlers[event] = handler;
  },
};

// (a) Pre-existing KB on disk with zero session counters → surfaces pre-existing entries.
resetKbIngestSession();
installKbIndexInjector(kbIndexMock as unknown as ExtensionApi);
const zeroBeforeFn = kbIndexMockHandlers["before_agent_start"];
if (typeof zeroBeforeFn !== "function") {
  fail("kb-index-injector: installKbIndexInjector did not register before_agent_start");
} else {
  const evt: { systemPrompt: string; cwd: string } = {
    systemPrompt: "BASE",
    cwd: kbIndexDir,
  };
  await zeroBeforeFn(evt, { cwd: kbIndexDir });
  if (!evt.systemPrompt.includes(SECTION_MARKER)) {
    fail("kb-index-injector: pre-existing entries should be injected when KB exists");
  }
  if (!evt.systemPrompt.includes("Repository knowledge base entries:")) {
    fail(`kb-index-injector: pre-existing heading wrong; got: ${JSON.stringify(evt.systemPrompt)}`);
  }
}

// (b) With counters bumped and KB seeded → systemPrompt grows by exactly 1
// and contains SECTION_MARKER.
recordIngest("record");
recordIngest("record");
recordIngest("pitfall");
const seededEvt: { systemPrompt: string; cwd: string } = {
  systemPrompt: "BASE",
  cwd: kbIndexDir,
};
const beforeFn = kbIndexMockHandlers["before_agent_start"];
if (typeof beforeFn !== "function") {
  fail("kb-index-injector: before_agent_start handler missing (re-installed?)");
} else {
  await beforeFn(seededEvt, { cwd: kbIndexDir });
  if (!seededEvt.systemPrompt.includes(SECTION_MARKER)) {
    fail("kb-index-injector: SECTION_MARKER missing after first before_agent_start");
  }
  if (!seededEvt.systemPrompt.startsWith("BASE")) {
    fail(`kb-index-injector: BASE prefix lost; got: ${JSON.stringify(seededEvt.systemPrompt)}`);
  }

  // (c) Dedup: a SECOND `before_agent_start` MUST NOT append again.
  const lenAfterFirst = seededEvt.systemPrompt.length;
  await beforeFn(seededEvt, { cwd: kbIndexDir });
if (seededEvt.systemPrompt.length !== lenAfterFirst) {
    fail(
      `kb-index-injector: dedup failed; systemPrompt grew from ${lenAfterFirst} to ${seededEvt.systemPrompt.length}`,
    );
  }
}
rmSync(kbIndexDir, { recursive: true, force: true });
resetKbIngestSession();

// --- kb-index-injector-subdir-and-preexisting -----------------------------
{
  resetKbIngestSession();

  // 1. Setup repo directory with .omp/knowledge/ and a subdirectory
  const repoDir = mkdtempSync(join(tmpdir(), "my-omp-kb-subdir-test-"));
  const subDir = join(repoDir, "src", "components");
  mkdirSync(join(repoDir, ".omp", "knowledge", "records"), { recursive: true });
  mkdirSync(join(repoDir, ".omp", "knowledge", "pitfalls"), { recursive: true });
  mkdirSync(subDir, { recursive: true });

  writeFileSync(join(repoDir, ".omp", "knowledge", "records", "2026-08-01_rec.md"), "record content");
  writeFileSync(join(repoDir, ".omp", "knowledge", "pitfalls", "2026-08-01_pit.md"), "pitfall content");

  // 2. Verify formatIndexSection & recentEntries work from subdirectory when session count is 0
  const sectionFromSubdir = formatIndexSection(subDir);
  if (!sectionFromSubdir.includes(SECTION_MARKER)) {
    fail("kb-index-injector-subdir: formatIndexSection from subdir missing SECTION_MARKER");
  }
  if (!sectionFromSubdir.includes("Repository knowledge base entries:")) {
    fail(`kb-index-injector-subdir: expected pre-existing heading when count=0; got:\n${sectionFromSubdir}`);
  }
  if (sectionFromSubdir.includes("You have ingested")) {
    fail("kb-index-injector-subdir: section should not include 'You have ingested' when session count is 0");
  }
  if (!sectionFromSubdir.includes("2026-08-01_rec.md") || !sectionFromSubdir.includes("2026-08-01_pit.md")) {
    fail("kb-index-injector-subdir: recentEntries failed to resolve KB files from subdirectory");
  }

  // 3. Verify before_agent_start surfaces pre-existing KB entries from subdirectory with count = 0
  const mockHandlers: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
  const mockPi = {
    registerCommand(): void {},
    sendUserMessage: async (): Promise<void> => {},
    sendMessage(): void {},
    registerTool(): void {},
    registerMessageRenderer(): void {},
    zod: z,
    on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
      mockHandlers[event] = handler;
    },
  };
  installKbIndexInjector(mockPi as unknown as ExtensionApi);
  const beforeStart = mockHandlers["before_agent_start"];
  const evtZero = { systemPrompt: "BASE_PROMPT" };
  await beforeStart(evtZero, { cwd: subDir });

  if (!evtZero.systemPrompt.startsWith("BASE_PROMPT\n\n## Active knowledge base")) {
    fail(`kb-index-injector-subdir: systemPrompt not injected correctly from subDir; got:\n${evtZero.systemPrompt}`);
  }
  if (!evtZero.systemPrompt.includes("Repository knowledge base entries:")) {
    fail("kb-index-injector-subdir: missing pre-existing heading in systemPrompt when session count=0");
  }

  // 4. Verify heading when session count > 0
  recordIngest("record");
  recordIngest("pitfall");
  const sectionWithCounts = formatIndexSection(subDir);
  if (!sectionWithCounts.includes("You have ingested 1 records and 1 pitfalls this session. Recent entries:")) {
    fail(`kb-index-injector-subdir: heading wrong when session count > 0; got:\n${sectionWithCounts}`);
  }
  if (sectionWithCounts.includes("Repository knowledge base entries:")) {
    fail("kb-index-injector-subdir: section should not include 'Repository knowledge base entries:' when session count > 0");
  }

  // 5. Verify empty repositories (no records or pitfalls) return "" and do not modify systemPrompt
  resetKbIngestSession();
  const emptyRepoDir = mkdtempSync(join(tmpdir(), "my-omp-kb-empty-repo-"));
  const emptySection = formatIndexSection(emptyRepoDir);
  if (emptySection !== "") {
    fail(`kb-index-injector-subdir: formatIndexSection on empty repo should be ""; got:\n${emptySection}`);
  }

  const evtEmpty = { systemPrompt: "BASE_PROMPT" };
  await beforeStart(evtEmpty, { cwd: emptyRepoDir });
  if (evtEmpty.systemPrompt !== "BASE_PROMPT") {
    fail(`kb-index-injector-subdir: empty repo should not modify systemPrompt; got:\n${evtEmpty.systemPrompt}`);
  }

  rmSync(repoDir, { recursive: true, force: true });
  rmSync(emptyRepoDir, { recursive: true, force: true });
  resetKbIngestSession();
}


// --- /record --recent / /pitfall --recent: LOCAL recent-listing handler -----
// The command runs in TS only — no command body, no user prompt, no LLM turn.
// Each branch (default count, explicit count, no-KB, free-text fall-through)
// is asserted against a fresh fixture to keep the test deterministic.
{
  // --- Mock pi that captures sendMessage + notify for assertions ---
  const makeMockPi = (): {
    pi: ExtensionApi;
    sent: Array<Record<string, unknown>>;
    toasts: Array<{ message: string; level: string }>;
  } => {
    const sent: Array<Record<string, unknown>> = [];
    const toasts: Array<{ message: string; level: string }> = [];
    const pi: ExtensionApi = {
      registerCommand: () => {},
      sendUserMessage: () => Promise.resolve(),
      sendMessage: (msg) => { sent.push(msg as Record<string, unknown>); },
      on: () => {},
      registerTool: () => {},
      registerMessageRenderer: () => {},
      zod: {} as ExtensionApi["zod"],
    };
    return { pi, sent, toasts };
  };

  // --- 1. isRecentArgs / parseRecentCount parser coverage ---
  const positiveArgCases = ["--recent", "--recent 5", "--recent 50"];
  for (const args of positiveArgCases) {
    if (!isRecentArgs(args)) fail(`isRecentArgs(${JSON.stringify(args)}) should be true`);
  }
  if (isRecentArgs("--recent abc")) fail("isRecentArgs('--recent abc') should be false (non-numeric)");
  if (isRecentArgs("")) fail("isRecentArgs('') should be false");
  if (isRecentArgs("fix the bug")) fail("isRecentArgs('fix the bug') should be false");
  if (!isRecentArgs("  --recent  ")) fail("isRecentArgs('  --recent  ') should be true (whitespace tolerant)");

  if (parseRecentCount("--recent") !== DEFAULT_LIMIT) fail(`parseRecentCount('--recent') should be ${DEFAULT_LIMIT}`);
  if (parseRecentCount("--recent 5") !== 5) fail("parseRecentCount('--recent 5') should be 5");
  if (parseRecentCount("--recent 999") !== MAX_LIMIT) fail(`parseRecentCount('--recent 999') should clamp to ${MAX_LIMIT}`);

  // --- 2. Free-text fall-through: handled=false, no card, no notify ---
  {
    const root = mkdtempSync(join(tmpdir(), "my-omp-recent-fallthrough-"));
    const { pi, sent, toasts } = makeMockPi();
    const r = await runRecentCommand({ kind: "record", rawArgs: "fix the bug", root, pi, ctx: { ui: { notify: (m, l) => toasts.push({ message: m, level: l ?? "info" }) } } });
    if (r.handled !== false) fail("runRecentCommand: free-text args should return handled=false");
    if (sent.length !== 0) fail(`runRecentCommand: free-text should not emit cards, got ${sent.length}`);
    if (toasts.length !== 0) fail(`runRecentCommand: free-text should not emit notify, got ${toasts.length}`);
    rmSync(root, { recursive: true, force: true });
  }

  // --- 3. No-KB: handled=true with "not found" card + warning notify ---
  {
    const root = mkdtempSync(join(tmpdir(), "my-omp-recent-nokb-"));
    const { pi, sent, toasts } = makeMockPi();
    const r = await runRecentCommand({ kind: "record", rawArgs: "--recent", root, pi, ctx: { ui: { notify: (m, l) => toasts.push({ message: m, level: l ?? "info" }) } } });
    if (r.handled !== true) fail("runRecentCommand: --recent with no KB should return handled=true");
    const card = sent[0];
    if (!card) fail("runRecentCommand: no-KB path did not emit a card");
    else if (card.customType !== "knowledge-record") fail(`runRecentCommand: no-KB card customType=${card.customType}, expected knowledge-record`);
    if (!toasts.some((t) => t.message.includes("No .omp/knowledge/"))) fail(`runRecentCommand: no-KB notify missing; got ${JSON.stringify(toasts)}`);
    if (!toasts.some((t) => t.level === "warn")) fail("runRecentCommand: no-KB should emit a warn-level notify");
    rmSync(root, { recursive: true, force: true });
  }

  // --- 4. Seeded fixture: --recent 3 with 3 records returns RECENT RECORDS (3) ---
  {
    const root = mkdtempSync(join(tmpdir(), "my-omp-recent-seeded-"));
    mkdirSync(join(root, ".omp", "knowledge", "records"), { recursive: true });
    writeFileSync(join(root, ".omp", "knowledge", "records", "2026-08-01_first.md"),  "---\ntitle: First record\n---\nbody one");
    writeFileSync(join(root, ".omp", "knowledge", "records", "2026-08-02_second.md"), "---\ntitle: Second record\n---\nbody two");
    writeFileSync(join(root, ".omp", "knowledge", "records", "2026-08-03_third.md"),  "---\ntitle: Third record\n---\nbody three");
    const { pi, sent, toasts } = makeMockPi();
    const r = await runRecentCommand({ kind: "record", rawArgs: "--recent 3", root, pi, ctx: { ui: { notify: (m, l) => toasts.push({ message: m, level: l ?? "info" }) } } });
    if (r.handled !== true) fail("runRecentCommand: --recent 3 with seeded KB should return handled=true");
    const card = sent[0];
    if (!card) fail("runRecentCommand: seeded path did not emit a card");
    else {
      if (card.customType !== "knowledge-record") fail(`runRecentCommand: card customType=${card.customType}, expected knowledge-record`);
      if (card.display !== true) fail("runRecentCommand: card display must be true");
      if (card.attribution !== "user") fail("runRecentCommand: card attribution must be user");
      const content = String(card.content ?? "");
      if (!content.includes("RECORD")) fail(`runRecentCommand: card label missing 'RECORD'; got ${JSON.stringify(content)}`);
      if (!content.includes("(3)")) fail(`runRecentCommand: card label missing count '(3)'; got ${JSON.stringify(content)}`);
    }
    const infoToast = toasts.find((t) => t.level === "info");
    if (!infoToast) fail("runRecentCommand: seeded path should emit an info-level notify");
    else if (!infoToast.message.includes("3 recent records")) fail(`runRecentCommand: notify message wrong: ${infoToast.message}`);
    rmSync(root, { recursive: true, force: true });
  }

  // --- 5. Seeded fixture: --recent with default limit + pitfalls kind ---
  {
    const root = mkdtempSync(join(tmpdir(), "my-omp-recent-pitfalls-"));
    mkdirSync(join(root, ".omp", "knowledge", "pitfalls"), { recursive: true });
    writeFileSync(join(root, ".omp", "knowledge", "pitfalls", "2026-08-01_pitfall.md"), "---\ntitle: Pitfall title\n---\noops body");
    const { pi, sent, toasts } = makeMockPi();
    const r = await runRecentCommand({ kind: "pitfall", rawArgs: "--recent", root, pi, ctx: { ui: { notify: (m, l) => toasts.push({ message: m, level: l ?? "info" }) } } });
    if (r.handled !== true) fail("runRecentCommand: /pitfall --recent should return handled=true");
    const card = sent[0];
    if (!card) fail("runRecentCommand: pitfalls path did not emit a card");
    else if (card.customType !== "knowledge-pitfall") fail(`runRecentCommand: pitfalls card customType=${card.customType}, expected knowledge-pitfall`);
    if (!toasts.some((t) => t.level === "info" && t.message.includes("1 recent pitfall"))) fail(`runRecentCommand: pitfall singular notify expected; got ${JSON.stringify(toasts)}`);
    rmSync(root, { recursive: true, force: true });
  }

  // --- 6. Integration: the registered /record handler routes --recent to bypass ---
  {
    const prevCwd = process.cwd();
    const root = mkdtempSync(join(tmpdir(), "my-omp-recent-integration-"));
    mkdirSync(join(root, ".omp", "knowledge", "records"), { recursive: true });
    writeFileSync(join(root, ".omp", "knowledge", "records", "2026-08-05_x.md"), "---\ntitle: X\n---\nbody x");
    process.chdir(root);
    try {
      sent.length = 0;
      customMessages.length = 0;
      const toasts: string[] = [];
      await registered["record"].handler("--recent", { ui: { notify: (m: string) => toasts.push(m) } });
      // Sent (user prompt) must be empty — bypass does NOT queue a user prompt.
      if (sent.length !== 0) fail("record --recent: registered handler queued a user prompt (should bypass)");
      const card = customMessages.find((m) => m.customType === "knowledge-record");
      if (!card) fail("record --recent: registered handler did not emit the knowledge-record card");
      if (!toasts.some((t) => t.includes("recent record"))) fail(`record --recent: notify missing; got ${JSON.stringify(toasts)}`);
    } finally {
      process.chdir(prevCwd);
      rmSync(root, { recursive: true, force: true });
    }
  }

  // --- 7. Integration: free-text args still flow through the default handler ---
  {
    sent.length = 0;
    customMessages.length = 0;
    await registered["record"].handler("some new finding", {});
    if (sent.length === 0) fail("record free-text: expected the default handler to queue a user prompt");
    if (!sent[0]?.includes("/record some new finding")) fail(`record free-text: prompt wrong: ${sent[0]}`);
  }
}

// --- KV Cache & Token Economics: Prefix Stability Assertions ---
{
  // 1. installClarify before_agent_start prefix stability
  const clarifyMockHandlers: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
  const clarifyMock = {
    registerCommand(): void {},
    sendUserMessage: async (): Promise<void> => {},
    sendMessage(): void {},
    registerTool(): void {},
    registerMessageRenderer(): void {},
    zod: z,
    on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
      clarifyMockHandlers[event] = handler;
    },
  };

  setClarifyEnabled(true);
  installClarify(clarifyMock as unknown as ExtensionApi);
  const clarifyBeforeStart = clarifyMockHandlers["before_agent_start"];
  if (typeof clarifyBeforeStart !== "function") {
    fail("kv-cache-and-token-economics: installClarify did not register before_agent_start");
  } else {
    const basePrompt = "SYSTEM PROMPT BASE PREFIX FOR CLARIFY TEST";
    const evt = {
      systemPrompt: basePrompt,
      systemPromptOptions: { selectedTools: ["clarify_prompt"] },
    };
    clarifyBeforeStart(evt);
    if (!evt.systemPrompt.startsWith(basePrompt)) {
      fail(`kv-cache-and-token-economics: clarify mutated prompt prefix; got: ${JSON.stringify(evt.systemPrompt)}`);
    }
    if (!evt.systemPrompt.endsWith(CLARIFY_PROMPT)) {
      fail(`kv-cache-and-token-economics: clarify did not append CLARIFY_PROMPT to tail; got: ${JSON.stringify(evt.systemPrompt)}`);
    }
  }
  setClarifyEnabled(false);

  // 2. installKbIndexInjector before_agent_start prefix stability
  const kbTestDir = mkdtempSync(join(tmpdir(), "my-omp-kv-cache-test-"));
  mkdirSync(join(kbTestDir, ".omp", "knowledge", "records"), { recursive: true });
  writeFileSync(join(kbTestDir, ".omp", "knowledge", "records", "2026-08-01_kv.md"), "stub");
  resetKbIngestSession();
  recordIngest("record");

  const expectedSection = formatIndexSection(kbTestDir);

  const kbMockHandlersKv: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
  const kbMockKv = {
    registerCommand(): void {},
    sendUserMessage: async (): Promise<void> => {},
    sendMessage(): void {},
    registerTool(): void {},
    registerMessageRenderer(): void {},
    zod: z,
    on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
      kbMockHandlersKv[event] = handler;
    },
  };

  installKbIndexInjector(kbMockKv as unknown as ExtensionApi);
  const kbBeforeStart = kbMockHandlersKv["before_agent_start"];
  if (typeof kbBeforeStart !== "function") {
    fail("kv-cache-and-token-economics: installKbIndexInjector did not register before_agent_start");
  } else {
    const basePrompt = "SYSTEM PROMPT BASE PREFIX FOR KB INJECTOR TEST";
    const evt = {
      systemPrompt: basePrompt,
      cwd: kbTestDir,
    };
    await kbBeforeStart(evt, { cwd: kbTestDir });
    if (!evt.systemPrompt.startsWith(basePrompt)) {
      fail(`kv-cache-and-token-economics: kb-index-injector mutated prompt prefix; got: ${JSON.stringify(evt.systemPrompt)}`);
    }
    if (!evt.systemPrompt.endsWith(expectedSection)) {
      fail(`kv-cache-and-token-economics: kb-index-injector did not append section to tail; got: ${JSON.stringify(evt.systemPrompt)}`);
    }
  }
  rmSync(kbTestDir, { recursive: true, force: true });
  resetKbIngestSession();
}

// --- Research to Reference Integration Tests ---
{
  const resRefDir = mkdtempSync(join(tmpdir(), "my-omp-research-ref-test-"));
  const projDir = join(resRefDir, ".omp", "knowledge", "research", "2026-08-07_ref-test");
  const resultsDir = join(projDir, "results");
  mkdirSync(resultsDir, { recursive: true });

  writeFileSync(
    join(resultsDir, "01_item.json"),
    JSON.stringify({
      name: "Item 1",
      evidence: "Source code at https://github.com/test-owner/test-repo-a.git and https://github.com/test-owner/test-repo-b",
    }),
  );
  writeFileSync(
    join(resultsDir, "02_item.json"),
    JSON.stringify({
      name: "Item 2",
      evidence: "More references at https://github.com/test-owner/test-repo-a",
    }),
  );
  writeFileSync(
    join(projDir, "report.md"),
    "# Report\n\nCited https://github.com/test-owner/test-repo-a and https://github.com/test-owner/test-repo-c",
  );

  const discovered = extractDiscoveredReferences(projDir);
  if (discovered.length !== 3) {
    fail(`research-to-reference: expected 3 discovered repos, got ${discovered.length}`);
  } else {
    if (discovered[0].name !== "test-owner/test-repo-a" || discovered[0].count !== 3) {
      fail(`research-to-reference: top repo should be test-owner/test-repo-a count 3, got: ${JSON.stringify(discovered[0])}`);
    }
  }

  // Test /reference add completion incorporating research-discovered references
  const prevCwd = process.cwd();
  process.chdir(resRefDir);
  try {
    const addCompletions = registered["reference"].getArgumentCompletions?.("add ") ?? null;
    if (!addCompletions || addCompletions.length < 3) {
      fail(`research-to-reference: expected /reference add suggestions, got: ${JSON.stringify(addCompletions)}`);
    } else {
      const urls = addCompletions.map((c) => c.value);
      if (!urls.includes("add https://github.com/test-owner/test-repo-a")) {
        fail(`research-to-reference: missing add https://github.com/test-owner/test-repo-a in completions: ${JSON.stringify(urls)}`);
      }
      const desc = addCompletions.find((c) => c.value === "add https://github.com/test-owner/test-repo-a")?.description;
      if (!desc || !desc.includes("2026-08-07_ref-test")) {
        fail(`research-to-reference: description should mention project slug, got: ${desc}`);
      }
    }
  } finally {
    process.chdir(prevCwd);
    rmSync(resRefDir, { recursive: true, force: true });
  }

  // Python generate_report.py extract_github_repos test
  const pyCode = `
import sys
from pathlib import Path
sys.path.insert(0, str(Path("commands/research-report").resolve()))
from generate_report import extract_github_repos, discovered_references_lines

items = [
    {"text": "Ref https://github.com/python-owner/python-repo-1.git and https://github.com/python-owner/python-repo-2"},
    {"text": "Ref https://github.com/python-owner/python-repo-1"}
]
repos = extract_github_repos(items)
assert len(repos) == 2, f"expected 2 repos, got {len(repos)}"
assert repos[0]["name"] == "python-owner/python-repo-1", f"top repo mismatch: {repos[0]}"
assert repos[0]["count"] == 2, f"count mismatch: {repos[0]}"
lines = discovered_references_lines(repos)
assert len(lines) > 0, "lines should not be empty"
assert "## Discovered Reference Repositories" in lines[0], f"heading mismatch: {lines[0]}"
assert "/reference add https://github.com/python-owner/python-repo-1" in lines[4], f"line mismatch: {lines[4]}"
print("PY_OK")
`;
  try {
    const pyOut = execFileSync("python3", ["-c", pyCode], { encoding: "utf8" }).trim();
    if (pyOut !== "PY_OK") fail(`research-to-reference: python test failed: ${pyOut}`);
  } catch (err: unknown) {
    fail(`research-to-reference: python script execution failed: ${err}`);
  }
}

// --- /timeline Unit Tests ---
{
  if (parseTimelineLimit("") !== 15) fail("timeline: parseTimelineLimit('') should be 15");
  if (parseTimelineLimit("5") !== 5) fail("timeline: parseTimelineLimit('5') should be 5");
  if (parseTimelineLimit("999") !== 50) fail("timeline: parseTimelineLimit('999') should be 50");

  const timelineFixture = mkdtempSync(join(tmpdir(), "my-omp-timeline-test-"));
  const kbDir = join(timelineFixture, ".omp", "knowledge");
  const recordsDir = join(kbDir, "records");
  const scratchDir = join(timelineFixture, ".omp", "scratch");
  const researchDir = join(kbDir, "research", "2026-08-10_test-topic");

  mkdirSync(recordsDir, { recursive: true });
  mkdirSync(scratchDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  writeFileSync(
    join(kbDir, "INDEX.md"),
    "# Index\n- 2026-08-13 [lesson] Sample Lesson Title\n- 2026-08-12 [pitfall] Sample Pitfall Title\n",
  );
  writeFileSync(
    join(scratchDir, "spec-x.md"),
    "# Feature Spec X\n\nDetails here",
  );
  writeFileSync(
    join(researchDir, "report.md"),
    "# Report\n\nContent",
  );

  const items = getUnifiedTimeline(timelineFixture, 10);
  if (items.length < 3) {
    fail(`timeline: expected at least 3 events, got ${items.length}`);
  } else {
    const cats = items.map((i) => i.category);
    if (!cats.includes("record") || !cats.includes("pitfall") || !cats.includes("ticket") || !cats.includes("research")) {
      fail(`timeline: missing expected event categories in: ${JSON.stringify(cats)}`);
    }
  }

  const formatted = formatTimelineLines(items);
  if (formatted.length !== items.length) {
    fail(`timeline: formatted lines length mismatch: ${formatted.length} vs ${items.length}`);
  }

  let notifiedMsg = "";
  const mockCtx: HandlerContext & { notify?(msg: string, level?: string): void } = {
    ui: {
      notify(msg: string) {
        notifiedMsg = msg;
      },
    },
    notify(msg: string) {
      notifiedMsg = msg;
    },
  };

  await runTimelineCommand(
    mockPi as unknown as ExtensionApi,
    timelineFixture,
    "10",
    mockCtx as unknown as HandlerContext,
  );
  const lastMsg = customMessages[customMessages.length - 1];
  if (!lastMsg || lastMsg.customType !== TIMELINE_CUSTOM_TYPE) {
    fail(`timeline: expected customType ${TIMELINE_CUSTOM_TYPE}, got: ${JSON.stringify(lastMsg)}`);
  }
  if (!notifiedMsg.includes("Timeline:")) {
    fail(`timeline: expected notification containing 'Timeline:', got: ${notifiedMsg}`);
  }
  rmSync(timelineFixture, { recursive: true, force: true });
}
// --- Colored Card Layout Borders Unit Tests ---
{
  const coloredText = colorize("hello", BORDER_COLORS.cyan);
  if (!coloredText.includes("\x1b[36m") || !coloredText.includes("\x1b[0m")) {
    fail(`colorize: expected ANSI escape sequence, got: ${JSON.stringify(coloredText)}`);
  }
  if (stripAnsi(coloredText) !== "hello") {
    fail(`stripAnsi: expected 'hello', got: ${stripAnsi(coloredText)}`);
  }
  if (displayWidth(coloredText) !== 5) {
    fail(`displayWidth: expected display width 5 for colored text, got ${displayWidth(coloredText)}`);
  }

  const topBorder = makeTopBorder(BORDER_COLORS.blue);
  if (displayWidth(topBorder) !== 76) {
    fail(`makeTopBorder: expected display width 76, got ${displayWidth(topBorder)}`);
  }

  const coloredBoxLine = boxLine("Sample Content Line", BORDER_COLORS.cyan);
  if (displayWidth(coloredBoxLine) !== 76) {
    fail(`boxLine: expected display width 76 for colored line, got ${displayWidth(coloredBoxLine)}`);
  }
  if (!coloredBoxLine.includes("\x1b[36m│\x1b[0m")) {
    fail(`boxLine: vertical border should be colored with ANSI cyan sequence, got: ${coloredBoxLine}`);
  }
  // Zero-records empty state check
  const emptyDir = mkdtempSync(join(tmpdir(), "my-omp-empty-kb-test-"));
  mkdirSync(join(emptyDir, ".omp", "knowledge", "records"), { recursive: true });
  const emptyRes = readKnowledge(emptyDir, { type: "records" });
  if (emptyRes.details.count !== 0 || !emptyRes.text.includes("○ No records saved yet")) {
    fail(`readKnowledge: expected empty state text for 0 records, got: ${emptyRes.text}`);
  }
  rmSync(emptyDir, { recursive: true, force: true });

  // ADR directory resolution & listAdrFiles unit check
  const adrFixture = mkdtempSync(join(tmpdir(), "my-omp-adr-test-"));
  try {
    const resNew = resolveAdrDir(adrFixture);
    if (!resNew.isNew || resNew.relDir !== ".omp/adr" || !existsSync(resNew.dir)) {
      fail(`resolveAdrDir: expected new .omp/adr directory creation, got: ${JSON.stringify(resNew)}`);
    }
    writeFileSync(join(resNew.dir, "0001-test-decision.md"), "# ADR 1");
    const files = listAdrFiles(adrFixture);
    if (files.length !== 1 || files[0] !== "0001-test-decision.md") {
      fail(`listAdrFiles: expected ['0001-test-decision.md'], got: ${JSON.stringify(files)}`);
    }
  } finally {
    rmSync(adrFixture, { recursive: true, force: true });
  }
}

// --- Research DAG Engine Unit Tests ---
{
  // 1. Slugify helper
  if (slugifyItemId("Protocol Specification", 0) !== "protocol_specification") {
    fail(`slugifyItemId mismatch: ${slugifyItemId("Protocol Specification", 0)}`);
  }
  if (slugifyItemId("", 2) !== "item_03") {
    fail(`slugifyItemId fallback mismatch: ${slugifyItemId("", 2)}`);
  }

  // 2. Flat outline items (all roots, all ready)
  const flatItems = [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }];
  const flatDag = buildResearchDag(flatItems);
  if (flatDag.hasCycles || flatDag.roots.length !== 3 || flatDag.leaves.length !== 3) {
    fail(`flatDag: expected 3 roots and 3 leaves, got roots=${flatDag.roots.length}, leaves=${flatDag.leaves.length}`);
  }
  const flatReady = getReadyDagNodes(flatDag);
  if (flatReady.length !== 3) {
    fail(`flatDag: expected all 3 nodes ready, got ${flatReady.length}`);
  }

  // 3. Multi-tier dependency graph (repo_discovery -> cipher_audit -> formal_proof)
  const dagFixture = mkdtempSync(join(tmpdir(), "my-omp-research-dag-test-"));
  const resultsDir = join(dagFixture, "results");
  mkdirSync(resultsDir, { recursive: true });

  const tieredItems = [
    { id: "repo_discovery", name: "Find Repo" },
    { id: "cipher_audit", name: "Audit Cipher", depends_on: ["repo_discovery"] },
    { id: "formal_proof", name: "Generate Proof", depends_on: ["cipher_audit"] },
  ];

  // Before any results: only repo_discovery is ready
  const initialDag = buildResearchDag(tieredItems, resultsDir);
  const initialReady = getReadyDagNodes(initialDag);
  if (initialReady.length !== 1 || initialReady[0].id !== "repo_discovery") {
    fail(`tieredDag initial: expected 1 ready node (repo_discovery), got: ${JSON.stringify(initialReady.map((n) => n.id))}`);
  }

  // Complete repo_discovery by writing a result JSON
  writeFileSync(
    join(resultsDir, "01_find_repo.json"),
    JSON.stringify({
      repo_url: "https://github.com/example/cryptolib",
      architecture: "AES-GCM custom engine",
      sources: ["https://github.com/example/cryptolib/README.md"],
    }),
  );

  const step2Dag = buildResearchDag(tieredItems, resultsDir);
  const step2Ready = getReadyDagNodes(step2Dag);
  if (step2Ready.length !== 1 || step2Ready[0].id !== "cipher_audit") {
    fail(`tieredDag step 2: expected cipher_audit ready after repo_discovery completed, got: ${JSON.stringify(step2Ready.map((n) => n.id))}`);
  }
  const repoNode = step2Dag.nodes.get("repo_discovery");
  if (repoNode?.status !== "completed") {
    fail(`tieredDag step 2: repo_discovery should have status 'completed', got: ${repoNode?.status}`);
  }

  // Verify upstream context extraction for cipher_audit
  const evidence = getUpstreamEvidence(step2Dag, "cipher_audit");
  if (evidence.length !== 1 || evidence[0].id !== "repo_discovery") {
    fail(`getUpstreamEvidence: expected 1 upstream evidence from repo_discovery, got: ${JSON.stringify(evidence)}`);
  }
  const promptInjection = formatUpstreamContextPrompt(evidence);
  if (!promptInjection.includes("<upstream-context>") || !promptInjection.includes("https://github.com/example/cryptolib")) {
    fail(`formatUpstreamContextPrompt: missing expected tags or repo URL, got: ${promptInjection}`);
  }

  // 4. Cycle detection (A -> B -> A)
  const cyclicItems = [
    { id: "node_a", name: "Node A", depends_on: ["node_b"] },
    { id: "node_b", name: "Node B", depends_on: ["node_a"] },
  ];
  const cyclicDag = buildResearchDag(cyclicItems);
  if (!cyclicDag.hasCycles || !cyclicDag.cycleNodes || cyclicDag.cycleNodes.length !== 2) {
    fail(`cyclicDag: expected hasCycles=true with 2 cycle nodes, got: ${JSON.stringify(cyclicDag)}`);
  }

  // 5. readOutlineItemSpecs YAML parser verification
  writeFileSync(
    join(dagFixture, "outline.yaml"),
    `topic: "DAG Test"
items:
  - id: discovery
    name: "Discovery Item"
    category: "discovery"
  - id: analysis
    name: "Analysis Item"
    category: "deep"
    depends_on: [discovery]
`,
  );
  const parsedSpecs = readOutlineItemSpecs(dagFixture);
  if (!parsedSpecs || parsedSpecs.length !== 2) {
    fail(`readOutlineItemSpecs: expected 2 parsed specs, got: ${JSON.stringify(parsedSpecs)}`);
  } else {
    if (parsedSpecs[0].id !== "discovery" || parsedSpecs[1].id !== "analysis") {
      fail(`readOutlineItemSpecs: id mismatch: ${JSON.stringify(parsedSpecs)}`);
    }
    const deps = parsedSpecs[1].depends_on;
    if (!Array.isArray(deps) || deps[0] !== "discovery") {
      fail(`readOutlineItemSpecs: depends_on mismatch: ${JSON.stringify(deps)}`);
    }
  }

  // 6. Transitive Critical-Path Prioritization & Bottleneck Unblocking
  // Diamond: root_bottleneck -> child_1 -> leaf_deep
  //                         -> child_2 -> leaf_deep
  // Independent: root_isolated (leads nowhere)
  const priorityItems = [
    { id: "root_isolated", name: "Isolated Leaf" },
    { id: "root_bottleneck", name: "Bottleneck Root" },
    { id: "child_1", name: "Child 1", depends_on: ["root_bottleneck"] },
    { id: "child_2", name: "Child 2", depends_on: ["root_bottleneck"] },
    { id: "leaf_deep", name: "Deep Leaf", depends_on: ["child_1", "child_2"] },
  ];
  const priorityDag = buildResearchDag(priorityItems);
  const readyNodes = getReadyDagNodes(priorityDag);

  if (readyNodes.length !== 2) {
    fail(`priorityDag: expected 2 ready nodes, got ${readyNodes.length}`);
  } else if (readyNodes[0].id !== "root_bottleneck") {
    fail(`priorityDag: expected root_bottleneck first due to higher unblocking impact, got: ${readyNodes[0].id}`);
  }

  const bottleneckNode = priorityDag.nodes.get("root_bottleneck");
  if (bottleneckNode?.transitiveDescendantsCount !== 3) {
    fail(`priorityDag: expected 3 transitive descendants for root_bottleneck, got ${bottleneckNode?.transitiveDescendantsCount}`);
  }
  if (bottleneckNode?.height !== 2 || bottleneckNode?.depth !== 0) {
    fail(`priorityDag: expected height=2 depth=0 for root_bottleneck, got height=${bottleneckNode?.height} depth=${bottleneckNode?.depth}`);
  }
  if (priorityDag.criticalPathLength !== 2 || priorityDag.maxDepth !== 2) {
    fail(`priorityDag: expected criticalPathLength=2 maxDepth=2, got cpl=${priorityDag.criticalPathLength} maxDepth=${priorityDag.maxDepth}`);
  }

  // 7. Deterministic Epistemic Hashing & Subgraph Invalidation
  const hash1 = computeEpistemicNodeHash("node_a", "Node A", ["dep_1"], "security");
  const hash2 = computeEpistemicNodeHash("node_a", "Node A", ["dep_1"], "security");
  const hash3 = computeEpistemicNodeHash("node_a", "Node A", ["dep_1"], "performance");
  if (!hash1 || hash1.length !== 16 || hash1 !== hash2) {
    fail(`computeEpistemicNodeHash: expected deterministic 16-hex hash, got ${hash1} vs ${hash2}`);
  }
  if (hash1 === hash3) {
    fail(`computeEpistemicNodeHash: expected distinct hash for different category`);
  }

  // Verify node.epistemicHash population and dirty flag detection
  const memoFixture = mkdtempSync(join(tmpdir(), "my-omp-memo-test-"));
  const memoResultsDir = join(memoFixture, "results");
  mkdirSync(memoResultsDir, { recursive: true });

  const memoItems = [{ id: "memo_node", name: "Memo Node" }];
  const cleanDag = buildResearchDag(memoItems);
  const expectedHash = cleanDag.nodes.get("memo_node")?.epistemicHash;

  // Matching result file (clean)
  writeFileSync(
    join(memoResultsDir, "01_memo_node.json"),
    JSON.stringify({ _epistemic_hash: expectedHash, result: "valid" }),
  );
  const cleanRun = buildResearchDag(memoItems, memoResultsDir);
  if (cleanRun.nodes.get("memo_node")?.isDirty) {
    fail(`subgraph memoization: expected node to NOT be dirty when hash matches`);
  }

  // Stale result file (dirty)
  writeFileSync(
    join(memoResultsDir, "01_memo_node.json"),
    JSON.stringify({ _epistemic_hash: "stale_hash_1234", result: "outdated" }),
  );
  const dirtyRun = buildResearchDag(memoItems, memoResultsDir);
  if (!dirtyRun.nodes.get("memo_node")?.isDirty) {
    fail(`subgraph memoization: expected node to be marked dirty when hash mismatches`);
  }

  rmSync(memoFixture, { recursive: true, force: true });
  rmSync(dagFixture, { recursive: true, force: true });

  // 8. ANSI text styling & Status Border Colors
  const boldText = bold("Bold Test");
  const italicText = italic("Italic Test");
  const dimText = dim("Dim Test");
  if (!boldText.includes("\x1b[1m") || !italicText.includes("\x1b[3m") || !dimText.includes("\x1b[2m")) {
    fail(`ANSI text styling: missing expected escape sequences`);
  }
  if (displayWidth(bold(italic("Hello World"))) !== 11) {
    fail(`ANSI displayWidth: expected 11 for styled Hello World, got ${displayWidth(bold(italic("Hello World")))}`);
  }
  if (statusBorderColor("REPORT_READY") !== BORDER_COLORS.green || statusBorderColor("OUTLINE") !== BORDER_COLORS.cyan || statusBorderColor("ERROR") !== BORDER_COLORS.red) {
    fail(`statusBorderColor: unexpected color mappings`);
  }

  // 9. Compact vs Full Research Dashboard Card Rendering & 76-column box width
  const testPayload = {
    slug: "2026-08-07_research-dashboard-ux",
    status: "REPORT_READY",
    topic: "Research Dashboard UX & Layout",
    next_step_command: "/research-report 2026-08-07_research-dashboard-ux",
    global_metrics: {
      total_items: 21,
      completed_items: 21,
      total_fields: 18,
      completed_fields: 18,
      coverage: 1.0,
    },
    findings_preview: [
      {
        name: "Dashboard Preview Engine",
        id: "preview_engine",
        summary: "Displays real extracted findings directly in the TUI card",
        priority: "P0",
        severity: "High",
        key_fields: {
          component: "research-renderer",
          verdict: "Significantly enhances research legibility",
        },
      },
    ],
    waves_run: 2,
    detail: "compact" as const,
  };
  const compactCard = renderResearchDashboardCard(testPayload);
  const compactChildren = (compactCard as any).children ?? [];
  if (compactChildren.length < 4) {
    fail(`renderResearchDashboardCard: expected at least 4 lines for compact view, got ${compactChildren.length}`);
  }
  const compactText = compactChildren.map((c: any) => c.text ?? "").join("\n");
  if (!compactText.includes("Ctrl+O")) {
    fail(`compactCard: missing 'Ctrl+O' hint, got:\n${compactText}`);
  }
  for (const child of compactChildren) {
    const text = child.text ?? "";
    const w = displayWidth(text);
    if (w !== 76) {
      fail(`compactCard: expected 76 display width, got ${w} for line: "${text}"`);
    }
  }

  // Passing { expanded: true } expands compact card to full multi-section table
  const expandedToggleCard = renderResearchDashboardCard(testPayload, undefined, { expanded: true });
  const expandedChildren = (expandedToggleCard as any).children ?? [];
  if (expandedChildren.length <= compactChildren.length) {
    fail(`expandedToggleCard: expected more lines than compactCard, got ${expandedChildren.length} vs ${compactChildren.length}`);
  }

  const fullCard = renderResearchDashboardCard({ ...testPayload, detail: "full" as const });
  const fullChildren = (fullCard as any).children ?? [];
  const fullText = fullChildren.map((c: any) => c.text ?? "").join("\n");
  if (!fullText.includes("Key Findings & Results Preview")) {
    fail(`fullCard: expected "Key Findings & Results Preview" heading, got:\n${fullText}`);
  }
  if (!fullText.includes("Dashboard Preview Engine")) {
    fail(`fullCard: expected finding item "Dashboard Preview Engine", got:\n${fullText}`);
  }
  if (!fullText.includes("Displays real extracted findings")) {
    fail(`fullCard: expected finding summary, got:\n${fullText}`);
  }
  for (const child of fullChildren) {
    const text = child.text ?? "";
    const w = displayWidth(text);
    if (w !== 76) {
      fail(`fullCard: expected 76 display width, got ${w} for line: "${text}"`);
    }
  }
}
// --- Research Archive / Unarchive / Remove / List Unit Tests ---
{
  const fixture = mkdtempSync(join(tmpdir(), "my-omp-research-archive-test-"));
  const researchDir = join(fixture, ".omp", "knowledge", "research");
  const projectSlug = "2026-08-01_crypto-audit";
  const projectPath = join(researchDir, projectSlug);
  mkdirSync(projectPath, { recursive: true });

  writeFileSync(
    join(projectPath, "research.md"),
    `---
project: ${projectSlug}
topic: "Crypto Audit"
status: CONVERGED
phase: 2
created: 2026-08-01
updated: 2026-08-01T00:00:00Z
counts:
  items: 5
  fields: 4
  filled: 5
  partial: 0
  pending: 0
---
# Living Outline
`,
  );

  // 1. Initial listing (active)
  const initialActive = listResearchProjects(fixture);
  if (initialActive.length !== 1 || initialActive[0] !== projectSlug) {
    fail(`listResearchProjects: expected [${projectSlug}], got: ${JSON.stringify(initialActive)}`);
  }
  const initialArchived = listArchivedResearchProjects(fixture);
  if (initialArchived.length !== 0) {
    fail(`listArchivedResearchProjects: expected empty array, got: ${JSON.stringify(initialArchived)}`);
  }

  // 2. Archive project
  const archiveRes = archiveResearchProject(fixture, "crypto-audit");
  if (!archiveRes.ok || archiveRes.slug !== projectSlug) {
    fail(`archiveResearchProject: expected success, got: ${JSON.stringify(archiveRes)}`);
  }

  // Check state after archive
  const activeAfterArchive = listResearchProjects(fixture);
  if (activeAfterArchive.length !== 0) {
    fail(`listResearchProjects after archive: expected empty active list, got: ${JSON.stringify(activeAfterArchive)}`);
  }
  const archivedAfterArchive = listArchivedResearchProjects(fixture);
  if (archivedAfterArchive.length !== 1 || archivedAfterArchive[0] !== projectSlug) {
    fail(`listArchivedResearchProjects after archive: expected [${projectSlug}], got: ${JSON.stringify(archivedAfterArchive)}`);
  }

  const archivedMd = readFileSync(join(researchDir, ".archive", projectSlug, "research.md"), "utf8");
  if (!archivedMd.includes("status: ARCHIVED")) {
    fail(`archived research.md: expected status: ARCHIVED, got: ${archivedMd}`);
  }

  // 3. Summaries listing
  const activeSummaries = listResearchSummaries(fixture, false);
  if (activeSummaries.length !== 0) {
    fail(`listResearchSummaries(active): expected 0, got ${activeSummaries.length}`);
  }
  const archivedSummaries = listResearchSummaries(fixture, true);
  if (archivedSummaries.length !== 1 || archivedSummaries[0].slug !== projectSlug || !archivedSummaries[0].archived) {
    fail(`listResearchSummaries(archived): expected 1 archived summary, got: ${JSON.stringify(archivedSummaries)}`);
  }

  // 4. Unarchive project
  const unarchiveRes = unarchiveResearchProject(fixture, "crypto-audit");
  if (!unarchiveRes.ok || unarchiveRes.slug !== projectSlug) {
    fail(`unarchiveResearchProject: expected success, got: ${JSON.stringify(unarchiveRes)}`);
  }

  const activeAfterUnarchive = listResearchProjects(fixture);
  if (activeAfterUnarchive.length !== 1 || activeAfterUnarchive[0] !== projectSlug) {
    fail(`listResearchProjects after unarchive: expected [${projectSlug}], got: ${JSON.stringify(activeAfterUnarchive)}`);
  }
  const archivedAfterUnarchive = listArchivedResearchProjects(fixture);
  if (archivedAfterUnarchive.length !== 0) {
    fail(`listArchivedResearchProjects after unarchive: expected empty, got: ${JSON.stringify(archivedAfterUnarchive)}`);
  }

  // 5. Safe removal & path traversal protection
  if (safeResearchTarget(fixture, "../escape") !== null) {
    fail(`safeResearchTarget: should reject path traversal ../escape`);
  }
  if (safeResearchTarget(fixture, projectSlug) !== projectPath) {
    fail(`safeResearchTarget: expected valid project path, got ${safeResearchTarget(fixture, projectSlug)}`);
  }

  const removeRes = removeResearchProject(fixture, "crypto-audit");
  if (!removeRes.ok || removeRes.slug !== projectSlug) {
    fail(`removeResearchProject: expected success, got: ${JSON.stringify(removeRes)}`);
  }
  if (existsSync(projectPath)) {
    fail(`removeResearchProject: directory still exists on disk: ${projectPath}`);
  }
  if (listResearchProjects(fixture).length !== 0) {
    fail(`listResearchProjects after remove: expected empty`);
  }

  rmSync(fixture, { recursive: true, force: true });
}
// --- Tilt-O-Meter, Swear Jar & Rage Leaderboard Unit Tests ---
{
  // 1. TILT_DICTIONARY sanity check
  if (TILT_DICTIONARY.length < 15) {
    fail(`TILT_DICTIONARY: expected at least 15 entries, got ${TILT_DICTIONARY.length}`);
  }
  for (const entry of TILT_DICTIONARY) {
    if (!entry.term || entry.points <= 0) {
      fail(`TILT_DICTIONARY: invalid entry ${JSON.stringify(entry)}`);
    }
  }

  // 2. scanPromptTilt deterministic tests
  const scan1 = scanPromptTilt("why did you break this? what the fuck");
  if (scan1.breakdown.wtfs < 1) {
    fail(`scanPromptTilt: expected at least 1 wtf, got ${JSON.stringify(scan1)}`);
  }
  if (scan1.points < 1) {
    fail(`scanPromptTilt: expected positive points for wtf, got ${scan1.points}`);
  }

  // Multi-word phrase matching without double counting
  const scanPhrase = scanPromptTilt("you are a piece of shit");
  if (scanPhrase.breakdown.rage_words !== 1 || scanPhrase.breakdown.wtfs !== 0) {
    fail(`scanPromptTilt: expected 1 rage_word and 0 wtfs for 'piece of shit', got ${JSON.stringify(scanPhrase)}`);
  }
  if (scanPhrase.points !== 4) {
    fail(`scanPromptTilt: expected 4 points for 'piece of shit', got ${scanPhrase.points}`);
  }

  // Code block stripping (no false positives on code strings)
  const scanCode = scanPromptTilt('Here is the code:\n```ts\nconst x = "fuck";\n```\nPlease review.');
  if (scanCode.points !== 0) {
    fail(`scanPromptTilt: expected 0 points for code block, got ${scanCode.points}`);
  }

  const scanRage = scanPromptTilt("FUCK THIS RETARDED PIECE OF SHIT BOT");
  if (scanRage.breakdown.f_bombs !== 1) {
    fail(`scanPromptTilt: expected 1 f-bomb, got ${scanRage.breakdown.f_bombs}`);
  }
  if (scanRage.breakdown.rage_words < 1) {
    fail(`scanPromptTilt: expected at least 1 rage word, got ${scanRage.breakdown.rage_words}`);
  }
  if (scanRage.points < 8) {
    fail(`scanPromptTilt: expected at least 8 points for severe rage, got ${scanRage.points}`);
  }
  // 2. calculateDefcon mapping
  if (calculateDefcon(0) !== 5) fail(`calculateDefcon(0) expected 5 (Zen), got ${calculateDefcon(0)}`);
  if (calculateDefcon(2) !== 4) fail(`calculateDefcon(2) expected 4 (Annoyed), got ${calculateDefcon(2)}`);
  if (calculateDefcon(4) !== 3) fail(`calculateDefcon(4) expected 3 (Frustrated), got ${calculateDefcon(4)}`);
  if (calculateDefcon(7) !== 2) fail(`calculateDefcon(7) expected 2 (High Agitation), got ${calculateDefcon(7)}`);
  if (calculateDefcon(15) !== 1) fail(`calculateDefcon(15) expected 1 (Nuclear Rage), got ${calculateDefcon(15)}`);

  // 3. recordTiltIncident & local store updates
  const fixture = mkdtempSync(join(tmpdir(), "my-omp-tilt-test-"));
  const rec1 = recordTiltIncident("WTF is this bug? FUCK!", fixture);
  if (!rec1 || rec1.points <= 0) {
    fail(`recordTiltIncident: expected points, got ${JSON.stringify(rec1)}`);
  }
  const localState = readLocalTilt(fixture);
  if (localState.session_strikes !== (rec1?.points ?? 0)) {
    fail(`readLocalTilt: expected session_strikes=${rec1?.points}, got ${localState.session_strikes}`);
  }
  if (localState.swear_jar_total <= 0) {
    fail(`readLocalTilt: expected swear jar total > 0, got ${localState.swear_jar_total}`);
  }
  // 4. renderTiltCard 76-column box width verification
  const cardLines = renderTiltCard({
    local: localState,
    global: {
      version: 1,
      lifetime_strikes: 42,
      lifetime_swear_jar: 21.0,
      breakdown: { f_bombs: 8, rage_words: 4, wtfs: 6, caps_rage: 4 },
      repo_leaderboard: {
        "my-omp-skills": 18,
        "image-branch_pkg": 12,
        "firmware-stm32": 8,
      },
    },
  });

  if (cardLines.length < 10) {
    fail(`renderTiltCard: expected at least 10 lines, got ${cardLines.length}`);
  }
  for (const line of cardLines) {
    const w = displayWidth(line);
    if (w !== 76) {
      fail(`renderTiltCard: expected 76 display width, got ${w} for line: "${line}"`);
    }
  }

  // 5. /tilt command handler execution
  const notifyMsgs: string[] = [];
  const tiltCtx: HandlerContext = {
    ui: {
      notify(msg) {
        notifyMsgs.push(msg);
      },
    },
  };
  const prevCustomCount = customMessages.length;
  await registered["tilt"].handler("", tiltCtx);
  if (customMessages.length !== prevCustomCount + 1) {
    fail(`registered["tilt"]: expected custom message emission`);
  }
  const lastMsg = customMessages[customMessages.length - 1];
  if (lastMsg.customType !== TILT_CUSTOM_TYPE) {
    fail(`registered["tilt"]: expected customType "${TILT_CUSTOM_TYPE}", got "${lastMsg.customType}"`);
  }

  // /tilt reset
  await registered["tilt"].handler("reset", tiltCtx);
  if (!notifyMsgs.some((m) => m.includes("reset to 0"))) {
    fail(`registered["tilt"] reset: expected notification message, got ${JSON.stringify(notifyMsgs)}`);
  }
  const resetLocal = readLocalTilt(fixture);
  // Manual reset test on fixture
  resetLocal.session_strikes = 0;
  resetLocal.defcon = 5;
  writeLocalTilt(fixture, resetLocal);
  if (readLocalTilt(fixture).session_strikes !== 0) {
    fail(`writeLocalTilt: reset failed`);
  }

  rmSync(fixture, { recursive: true, force: true });
}

// --- OMP-IAP/v1 Protocol & Live DAG Coordination Unit Tests ---
{
  // 1. Envelope Construction & Hashing
  const hashTest = computeSha256("test artifact payload content");
  if (!hashTest.startsWith("sha256:") || hashTest.length !== 71) {
    fail(`computeSha256: invalid format, got ${hashTest}`);
  }

  const env1 = buildEnvelope({
    performative: "INFORM",
    sender: { name: "Worker-01", agent_type: "scout" },
    payload: { repo_url: "https://github.com/example/cryptolib", architecture: "AES-GCM" },
  });

  if (env1.protocol !== IAP_PROTOCOL_VERSION) {
    fail(`buildEnvelope: expected protocol '${IAP_PROTOCOL_VERSION}', got '${env1.protocol}'`);
  }
  if (env1.performative !== "INFORM") {
    fail(`buildEnvelope: expected performative 'INFORM', got '${env1.performative}'`);
  }
  if (!env1.id || !env1.timestamp) {
    fail(`buildEnvelope: missing id or timestamp`);
  }

  // 2. Validation
  const valValid = validateEnvelope(env1);
  if (!valValid.valid || !valValid.envelope) {
    fail(`validateEnvelope: expected valid, got ${JSON.stringify(valValid)}`);
  }

  const valInvalid = validateEnvelope({ protocol: "wrong", performative: "INVALID" });
  if (valInvalid.valid) {
    fail(`validateEnvelope: expected invalid for malformed protocol`);
  }

  // 3. Pointer Envelope Resolution & Digest Verification
  const fixture = mkdtempSync(join(tmpdir(), "my-omp-iap-test-"));
  const artifactPath = join(fixture, "spec.json");
  const artifactContent = JSON.stringify({ spec_version: "2.1", cipher: "AES-256-GCM" });
  writeFileSync(artifactPath, artifactContent, "utf8");

  const pointerEnv = buildEnvelope({
    performative: "COMPLETED",
    sender: "Worker-Spec",
    payload: { summary: "Spec extraction completed" },
    artifacts: [
      {
        uri: artifactPath,
        digest: computeSha256(artifactContent),
      },
    ],
  });

  if (!isPointerEnvelope(pointerEnv)) {
    fail(`isPointerEnvelope: expected true for envelope with artifacts`);
  }

  const resolved = await resolveEnvelopePayload<{ spec_version: string }>(pointerEnv);
  if (!resolved.verified || resolved.payload.spec_version !== "2.1") {
    fail(`resolveEnvelopePayload: resolution failed, got ${JSON.stringify(resolved)}`);
  }

  // Corrupted digest verification
  const corruptedEnv = buildEnvelope({
    performative: "COMPLETED",
    sender: "Worker-Spec",
    payload: { summary: "Corrupted" },
    artifacts: [
      {
        uri: artifactPath,
        digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
  });
  const corruptedRes = await resolveEnvelopePayload(corruptedEnv);
  if (corruptedRes.verified) {
    fail(`resolveEnvelopePayload: expected verification failure for mismatched digest`);
  }

  // 4. Parsing from embedded Markdown code blocks
  const markdownResponse = `
Here are the findings from my investigation.

\`\`\`iap
{
  "protocol": "omp-iap/v1",
  "id": "msg_001",
  "sender": { "name": "Worker-02", "agent_type": "scout" },
  "performative": "COMPLETED",
  "payload": {
    "verdict": "VULNERABLE",
    "severity": "High"
  }
}
\`\`\`
Hope this helps!
`;
  const parsedMd = parseEnvelope(markdownResponse);
  if (!parsedMd.parsed || parsedMd.envelope?.performative !== "COMPLETED") {
    fail(`parseEnvelope: markdown block parsing failed, got ${JSON.stringify(parsedMd)}`);
  }

  // 5. Hub Ingestion & Synthesis
  const hubMsgs = [
    { from: "Worker-A", message: serializeEnvelopeForHub(env1) },
    { from: "Worker-B", message: "plain text message without envelope" },
  ];
  const extractedEnvelopes = extractEnvelopesFromHubInbox(hubMsgs);
  if (extractedEnvelopes.length !== 1) {
    fail(`extractEnvelopesFromHubInbox: expected 1 extracted envelope, got ${extractedEnvelopes.length}`);
  }

  const synthComp = synthesizeCompletedEnvelope({
    filePath: artifactPath,
    fileContent: artifactContent,
    senderName: "synth-worker",
  });
  if (!synthComp.synthesized || synthComp.performative !== "COMPLETED" || !synthComp.artifacts?.[0].digest) {
    fail(`synthesizeCompletedEnvelope: invalid synthetic envelope`);
  }

  const synthBlocked = synthesizeBlockedEnvelope({
    senderName: "Worker-Blocked",
    waitingFor: "item_01#repo_url",
    reason: "NEED_REPO_URL",
  });
  if (synthBlocked.performative !== "BLOCKED" || (synthBlocked.payload as any).waiting_for !== "item_01#repo_url") {
    fail(`synthesizeBlockedEnvelope: invalid blocked envelope`);
  }

  const synthFailed = synthesizeFailedEnvelope({
    senderName: "Worker-Failed",
    error: "Network timeout fetching repository",
  });
  if (synthFailed.performative !== "FAILED") {
    fail(`synthesizeFailedEnvelope: invalid failed envelope`);
  }

  // 6. Live DAG Ingestion & Reactive Suspension / Unblocking
  const items = [
    { id: "node_a", name: "Node A" },
    { id: "node_b", name: "Node B", depends_on: ["node_a"] },
    { id: "node_c", name: "Node C", depends_on: ["node_b"] },
  ];
  const dag = buildResearchDag(items);

  // Initial state: node_a ready, node_b pending, node_c pending
  if (dag.nodes.get("node_a")?.status !== "ready") fail("node_a should be ready initially");
  if (dag.nodes.get("node_b")?.status !== "pending") fail("node_b should be pending initially");

  // Ingest BLOCKED for node_a
  const blockEnv = buildEnvelope({
    performative: "BLOCKED",
    sender: "node_a",
    payload: { waiting_for: "manual_api_key", reason: "MISSING_KEY" },
  });
  const blockRes = ingestIapEnvelope(dag, blockEnv);
  if (!blockRes.updated || dag.nodes.get("node_a")?.status !== "blocked") {
    fail(`ingestIapEnvelope: expected node_a to transition to blocked status`);
  }
  if (dag.nodes.get("node_a")?.waitingFor !== "manual_api_key") {
    fail(`ingestIapEnvelope: node_a missing waitingFor metadata`);
  }

  // Ingest COMPLETED for node_a -> should reactively unblock node_b!
  const compEnvA = buildEnvelope({
    performative: "COMPLETED",
    sender: "node_a",
    payload: { result: "ok" },
  });
  const compResA = ingestIapEnvelope(dag, compEnvA);
  if (!compResA.updated || !compResA.unblockedNodes.includes("node_b")) {
    fail(`ingestIapEnvelope: expected node_b to be unblocked after node_a completed`);
  }
  if (dag.nodes.get("node_b")?.status !== "ready") {
    fail(`dag: node_b should be ready after node_a completed`);
  }
  if (dag.nodes.get("node_c")?.status !== "pending") {
    fail(`dag: node_c should remain pending until node_b completes`);
  }

  // Synthesize envelopes from on-disk DAG results
  const resultsDir = join(fixture, "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "node_a.json"), JSON.stringify({ item: "node_a", evidence: "found" }), "utf8");
  writeFileSync(join(resultsDir, "node_b.json"), JSON.stringify({ item: "node_b", evidence: "audited" }), "utf8");

  const dagWithFiles = buildResearchDag(items, resultsDir);
  const synthEnvelopes = synthesizeEnvelopesForDag(dagWithFiles, resultsDir);
  if (synthEnvelopes.length < 2) {
    fail(`synthesizeEnvelopesForDag: expected at least 2 synthetic envelopes, got ${synthEnvelopes.length}`);
  }

  rmSync(fixture, { recursive: true, force: true });
}

// --- Routinize Extension Evolution & Skill Graduation Unit Tests ---
{
  // 1. validateExtensionSyntax checks
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
  const checkValid = validateExtensionSyntax(validExt);
  if (!checkValid.valid) {
    fail(`validateExtensionSyntax: expected valid, got error: ${checkValid.error}`);
  }

  const checkEmpty = validateExtensionSyntax("");
  if (checkEmpty.valid) {
    fail(`validateExtensionSyntax: expected error on empty content`);
  }

  const checkNoDefault = validateExtensionSyntax(`function run() {}`);
  if (checkNoDefault.valid) {
    fail(`validateExtensionSyntax: expected error when default export is missing`);
  }

  const checkMismatched = validateExtensionSyntax(`export default function() { return ( }`);
  if (checkMismatched.valid) {
    fail(`validateExtensionSyntax: expected error on mismatched delimiters`);
  }

  // 2. scaffoldLocalExtension
  const scaffolded = scaffoldLocalExtension({
    slug: "smoke-test",
    description: "Run local hardware smoke tests",
    commandName: "smoke-test",
    options: [{ value: "all", label: "all", description: "Run all tests" }],
    implementationBody: `ctx.ui?.notify?.("Smoke tests passed", "info");`,
  });

  if (scaffolded.path !== ".omp/extensions/smoke-test.ts") {
    fail(`scaffoldLocalExtension: unexpected path ${scaffolded.path}`);
  }
  if (!scaffolded.content.includes("smoke-test") || !scaffolded.content.includes("Smoke tests passed")) {
    fail(`scaffoldLocalExtension: missing expected content, got:\n${scaffolded.content}`);
  }
  const scaffoldCheck = validateExtensionSyntax(scaffolded.content);
  if (!scaffoldCheck.valid) {
    fail(`scaffoldLocalExtension: generated code failed syntax validation: ${scaffoldCheck.error}`);
  }

  // 3. isSkillProceduralCandidate heuristic tests
  const creativeSkill = `
# Grilling
Run an interview loop to stress-test your design. Never assume. Ask one question at a time.
`;
  const candCreative = isSkillProceduralCandidate(creativeSkill);
  if (candCreative.isCandidate) {
    fail(`isSkillProceduralCandidate: creative skill should NOT be flagged for graduation`);
  }

  const proceduralSkill = `
# Clean Build
Run the following build commands:
\`\`\`bash
npm run clean
cargo build --release
pytest tests/
\`\`\`
`;
  const candProcedural = isSkillProceduralCandidate(proceduralSkill);
  if (!candProcedural.isCandidate || candProcedural.estimatedTokenSavings <= 0) {
    fail(`isSkillProceduralCandidate: procedural skill SHOULD be flagged for graduation, got ${JSON.stringify(candProcedural)}`);
  }

  // 4. graduateSkillToExtension
  const graduated = graduateSkillToExtension({
    skillPath: ".omp/skills/clean-build/SKILL.md",
    skillContent: proceduralSkill,
  });

  if (graduated.extensionPath !== ".omp/extensions/clean-build.ts") {
    fail(`graduateSkillToExtension: unexpected extensionPath ${graduated.extensionPath}`);
  }
  if (graduated.skillPathToDelete !== ".omp/skills/clean-build/SKILL.md") {
    fail(`graduateSkillToExtension: unexpected skillPathToDelete ${graduated.skillPathToDelete}`);
  }
  if (graduated.tokenSavings <= 0) {
    fail(`graduateSkillToExtension: expected positive token savings`);
  }
  const gradCheck = validateExtensionSyntax(graduated.extensionContent);
  if (!gradCheck.valid) {
    fail(`graduateSkillToExtension: generated extension failed syntax validation: ${gradCheck.error}`);
  }
}
// --- Lazy Directory Creation, Canonical Paths, & Subagent File Contract Unit Tests ---
{
  const fixture = mkdtempSync(join(tmpdir(), "omp-file-first-test-"));

  // 1. ensureKnowledgeDirs
  const kbDirs = ensureKnowledgeDirs(fixture);
  if (!existsSync(kbDirs.recordsDir) || !existsSync(kbDirs.pitfallsDir) || !existsSync(kbDirs.researchDir)) {
    fail(`ensureKnowledgeDirs: directories were not created properly`);
  }
  if (!existsSync(kbDirs.indexPath)) {
    fail(`ensureKnowledgeDirs: INDEX.md was not initialized`);
  }

  // 2. ensureRoutinesDirs & ensureScratchDirs
  const routDirs = ensureRoutinesDirs(fixture);
  if (!existsSync(routDirs.routinesDir) || !existsSync(routDirs.manifestPath)) {
    fail(`ensureRoutinesDirs: routines directory or manifest not created`);
  }
  const scratchDir = ensureScratchDirs(fixture);
  if (!existsSync(scratchDir)) {
    fail(`ensureScratchDirs: scratch directory was not created`);
  }

  // 3. canonicalResultPath
  const resDir = join(fixture, "results");
  mkdirSync(resDir, { recursive: true });
  const cPath1 = canonicalResultPath(resDir, "find_repo", "Find Official Repo");
  if (!cPath1.endsWith("results/find_repo.json")) {
    fail(`canonicalResultPath: unexpected canonical path ${cPath1}`);
  }

  const cPath2 = canonicalResultPath(resDir, "crypto_audit", "Crypto Audit", 1);
  if (!cPath2.endsWith("results/crypto_audit.json")) {
    fail(`canonicalResultPath: unexpected non-existing indexed path ${cPath2}`);
  }
  writeFileSync(join(resDir, "02_crypto_audit.json"), "{}", "utf8");
  const cPath2Existing = canonicalResultPath(resDir, "crypto_audit", "Crypto Audit", 1);
  if (!cPath2Existing.endsWith("results/02_crypto_audit.json")) {
    fail(`canonicalResultPath: expected existing 02_crypto_audit.json to be picked`);
  }

  // 4. generateSubagentFileContract & parseFileContract
  const contract = generateSubagentFileContract({
    itemId: "cipher_audit",
    itemName: "Audit Cipher Implementation",
    itemIndex: 2,
    projectDir: fixture,
    fieldsPath: join(fixture, "fields.yaml"),
    upstreamContextPrompt: "<upstream-context>\nFound repo: https://github.com/test/repo\n</upstream-context>",
  });

  if (!contract.contractPrompt.includes("<file-contract>") || !contract.contractPrompt.includes("Output JSON Path: results/03_cipher_audit.json")) {
    fail(`generateSubagentFileContract: missing expected contract format, got:\n${contract.contractPrompt}`);
  }
  if (!contract.contractPrompt.includes("<upstream-context>")) {
    fail(`generateSubagentFileContract: upstream context was not appended`);
  }

  const parsedContract = parseFileContract(contract.contractPrompt);
  if (!parsedContract || parsedContract.itemId !== "cipher_audit" || parsedContract.targetPath !== "results/03_cipher_audit.json") {
    fail(`parseFileContract: failed to parse contract, got: ${JSON.stringify(parsedContract)}`);
  }

  rmSync(fixture, { recursive: true, force: true });
}
if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — commands, bootstrap, kb-guard-status, policy, knowledge_read, renderers, hindsight, clarify, kb-index-injector, and kv-cache-and-token-economics behave correctly.");
