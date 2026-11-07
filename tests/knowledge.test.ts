// Knowledge Base, Policy Guard, and Injector Test Suite

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  __setStatusFnForTests,
  formatStatusText,
  getBlockCount,
  getBlockDetails,
  recordBlock,
  resetSession as resetKbGuardSession,
} from "../src/knowledge/kb-guard-status.ts";
import {
  formatIndexSection,
  installKbIndexInjector,
  SECTION_MARKER,
} from "../src/knowledge/kb-index-injector.ts";
import {
  getPitfallCount,
  getRecordCount,
  recordIngest,
  resetSession as resetKbIngestSession,
} from "../src/knowledge/kb-ingest-status.ts";
import { findKnowledgeRoot, findRelevantKnowledge, readKnowledge } from "../src/knowledge/knowledge.ts";
import { findFrontierTicket } from "../src/core/locators.ts";
import { isDestructiveBashAgainstProtected } from "../src/knowledge/policy.ts";
import { runRecentCommand } from "../src/features/recent-command.ts";
import {
  createTempFixture,
  fail,
  type TestContext,
} from "./test-utils.ts";

export async function runKnowledgeSuite(ctx: TestContext): Promise<void> {
  const { tools, handlers } = ctx;

  // 1. kb-guard-status widget checks
  resetKbGuardSession();
  if (getBlockCount() !== 0) fail(`kb-guard-status: count=${getBlockCount()}, expected 0`);
  if (getBlockDetails().length !== 0) fail(`kb-guard-status: details=${getBlockDetails().length}, expected 0`);
  recordBlock("edit", "records/2026-08-01_test.md", "knowledge");
  if (getBlockCount() !== 1) fail(`kb-guard-status: count=${getBlockCount()}, expected 1`);
  const details = getBlockDetails();
  if (details.length !== 1 || details[0].path !== "records/2026-08-01_test.md") {
    fail(`kb-guard-status: unexpected block detail: ${JSON.stringify(details)}`);
  }
  // 2. Policy: append-only knowledge base enforcement
  const fixture = createTempFixture("kb-policy-test-");
  const fixtureRoot = fixture.dir;

  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "records"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "pitfalls"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".omp", "knowledge", "research", "2026-08-01_demo"), { recursive: true });
  writeFileSync(join(fixtureRoot, ".omp", "knowledge", "INDEX.md"), "- index\n");

  const policyToolCall = handlers["tool_call"];
  /** True when a tool_call handler returned a block verdict. */
  const blockedBy = (result: unknown): boolean => {
    if (!result || typeof result !== "object" || !("block" in result)) return false;
    const verdict: unknown = result.block;
    return verdict === true;
  };
  if (typeof policyToolCall === "function") {
    // Blocking edit on record
    const editRec = policyToolCall({
      toolName: "edit",
      input: { input: `[${join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-01_test.md")}]\nPUT 1:=test` },
    }, { cwd: fixtureRoot });
    if (!editRec || (editRec as { block: boolean }).block !== true) {
      fail("policy: failed to block edit on record");
    }

    // Blocking write over existing file
    const existFile = join(fixtureRoot, ".omp", "knowledge", "records", "existing.md");
    writeFileSync(existFile, "exists", "utf8");
    const writeRec = policyToolCall({
      toolName: "write",
      input: { path: existFile, content: "overwrite" },
    }, { cwd: fixtureRoot });
    if (!writeRec || (writeRec as { block: boolean }).block !== true) {
      fail("policy: failed to block write over existing record");
    }

    // Allowing new record write
    const newFile = join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-02_new.md");
    const writeNew = policyToolCall({
      toolName: "write",
      input: { path: newFile, content: "new content" },
    }, { cwd: fixtureRoot });
    if (writeNew && (writeNew as { block?: boolean }).block === true) {
      fail("policy: incorrectly blocked new record write");
    }

    // Bash policy checks
    // 1. Destructive redirect to INDEX.md must block
    const redirectBlock = policyToolCall({
      toolName: "bash",
      input: { command: `echo "truncate" > ${join(fixtureRoot, ".omp", "knowledge", "INDEX.md")}` },
    }, { cwd: fixtureRoot });
    if (!redirectBlock || (redirectBlock as { block: boolean }).block !== true) {
      fail("policy: failed to block bash redirect overwrite on INDEX.md");
    }

    // 2. Destructive rm on record must block
    const rmBlock = policyToolCall({
      toolName: "bash",
      input: { command: `rm -f ${existFile}` },
    }, { cwd: fixtureRoot });
    if (!rmBlock || (rmBlock as { block: boolean }).block !== true) {
      fail("policy: failed to block bash rm on record");
    }

    // 3. Append to INDEX.md must NOT block
    const appendAllowed = policyToolCall({
      toolName: "bash",
      input: { command: `echo "new line" >> ${join(fixtureRoot, ".omp", "knowledge", "INDEX.md")}` },
    }, { cwd: fixtureRoot });
    if (appendAllowed && (appendAllowed as { block?: boolean }).block === true) {
      fail("policy: incorrectly blocked bash append >> to INDEX.md");
    }
    // D06: rm -rf .omp/knowledge must block
    const rmKnowledgeBlock = policyToolCall({
      toolName: "bash",
      input: { command: `rm -rf ${join(fixtureRoot, ".omp", "knowledge")}` },
    }, { cwd: fixtureRoot });
    if (!blockedBy(rmKnowledgeBlock)) {
      fail("D06: policy failed to block bash rm -rf .omp/knowledge");
    }

    // D06: rm -rf .omp must block
    const rmOmpBlock = policyToolCall({
      toolName: "bash",
      input: { command: `rm -rf ${join(fixtureRoot, ".omp")}` },
    }, { cwd: fixtureRoot });
    if (!blockedBy(rmOmpBlock)) {
      fail("D06: policy failed to block bash rm -rf .omp");
    }

    // D06: 1> redirect to INDEX.md must block
    const redirect1Block = policyToolCall({
      toolName: "bash",
      input: { command: `echo "truncate" 1> ${join(fixtureRoot, ".omp", "knowledge", "INDEX.md")}` },
    }, { cwd: fixtureRoot });
    if (!blockedBy(redirect1Block)) {
      fail("D06: policy failed to block bash 1> redirect to INDEX.md");
    }

    // D06: cp -t into protected dir must block
    const cpTargetBlock = policyToolCall({
      toolName: "bash",
      input: { command: `cp -t ${join(fixtureRoot, ".omp", "knowledge", "records")} /tmp/malicious.md` },
    }, { cwd: fixtureRoot });
    if (!blockedBy(cpTargetBlock)) {
      fail("D06: policy failed to block bash cp -t into protected dir");
    }

    // D06: mv -t into protected dir must block
    const mvTargetBlock = policyToolCall({
      toolName: "bash",
      input: { command: `mv -t ${join(fixtureRoot, ".omp", "knowledge", "records")} /tmp/malicious.md` },
    }, { cwd: fixtureRoot });
    if (!blockedBy(mvTargetBlock)) {
      fail("D06: policy failed to block bash mv -t into protected dir");
    }

    // D06: stderr redirect 2>&1 must NOT block
    const redirectStderrAllowed = policyToolCall({
      toolName: "bash",
      input: { command: `echo "hello" 2>&1` },
    }, { cwd: fixtureRoot });
    if (blockedBy(redirectStderrAllowed)) {
      fail("D06: policy incorrectly blocked 2>&1 stderr redirect");
    }

    // D06: plain mv src protected-dest direct test (asserts returned target)
    const plainMvDest = join(fixtureRoot, ".omp", "knowledge", "records", "dest.md");
    const plainMvCheck = isDestructiveBashAgainstProtected(
      `mv /tmp/source.md ${plainMvDest}`,
      fixtureRoot,
    );
    if (!plainMvCheck.blocked || plainMvCheck.target !== plainMvDest) {
      fail(`D06: isDestructiveBashAgainstProtected failed on plain mv: blocked=${plainMvCheck.blocked}, target=${plainMvCheck.target}`);
    }


    // 4. Temporary script in /tmp mentioning audit must NOT block
    const tempScriptAllowed = policyToolCall({
      toolName: "bash",
      input: { command: `cat > /tmp/render-verdict.mjs << 'EOF'\nconsole.log(".omp/audits");\nEOF` },
    }, { cwd: fixtureRoot });
    if (tempScriptAllowed && (tempScriptAllowed as { block?: boolean }).block === true) {
      fail("policy: incorrectly blocked temporary script in /tmp mentioning audits");
    }

    // 5. Grep reading INDEX.md redirected to /tmp must NOT block
    const grepRedirectAllowed = policyToolCall({
      toolName: "bash",
      input: { command: `grep "index" ${join(fixtureRoot, ".omp", "knowledge", "INDEX.md")} > /tmp/search-results.txt` },
    }, { cwd: fixtureRoot });
    if (grepRedirectAllowed && (grepRedirectAllowed as { block?: boolean }).block === true) {
      fail("policy: incorrectly blocked grep reading INDEX.md redirected to /tmp");
    }

    // 6. Writing a NEW snapshot under .omp/audits/ must NOT block -- this is the
    //    archive-snapshot mechanism the /audit body now prescribes.
    const auditsArchiveDir = join(fixtureRoot, ".omp", "audits", "test-slug", "archive");
    mkdirSync(auditsArchiveDir, { recursive: true });
    const snapshotPath = join(auditsArchiveDir, "v0.1.0.md");
    const writeSnapshot = policyToolCall({
      toolName: "write",
      input: { path: snapshotPath, content: "## Revision History\n- v0.1.0 initial" },
    }, { cwd: fixtureRoot });
    if (blockedBy(writeSnapshot)) {
      fail("policy: incorrectly blocked write of a new audit snapshot file");
    }

    // 7. Shell-copying INTO .omp/audits/ must block -- which is exactly why the
    //    /audit body tells the agent to snapshot via read + write, never `cp`.
    const cpIntoAudits = policyToolCall({
      toolName: "bash",
      input: {
        command: `cp ${join(fixtureRoot, ".omp", "audits", "test-slug", "overview.md")} ${snapshotPath}`,
      },
    }, { cwd: fixtureRoot });
    if (!blockedBy(cpIntoAudits)) {
      fail("policy: failed to block bash cp into .omp/audits/");
    }
    // D07: Subtopic without own version revisable after root report bumped
    const testAuditDir = join(fixtureRoot, ".omp", "audits", "test-audit");
    mkdirSync(join(testAuditDir, "subtopics"), { recursive: true });
    const overviewFile = join(testAuditDir, "overview.md");
    const authSubtopicFile = join(testAuditDir, "subtopics", "auth.md");

    writeFileSync(
      overviewFile,
      `---\ntitle: "Test Audit"\nslug: "test-audit"\nversion: "v0.1.0"\nstatus: active\n---\n## Executive Summary\nSummary\n## Revision History\n- **v0.1.0** (2026-11-01): Initial\n`,
      "utf8",
    );
    writeFileSync(authSubtopicFile, `# Auth Subtopic\nInitial auth\n`, "utf8");

    // Bump overview.md to v0.1.1 with revision history
    // Ensure mtime is strictly after authSubtopicFile
    const bumpedOverviewContent = `---\ntitle: "Test Audit"\nslug: "test-audit"\nversion: "v0.1.1"\nstatus: active\n---\n## Executive Summary\nSummary v0.1.1\n## Revision History\n- **v0.1.1** (2026-11-07): Bump\n- **v0.1.0** (2026-11-01): Initial\n`;
    writeFileSync(overviewFile, bumpedOverviewContent, "utf8");

    const subtopicUpdateAllowed = policyToolCall({
      toolName: "write",
      input: {
        path: authSubtopicFile,
        content: `# Auth Subtopic\nUpdated auth findings\n`,
      },
    }, { cwd: fixtureRoot });
    if (blockedBy(subtopicUpdateAllowed)) {
      fail("D07: policy blocked valid subtopic write after root overview was bumped");
    }

    // D08: SemVer downgrade must block (v0.1.1 -> v0.1.0)
    const downgradeBlock = policyToolCall({
      toolName: "write",
      input: {
        path: overviewFile,
        content: `---\ntitle: "Test Audit"\nslug: "test-audit"\nversion: "v0.1.0"\nstatus: active\n---\n## Executive Summary\nDowngrade\n## Revision History\n- **v0.1.0** (2026-11-07): Bad downgrade\n`,
      },
    }, { cwd: fixtureRoot });
    if (!blockedBy(downgradeBlock)) {
      fail("D08: policy failed to block SemVer version downgrade");
    }

    // D08 boundary: a revision written in the AUDIT-FORMAT template shape
    // (`status: active # active | superseded | archived`) with a strictly
    // higher version is a valid update.
    const templateRevision = policyToolCall({
      toolName: "write",
      input: {
        path: overviewFile,
        content: `---\ntitle: "Test Audit"\nslug: "test-audit"\nversion: "v0.2.0"\nstatus: active # active | superseded | archived\n---\n## Executive Summary\nRevised\n## Revision History\n- **v0.2.0** (2026-11-08): Revise\n- **v0.1.1** (2026-11-07): Bump\n`,
      },
    }, { cwd: fixtureRoot });
    if (blockedBy(templateRevision)) {
      fail("D08: policy blocked a valid version bump whose status line carries the template YAML comment");
    }
    // D33: readKnowledge must never create .omp/knowledge directory
    const cleanFixture = createTempFixture("kb-clean-");
    readKnowledge(cleanFixture.dir, { type: "audits" });
    if (existsSync(join(cleanFixture.dir, ".omp", "knowledge"))) {
      fail("D33: readKnowledge created .omp/knowledge directory during read-only call");
    }
    cleanFixture.cleanup();

    // X-KNOWLEDGE-8: readKnowledge type="index" should return newest tail entries
    const indexFixture = createTempFixture("kb-index-test-");
    mkdirSync(join(indexFixture.dir, ".omp", "knowledge"), { recursive: true });
    writeFileSync(
      join(indexFixture.dir, ".omp", "knowledge", "INDEX.md"),
      "# Knowledge Base Index\n- 2026-01-01 Old finding 1\n- 2026-01-02 Old finding 2\n- 2026-11-01 Recent finding 3\n- 2026-11-07 Newest finding 4\n",
      "utf8",
    );
    const indexRead = readKnowledge(indexFixture.dir, { type: "index", limit: 2 });
    if (!indexRead.text.includes("Newest finding 4") || indexRead.text.includes("# Knowledge Base Index")) {
      fail(`X-KNOWLEDGE-8: readKnowledge index did not return tail entries: ${indexRead.text}`);
    }
    indexFixture.cleanup();

    // X-KNOWLEDGE-9: two research projects that both match are both returned
    const researchFixture = createTempFixture("kb-research-test-");
    for (const [slug, title] of [
      ["2026-08-25_multi-llm", "Multi-LLM Debate"],
      ["2026-08-26_consensus", "Distributed Consensus"],
    ]) {
      const projDir = join(researchFixture.dir, ".omp", "knowledge", "research", slug);
      mkdirSync(projDir, { recursive: true });
      writeFileSync(join(projDir, "research.md"), `---\ntitle: ${title}\n---\n# ${title}\n`, "utf8");
    }
    const relHits = findRelevantKnowledge(researchFixture.dir, "multi-llm debate and distributed consensus");
    const relPaths = relHits.map((h) => h.path).sort();
    if (
      relPaths.length !== 2 ||
      !relPaths[0].includes("2026-08-25_multi-llm/") ||
      !relPaths[1].includes("2026-08-26_consensus/")
    ) {
      fail(`X-KNOWLEDGE-9: findRelevantKnowledge dropped research hits: ${JSON.stringify(relHits)}`);
    }
    researchFixture.cleanup();

    // D32: formatStatusText from repo subdirectory and audit-only repo
    const subDirFixture = createTempFixture("kb-subdir-test-");
    const repoSubDir = join(subDirFixture.dir, "packages", "core");
    mkdirSync(repoSubDir, { recursive: true });
    mkdirSync(join(subDirFixture.dir, ".omp", "knowledge"), { recursive: true });
    const guardStatusSub = formatStatusText(repoSubDir);
    if (!guardStatusSub) {
      fail("D32: formatStatusText returned undefined from repository subdirectory");
    }
    subDirFixture.cleanup();

    const auditOnlyFixture = createTempFixture("kb-audit-only-test-");
    mkdirSync(join(auditOnlyFixture.dir, ".omp", "audits"), { recursive: true });
    const auditGuardStatus = formatStatusText(auditOnlyFixture.dir);
    if (!auditGuardStatus) {
      fail("D32: formatStatusText returned undefined for audit-only repository");
    }
    auditOnlyFixture.cleanup();
    // D28: Subagent session_start must not wipe parent session counters
    // D29: Session switch resets/isolates counts for new session
    // D30: Ingest counted on tool_result success, not speculative tool_call; deduplicated
    // D31: ctx.ui.setStatus wired and called
    const statusCalls: Array<{ key: string; text: string | undefined }> = [];
    const mockUi = {
      setStatus(key: string, text: string | undefined) {
        statusCalls.push({ key, text });
      },
    };

    const mainCtx = {
      hasUI: true,
      ui: mockUi,
      cwd: fixtureRoot,
      sessionManager: { getSessionId: () => "session-main" },
    };
    const subCtx = {
      hasUI: false,
      cwd: fixtureRoot,
      sessionManager: { getSessionId: () => "session-subagent" },
    };
    const newSessionCtx = {
      hasUI: true,
      ui: mockUi,
      cwd: fixtureRoot,
      sessionManager: { getSessionId: () => "session-new" },
    };

    // Trigger session_start for main session
    const sessionStartListeners = ctx.eventListeners["session_start"] ?? [];
    for (const listener of sessionStartListeners) {
      listener({ cwd: fixtureRoot }, mainCtx);
    }

    // D31 check: mockUi.setStatus should be called for kb-guardrail and kb-ingest
    const guardStatusCalls = statusCalls.filter((c) => c.key === "kb-guardrail");
    const ingestStatusCalls = statusCalls.filter((c) => c.key === "kb-ingest");
    if (guardStatusCalls.length === 0 || ingestStatusCalls.length === 0) {
      fail("D31: ctx.ui.setStatus was not called during session_start");
    }

    // D30 check: speculative tool_call must NOT increment ingest counter
    const testRecordPath = join(fixtureRoot, ".omp", "knowledge", "records", "2026-11-07_d30.md");
    const toolCallListeners = ctx.eventListeners["tool_call"] ?? [];
    for (const listener of toolCallListeners) {
      listener({ toolName: "write", input: { path: testRecordPath, content: "test" } }, mainCtx);
    }
    if (getRecordCount() !== 0) {
      fail(`D30: speculative tool_call prematurely incremented record count: ${getRecordCount()}`);
    }

    // Now simulate successful tool_result writing the file
    writeFileSync(testRecordPath, "---\ntitle: D30\n---\nNotes", "utf8");
    const toolResultListeners = ctx.eventListeners["tool_result"] ?? [];
    for (const listener of toolResultListeners) {
      listener(
        {
          type: "tool_result",
          toolName: "write",
          toolCallId: "call_1",
          input: { path: testRecordPath, content: "test" },
          content: [{ type: "text", text: "ok" }],
          isError: false,
        },
        mainCtx,
      );
    }
    if (getRecordCount() !== 1) {
      fail(`D30: tool_result success failed to increment record count: ${getRecordCount()}`);
    }

    // Duplicate tool_result for same path should NOT increment again
    for (const listener of toolResultListeners) {
      listener(
        {
          type: "tool_result",
          toolName: "write",
          toolCallId: "call_2",
          input: { path: testRecordPath, content: "test" },
          content: [{ type: "text", text: "ok" }],
          isError: false,
        },
        mainCtx,
      );
    }
    if (getRecordCount() !== 1) {
      fail(`D30: duplicate tool_result incremented record count: ${getRecordCount()}`);
    }

    // Record a block in main session
    recordBlock("edit", testRecordPath, "knowledge");
    const mainBlockCountBefore = getBlockCount();
    const mainRecordCountBefore = getRecordCount();

    // D28 check: subagent session_start must NOT wipe main session counters
    for (const listener of sessionStartListeners) {
      listener({ cwd: fixtureRoot }, subCtx);
    }
    if (getBlockCount() !== mainBlockCountBefore || getRecordCount() !== mainRecordCountBefore) {
      fail(`D28: subagent session_start wiped main session counters: blocks=${getBlockCount()}, records=${getRecordCount()}`);
    }

    // D29 check: session_switch to new session should reset counters to 0 for the new session
    const sessionSwitchListeners = ctx.eventListeners["session_switch"] ?? [];
    for (const listener of sessionSwitchListeners) {
      listener({ reason: "new" }, newSessionCtx);
    }
    if (getBlockCount() !== 0 || getRecordCount() !== 0) {
      fail(`D29: session_switch did not reset counters for new session: blocks=${getBlockCount()}, records=${getRecordCount()}`);
    }

  }
  const knowledgeTool = tools.find((t) => t.name === "knowledge_read");
  if (!knowledgeTool) {
    fail("knowledge_read tool not registered");
  } else {
    writeFileSync(
      join(fixtureRoot, ".omp", "knowledge", "records", "2026-08-03_dtcm.md"),
      "---\ntitle: DTCM Architecture\ntags: [dtcm, memory]\n---\nDTCM memory notes",
    );
    const readRes = await knowledgeTool.execute(
      "t1",
      { type: "records", query: "DTCM" },
      undefined,
      undefined,
      { cwd: fixtureRoot },
    );
    const resText = (readRes.content ?? []).map((b) => b.text).join("");
    if (!resText.includes("DTCM Architecture")) {
      fail(`knowledge_read: search query did not find DTCM record: ${resText}`);
    }
  }

  // 4. Frontier Ticket locator
  mkdirSync(join(fixtureRoot, ".scratch", "feature-a", "issues"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, ".scratch", "feature-a", "issues", "001-init.md"),
    "---\ntitle: Initialize Feature\nstatus: resolved\n---\nCompleted",
  );
  writeFileSync(
    join(fixtureRoot, ".scratch", "feature-a", "issues", "002-core.md"),
    "---\ntitle: Build Core Logic\nstatus: open\nblocked_by: [001-init]\n---\nPending",
  );

  const frontier = findFrontierTicket(fixtureRoot);
  if (!frontier || frontier.feature !== "feature-a" || frontier.title !== "Build Core Logic") {
    fail(`findFrontierTicket: unexpected result: ${JSON.stringify(frontier)}`);
  }

  // 5. /record --recent & /pitfall --recent
  const recentMockUI = {
    msgs: [] as string[],
    notify(msg: string) {
      this.msgs.push(msg);
    },
  };
  ctx.customMessages.length = 0;
  await runRecentCommand({
    root: fixtureRoot,
    kind: "record",
    rawArgs: "--recent 5",
    ctx: { ui: recentMockUI },
    pi: ctx.pi,
  });

  const recordMsg = ctx.customMessages.find((m) => m.customType === "knowledge-record");
  if (!recordMsg) {
    fail("/record --recent: no knowledge-record message dispatched");
  } else {
    const msgContent = typeof recordMsg.content === "string" ? recordMsg.content : "";
    if (msgContent.length === 0) {
      fail("/record --recent: empty content in message");
    }
    if (!msgContent.includes("DTCM Architecture")) {
      fail(`/record --recent: missing DTCM title in content: ${msgContent}`);
    }
  }

  ctx.customMessages.length = 0;
  await runRecentCommand({
    root: fixtureRoot,
    kind: "pitfall",
    rawArgs: "--recent",
    ctx: { ui: recentMockUI },
    pi: ctx.pi,
  });

  const pitfallMsg = ctx.customMessages.find((m) => m.customType === "knowledge-pitfall");
  if (!pitfallMsg) {
    fail("/pitfall --recent: no knowledge-pitfall message dispatched");
  } else {
    const pitfallContent = typeof pitfallMsg.content === "string" ? pitfallMsg.content : "";
    if (pitfallContent.length === 0) {
      fail("/pitfall --recent: empty content in message");
    }
  }

  // D53: the runtime hands before_agent_start `systemPrompt: string[]` and
  // chains each handler's result. Base blocks must survive as a prefix, and
  // the KB index + relevant-knowledge must land as appended blocks.
  const promptFixture = createTempFixture("kb-sysprompt-");
  try {
    mkdirSync(join(promptFixture.dir, ".omp", "knowledge", "records"), { recursive: true });
    writeFileSync(
      join(promptFixture.dir, ".omp", "knowledge", "records", "2026-11-07_sqlite-locking.md"),
      "# SQLite locking\n\nWAL mode avoids writer starvation.\n",
    );
    writeFileSync(
      join(promptFixture.dir, ".omp", "knowledge", "INDEX.md"),
      "- [SQLite locking](.omp/knowledge/records/2026-11-07_sqlite-locking.md)\n",
    );
    const base = ["BASE-BLOCK-A", "BASE-BLOCK-B"];
    const started = await handlers["before_agent_start"]?.(
      { type: "before_agent_start", prompt: "why is sqlite locking up", systemPrompt: [...base] },
      { cwd: promptFixture.dir, hasUI: true },
    );
    const sp = started && typeof started === "object" && "systemPrompt" in started ? started.systemPrompt : undefined;
    if (!Array.isArray(sp) || !sp.every((block) => typeof block === "string")) {
      fail(`D53: before_agent_start returned a non-array system prompt: ${JSON.stringify(sp)}`);
    } else {
      if (sp[0] !== base[0] || sp[1] !== base[1]) {
        fail(`D53: base system prompt blocks were rewritten: ${JSON.stringify(sp.slice(0, 2))}`);
      }
      if (!sp.some((block) => block.includes(SECTION_MARKER))) {
        fail("D53: KB index section missing from the system prompt");
      }
      if (!sp.some((block) => block.includes("<relevant-knowledge>"))) {
        fail("D53: relevant-knowledge block missing from the system prompt");
      }
    }
  } finally {
    promptFixture.cleanup();
  }

  fixture.cleanup();
}
