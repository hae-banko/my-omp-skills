// Commands and Session Bootstrap Test Suite

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { __resetBootstrapForTests } from "../src/core/bootstrap.ts";
import {
  completeStrings,
  createSubcommandCompleter,
  filterCompletions,
} from "../src/core/completions.ts";
import {
  scanAndValidateMarkdownDir,
  validateMarkdownFrontmatter,
} from "../src/core/markdown-lint.ts";
import {
  createTempFixture,
  EXPECTED_COMMANDS,
  fail,
  type TestContext,
} from "./test-utils.ts";

export async function runCommandsSuite(ctx: TestContext): Promise<void> {
  const { registered, sent, handlers } = ctx;

  // 1. Every expected command registered, and no extras
  for (const name of Object.keys(EXPECTED_COMMANDS)) {
    if (!registered[name]) {
      fail(`command missing: ${name}`);
    } else {
      if (!registered[name].description) {
        fail(`command ${name} has empty description`);
      }
    }
  }

  for (const name of Object.keys(registered)) {
    if (!(name in EXPECTED_COMMANDS)) {
      fail(`unexpected command registered: ${name}`);
    }
  }

  // 2. Command execution & companion pointers in hidden custom messages
  for (const name of Object.keys(registered)) {
    sent.length = 0;
    ctx.customMessages.length = 0;
    await registered[name].handler("", {});

    const spec = EXPECTED_COMMANDS[name];
    if (spec?.silent) {
      if (sent.length !== 0) {
        fail(`silent command /${name} queued a message: ${JSON.stringify(sent)}`);
      }
    } else {
      const userPrompt = sent[0] ?? "";
      if (userPrompt !== `/${name}`) {
        fail(`${name}: expected clean user prompt "/${name}", got "${userPrompt}"`);
      }

      const hiddenMsg = ctx.customMessages.find((m) => m.display === false);
      const injected = (hiddenMsg?.content as string) ?? "";
      if (injected.length === 0) {
        fail(`${name}: empty injected workflow body in custom message`);
      }

      const expectedCompanions = spec?.companions ?? 0;
      const hasPointer = injected.includes("Companion reference files");
      if (expectedCompanions > 0 && !hasPointer) {
        fail(`${name}: companion pointer missing`);
      }
      if (expectedCompanions === 0 && hasPointer) {
        fail(`${name}: unexpected companion pointer`);
      }
    }
  }

  // 3. Argument passthrough: args land in the hidden workflow body and visible user prompt
  sent.length = 0;
  ctx.customMessages.length = 0;
  await registered["omp-handoff"].handler("finish the auth flow", {});
  if (!sent[0]?.includes("/omp-handoff finish the auth flow")) {
    fail("omp-handoff: args not in visible prompt");
  }
  const handoffHidden = ctx.customMessages.find((m) => m.display === false);
  if (!((handoffHidden?.content as string) ?? "").includes("finish the auth flow")) {
    fail("omp-handoff: args not injected into hidden workflow body");
  }

  // 4. No command body is a frontmatter-stripping casualty
  for (const name of Object.keys(registered)) {
    ctx.customMessages.length = 0;
    await registered[name].handler("", {});
    const hiddenMsg = ctx.customMessages.find((m) => m.display === false);
    const injected = (hiddenMsg?.content as string) ?? "";
    if (injected.startsWith("---")) fail(`${name}: frontmatter not stripped`);
  }

  // 5. Bootstrap injection lifecycle
  __resetBootstrapForTests();
  const baseMessages: unknown[] = [
    { role: "compactionSummary", content: [{ type: "text", text: "compacted" }] },
    { role: "user", content: [{ type: "text", text: "hello" }] },
  ];

  function asMessagesResult(value: unknown): unknown[] | null {
    if (!value || typeof value !== "object" || !("messages" in value)) return null;
    return Array.isArray(value.messages) ? value.messages : null;
  }

  function textOfMessage(message: unknown): string {
    if (!message || typeof message !== "object" || !("content" in message)) return "";
    const content: unknown = message.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content) || content.length === 0) return "";
    const first = content[0];
    if (!first || typeof first !== "object" || !("text" in first)) return "";
    return typeof first.text === "string" ? first.text : "";
  }

  await handlers["session_start"]?.({}, {});
  const injected = asMessagesResult(await handlers["context"]?.({ messages: baseMessages }));
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
  }

  // Dedup: same messages again -> no second injection
  const second = await handlers["context"]?.({ messages: injected ?? baseMessages });
  if (second !== undefined) fail("bootstrap: injected twice in one session");

  // agent_end clears the flag
  await handlers["agent_end"]?.({});
  const afterEnd = await handlers["context"]?.({ messages: baseMessages });
  if (afterEnd !== undefined) fail("bootstrap: injected after agent_end");

  // 6. Declarative Completions
  const testOpts = [
    { value: "run", label: "run", description: "Run routine" },
    { value: "scan", label: "scan", description: "Scan session" },
    { value: "list", label: "list", description: "List all" },
  ];

  const filtered = filterCompletions(testOpts, "sc");
  if (filtered.length !== 1 || filtered[0].value !== "scan") {
    fail(`filterCompletions: expected scan, got: ${JSON.stringify(filtered)}`);
  }

  const strOpts = completeStrings(["apple", "banana", "apricot"], "ap");
  if (strOpts.length !== 2) {
    fail(`completeStrings: expected 2 matches, got: ${JSON.stringify(strOpts)}`);
  }

  const subCompleter = createSubcommandCompleter(testOpts, (sub, rest) => {
    if (sub === "run") return completeStrings(["script-a", "script-b"], rest);
    return null;
  });

  const subRes = subCompleter("run sc");
  if (!subRes || subRes.length !== 2) {
    fail(`createSubcommandCompleter: expected 2 script options`);
  }

  // 7. Markdown Frontmatter Linting & Syntax Validation
  const unclosedCheck = validateMarkdownFrontmatter("---\nname: test\n# missing end");
  if (unclosedCheck.length === 0 || !unclosedCheck[0].includes("Unclosed YAML")) {
    fail("validateMarkdownFrontmatter: failed to detect unclosed frontmatter");
  }

  const dupKeyCheck = validateMarkdownFrontmatter("---\nname: a\nname: b\n---\nbody");
  if (dupKeyCheck.length === 0 || !dupKeyCheck[0].includes("Duplicate frontmatter key")) {
    fail("validateMarkdownFrontmatter: failed to detect duplicate key");
  }

  const quoteCheck = validateMarkdownFrontmatter('---\nname: "unclosed\n---\nbody');
  if (quoteCheck.length === 0 || !quoteCheck[0].includes("Mismatched quotes")) {
    fail("validateMarkdownFrontmatter: failed to detect mismatched quotes");
  }

  const cmdFailures = scanAndValidateMarkdownDir("commands");
  if (cmdFailures.length > 0) {
    fail(`commands markdown lint failures: ${JSON.stringify(cmdFailures, null, 2)}`);
  }

  const skillFailures = scanAndValidateMarkdownDir("skills");
  if (skillFailures.length > 0) {
    fail(`skills markdown lint failures: ${JSON.stringify(skillFailures, null, 2)}`);
  }
}
