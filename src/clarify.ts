// Prompt clarification extension adapted from dkmnx/pi-clarify.
//
// Adds /clarify slash command (on/off/toggle), clarify_prompt tool with
// interactive TUI selection + custom text input, ~ single-turn bypass prefix,
// and system prompt guideline injection when active.

import { Type } from "@sinclair/typebox";
import { Container, Text } from "@earendil-works/pi-tui";
import type { CommandContext, ExtensionApi, ToolResult } from "./api.ts";

export const CLARIFY_GUIDELINES = `
Prompt Clarification Guidelines:
- If the user's request is ambiguous, vague, or missing critical details required to act correctly, call the \`clarify_prompt\` tool to ask for clarification before proceeding.
- Provide a clear, concise question and a list of at least 3 plausible options/choices for the user to choose from.
- Do NOT use \`clarify_prompt\` if the user's intent is unambiguous, or if the user prefixed their turn with \`~\` to bypass clarification.
`.trim();

export const CLARIFY_PROMPT = `

## Prompt Clarification Active
${CLARIFY_GUIDELINES}
`;

export function isVagueInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 15) return true;
  const vaguePatterns = [
    /^(fix|do|help|make|change|update|check|run|start|build|test|clean)(\s+it|\s+this|\s+that)?$/i,
    /^(what|how|why)\??$/i,
    /^(please\s+)?(help|fix|do|go|start)$/i,
  ];
  return vaguePatterns.some((pattern) => pattern.test(trimmed));
}

export function shouldBypassClarify(text: string): boolean {
  return text.trimStart().startsWith("~");
}

export function stripClarifyBypassPrefix(text: string): string {
  if (!shouldBypassClarify(text)) return text;
  return text.trimStart().replace(/^~\s*/, "");
}

let enabled = false;
let bypassNextTurn = false;

export function isClarifyEnabled(): boolean {
  return enabled;
}

export function setClarifyEnabled(val: boolean): void {
  enabled = val;
}

export function toggleClarifyState(args?: string, ctx?: CommandContext): boolean {
  const arg = (args ?? "").trim().toLowerCase();
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
    description: "Toggle prompt clarification on/off (/clarify on|off)",
    handler: (args: string, ctx: CommandContext) => {
      toggleClarifyState(args, ctx);
    },
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

    if (shouldBypassClarify(text)) {
      bypassNextTurn = true;
      const stripped = stripClarifyBypassPrefix(text);
      if (event && typeof event === "object" && "text" in event) {
        (event as { text: string }).text = stripped;
      }
      return { text: stripped };
    }
  });

  pi.on("before_agent_start", (event: unknown) => {
    if (event && typeof event === "object" && "systemPrompt" in event) {
      const evt = event as { systemPrompt: string };
      if (enabled && !bypassNextTurn) {
        evt.systemPrompt = (evt.systemPrompt ?? "") + CLARIFY_PROMPT;
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
      options: Type.Array(Type.String(), { minItems: 3 }),
    }),
    execute: async (_toolCallId, rawParams, _signal, _onUpdate, ctx) => {
      const params = rawParams as { question: string; options: string[] };
      const question = params.question ?? "Please clarify:";
      const options = Array.isArray(params.options) ? params.options : [];
      const choices = [...options, "Your answer..."];

      const toolCtx = ctx as {
        ui?: {
          select?: (title: string, options: string[]) => Promise<string | undefined>;
          input?: (title: string, placeholder?: string) => Promise<string | undefined>;
        };
        abort?: () => void;
      };

      let selected: string | undefined;
      if (toolCtx?.ui?.select) {
        selected = await toolCtx.ui.select(question, choices);
      }

      if (!selected) {
        toolCtx?.abort?.();
        return {
          content: [{ type: "text", text: "Clarification skipped by user." }],
          details: { cancelled: true },
        };
      }

      let answer = selected;
      if (selected === "Your answer...") {
        let customAnswer: string | undefined;
        if (toolCtx?.ui?.input) {
          customAnswer = await toolCtx.ui.input("Enter your answer:");
        }
        if (!customAnswer) {
          toolCtx?.abort?.();
          return {
            content: [{ type: "text", text: "Clarification skipped by user." }],
            details: { cancelled: true },
          };
        }
        answer = customAnswer;
      }

      return {
        content: [{ type: "text", text: `User selected: ${answer}` }],
        details: { question, answer },
      };
    },
    renderCall: (args: Record<string, unknown>) => {
      const container = new Container();
      const q = typeof args.question === "string" ? args.question : "Clarification question";
      const opts = Array.isArray(args.options) ? args.options : [];
      container.addChild(new Text(`CLARIFY — ${q}`, 0, 0));
      for (const opt of opts) {
        container.addChild(new Text(`  • ${String(opt)}`, 0, 0));
      }
      return container;
    },
    renderResult: (result: ToolResult) => {
      const container = new Container();
      const lines = (result.content ?? [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .join(" ");
      container.addChild(new Text(`CLARIFY ANSWER — ${lines}`, 0, 0));
      return container;
    },
  });
}
