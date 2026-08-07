// Selftest for the my-omp-skills extension entry point.
//
// Imports the extension with a mock `pi`, then asserts:
// 1. Every command registers with a description and a non-empty workflow body,
//    companions disclosed, args passed through, frontmatter stripped.
// 2. The session bootstrap injects exactly once per session (session_start →
//    context → dedup → agent_end clears it), after leading compaction summaries.
// 3. The tool_call policy blocks rewrites of the append-only knowledge base
//    while letting new files, research working files, and INDEX.md appends pass.
//
// Run: bun run scripts/selftest.ts

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bundled via esbuild alias to scripts/stubs/pi-tui.ts; the real module is
// served at runtime by the omp binary.
import { Container as TuiContainer } from "@oh-my-pi/pi-tui";

import extension from "../src/index.ts";
import { isHindsightEnabled, reloadHindsightConfig } from "../src/hindsight.ts";
import {
  renderResearchReviewCard,
  renderResearchWaveProgressCard,
  renderResearchReportPreviewCard,
  renderResearchDashboardCard,
  type ResearchReviewPayload,
  type ResearchWaveProgressPayload,
  type ResearchReportPreviewPayload,
  type ResearchDashboardPayload,
} from "../src/research-renderer.ts";
import {
  renderAuditCard,
  renderTicketBreakdownCard,
  renderTriageStatusCard,
  type AuditCardPayload,
  type TicketBreakdownPayload,
  type TriageStatusPayload,
} from "../src/telemetry-renderer.ts";

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
    ctx: { cwd: string },
  ): Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
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
  reference: {},
  record: { companions: 1 },
  pitfall: { companions: 1 },
  routinize: { companions: 2 },
  research: { companions: 7 },
  "research-add-items": { companions: 1 },
  "research-add-fields": { companions: 1 },
  "research-deep": { companions: 7 },
  "research-report": {},
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
const tools: RegisteredTool[] = [];
const renderers: Record<string, (message: unknown, options: unknown, theme: unknown) => unknown> = {};

const zod = {
  object: (shape: Record<string, unknown>) => ({ shape }),
  enum: (values: readonly string[]) => ({
    default: (value: string) => ({ values, default: value }),
    optional: () => ({ kind: "enum", values }),
  }),
  string: () => ({ optional: () => ({ kind: "string" }) }),
  record: (keyType?: unknown, valueType?: unknown) => ({ optional: () => ({ kind: "record" }) }),
  number: () => ({
    int: () => ({
      min: (n: number) => ({
        max: (m: number) => ({ optional: () => ({ kind: "number", min: n, max: m }) }),
      }),
    }),
  }),
  boolean: () => ({ optional: () => ({ kind: "boolean" }) }),
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
  zod,
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

// --- Policy: append-only knowledge base ------------------------------------

const fixtureRoot = mkdtempSync(join(tmpdir(), "my-omp-skills-test-"));
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "records"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "pitfalls"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-08-01_demo"), {
  recursive: true,
});
mkdirSync(join(fixtureRoot, ".omp", "audits", "demo-audit", "archive"), { recursive: true });
mkdirSync(join(fixtureRoot, ".omp", "audits", "complex-audit", "subtopics"), { recursive: true });
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-03_dtcm.md"),
  "---\ntitle: DTCM\n---\nfound it",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "INDEX.md"),
  "- 2026-08-03 DTCM — .omp/knowledge/records/2026-08-03_dtcm.md\n",
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

  const directCard = renderResearchReviewCard(samplePayload) as TuiContainer;
  if (!(directCard instanceof TuiContainer)) {
    fail("renderer: renderResearchReviewCard did not return a Container");
  }
  const directChildren = (directCard as unknown as { children: unknown[] }).children ?? [];
  const directTexts = directChildren
    .map((c: unknown) => {
      if (c && typeof c === "object" && "text" in c) {
        return String(c.text ?? "");
      }
      return "";
    })
    .join("\n");
  if (!directTexts.includes("RESEARCH DRAFT REVIEW")) {
    fail("research-review: output missing RESEARCH DRAFT REVIEW header");
  }
  if (!directTexts.includes("Section 1: Living Outline")) {
    fail("research-review: output missing Section 1 title");
  }
  if (!directTexts.includes("Section 2: Execution Settings")) {
    fail("research-review: output missing Section 2 title");
  }
  if (!directTexts.includes("Section 3: Interactive Action Options")) {
    fail("research-review: output missing Section 3 title");
  }

  const msgCard = renderers["research-review"](
    { customType: "research-review", details: samplePayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered research-review renderer did not return a Container");
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
  const directCard = renderResearchWaveProgressCard(wavePayload) as TuiContainer;
  if (!(directCard instanceof TuiContainer)) {
    fail("renderer: renderResearchWaveProgressCard did not return a Container");
  }
  const directChildren = (directCard as unknown as { children: unknown[] }).children ?? [];
  const directTexts = directChildren
    .map((c: unknown) => (c && typeof c === "object" && "text" in c ? String(c.text ?? "") : ""))
    .join("\n");
  if (!directTexts.includes("RESEARCH WAVE PROGRESS")) {
    fail("research-wave-progress: output missing header");
  }
  if (!directTexts.includes("[WAVE 2/3]")) {
    fail("research-wave-progress: output missing wave badge");
  }
  if (!directTexts.includes("[████░░░░]")) {
    fail("research-wave-progress: output missing progress bar");
  }
  if (!directTexts.includes("Uncertainty Reduction (ΔU)")) {
    fail("research-wave-progress: output missing ΔU metric");
  }

  const msgCard = renderers["research-wave-progress"](
    { customType: "research-wave-progress", details: wavePayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered research-wave-progress renderer did not return a Container");
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
  const directCard = renderResearchReportPreviewCard(reportPayload) as TuiContainer;
  if (!(directCard instanceof TuiContainer)) {
    fail("renderer: renderResearchReportPreviewCard did not return a Container");
  }
  const directChildren = (directCard as unknown as { children: unknown[] }).children ?? [];
  const directTexts = directChildren
    .map((c: unknown) => (c && typeof c === "object" && "text" in c ? String(c.text ?? "") : ""))
    .join("\n");
  if (!directTexts.includes("RESEARCH REPORT PREVIEW")) {
    fail("research-report-preview: output missing header");
  }
  if (!directTexts.includes("Coverage:")) {
    fail("research-report-preview: output missing coverage");
  }
  if (!directTexts.includes("Verified Sources Count:")) {
    fail("research-report-preview: output missing verified sources count");
  }
  if (!directTexts.includes("Executive Summary Preview:")) {
    fail("research-report-preview: output missing summary preview");
  }
  if (!directTexts.includes("Unresolved Field Provenance:")) {
    fail("research-report-preview: output missing unresolved field provenance");
  }

  const msgCard = renderers["research-report-preview"](
    { customType: "research-report-preview", details: reportPayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered research-report-preview renderer did not return a Container");
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
  const directCard = renderResearchDashboardCard(dashPayload) as TuiContainer;
  if (!(directCard instanceof TuiContainer)) {
    fail("renderer: renderResearchDashboardCard did not return a Container");
  }
  const directChildren = (directCard as unknown as { children: unknown[] }).children ?? [];
  const directTexts = directChildren
    .map((c: unknown) => (c && typeof c === "object" && "text" in c ? String(c.text ?? "") : ""))
    .join("\n");
  if (!directTexts.includes("RESEARCH DASHBOARD")) {
    fail("research-dashboard: output missing header");
  }
  if (!directTexts.includes("Pipeline Status:")) {
    fail("research-dashboard: output missing pipeline status");
  }
  if (!directTexts.includes("Phase 1") || !directTexts.includes("Phase 2") || !directTexts.includes("Phase 3")) {
    fail("research-dashboard: output missing phase indicators");
  }
  if (!directTexts.includes("Global Completion Metrics:")) {
    fail("research-dashboard: output missing global completion metrics");
  }
  if (!directTexts.includes("Project Artifacts Status:")) {
    fail("research-dashboard: output missing project artifacts status");
  }
  if (!directTexts.includes("Recommended Next Step:")) {
    fail("research-dashboard: output missing recommended next step");
  }

  const msgCard = renderers["research-dashboard"](
    { customType: "research-dashboard", details: dashPayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered research-dashboard renderer did not return a Container");
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
  const card = renderAuditCard(auditPayload) as TuiContainer;
  if (!(card instanceof TuiContainer)) {
    fail("renderer: renderAuditCard did not return a Container");
  }
  const children = (card as unknown as { children: unknown[] }).children ?? [];
  const texts = children
    .map((c: unknown) => (c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : ""))
    .join("\n");
  if (!texts.includes("AUDIT REPORT")) fail("audit-card: output missing header");
  if (!texts.includes("security-audit")) fail("audit-card: output missing slug");
  if (!texts.includes("v0.1.0")) fail("audit-card: output missing version");
  if (!texts.includes("active")) fail("audit-card: output missing status");
  if (!texts.includes(".omp/audits/security-audit/overview.md")) fail("audit-card: output missing root report path");
  if (!texts.includes("Subtopics Count: 2")) fail("audit-card: output missing subtopics count");
  if (!texts.includes("Initial draft")) fail("audit-card: output missing latest revision");

  const msgCard = renderers["audit-card"](
    { customType: "audit-card", details: auditPayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered audit-card renderer did not return a Container");
  }
}

if (!renderers["ticket-breakdown"]) {
  fail("renderers: ticket-breakdown not registered");
} else {
  const ticketPayload: TicketBreakdownPayload = {
    feature: "auth-flow",
    ticket_count: 2,
    tracker_path: ".scratch/auth-flow/issues/",
    ready_status: "ready-for-agent",
    tickets: [
      { id: "01", title: "DB Schema", blocked_by: [] },
      { id: "02", title: "API Handler", blocked_by: ["01"] },
    ],
  };
  const card = renderTicketBreakdownCard(ticketPayload) as TuiContainer;
  if (!(card instanceof TuiContainer)) {
    fail("renderer: renderTicketBreakdownCard did not return a Container");
  }
  const children = (card as unknown as { children: unknown[] }).children ?? [];
  const texts = children
    .map((c: unknown) => (c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : ""))
    .join("\n");
  if (!texts.includes("TICKET BREAKDOWN")) fail("ticket-breakdown: output missing header");
  if (!texts.includes(".scratch/auth-flow/issues/")) fail("ticket-breakdown: output missing tracker path");
  if (!texts.includes("Ticket Count: 2")) fail("ticket-breakdown: output missing ticket count");
  if (!texts.includes("ready-for-agent")) fail("ticket-breakdown: output missing ready status");
  if (!texts.includes("Ticket 01 -> Ticket 02")) {
    fail("ticket-breakdown: output missing blocking dependency arrow");
  }

  const msgCard = renderers["ticket-breakdown"](
    { customType: "ticket-breakdown", details: ticketPayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered ticket-breakdown renderer did not return a Container");
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
  const card = renderTriageStatusCard(triagePayload) as TuiContainer;
  if (!(card instanceof TuiContainer)) {
    fail("renderer: renderTriageStatusCard did not return a Container");
  }
  const children = (card as unknown as { children: unknown[] }).children ?? [];
  const texts = children
    .map((c: unknown) => (c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : ""))
    .join("\n");
  if (!texts.includes("TRIAGE STATUS")) fail("triage-status: output missing header");
  if (!texts.includes("Total Items: 6")) fail("triage-status: output missing total items");
  if (!texts.includes("unlabeled: 2")) fail("triage-status: output missing unlabeled count");
  if (!texts.includes("needs-triage: 3")) fail("triage-status: output missing needs-triage count");
  if (!texts.includes("agent-ready: 1")) fail("triage-status: output missing agent-ready count");
  if (!texts.includes("Categorize unlabeled issues")) fail("triage-status: output missing next action");

  const msgCard = renderers["triage-status"](
    { customType: "triage-status", details: triagePayload },
    {},
    null,
  ) as TuiContainer;
  if (!(msgCard instanceof TuiContainer)) {
    fail("renderer: registered triage-status renderer did not return a Container");
  }
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

for (const bad of malformedPayloads) {
  try {
    const c1 = renderAuditCard(bad as AuditCardPayload);
    if (!(c1 instanceof TuiContainer)) fail("resilience: renderAuditCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderAuditCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c2 = renderTicketBreakdownCard(bad as TicketBreakdownPayload);
    if (!(c2 instanceof TuiContainer)) fail("resilience: renderTicketBreakdownCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderTicketBreakdownCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c3 = renderTriageStatusCard(bad as TriageStatusPayload);
    if (!(c3 instanceof TuiContainer)) fail("resilience: renderTriageStatusCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderTriageStatusCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c4 = renderResearchReviewCard(bad as ResearchReviewPayload);
    if (!(c4 instanceof TuiContainer)) fail("resilience: renderResearchReviewCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderResearchReviewCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c5 = renderResearchWaveProgressCard(bad as ResearchWaveProgressPayload);
    if (!(c5 instanceof TuiContainer)) fail("resilience: renderResearchWaveProgressCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderResearchWaveProgressCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c6 = renderResearchReportPreviewCard(bad as ResearchReportPreviewPayload);
    if (!(c6 instanceof TuiContainer)) fail("resilience: renderResearchReportPreviewCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderResearchReportPreviewCard threw exception for malformed payload: ${err}`);
  }
  try {
    const c7 = renderResearchDashboardCard(bad as ResearchDashboardPayload);
    if (!(c7 instanceof TuiContainer)) fail("resilience: renderResearchDashboardCard failed to return Container for malformed payload");
  } catch (err) {
    fail(`resilience: renderResearchDashboardCard threw exception for malformed payload: ${err}`);
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
const { parseHerdrOutput } = await import("../src/herdr-tools.ts");
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
        ],
      }),
    );
    writeFileSync(
      join(routinesDir, "echo_test.sh"),
      `#!/usr/bin/env bash\nMSG="\${MSG:-hello}"\necho "Routine MSG: \${MSG}"\n`,
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
  mkdirSync(join(fixtureRoot, ".scratch", "specs"), { recursive: true });
  mkdirSync(join(fixtureRoot, "docs", "specs"), { recursive: true });
  writeFileSync(join(fixtureRoot, ".scratch", "specs", "spec-a.md"), "# Spec A");
  writeFileSync(join(fixtureRoot, "docs", "specs", "spec-b.md"), "# Spec B");
  // /to-spec Finding 4.1 fixture: a feature dir whose spec.md is a *directory*
  // (not a file). The completion must NOT add it as a suggestion.
  mkdirSync(join(fixtureRoot, ".scratch", "spec-c", "spec.md", "nested"), { recursive: true });
  const prevCwd = process.cwd();
  process.chdir(fixtureRoot);
  try {
    // 1. /reference
    const refSub = registered["reference"].getArgumentCompletions?.("") ?? null;
    if (!refSub || refSub.length !== 4) {
      fail("reference: expected 4 subcommands for empty prefix");
    } else {
      const labels = refSub.map((c) => c.label).sort().join(",");
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
      !auditEmpty.some((c) => c.label === "demo-audit") ||
      !auditEmpty.some((c) => c.label === "complex-audit") ||
      !auditEmpty.some((c) => c.label === "--recent") ||
      !auditEmpty.some((c) => c.label === "status") ||
      !auditEmpty.some((c) => c.label === "list") ||
      !auditEmpty.some((c) => c.label === "view") ||
      !auditEmpty.some((c) => c.label === "subtopics")
    ) {
      fail("audit: expected demo-audit, complex-audit, subcommands (status, list, view, subtopics), and --recent completions for empty prefix");
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
    if (!researchEmpty || researchEmpty.length < 10) {
      fail(`research: expected subcommands and project slugs for empty prefix, got ${researchEmpty?.length}`);
    } else {
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
      if (researchSubSpace[0].value !== "review other-slug") {
        fail(`research: unexpected completion value for subcommand space: ${researchSubSpace[0].value}`);
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
    if (!reportEmpty || reportEmpty.length !== 3) {
      fail("research-report: expected all research slugs including non-dated for empty prefix");
    } else {
      const labels = reportEmpty.map((c) => c.label).sort().join(",");
      if (!labels.includes("other-slug")) fail("research-report: expected all research slugs");
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
    if (!toTicketsEmpty || toTicketsEmpty.length !== 2) {
      fail("to-tickets: expected spec markdown files");
    } else {
      const values = toTicketsEmpty.map((c) => c.value).sort().join(",");
      if (values !== ".scratch/specs/spec-a.md,docs/specs/spec-b.md") {
        fail(`to-tickets: unexpected spec file completion values: ${values}`);
      }
    }

    // 8. /routinize
    const routinizeEmpty = registered["routinize"].getArgumentCompletions?.("") ?? null;
    if (!routinizeEmpty || routinizeEmpty.length !== 3) {
      fail("routinize: expected 3 subcommands (scan, run, list) for empty prefix");
    } else {
      const labels = routinizeEmpty.map((c) => c.label).sort().join(",");
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
      if (!labels.includes(".scratch/specs/spec-a.md") || !labels.includes("docs/specs/spec-b.md")) {
        fail(`implement: missing expected markdown files (got: ${labels.join(",")})`);
      }
    }

    // 10. /to-spec
    const toSpecEmpty = registered["to-spec"].getArgumentCompletions?.("") ?? null;
    if (!toSpecEmpty || toSpecEmpty.length < 2) {
      fail("to-spec: expected spec markdown files for empty prefix");
    } else {
      const values = toSpecEmpty.map((c) => c.value).sort().join(",");
      if (values !== ".scratch/specs/spec-a.md,docs/specs/spec-b.md") {
        fail(`to-spec: unexpected spec file completion values: ${values}`);
      }
      // Finding 4.1: a directory named spec.md (fixture .scratch/spec-c/spec.md/)
      // must NOT appear in completions.
      if (values.includes("spec-c")) {
        fail(`to-spec: directory named spec.md should be excluded (got: ${values})`);
      }
    }

    // 11. /wayfinder
    const wayfinderEmpty = registered["wayfinder"].getArgumentCompletions?.("") ?? null;
    if (!wayfinderEmpty || wayfinderEmpty.length !== 4) {
      fail("wayfinder: expected 4 subcommands (status, map, list, resolve) for empty prefix");
    } else {
      const labels = wayfinderEmpty.map((c) => c.label).sort().join(",");
      if (labels !== "list,map,resolve,status") {
        fail(`wayfinder: unexpected subcommand labels: ${labels}`);
      }
    }
    const wayfinderRes = registered["wayfinder"].getArgumentCompletions?.("res") ?? null;
    if (!wayfinderRes || wayfinderRes.length !== 1 || wayfinderRes[0].label !== "resolve") {
      fail("wayfinder: expected resolve completion for 'res'");
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
      if (!labels.includes(".scratch/specs/spec-a.md") || !labels.includes("docs/specs/spec-b.md")) {
        fail(`grill-me: missing expected spec file completions (got: ${labels.join(",")})`);
      }
    }

    const grillDocsEmpty = registered["grill-with-docs"].getArgumentCompletions?.("") ?? null;
    if (!grillDocsEmpty || grillDocsEmpty.length === 0) {
      fail("grill-with-docs: expected spec filenames / feature names for empty prefix");
    } else {
      const labels = grillDocsEmpty.map((c) => c.label);
      if (!labels.includes(".scratch/specs/spec-a.md") || !labels.includes("docs/specs/spec-b.md")) {
        fail(`grill-with-docs: missing expected spec file completions (got: ${labels.join(",")})`);
      }
    }
  } finally {
    process.chdir(prevCwd);
  }
}


if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — commands, bootstrap, policy, knowledge_read, renderers, and hindsight behave correctly.");
