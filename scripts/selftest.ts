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
  }
}

// --- Command Argument Completions -------------------------------------------

{
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-a"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "references", "ref-b"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-08-02_deep-demo"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "other-slug"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".scratch", "specs"), { recursive: true });
  mkdirSync(join(fixtureRoot, "docs", "specs"), { recursive: true });
  writeFileSync(join(fixtureRoot, ".scratch", "specs", "spec-a.md"), "# Spec A");
  writeFileSync(join(fixtureRoot, "docs", "specs", "spec-b.md"), "# Spec B");

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
    // 1b. /audit
    const auditEmpty = registered["audit"].getArgumentCompletions?.("") ?? null;
    if (!auditEmpty || !auditEmpty.some((c) => c.label === "demo-audit") || !auditEmpty.some((c) => c.label === "complex-audit") || !auditEmpty.some((c) => c.label === "--recent")) {
      fail("audit: expected demo-audit, complex-audit, and --recent completions for empty prefix");
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
  } finally {
    process.chdir(prevCwd);
  }
}


if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — commands, bootstrap, policy, knowledge_read, renderers, and hindsight behave correctly.");
