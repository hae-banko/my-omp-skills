// Prompt clarification extension adapted from dkmnx/pi-clarify.
//
// Adds /clarify slash command (on/off/toggle/debug/status), clarify_prompt tool with
// interactive TUI selection + custom text input, ~ single-turn bypass prefix,
// and system prompt guideline injection when active.

import { Type } from "@sinclair/typebox";
import { Container, Text } from "@earendil-works/pi-tui";
import {
  asBeforeAgentStartEvent,
  asEventContext,
  type BeforeAgentStartEventResult,
  type CommandContext,
  type ExtensionApi,
  type ToolResult,
} from "../core/api.ts";
import { findKnowledgeRoot, findRelevantKnowledge } from "../knowledge/knowledge.ts";
import { toolResultCard } from "../research/research-format.ts";

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
// Stripped texts of `~`-prefixed prompts awaiting their before_agent_start.
// Bounded: an aborted `~prompt` can only ever exempt a later identical prompt.
const pendingBypasses = new Set<string>();
const MAX_PENDING_BYPASSES = 16;
const CLARIFY_DEBUG_CUSTOM_TYPE = "clarify-debug";

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

  pi.registerMessageRenderer(CLARIFY_DEBUG_CUSTOM_TYPE, (message: unknown) => {
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

    if (
      event &&
      typeof event === "object" &&
      "source" in event &&
      ((event as { source: unknown }).source === "extension" ||
        (event as { source: unknown }).source === "system")
    ) {
      return { text, action: "continue" };
    }

    if (shouldBypassClarify(text)) {
      const trimmed = stripClarifyBypassPrefix(text);
      // Slash commands never reach before_agent_start with their own text.
      if (!trimmed.startsWith("/")) {
        pendingBypasses.add(trimmed);
        if (pendingBypasses.size > MAX_PENDING_BYPASSES) {
          const oldest = pendingBypasses.values().next().value;
          if (oldest !== undefined) pendingBypasses.delete(oldest);
        }
      }
      if (event && typeof event === "object" && "text" in event) {
        const inputEvent = event as { text: unknown };
        if (typeof inputEvent.text === "string") inputEvent.text = trimmed;
      }
      return { text: trimmed, action: "transform" };
    }

    return { text, action: "continue" };
  });

  pi.on("before_agent_start", (event: unknown, ctx?: unknown): BeforeAgentStartEventResult | undefined => {
    const evt = asBeforeAgentStartEvent(event);
    if (!evt) return;
    const promptText = evt.prompt;
    const isBypassed = pendingBypasses.delete(promptText);
    // New blocks go to the tail; the runtime's blocks are never rewritten (AGENTS.md §8).
    const appended: string[] = [];
    const clarifyActive = enabled && !isBypassed;
    if (clarifyActive && !evt.systemPrompt.some((block) => block.includes(CLARIFY_GUIDELINES))) {
      appended.push(CLARIFY_PROMPT.trim());
    }

    // Zero-turn pitfall / record auto-surfacing
    const cwd = asEventContext(ctx).cwd ?? process.cwd();
    if (promptText && !evt.systemPrompt.some((block) => block.includes("<relevant-knowledge>"))) {
      const root = findKnowledgeRoot(cwd) ?? cwd;
      const matches = findRelevantKnowledge(root, promptText);
      if (matches.length > 0) {
        const lines = matches.map(
          (m) => `- [${m.kind.toUpperCase()}] ${m.title} (${m.path}) — ${m.snippet}`,
        );
        appended.push(
          `<relevant-knowledge>\nThe following repository knowledge matches terms in your prompt:\n${lines.join("\n")}\n</relevant-knowledge>`,
        );
      }
    }

    const debugMessage =
      debugEnabled && clarifyActive
        ? {
            customType: CLARIFY_DEBUG_CUSTOM_TYPE,
            content: [
              "- System Prompt Injection: ACTIVE",
              `- Prompt Text: ${promptText}`,
              "- Injected Guidelines: Present",
            ].join("\n"),
            display: true,
            attribution: "user" as const,
          }
        : undefined;
    if (appended.length === 0 && !debugMessage) return;
    return {
      ...(appended.length > 0 ? { systemPrompt: [...evt.systemPrompt, ...appended] } : {}),
      ...(debugMessage ? { message: debugMessage } : {}),
    };
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
