// Tools & Core Protocol Defect Regression Test Suite
// Covers issues 08, 11, 13, 14, 17: D23, D34-D36, D39-D44, D51-D52, and related findings.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempFixture, fail, type TestContext } from "./test-utils.ts";
import { findRepoRoot, getWorkspaceContext, clearWorkspaceCache, setHomedirForTesting } from "../src/core/workspace.ts";
import { findRoutinesRepoRoot, clearRoutinesRepoRootCache, installRoutinesTool } from "../src/features/routines.ts";
import { findFrontierTicket, listUnmanagedReferences } from "../src/core/locators.ts";
import { runReferenceCommand } from "../src/features/references.ts";
import { parseRecentCount } from "../src/features/recent-command.ts";
import { setHerdrRunnerForTesting, installHerdrTools } from "../src/features/herdr-tools.ts";
import { getTriageStatusPayload, getAuditCardPayload } from "../src/index.ts";

export async function runToolsSuite(ctx: TestContext): Promise<void> {
  console.log("Running Tools & Core Protocol suite...");

  // D23: Reference - Failed clone leaves partial target, unmanaged directory handling
  {
    const fixture = createTempFixture("tools-ref-");
    const target = join(fixture.dir, ".omp", "references", "bad-repo");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "junk.txt"), "leftover");

    // Before fix: listReferences hid it, unmanaged directories weren't discoverable
    const unmanaged = listUnmanagedReferences(fixture.dir);
    if (!unmanaged.includes("bad-repo")) {
      fail("D23: listUnmanagedReferences should list non-git directories under .omp/references");
    }

    // Attempting add on unmanaged directory reports it as unmanaged and advises removal
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "add https://github.com/example/bad-repo.git", { ui: {} });
    const addMsg = ctx.customMessages.find((m) => String(m.content).includes("unmanaged leftover"));
    if (!addMsg) {
      fail("D23: /reference add should report unmanaged leftover directory and suggest removal");
    }

    // /reference list warns about unmanaged directory
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "list", { ui: {} });
    const listMsg = ctx.customMessages.find((m) => String(m.content).includes("unmanaged leftover"));
    if (!listMsg) {
      fail("D23: /reference list should warn about unmanaged directories");
    }

    // /reference remove deletes the unmanaged directory
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "remove bad-repo", { ui: {} });
    if (existsSync(target)) {
      fail("D23: /reference remove should delete unmanaged leftover directory");
    }

    fixture.cleanup();
  }

  // D34: Workspace - Do not cache fallback (non-repo) results
  {
    const fixture = createTempFixture("tools-ws-fallback-");
    clearWorkspaceCache();

    const ws1 = getWorkspaceContext(fixture.dir);
    if (ws1.isRepo) {
      fail("D34: ws1 should not be repo");
    }

    // Now init a .git in the directory
    mkdirSync(join(fixture.dir, ".git"));
    const ws2 = getWorkspaceContext(fixture.dir);
    if (!ws2.isRepo) {
      fail("D34: getWorkspaceContext should not cache fallback non-repo result permanently");
    }

    clearWorkspaceCache();
    fixture.cleanup();
  }

  // D35: Workspace - .git/.omp take precedence over weak markers (.scratch, scripts/routines) anywhere up tree
  // Exclude ~/.omp (user config dir) so non-git projects under HOME resolve to the project, not HOME
  {
    const fixture = createTempFixture("tools-ws-precedence-");
    // Outer is a real repo (.git)
    mkdirSync(join(fixture.dir, ".git"));
    // Inner has .scratch or scripts/routines
    const inner = join(fixture.dir, "packages", "service");
    mkdirSync(join(inner, "scripts", "routines"), { recursive: true });

    const root = findRepoRoot(inner);
    if (root !== fixture.dir) {
      fail(`D35: findRepoRoot should prefer .git root (${fixture.dir}) over nested weak marker (${root})`);
    }

    // Now test ~/.omp exclusion: fake HOME has ~/.omp, project inside fake HOME has only .scratch
    // (Must be in a separate fixture without an enclosing .git)
    const homeFixture = createTempFixture("tools-ws-fakehome-");
    const fakeHome = homeFixture.dir;
    const userOmp = join(fakeHome, ".omp");
    const project = join(fakeHome, "projects", "my-project");
    mkdirSync(userOmp, { recursive: true });
    mkdirSync(join(project, ".scratch"), { recursive: true });

    try {
      setHomedirForTesting(fakeHome);
      const projRoot = findRepoRoot(project);
      if (projRoot !== project) {
        fail(`D35: findRepoRoot should exclude ~/.omp and resolve to project with .scratch (${project}), got ${projRoot}`);
      }
    } finally {
      setHomedirForTesting(null);
      homeFixture.cleanup();
    }

    fixture.cleanup();
  }

  // D36: Routines - repoRootCache picks up a manifest created later
  {
    const fixture = createTempFixture("tools-routines-cache-");
    clearRoutinesRepoRootCache();
    mkdirSync(join(fixture.dir, ".git"));
    const sub = join(fixture.dir, "packages", "sub");
    mkdirSync(sub, { recursive: true });

    // First lookup: no manifest in sub, resolves to fixture.dir
    const r1 = findRoutinesRepoRoot(sub);
    if (r1 !== fixture.dir) {
      fail(`D36: initial lookup should resolve to git root ${fixture.dir}, got ${r1}`);
    }

    // Now manifest is created inside sub
    mkdirSync(join(sub, "scripts", "routines"), { recursive: true });
    writeFileSync(join(sub, "scripts", "routines", "manifest.json"), JSON.stringify({ routines: [] }));

    const r2 = findRoutinesRepoRoot(sub);
    if (r2 !== sub) {
      fail(`D36: findRoutinesRepoRoot should discover manifest created later in ${sub}, got ${r2}`);
    }

    clearRoutinesRepoRootCache();
    fixture.cleanup();
  }

  // D39: Triage - Recognise 'ready-for-agent' and 'ready_for_agent'
  {
    const fixture = createTempFixture("tools-triage-status-");
    const issuesDir = join(fixture.dir, ".omp", "scratch", "feat", "issues");
    mkdirSync(issuesDir, { recursive: true });
    writeFileSync(join(issuesDir, "01.md"), "# Ticket\n\nstatus: ready-for-agent\n");

    const payload = getTriageStatusPayload(fixture.dir);
    if (payload.backlog?.agent_ready !== 1 || payload.backlog?.unlabeled !== 0) {
      fail(`D39: getTriageStatusPayload should count ready-for-agent as agent_ready, got agent_ready=${payload.backlog?.agent_ready}, unlabeled=${payload.backlog?.unlabeled}`);
    }

    fixture.cleanup();
  }

  // D40: Triage - Count only issue files, not specs or debates
  {
    const fixture = createTempFixture("tools-triage-count-");
    const scratch = join(fixture.dir, ".omp", "scratch");
    const specDir = join(scratch, "feat");
    const issuesDir = join(scratch, "feat", "issues");
    const debateDir = join(scratch, "debates");
    mkdirSync(specDir, { recursive: true });
    mkdirSync(issuesDir, { recursive: true });
    mkdirSync(debateDir, { recursive: true });

    writeFileSync(join(specDir, "spec.md"), "# Spec\nSome description\n");
    writeFileSync(join(debateDir, "2026-11-07_debate.md"), "# Debate\nSome content\n");
    writeFileSync(join(issuesDir, "01.md"), "# Ticket\nstatus: needs-triage\n");

    const payload = getTriageStatusPayload(fixture.dir);
    if (payload.total_items !== 1) {
      fail(`D40: getTriageStatusPayload should only count files in **/issues/*.md, expected total_items=1, got ${payload.total_items}`);
    }

    fixture.cleanup();
  }

  // D41: Audit - Strip YAML comments from audit status
  {
    const fixture = createTempFixture("tools-audit-status-");
    const auditDir = join(fixture.dir, ".omp", "audits", "sec-audit");
    mkdirSync(auditDir, { recursive: true });
    writeFileSync(
      join(auditDir, "overview.md"),
      '---\ntitle: "Security Audit"\nversion: "v1.0.0"\nstatus: active # active | superseded | archived\n---\n# Security Audit\n',
    );

    const payload = getAuditCardPayload(fixture.dir, "sec-audit");
    if (payload.status !== "active") {
      fail(`D41: getAuditCardPayload should strip YAML comments, expected "active", got "${payload.status}"`);
    }

    fixture.cleanup();
  }

  // D42: Frontier - Blockers resolve within same feature
  {
    const fixture = createTempFixture("tools-frontier-blockers-");
    const featA = join(fixture.dir, ".omp", "scratch", "featA", "issues");
    const featB = join(fixture.dir, ".omp", "scratch", "featB", "issues");
    mkdirSync(featA, { recursive: true });
    mkdirSync(featB, { recursive: true });

    // Feature A has resolved ticket 001
    writeFileSync(join(featA, "001.md"), "# Auth 001\nStatus: resolved\n");
    // Feature B has open ticket 001 and open ticket 002 (blocked by 001)
    writeFileSync(join(featB, "001.md"), "# Billing 001\nStatus: open\n");
    writeFileSync(join(featB, "002.md"), "# Billing 002\nStatus: open\nBlocked by: 001\n");

    const frontier = findFrontierTicket(fixture.dir);
    // 002 in featB must NOT be chosen as frontier because featB/001 is open!
    // The unblocked ticket is featB's 001!
    if (!frontier || frontier.feature !== "featB" || !frontier.file.includes("001.md")) {
      fail(`D42: findFrontierTicket should scope blocker resolution per feature, expected featB/001.md, got ${frontier?.file}`);
    }

    fixture.cleanup();
  }

  // D43 & D44: Routines - Tool content has error/timeout on failure even with stdout, corrupt manifest stops run
  {
    const fixture = createTempFixture("tools-routines-run-");
    mkdirSync(join(fixture.dir, ".git"));
    const routinesDir = join(fixture.dir, "scripts", "routines");
    mkdirSync(routinesDir, { recursive: true });

    // Script that prints stdout and exits with non-zero code
    writeFileSync(join(routinesDir, "fail.sh"), '#!/bin/bash\necho "Partial progress"\nexit 2\n');

    // D44: Corrupt manifest
    writeFileSync(join(routinesDir, "manifest.json"), '{ "routines": [ invalid json');

    // Register routines tool
    installRoutinesTool(ctx.pi);
    const routineTool = ctx.tools.find((t) => t.name === "run_routine");
    if (!routineTool) {
      fail("Routines tool not registered");
    } else {
      // D44 test: Corrupt manifest stops run with error
      const corruptRes = await routineTool.execute(
        "call-1",
        { routineId: "fail" },
        undefined,
        undefined,
        { cwd: fixture.dir },
      );
      if (!corruptRes.content[0].text.includes("manifest.json") || !corruptRes.content[0].text.includes("parse error")) {
        fail(`D44: run_routine should stop and report corrupt manifest error, got: ${corruptRes.content[0].text}`);
      }

      // Fix manifest to valid JSON
      writeFileSync(
        join(routinesDir, "manifest.json"),
        JSON.stringify({
          routines: [
            {
              id: "fail",
              name: "Failing Routine",
              file: "fail.sh",
              parameters: [{ name: "my-param", default: "param_val" }],
            },
          ],
        }),
      );

      // D43 test: Run failing routine with stdout
      const failRes = await routineTool.execute(
        "call-2",
        { routineId: "fail" },
        undefined,
        undefined,
        { cwd: fixture.dir },
      );
      const text = failRes.content[0].text;
      if (!text.includes("Partial progress")) {
        fail(`D43: run_routine should include stdout in content text, got: ${text}`);
      }
      if (!text.includes("Execution error") && !text.includes("Routine failed") && !text.includes("exit code 2")) {
        fail(`D43: run_routine should include failure indicator in content text even with stdout, got: ${text}`);
      }
    }

    fixture.cleanup();
  }

  // TOOLSPROTO-8: Routines - Kebab-case parameter env binding
  {
    const fixture = createTempFixture("tools-routines-env-");
    mkdirSync(join(fixture.dir, ".git"));
    const routinesDir = join(fixture.dir, "scripts", "routines");
    mkdirSync(routinesDir, { recursive: true });
    writeFileSync(
      join(routinesDir, "echo-env.sh"),
      '#!/bin/bash\necho "OUTPUT_DIR=${OUTPUT_DIR}"\n',
    );
    writeFileSync(
      join(routinesDir, "manifest.json"),
      JSON.stringify({
        routines: [
          {
            id: "echo-env",
            name: "Echo Env",
            file: "echo-env.sh",
            parameters: [{ name: "output-dir", default: "default_dir" }],
          },
        ],
      }),
    );

    const routineTool = ctx.tools.find((t) => t.name === "run_routine");
    if (routineTool) {
      const res = await routineTool.execute(
        "call-env",
        { routineId: "echo-env", args: { "output-dir": "custom_val" } },
        undefined,
        undefined,
        { cwd: fixture.dir },
      );
      if (!res.content[0].text.includes("OUTPUT_DIR=custom_val")) {
        fail(`TOOLSPROTO-8: run_routine should bind kebab-case output-dir to OUTPUT_DIR env var, got: ${res.content[0].text}`);
      }
    }
    fixture.cleanup();
  }

  // TOOLSPROTO-13: Recent count - parseRecentCount("--recent 0") defaults to positive limit
  {
    const limit0 = parseRecentCount("--recent 0");
    if (limit0 <= 0) {
      fail(`TOOLSPROTO-13: parseRecentCount("--recent 0") should not return non-positive count, got ${limit0}`);
    }
  }

  // herdr tools: absent outside herdr; inside it, D51/D52 and TOOLSPROTO-11.
  const prevHerdrEnv = process.env.HERDR_ENV;
  const prevHerdrPane = process.env.HERDR_PANE_ID;

  // D51 & D52: herdr agent settlement & CLI argument compliance
  {
    const recordedCalls: Array<{ args: string[]; timeout?: number }> = [];
    setHerdrRunnerForTesting(async (args, _signal, timeoutMs) => {
      recordedCalls.push({ args, timeout: timeoutMs });
      const sub = args[0];
      const cmd = args[1];
      if (sub === "agent" && cmd === "prompt") {
        return { agent_status: "idle", prompt: args[3] };
      }
      if (sub === "agent" && cmd === "wait") {
        return { agent_status: "idle" };
      }
      if (sub === "pane" && cmd === "send-text") {
        return { ok: true };
      }
      if (sub === "agent" && cmd === "get") {
        return { agent_status: "idle" };
      }
      return { ok: true };
    });

    // Outside herdr (plain terminal, Tern) the tools must not be registered:
    // they would only cost context in every session's tool list.
    delete process.env.HERDR_ENV;
    delete process.env.HERDR_PANE_ID;
    installHerdrTools(ctx.pi);
    if (ctx.tools.some((t) => t.name.startsWith("herdr_"))) {
      fail("herdr tools registered outside a herdr pane");
    }

    process.env.HERDR_ENV = "1";
    process.env.HERDR_PANE_ID = "pane_1";
    installHerdrTools(ctx.pi);
    const agentTool = ctx.tools.find((t) => t.name === "herdr_agent");
    if (!agentTool) {
      fail("herdr_agent tool not registered inside herdr");
    } else {
      // Test prompt action
      recordedCalls.length = 0;
      await agentTool.execute(
        "call-prompt",
        { action: "prompt", target: "worker_1", prompt: "Hello worker", timeout: 5000 },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );

      const promptCall = recordedCalls.find((c) => c.args[0] === "agent" && c.args[1] === "prompt");
      if (!promptCall) {
        fail("D51/D52: herdr_agent prompt should use 'agent prompt' subcommand");
      } else {
        const a = promptCall.args;
        if (!a.includes("--wait") || !a.includes("--until") || !a.includes("idle") || !a.includes("done") || !a.includes("blocked")) {
          fail(`D51/D52: herdr_agent prompt should include --wait --until idle --until done --until blocked, got: ${a.join(" ")}`);
        }
        if (!a.includes("--timeout") || a[a.indexOf("--timeout") + 1] !== "5000") {
          fail(`D51/D52: herdr_agent prompt should pass --timeout 5000, got: ${a.join(" ")}`);
        }
      }

      // Test wait action
      recordedCalls.length = 0;
      await agentTool.execute(
        "call-wait",
        { action: "wait", target: "worker_1", status: "idle", timeout: 4000 },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );

      const waitCall = recordedCalls.find((c) => c.args[0] === "agent" && c.args[1] === "wait");
      if (!waitCall) {
        fail("D52: herdr_agent wait should call 'agent wait'");
      } else {
        const a = waitCall.args;
        if (!a.includes("--until") || a.includes("--status")) {
          fail(`D52: herdr_agent wait must use --until and never --status, got: ${a.join(" ")}`);
        }
      }

      // Test send action
      recordedCalls.length = 0;
      await agentTool.execute(
        "call-send",
        { action: "send", target: "worker_1", text: "literal message" },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );

      const sendCall = recordedCalls.find((c) => c.args[0] === "agent" && c.args[1] === "prompt" && c.args.length === 4 && !c.args.includes("--wait"));
      if (!sendCall) {
        fail("D52: herdr_agent send should map to ['agent', 'prompt', target, text]");
      } else if (sendCall.args[2] !== "worker_1" || sendCall.args[3] !== "literal message") {
        fail(`D52: herdr_agent send args mismatch, got: ${sendCall.args.join(" ")}`);
      }

      // Test prompt timeout reporting
      setHerdrRunnerForTesting(async () => {
        throw new Error("timeout waiting for agent");
      });
      const timeoutRes = await agentTool.execute(
        "call-prompt-timeout",
        { action: "prompt", target: "worker_1", prompt: "Hang" },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );
      if (!timeoutRes.content[0].text.toLowerCase().includes("timeout")) {
        fail(`D51/D52: prompt timeout should report timeout in content, got: ${timeoutRes.content[0].text}`);
      }

      setHerdrRunnerForTesting(null);
    }
  }

  // TOOLSPROTO-11: herdr_pane wait_output pattern matching (still inside herdr)
  {
    let readCount = 0;
    setHerdrRunnerForTesting(async (args) => {
      if (args[0] === "pane" && args[1] === "read") {
        readCount++;
        return "[Server] listening on port 8080";
      }
      return { ok: true };
    });

    const paneTool = ctx.tools.find((t) => t.name === "herdr_pane");
    if (!paneTool) {
      fail("TOOLSPROTO-11: herdr_pane tool not registered inside herdr");
    } else {
      // Empty match should not immediately match empty/any text
      const emptyRes = await paneTool.execute(
        "call-empty-match",
        { action: "wait_output", pane: "pane_1", match: "", timeout: 200 },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );
      if (emptyRes.content[0].text.includes("matched:")) {
        fail("TOOLSPROTO-11: wait_output with empty match string should not immediately report matched");
      }

      // Literal string with brackets should match literally, not as character class
      const bracketRes = await paneTool.execute(
        "call-bracket-match",
        { action: "wait_output", pane: "pane_1", match: "[Server] listening", timeout: 500 },
        undefined,
        undefined,
        { cwd: process.cwd() },
      );
      if (!bracketRes.content[0].text.includes("matched: [Server] listening")) {
        fail(`TOOLSPROTO-11: wait_output should match literal [Server] listening, got: ${bracketRes.content[0].text}`);
      }

      setHerdrRunnerForTesting(null);
    }
  }
  if (prevHerdrEnv === undefined) delete process.env.HERDR_ENV;
  else process.env.HERDR_ENV = prevHerdrEnv;
  if (prevHerdrPane === undefined) delete process.env.HERDR_PANE_ID;
  else process.env.HERDR_PANE_ID = prevHerdrPane;

  // TOOLSPROTO-12: References - Repo Name Collision & Custom Directory Name Support
  {
    const fixture = createTempFixture("tools-ref-collision-");
    const fixtureOrigin = "https://github.com/org1/engine";
    const existingRepo = join(fixture.dir, ".omp", "references", "engine");
    mkdirSync(existingRepo, { recursive: true });
    execFileSync("git", ["init"], { cwd: existingRepo });
    execFileSync("git", ["remote", "add", "origin", fixtureOrigin], { cwd: existingRepo });

    // (a) existing dir whose origin is org1 + add of org2 URL -> message names collision and existing origin
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "add https://github.com/org2/engine", { ui: {} });
    const collisionMsg = ctx.customMessages.find((m) =>
      String(m.content).includes(fixtureOrigin) &&
      String(m.content).includes("already exists") &&
      String(m.content).includes("<other-name>")
    );
    if (!collisionMsg) {
      fail("TOOLSPROTO-12: existing dir whose origin is org1 + add of org2 URL must report collision naming existing origin and advice to pass <other-name>");
    }
    const wrongUpdateMsg = ctx.customMessages.find((m) => String(m.content).includes("use /reference update engine"));
    if (wrongUpdateMsg) {
      fail("TOOLSPROTO-12: collision on differing origins must NOT advise 'use /reference update'");
    }

    // (b) add <url> ../evil is rejected without creating anything
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "add https://github.com/org1/engine ../evil", { ui: {} });
    const evilPath = join(fixture.dir, ".omp", "references", "..", "evil");
    if (existsSync(evilPath)) {
      fail("TOOLSPROTO-12: add <url> ../evil must NOT create evil directory outside corpus");
    }
    const rejectedMsg = ctx.customMessages.find((m) => String(m.content).includes("not a safe directory name"));
    if (!rejectedMsg) {
      fail("TOOLSPROTO-12: add <url> ../evil must reject with unsafe directory name message");
    }

    // (c) same-origin re-add still yields the update hint
    ctx.customMessages.length = 0;
    await runReferenceCommand(ctx.pi, fixture.dir, "add https://github.com/org1/engine.git", { ui: {} });
    const updateHintMsg = ctx.customMessages.find((m) => String(m.content).includes("already exists — use /reference update engine"));
    if (!updateHintMsg) {
      fail("TOOLSPROTO-12: same-origin re-add must still advise using /reference update");
    }

    fixture.cleanup();
  }
}
