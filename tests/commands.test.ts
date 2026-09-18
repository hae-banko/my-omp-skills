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
  createInteractiveCommandContext,
  EXPECTED_COMMANDS,
  fail,
  type RegisteredCommand,
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
    } else if (spec?.noEcho) {
      // noEcho: command routes via pi.sendMessage({ triggerTurn: true }) and must NOT call pi.sendUserMessage with the command echo.
      if (sent.length !== 0) {
        fail(`noEcho command /${name} must not echo into the input box: ${JSON.stringify(sent)}`);
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

  // 8. /council subcommand routing + completions
  const councilSpec = registered["council"];
  if (!councilSpec) fail("/council not registered");
  const complete = (prefix: string) => {
    const fn = councilSpec.getArgumentCompletions;
    if (!fn) return [];
    return fn(prefix) ?? [];
  };

  // The completer returns ONLY clean natural keywords (zero -- prefixes).
  const allOptions = complete("");
  if (allOptions.some((o) => o.value.startsWith("--"))) {
    fail(`/council completions must NOT contain -- prefixes: found ${allOptions.filter((o) => o.value.startsWith("--")).map((o) => o.value).join(", ")}`);
  }
  const expectedValues = [
    "software", "ml", "embedded", "firmware", "ee", "hardware",
    "overlay", "modal", "preset", "council", "quick", "deep", "debate",
    "save", "record", "actionable", "compact", "list", "init",
  ];
  for (const v of expectedValues) {
    if (!allOptions.some((o) => o.value === v)) {
      fail(`/council completion missing natural keyword: ${v}`);
    }
  }

  // Filtering: typing "ml" or "--ml" both cleanly resolve to "ml".
  const mlFromBare = complete("ml");
  if (mlFromBare.length === 0 || mlFromBare[0].value !== "ml") fail("/council 'ml' completion");
  const mlFromDash = complete("--ml");
  if (mlFromDash.length === 0 || mlFromDash[0].value !== "ml") fail("/council '--ml' completion fallback");

  // Custom councils from council.yaml surface in completions when
  // MY_OMP_SKILLS_TEST_ROOT points at a temp dir containing one.
  const completionTmp = createTempFixture("council-completions-");
  const prevCompletionRoot = process.env.MY_OMP_SKILLS_TEST_ROOT;
  process.env.MY_OMP_SKILLS_TEST_ROOT = completionTmp.dir;
  try {
    mkdirSync(join(completionTmp.dir, ".omp"), { recursive: true });
    writeFileSync(
      join(completionTmp.dir, ".omp", "council.yaml"),
      [
        "councils:",
        "  my-custom-team:",
        "    - name: Team Lead",
        "    - name: Analyst",
        "    - name: Skeptic",
        "",
      ].join("\n"),
      "utf8",
    );
    const withCustom = complete("");
    const customOpt = withCustom.find((o) => o.value === "my-custom-team");
    if (!customOpt) {
      fail(`/council completions missing custom council id: ${JSON.stringify(withCustom.map((o) => o.value))}`);
    } else if (!customOpt.description?.includes("my-custom-team") && !customOpt.description?.includes("Custom council")) {
      fail(`/council custom council description unexpected: ${customOpt.description}`);
    }
    // council/preset heads offer all council ids (built-in + custom) matching rest.
    const presetOptions = complete("preset my-c");
    if (!presetOptions.some((o) => o.value === "my-custom-team")) {
      fail(`/council 'preset my-c' completion missing my-custom-team: ${JSON.stringify(presetOptions)}`);
    }
    const councilOptions = complete("council default");
    if (!councilOptions.some((o) => o.value === "default-triad")) {
      fail(`/council 'council default' completion missing default-triad: ${JSON.stringify(councilOptions)}`);
    }
  } finally {
    if (prevCompletionRoot === undefined) delete process.env.MY_OMP_SKILLS_TEST_ROOT;
    else process.env.MY_OMP_SKILLS_TEST_ROOT = prevCompletionRoot;
    completionTmp.cleanup();
  }

  // Subcommand filtering: typing "init" surfaces init + force (no -- prefix).
  const initOnly = complete("init");
  if (initOnly.length === 0 || initOnly[0].value !== "init") fail("/council init completion");
  if (!initOnly.some((o) => o.value === "force")) fail("/council init force completion");
  if (initOnly.some((o) => o.value.startsWith("--"))) fail("/council init completions should not have -- prefix");
  // /council list routes through the runCouncilCommand subcommand path and
  // emits a customType=council-verdict listing message (no deliberation).
  sent.length = 0;
  const getCustomType = (m: Record<string, unknown>): string | undefined =>
    typeof m.customType === "string" ? m.customType : undefined;

  sent.length = 0;
  ctx.customMessages.length = 0;
  await registered["council"].handler("list", {});
  const listMsgs = ctx.customMessages.filter((m) => getCustomType(m) === "council-verdict");
  if (listMsgs.length === 0) fail("/council list: no council-verdict message");
  // /council init scaffolds the YAML config — point the test at a tmp dir so
  // we never write into the real repo's .omp/ from CI.
  const tmp = createTempFixture("council-init-");
  const prevRoot = process.env.MY_OMP_SKILLS_TEST_ROOT;
  process.env.MY_OMP_SKILLS_TEST_ROOT = tmp.dir;
  try {
    sent.length = 0;
    ctx.customMessages.length = 0;
    await registered["council"].handler("init force", {});
    const initMsgs = ctx.customMessages.filter((m) => getCustomType(m) === "council-verdict");
    if (initMsgs.length === 0) fail("/council init: no council-verdict message");
    if (!existsSync(join(tmp.dir, ".omp", "council.yaml"))) {
      fail("/council init: .omp/council.yaml not created in test root");
    }
  } finally {
    if (prevRoot === undefined) delete process.env.MY_OMP_SKILLS_TEST_ROOT;
    else process.env.MY_OMP_SKILLS_TEST_ROOT = prevRoot;
    tmp.cleanup();
  }

  // Council deliberation message options: the hidden command workflow body must
  // dispatch via { triggerTurn: true } without deliverAs ("nextTurn" would leak
  // council instructions into subsequent turns), and the placeholder verdict
  // card must NOT pass deliverAs: "followUp" (which queued an extra user turn).
  sent.length = 0;
  ctx.customMessages.length = 0;
  ctx.customMessageOptions.length = 0;
  await registered["council"].handler("ml Should we use GQA?", {});
  const optFor = (m: Record<string, unknown>): Record<string, unknown> | undefined => {
    const idx = ctx.customMessages.indexOf(m);
    return idx >= 0 ? ctx.customMessageOptions[idx] : undefined;
  };
  const commandMsg = ctx.customMessages.find((m) => getCustomType(m) === "command:council");
  if (!commandMsg) {
    fail("/council: no command:council custom message for deliberation");
  } else {
    const commandOpts = optFor(commandMsg);
    if (!commandOpts) {
      fail("/council: command:council message sent without options");
    } else {
      if (commandOpts.triggerTurn !== true) {
        fail(`/council: command:council message must pass triggerTurn: true, got ${JSON.stringify(commandOpts)}`);
      }
      if (commandOpts.deliverAs === "nextTurn") {
        fail("/council: command:council message must NOT use deliverAs: nextTurn (leaks prompt into later turns)");
      }
    }
  }
  const verdictMsg = ctx.customMessages.find((m) => getCustomType(m) === "council-verdict");
  if (!verdictMsg) {
    fail("/council: no council-verdict placeholder message");
  } else {
    const verdictOpts = optFor(verdictMsg);
    if (verdictOpts && verdictOpts.deliverAs === "followUp") {
      fail("/council: council-verdict placeholder must NOT use deliverAs: followUp (queues a stray user turn)");
    }
  }

  // 9. /timeline argument completions
  const timelineSpec = registered["timeline"];
  if (!timelineSpec) fail("/timeline not registered");
  const timelineCompleter = timelineSpec.getArgumentCompletions;
  if (!timelineCompleter) {
    fail("/timeline: getArgumentCompletions not defined");
  } else {
    const timelineOpts = timelineCompleter("") ?? [];
    if (!timelineOpts.some((o) => o.value === "5") || !timelineOpts.some((o) => o.value === "15")) {
      fail("/timeline: missing expected numeric completions");
    }
  }

  // 10. Automated Interactive TUI Command Verification (Prevents "Mock Gap" Regressions)
  // Ensures commands running inside interactive TUI (with ctx.ui.custom) return valid
  // components whose render(width) returns readonly string[], not a Container or raw object.
  const researchCmd = registered["research"];
  if (researchCmd) {
    const interactiveCtx = createInteractiveCommandContext();
    await researchCmd.handler("dashboard", interactiveCtx);
    if (interactiveCtx.customCalls.length === 0) {
      fail("/research dashboard: expected ctx.ui.custom to be invoked in interactive mode");
    } else {
      const call = interactiveCtx.customCalls[0];
      const lines80 = call.renderedFrames[80];
      if (!lines80 || lines80.length === 0) {
        fail("/research dashboard: rendered 0 lines in interactive overlay");
      }
      if (call.component.handleInput) {
        const dismissAct = call.component.handleInput("q");
        if (
          !dismissAct ||
          typeof dismissAct !== "object" ||
          !("action" in dismissAct) ||
          (dismissAct as Record<string, unknown>).action !== "dismiss"
        ) {
          fail("/research dashboard: 'q' key did not return dismiss action");
        }
      }
    }
  }

  const councilCmd = registered["council"];
  if (councilCmd) {
    const interactiveCtx = createInteractiveCommandContext();
    await councilCmd.handler("--overlay test topic", interactiveCtx);
    if (interactiveCtx.customCalls.length === 0) {
      fail("/council: expected ctx.ui.custom to be invoked in interactive mode");
    } else {
      const call = interactiveCtx.customCalls[0];
      const lines80 = call.renderedFrames[80];
      if (!lines80 || lines80.length === 0) {
        fail("/council: rendered 0 lines in interactive verdict overlay");
      }
      if (call.component.handleInput) {
        const dismissAct = call.component.handleInput("q");
        if (
          !dismissAct ||
          typeof dismissAct !== "object" ||
          !("action" in dismissAct) ||
          (dismissAct as Record<string, unknown>).action !== "dismiss"
        ) {
          fail("/council: 'q' key did not return dismiss action");
        }
      }
    }
  }

  // 11. Full-sweep interactive invocation across all commands
  // Ensures every command executes safely when ctx.hasUI is true without crashing
  for (const name of Object.keys(registered)) {
    const sweepCtx = createInteractiveCommandContext();
    try {
      await registered[name].handler("", sweepCtx);
    } catch (err) {
      fail(`interactive sweep failed on /${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
