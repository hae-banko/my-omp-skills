// Prompt clarification extension adapted from dkmnx/pi-clarify.
//
// Adds /clarify slash command (on/off/toggle/debug/status), clarify_prompt tool with
// interactive TUI selection + custom text input, ~ single-turn bypass prefix,
// and system prompt guideline injection when active.

import { Type } from "@sinclair/typebox";
import { Container, Text } from "@earendil-works/pi-tui";
import type { CommandContext, ExtensionApi, ToolResult } from "./api.ts";
import { findKnowledgeRoot, findRelevantKnowledge } from "./knowledge.ts";
import { toolResultCard } from "./research-format.ts";

export interface ThemeHelper {
  fg?(color: string, text: string): string;
  bold?(text: string): string;
}

export const CLARIFY_GUIDELINES = `
Prompt Clarification Guidelines:
- If the user's request is ambiguous, vague, or missing critical details required to act correctly, call the \`clarify_prompt\` tool to ask for clarification before proceeding.
- Provide a clear, concise question and a list of at least 3 plausible options/choices for the user to choose from.
- Do NOT use \`clarify_prompt\` if the user's intent is unambiguous, or if the user prefixed their turn with \`~\` to bypass clarification.
- Continue to format your non-clarification text responses with standard Markdown (headers, code blocks, bold/italics, dividers, bullet lists).
`.trim();

export const CLARIFY_PROMPT = `

## Prompt Clarification Active
${CLARIFY_GUIDELINES}
`;

const VAGUE_PATTERNS = [
  /^(\s*please\s*)?(fix|do|help|make|change|update|check|optimize|refactor|clean)(\s+it|\s+this|\s+that|\s+the\s+code|\s+everything|\s+stuff|\s+better|\s+it\s+better)?\s*\??$/i,
  /^(what|how|why)\??$/i,
  /^(please\s+)?(help|fix|do|go|start)$/i,
];

export function isVagueInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/")) return false;
  if (trimmed.length === 1) return true;
  if (/^[?.!…:;,\-\_\*\#\$\@\%\^\&\(\)]+$/.test(trimmed)) return true;
  return VAGUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function shouldBypassClarify(text: string): boolean {
  return /^~+/.test(text.trimStart());
}

export function stripClarifyBypassPrefix(text: string): string {
  if (!shouldBypassClarify(text)) return text;
  return text.trimStart().replace(/^~+\s*/, "");
}

let enabled = false;
let debugEnabled = false;
let bypassNextTurn = false;

export function isClarifyEnabled(): boolean {
  return enabled;
}

export function setClarifyEnabled(val: boolean): void {
  enabled = val;
}

export function isClarifyDebugEnabled(): boolean {
  return debugEnabled;
}

export function setClarifyDebugEnabled(val: boolean): void {
  debugEnabled = val;
}

export function toggleClarifyState(args?: string, ctx?: CommandContext): boolean {
  const arg = (args ?? "").trim().toLowerCase();
  const parts = arg.split(/\s+/);

  if (parts[0] === "debug") {
    const val = parts[1];
    if (val === "on") {
      debugEnabled = true;
    } else if (val === "off") {
      debugEnabled = false;
    } else {
      debugEnabled = !debugEnabled;
    }
    const debugStr = debugEnabled ? "enabled" : "disabled";
    ctx?.ui?.notify?.(`Prompt clarification debug mode ${debugStr}`, "info");
    return debugEnabled;
  }

  if (arg === "status") {
    const statusMsg = `Prompt clarification is ${enabled ? "enabled" : "disabled"} (debug: ${debugEnabled ? "enabled" : "disabled"})`;
    ctx?.ui?.notify?.(statusMsg, "info");
    return enabled;
  }

  if (arg === "on") {
    enabled = true;
  } else if (arg === "off") {
    enabled = false;
  } else {
    enabled = !enabled;
  }
  const statusStr = enabled ? "enabled" : "disabled";
  ctx?.ui?.notify?.(`Prompt clarification ${statusStr}`, "info");
  return enabled;
}

export function installClarify(pi: ExtensionApi): void {
  pi.registerCommand("clarify", {
    description: "Toggle prompt clarification (/clarify [on|off|debug|status])",
    handler: (args: string, ctx: CommandContext) => {
      toggleClarifyState(args, ctx);
    },
  });

  pi.registerMessageRenderer("clarify-debug", (message: unknown) => {
    let contentStr = "";
    if (message && typeof message === "object") {
      if ("content" in message && typeof (message as { content: unknown }).content === "string") {
        contentStr = (message as { content: string }).content;
      }
    }
    const lines = contentStr ? contentStr.split("\n") : [];
    return toolResultCard(lines, "CLARIFY DEBUG — Transformed Prompt Sent to Agent");
  });

  pi.on("input", (event: unknown) => {
    if (
      event &&
      typeof event === "object" &&
      "source" in event &&
      ((event as { source: unknown }).source === "extension" ||
        (event as { source: unknown }).source === "system")
    ) {
      return { action: "continue" };
    }

    let text = "";
    if (typeof event === "string") {
      text = event;
    } else if (
      event &&
      typeof event === "object" &&
      "text" in event &&
      typeof (event as { text: unknown }).text === "string"
    ) {
      text = (event as { text: string }).text;
    }

    if (shouldBypassClarify(text)) {
      bypassNextTurn = true;
      const stripped = stripClarifyBypassPrefix(text);
      if (event && typeof event === "object" && "text" in event) {
        (event as { text: string }).text = stripped;
      }
      return { action: "transform", text: stripped };
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", (event: unknown, ctx?: unknown) => {
    if (event && typeof event === "object") {
      const evt = event as {
        prompt?: string;
        promptText?: string;
        systemPrompt?: string;
        systemPromptOptions?: { selectedTools?: string[] };
      };

      const selectedTools = evt.systemPromptOptions?.selectedTools;
      if (!Array.isArray(selectedTools) || selectedTools.includes("clarify_prompt")) {
        if (enabled && !bypassNextTurn) {
          const sysPrompt = evt.systemPrompt ?? "";
          if (
            !sysPrompt.includes(CLARIFY_GUIDELINES) &&
            !sysPrompt.includes("## Prompt Clarification Active")
          ) {
            evt.systemPrompt = sysPrompt + CLARIFY_PROMPT;
          }
        }
      }

      if (debugEnabled && enabled && !bypassNextTurn) {
        const promptText = evt.prompt ?? evt.promptText ?? "";
        const content = [
          "- System Prompt Injection: ACTIVE",
          `- Prompt Text: ${promptText}`,
          "- Injected Guidelines: Present",
        ].join("\n");
        pi.sendMessage({
          customType: "clarify-debug",
          content,
          display: true,
          attribution: "user",
        });
      }

      // Zero-turn pitfall / record auto-surfacing
      const promptText = evt.prompt ?? evt.promptText ?? "";
      const cwd =
        ctx && typeof ctx === "object" && "cwd" in ctx && typeof ctx.cwd === "string"
          ? ctx.cwd
          : process.cwd();
      if (promptText) {
        const root = findKnowledgeRoot(cwd) ?? cwd;
        const matches = findRelevantKnowledge(root, promptText);
        if (matches.length > 0) {
          const sysPrompt = evt.systemPrompt ?? "";
          if (!sysPrompt.includes("<relevant-knowledge>")) {
            const lines = matches.map(
              (m) => `- [${m.kind.toUpperCase()}] ${m.title} (${m.path}) — ${m.snippet}`,
            );
            evt.systemPrompt =
              (evt.systemPrompt ?? "") +
              `\n<relevant-knowledge>\nThe following repository knowledge matches terms in your prompt:\n${lines.join("\n")}\n</relevant-knowledge>`;
          }
        }
      }
    }
    bypassNextTurn = false;
  });

  pi.registerTool({
    name: "clarify_prompt",
    label: "Clarify Prompt",
    description:
      "Ask the user a clarifying question with multiple choice options when the request is ambiguous or vague.",
    parameters: Type.Object({
      question: Type.String(),
      options: Type.Array(Type.String(), { minItems: 1 }),
    }),
    execute: async (_toolCallId, rawParams, signal, _onUpdate, ctx) => {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Clarification skipped by user." }],
          details: { cancelled: true },
        };
      }

      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as {
        question?: string;
        options?: string[];
      };
      const question =
        typeof params.question === "string" && params.question.trim()
          ? params.question.trim()
          : "Please clarify:";

      const toolCtx = (ctx && typeof ctx === "object" ? ctx : {}) as {
        hasUI?: boolean;
        ui?: {
          select?: (title: string, options: string[]) => Promise<string | undefined>;
          input?: (title: string, placeholder?: string) => Promise<string | undefined>;
        };
        abort?: () => void;
      };

      if (toolCtx.hasUI === false || !toolCtx.ui?.select) {
        return {
          content: [
            {
              type: "text",
              text: "Non-interactive session: proceeding with best interpretation for: " + question,
            },
          ],
          details: { nonInteractive: true },
        };
      }

      const customChoice = "Your answer...";
      const rawOpts = Array.isArray(params.options)
        ? params.options.filter((o): o is string => typeof o === "string")
        : [];
      const uniqueOpts = Array.from(new Set(rawOpts.filter((o) => o !== customChoice)));

      let padIdx = 1;
      while (uniqueOpts.length < 3) {
        const label = `Option ${padIdx}`;
        if (!uniqueOpts.includes(label)) {
          uniqueOpts.push(label);
        }
        padIdx++;
      }

      const choices = [...uniqueOpts, customChoice];

      let selected: string | undefined;
      try {
        selected = await toolCtx.ui.select(question, choices);
      } catch {
        // Handle UI interaction failure gracefully
      }

      if (!selected) {
        toolCtx.abort?.();
        return {
          content: [{ type: "text", text: "Clarification skipped by user." }],
          details: { cancelled: true },
        };
      }

      let answer = selected;
      if (selected === customChoice) {
        let customAnswer: string | undefined;
        if (toolCtx.ui?.input) {
          try {
            customAnswer = await toolCtx.ui.input("Enter your answer:");
          } catch {
            // Handle UI interaction failure gracefully
          }
        }
        if (!customAnswer || !customAnswer.trim()) {
          toolCtx.abort?.();
          return {
            content: [{ type: "text", text: "Clarification skipped by user." }],
            details: { cancelled: true },
          };
        }
        answer = customAnswer.trim();
      }

      return {
        content: [{ type: "text", text: `User selected: ${answer}` }],
        details: { question, answer },
      };
    },
    renderCall: (args: Record<string, unknown>, _options?: unknown, theme?: unknown) => {
      const container = new Container();
      const safeArgs = args && typeof args === "object" ? args : {};
      const q =
        typeof safeArgs.question === "string" && safeArgs.question.trim()
          ? safeArgs.question.trim()
          : "Clarification question";
      const rawOpts = Array.isArray(safeArgs.options) ? safeArgs.options : [];

      const t = theme as ThemeHelper | undefined;
      if (t?.fg) {
        const title = t.bold ? t.bold("CLARIFY") : "CLARIFY";
        container.addChild(new Text(t.fg("toolTitle", title) + t.fg("muted", ` — ${q}`), 0, 0));
        for (const item of rawOpts) {
          const optStr = typeof item === "string" ? item : (item != null ? String(item) : "");
          if (!optStr) continue;
          const truncated = optStr.length > 80 ? optStr.slice(0, 77) + "..." : optStr;
          container.addChild(new Text(t.fg("muted", `  • ${truncated}`), 0, 0));
        }
      } else {
        container.addChild(new Text(`CLARIFY — ${q}`, 0, 0));
        for (const item of rawOpts) {
          const optStr = typeof item === "string" ? item : (item != null ? String(item) : "");
          if (!optStr) continue;
          const truncated = optStr.length > 80 ? optStr.slice(0, 77) + "..." : optStr;
          container.addChild(new Text(`  • ${truncated}`, 0, 0));
        }
      }
      return container;
    },
    renderResult: (result: ToolResult, _options?: unknown, theme?: unknown) => {
      const container = new Container();
      const content =
        result && typeof result === "object" && Array.isArray((result as ToolResult).content)
          ? (result as ToolResult).content
          : [];
      const lines = content
        .map((block: { type?: string; text?: string }) => {
          if (
            block &&
            typeof block === "object" &&
            block.type === "text" &&
            typeof block.text === "string"
          ) {
            return block.text;
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
      const text = lines || "No result text";

      const details = result?.details as Record<string, unknown> | undefined;
      const isCancelled = details?.cancelled === true || text.includes("skipped");

      const t = theme as ThemeHelper | undefined;
      if (t?.fg) {
        const title = t.bold ? t.bold("CLARIFY ANSWER") : "CLARIFY ANSWER";
        const colorTag = isCancelled ? "warning" : "success";
        container.addChild(new Text(t.fg(colorTag, title) + t.fg("muted", ` — ${text}`), 0, 0));
      } else {
        container.addChild(new Text(`CLARIFY ANSWER — ${text}`, 0, 0));
      }
      return container;
    },
  });
}
