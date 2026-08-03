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

interface HandlerContext {
  ui?: {
    notify?(message: string, level?: string): void;
  };
}

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: HandlerContext) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  description: string;
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

const EXPECTED: Record<string, { companions?: number }> = {
  "ask-me": {},
  "grill-me": {},
  "grill-with-docs": {},
  triage: { companions: 2 },
  "improve-codebase-architecture": { companions: 1 },
  "omp-setup": { companions: 5 },
  "to-spec": {},
  "to-tickets": {},
  implement: {},
  wayfinder: {},
  "omp-handoff": {},
  "plugin-issue": {},
  record: { companions: 1 },
  pitfall: { companions: 1 },
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
  enum: (values: readonly string[]) => ({ default: (value: string) => ({ values, default: value }) }),
  string: () => ({ optional: () => ({ kind: "string" }) }),
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
    def: { description: string; handler: RegisteredCommand["handler"] },
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

// 2. Every command has a description and injects a non-empty body.
for (const name of Object.keys(registered)) {
  const def = registered[name];
  if (!def.description) fail(`${name}: missing description`);
  sent.length = 0;
  await def.handler("", {});
  const injected = sent[0] ?? "";
  if (injected.length === 0) fail(`${name}: empty injected body`);
  const expectedCompanions = EXPECTED[name]?.companions ?? 0;
  const hasPointer = injected.includes("Companion reference files");
  if (expectedCompanions > 0 && !hasPointer) fail(`${name}: companion pointer missing`);
  if (expectedCompanions === 0 && hasPointer) fail(`${name}: unexpected companion pointer`);
}

// 3. Argument passthrough: args land in the injected message.
sent.length = 0;
await registered["omp-handoff"].handler("finish the auth flow", {});
if (!sent[0]?.includes("finish the auth flow")) fail("omp-handoff: args not injected");

// 4. No command body is a frontmatter-stripping casualty.
for (const name of Object.keys(registered)) {
  sent.length = 0;
  await registered[name].handler("", {});
  if (sent[0]?.startsWith("---")) fail(`${name}: frontmatter not stripped`);
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
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-03_dtcm.md"),
  "---\ntitle: DTCM\n---\nfound it",
);
writeFileSync(
  join(fixtureRoot, ".omp", "knowledge", "INDEX.md"),
  "- 2026-08-03 DTCM — .omp/knowledge/records/2026-08-03_dtcm.md\n",
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

// Receipts: /record and /pitfall emit a custom message with the right type.
customMessages.length = 0;
await registered["record"].handler("remember the DTCM thing", {});
if (customMessages.length !== 1 || customMessages[0].customType !== "knowledge-record") {
  fail("record: receipt custom message missing or wrong type");
} else if (!String(customMessages[0].content ?? "").includes("remember the DTCM thing")) {
  fail("record: receipt content missing the finding");
}
customMessages.length = 0;
await registered["pitfall"].handler("memory backend was off", {});
if (customMessages.length !== 1 || customMessages[0].customType !== "knowledge-pitfall") {
  fail("pitfall: receipt custom message missing or wrong type");
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — commands, bootstrap, policy, knowledge_read, and renderers behave correctly.");
