// herdr tools — structured control of the herdr terminal workspace manager.
//
// Ported from pi-herdr (ogulcancelik/pi-extensions, MIT): the mechanics are
// harness-agnostic — exec the `herdr` CLI, parse JSON envelopes, expose
// structured tools. Adapted to the herdr CLI as installed here (0.7.x):
// actions that pi-herdr maps to 0.7.5+ primitives (agent `kind`/`pane`
// start, agent `send_keys`, pane `wait_output`, agent `prompt`) are composed
// from 0.7.x primitives instead (send + wait; read + poll).
//
// Activation: these tools only make sense inside a herdr-managed pane
// (HERDR_ENV=1 + HERDR_PANE_ID). Outside herdr, execute returns a clear
// gate message instead of failing cryptically. Invocation is opt-in: the
// model uses them when the user mentions herdr or asks to inspect/control
// herdr panes, workspaces, or agents.

import { execFile } from "node:child_process";
import type { ExtensionApi, ToolDefinition, ToolResult } from "./api.ts";
import { toolResultCard } from "./research-format.ts";
const WHITESPACE_RE = /\s+/;

function inHerdr(): boolean {
  return process.env.HERDR_ENV === "1" && Boolean(process.env.HERDR_PANE_ID);
}

const GATE_MESSAGE =
  "herdr tools require running inside a herdr-managed pane (HERDR_ENV=1 and HERDR_PANE_ID set). This session is not inside herdr — use the herdr CLI directly or start one from herdr.";

interface HerdrEnvelope {
  result?: unknown;
  error?: { code?: string; message?: string };
}

function parseEnvelope(output: string): HerdrEnvelope | null {
  try {
    return JSON.parse(output) as HerdrEnvelope;
  } catch {
    return null;
  }
}

/**
 * Classify CLI stdout: a JSON envelope ({result}/{error}), or raw terminal
 * text (`pane read` / `agent read` print the pane content verbatim, not an
 * envelope). Returns {ok, value} with value = the unwrapped result, the raw
 * text, or null for empty output.
 */
export function parseHerdrOutput(stdout: string): { ok: boolean; value: unknown } {
  const envelope = parseEnvelope(stdout);
  if (envelope) {
    if (envelope.error) {
      return { ok: false, value: envelope.error.message ?? String(envelope.error.code ?? "herdr error") };
    }
    return { ok: true, value: envelope.result ?? null };
  }
  return { ok: true, value: stdout.length > 0 ? stdout : null };
}

function runHerdr(args: string[], signal?: AbortSignal, timeoutMs = 30000): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  execFile("herdr", args, { timeout: timeoutMs, signal }, (error, stdout, stderr) => {
    if (error) {
      const parsed = parseHerdrOutput(stderr || stdout);
      if (!parsed.ok) {
        reject(new Error(String(parsed.value)));
      } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("herdr CLI not found on PATH"));
      } else {
        reject(error);
      }
      return;
    }
    const parsed = parseHerdrOutput(stdout);
    if (!parsed.ok) {
      reject(new Error(String(parsed.value)));
      return;
    }
    resolve(parsed.value);
  });
  return promise;
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** `--current`/`--pane <id>` flag pair for pane-targeted CLI calls. */
function paneArgs(pane?: string, current?: boolean): string[] {
  if (pane) return ["--pane", pane];
  return current === false ? [] : ["--current"];
}

/** Short human summary of an agent/pane/workspace/tab result for the card. */
function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "ok");
  const v = value as Record<string, unknown>;
  if (Array.isArray(v)) return (v as unknown[]).map(summarize).join("\n");
  const parts: string[] = [];
  if (typeof v.name === "string") parts.push(v.name as string);
  if (typeof v.label === "string") parts.push(v.label as string);
  for (const key of ["pane_id", "tab_id", "workspace_id"]) {
    if (typeof v[key] === "string") parts.push(`[${v[key] as string}]`);
  }
  if (typeof v.agent === "string") parts.push(String(v.agent));
  if (typeof v.agent_status === "string" && v.agent_status !== "unknown") {
    parts.push(`(${v.agent_status as string})`);
  }
  if (typeof v.cwd === "string") parts.push(String(v.cwd));
  return parts.length > 0 ? parts.join(" ") : JSON.stringify(v).slice(0, 200);
}

/** Card content for a herdr result: lines from details.summary (else first
 * content block, else "ok"), plus the action label from details. */
function herdrCardContent(result: ToolResult): { lines: string[]; action: string } {
  const details = result.details as { action?: string; summary?: string } | undefined;
  const lines = (details?.summary ?? result.content[0]?.text ?? "ok")
    .split("\n")
    .slice(0, 12);
  return { lines, action: details?.action ?? "?" };
}

type ExecuteArgs = Parameters<ToolDefinition["execute"]>;

function gateOrRun(
  args: string[],
  label: string,
  action: string,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<ToolResult> {
  if (!inHerdr()) {
    return Promise.resolve({
      content: [{ type: "text", text: GATE_MESSAGE }],
      details: { action, summary: "not inside herdr" },
    });
  }
  return runHerdr(args, signal, timeoutMs).then((result) => {
    const summary = Array.isArray(result)
      ? (result as unknown[]).map(summarize).join("\n")
      : summarize(result);
    return {
      content: [{ type: "text", text: summary }],
      details: { action, summary },
    };
  });
}

export function installHerdrTools(pi: ExtensionApi): void {
  const { zod } = pi;

  pi.registerTool({
    name: "herdr_layout",
    label: "Herdr Layout",
    description:
      "Inspect and control herdr workspace/tab/pane topology (list, create, focus, split). Use when the user asks about herdr layouts, workspaces, tabs, or panes.",
    parameters: zod.object({
      action: zod
        .enum([
          "current",
          "workspace_list",
          "workspace_create",
          "workspace_focus",
          "tab_list",
          "tab_create",
          "tab_focus",
          "pane_list",
          "pane_layout",
          "pane_split",
        ])
        .default("current"),
      workspace: zod.string().optional(),
      tab: zod.string().optional(),
      pane: zod.string().optional(),
      current: zod.boolean().optional(),
      label: zod.string().optional(),
      cwd: zod.string().optional(),
      direction: zod.enum(["right", "down"]).optional(),
      focus: zod.boolean().optional(),
    }),
    execute: async (toolCallId, rawParams, signal, _onUpdate, ctx) => {
      const p = rawParams as Record<string, string | boolean | undefined>;
      const action = String(p.action ?? "current");
      let args: string[];
      switch (action) {
        case "current":
          args = ["pane", "current"];
          break;
        case "workspace_list":
          args = ["workspace", "list"];
          break;
        case "workspace_create":
          args = ["workspace", "create"];
          if (p.cwd) args.push("--cwd", String(p.cwd));
          if (p.label) args.push("--label", String(p.label));
          break;
        case "workspace_focus":
          args = ["workspace", "focus", String(p.workspace ?? "")];
          break;
        case "tab_list":
          args = ["tab", "list"];
          if (p.workspace) args.push("--workspace", String(p.workspace));
          break;
        case "tab_create":
          args = ["tab", "create"];
          if (p.workspace) args.push("--workspace", String(p.workspace));
          if (p.cwd) args.push("--cwd", String(p.cwd));
          if (p.label) args.push("--label", String(p.label));
          break;
        case "tab_focus":
          args = ["tab", "focus", String(p.tab ?? "")];
          break;
        case "pane_list":
          args = ["pane", "list"];
          if (p.workspace) args.push("--workspace", String(p.workspace));
          break;
        case "pane_layout":
          args = ["pane", "layout", ...paneArgs(String(p.pane ?? ""), p.current === true)];
          break;
        case "pane_split":
          args = ["pane", "split", ...paneArgs(String(p.pane ?? ""), p.current === true)];
          args.push("--direction", String(p.direction ?? "right"));
          if (p.cwd) args.push("--cwd", String(p.cwd));
          if (p.focus) args.push("--focus");
          break;
        default:
          args = ["pane", "current"];
      }
      const result = await gateOrRun(args, "HERDR — LAYOUT", action, signal);
      return result;
    },
    renderResult: (result, _options, _theme) => {
      const card = herdrCardContent(result);
      return toolResultCard(card.lines, `HERDR — LAYOUT (${card.action})`);
    },
  });

  pi.registerTool({
    name: "herdr_pane",
    label: "Herdr Pane",
    description:
      "Control a herdr terminal pane: run a shell command, read output, wait for output, send text or keys, close. For ordinary processes (builds, servers, tests), not coding-agent workflows.",
    parameters: zod.object({
      action: zod
        .enum(["get", "run", "read", "wait_output", "send_text", "send_keys", "close"])
        .default("get"),
      pane: zod.string().optional(),
      command: zod.string().optional(),
      text: zod.string().optional(),
      keys: zod.string().optional(),
      match: zod.string().optional(),
      source: zod.enum(["visible", "recent", "recent-unwrapped"]).optional(),
      format: zod.enum(["text", "ansi"]).optional(),
      lines: zod.number().int().min(1).max(2000).optional(),
      timeout: zod.number().int().min(100).max(600000).optional(),
    }),
    execute: async (toolCallId, rawParams, signal, _onUpdate, ctx) => {
      const p = rawParams as Record<string, string | number | boolean | undefined>;
      const action = String(p.action ?? "get");
      const pane = String(p.pane ?? "");
      if (!inHerdr()) {
        return {
          content: [{ type: "text", text: GATE_MESSAGE }],
          details: { action, summary: "not inside herdr" },
        };
      }
      if (!pane && action !== "get") {
        return {
          content: [{ type: "text", text: `herdr_pane ${action} requires a pane id` }],
          details: { action, summary: "missing pane" },
        };
      }

      let result: unknown;
      if (action === "wait_output") {
        const match = String(p.match ?? "");
        const timeout = Number(p.timeout ?? 30000);
        const deadline = Date.now() + timeout;
        let matched = false;
        let lastText = "";
        let regex: RegExp | null = null;
        try {
          regex = new RegExp(match);
        } catch {
          regex = null;
        }
        for (;;) {
          const read = await runHerdr(
            ["pane", "read", pane, "--source", "recent", "--lines", "400"],
            signal,
          );
          lastText =
            typeof read === "string"
              ? read
              : String(
                  (read as Record<string, unknown>)?.content ??
                    (read as Record<string, unknown>)?.text ??
                    JSON.stringify(read),
                );
          const hit = regex ? regex.test(lastText) : lastText.includes(match);
          if (hit) {
            matched = true;
            break;
          }
          if (Date.now() >= deadline) break;
          await sleep(1000);
        }
        result = matched
          ? `matched: ${match}`
          : `no match for ${JSON.stringify(match)} after ${timeout}ms; last output:\n${lastText.slice(-2000)}`;
      } else {
        let args: string[];
        switch (action) {
          case "get":
            args = ["pane", "get", pane];
            break;
          case "run":
            args = ["pane", "run", pane, String(p.command ?? "")];
            break;
          case "read":
            args = ["pane", "read", pane];
            if (p.source) args.push("--source", String(p.source));
            if (p.lines) args.push("--lines", String(p.lines));
            if (p.format) args.push("--format", String(p.format));
            break;
          case "send_text":
            args = ["pane", "send-text", pane, String(p.text ?? "")];
            break;
          case "send_keys":
            args = ["pane", "send-keys", pane, ...String(p.keys ?? "").split(WHITESPACE_RE).filter(Boolean)];
            break;
          case "close":
            args = ["pane", "close", pane];
            break;
          default:
            args = ["pane", "get", pane];
        }
        result = await runHerdr(args, signal);
      }
      const summary = summarize(result);
      return {
        content: [{ type: "text", text: summary }],
        details: { action, summary },
      };
    },
    renderResult: (result, _options, _theme) => {
      const card = herdrCardContent(result);
      return toolResultCard(card.lines, `HERDR — PANE (${card.action})`);
    },
  });

  pi.registerTool({
    name: "herdr_agent",
    label: "Herdr Agent",
    description:
      "Control a recognized coding agent in a herdr pane: list, get, start, prompt (send + wait for settlement), wait for a lifecycle state, read output, send text, focus, rename. Use for sibling agent workflows.",
    parameters: zod.object({
      action: zod
        .enum(["list", "get", "start", "prompt", "wait", "read", "send", "focus", "rename"])
        .default("list"),
      target: zod.string().optional(),
      name: zod.string().optional(),
      prompt: zod.string().optional(),
      text: zod.string().optional(),
      status: zod.enum(["idle", "working", "blocked", "unknown"]).optional(),
      source: zod.enum(["visible", "recent", "recent-unwrapped"]).optional(),
      format: zod.enum(["text", "ansi"]).optional(),
      lines: zod.number().int().min(1).max(2000).optional(),
      timeout: zod.number().int().min(100).max(600000).optional(),
      cwd: zod.string().optional(),
      workspace: zod.string().optional(),
      tab: zod.string().optional(),
      split: zod.enum(["right", "down"]).optional(),
      focus: zod.boolean().optional(),
      argv: zod.string().optional(),
    }),
    execute: async (toolCallId, rawParams, signal, _onUpdate, ctx) => {
      const p = rawParams as Record<string, string | number | boolean | undefined>;
      const action = String(p.action ?? "list");
      if (!inHerdr()) {
        return {
          content: [{ type: "text", text: GATE_MESSAGE }],
          details: { action, summary: "not inside herdr" },
        };
      }
      const target = String(p.target ?? "");
      const timeout = Number(p.timeout ?? 60000);

      let result: unknown;
      switch (action) {
        case "list":
          result = await runHerdr(["agent", "list"], signal);
          break;
        case "get":
          result = await runHerdr(["agent", "get", target], signal);
          break;
        case "start": {
          // herdr 0.7.x form: agent start <name> [--cwd] [--workspace] [--tab]
          // [--split] [--focus] -- <argv...>
          const args = ["agent", "start", String(p.name ?? "")];
          if (p.cwd) args.push("--cwd", String(p.cwd));
          if (p.workspace) args.push("--workspace", String(p.workspace));
          if (p.tab) args.push("--tab", String(p.tab));
          if (p.split) args.push("--split", String(p.split));
          if (p.focus) args.push("--focus");
          const argv = String(p.argv ?? "").trim();
          if (argv) args.push("--", ...argv.split(WHITESPACE_RE));
          result = await runHerdr(args, signal);
          break;
        }
        case "prompt": {
          await runHerdr(["agent", "send", target, String(p.prompt ?? "")], signal);
          try {
            await runHerdr(["agent", "wait", target, "--status", "blocked", "--timeout", String(timeout)], signal);
          } catch {
            // Not blocked — the agent settled another way (idle/done/working).
          }
          const state = await runHerdr(["agent", "get", target], signal);
          const status = (state as Record<string, unknown>)?.agent_status ?? "unknown";
          result = `prompt delivered to ${target}; agent state: ${String(status)}`;
          break;
        }
        case "wait":
          result = await runHerdr(
            ["agent", "wait", target, "--status", String(p.status ?? "idle"), "--timeout", String(timeout)],
            signal,
          );
          break;
        case "read": {
          const args = ["agent", "read", target];
          if (p.source) args.push("--source", String(p.source));
          if (p.lines) args.push("--lines", String(p.lines));
          if (p.format) args.push("--format", String(p.format));
          result = await runHerdr(args, signal);
          break;
        }
        case "send":
          result = await runHerdr(["agent", "send", target, String(p.text ?? "")], signal);
          break;
        case "focus":
          result = await runHerdr(["agent", "focus", target], signal);
          break;
        case "rename":
          result = await runHerdr(["agent", "rename", target, String(p.name ?? "--clear")], signal);
          break;
        default:
          result = await runHerdr(["agent", "list"], signal);
      }
      const summary = summarize(result);
      return {
        content: [{ type: "text", text: summary }],
        details: { action, summary },
      };
    },
    renderResult: (result, _options, _theme) => {
      const card = herdrCardContent(result);
      return toolResultCard(card.lines, `HERDR — AGENT (${card.action})`);
    },
  });
}
