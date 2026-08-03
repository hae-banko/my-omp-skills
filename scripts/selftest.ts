// Selftest for the my-omp-skills extension entry point.
//
// Imports the extension with a mock `pi`, asserts every command registers with
// a description and a non-empty workflow body, then invokes each handler and
// asserts `sendUserMessage` receives content that includes the workflow body
// and, for commands with companions, the companion pointer section.
//
// Run: bun run scripts/selftest.ts

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

const EXPECTED: Record<string, { companions?: number }> = {
  "ask-matt": {},
  "grill-me": {},
  "grill-with-docs": {},
  triage: { companions: 2 },
  "improve-codebase-architecture": { companions: 1 },
  setup: { companions: 5 },
  "to-spec": {},
  "to-tickets": {},
  implement: {},
  wayfinder: {},
  handoff: {},
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
};

extension(mockPi);

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
await registered.handoff.handler("finish the auth flow", {});
if (!sent[0]?.includes("finish the auth flow")) fail("handoff: args not injected");

// 4. No command body is a frontmatter-stripping casualty.
for (const name of Object.keys(registered)) {
  sent.length = 0;
  await registered[name].handler("", {});
  if (sent[0]?.startsWith("---")) fail(`${name}: frontmatter not stripped`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nOK — all commands register and inject correctly.");
