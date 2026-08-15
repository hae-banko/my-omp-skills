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
  systemPromptHasSection,
} from "../src/knowledge/kb-index-injector.ts";
import {
  getPitfallCount,
  getRecordCount,
  recordIngest,
  resetSession as resetKbIngestSession,
} from "../src/knowledge/kb-ingest-status.ts";
import { findKnowledgeRoot, findRelevantKnowledge, readKnowledge } from "../src/knowledge/knowledge.ts";
import { findFrontierTicket } from "../src/core/locators.ts";
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
  await runRecentCommand({
    root: fixtureRoot,
    kind: "record",
    rawArgs: "--recent 5",
    ctx: { ui: recentMockUI },
    pi: ctx.pi,
  });

  fixture.cleanup();
}
