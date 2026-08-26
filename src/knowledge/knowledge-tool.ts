// knowledge_read tool + transcript renderers for knowledge-base messages.
// The tool gives the model a sanctioned way to look up past findings; the
// renderers give the TUI compact cards instead of raw text.

import type { ExtensionApi, ToolResult } from "../core/api.ts";
import { findKnowledgeRoot, readKnowledge, type KnowledgeQuery } from "./knowledge.ts";
import { createTuiCard } from "../core/card.ts";

const TOOL_NAME = "knowledge_read";

function knowledgeResultLines(result: ToolResult): string[] {
  const text = (result.content ?? [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .join(" ")
    .split("\n");
  return text.length > 0 ? text : ["no content"];
}

export function installKnowledgeTool(pi: ExtensionApi): void {
  const { zod } = pi;

  pi.registerTool({
    name: TOOL_NAME,
    label: "Knowledge Base Read",
    description:
      "Read entries from the repo-local knowledge base (.omp/knowledge/): the INDEX, records, pitfalls, or research projects. " +
      "Use when the user asks about past findings, lessons, or recorded pitfalls.",
    parameters: zod.object({
      type: zod.enum(["index", "records", "pitfalls", "research", "audits"]).default("index"),
      slug: zod.string().optional(),
      limit: zod.number().int().min(1).max(50).optional(),
      full: zod.boolean().optional(),
      query: zod.string().optional(),
    }),
    execute: async (_toolCallId, rawParams, _signal, _onUpdate, ctx) => {
      // The runtime validates params against the zod schema above before
      // execute runs, so the shape is trusted here.
      const params = rawParams as KnowledgeQuery;
      const root = findKnowledgeRoot(ctx.cwd);
      if (!root) {
        return {
          content: [
            {
              type: "text",
              text: "No .omp/knowledge/ found from this working directory. Run /record once (or /omp-setup) to create it.",
            },
          ],
          details: { found: false, type: params.type, count: 0, paths: [] },
        };
      }
      const result = readKnowledge(root, {
        type: params.type,
        slug: params.slug,
        limit: params.limit,
        full: params.full,
        query: params.query,
      });
      return { content: [{ type: "text", text: result.text }], details: result.details };
    },
    renderResult: (result, _options, theme) => {
      const details = result.details as { found?: boolean; type?: string; count?: number };
      if (details && details.found === false) {
        return createTuiCard(
          {
            title: "KNOWLEDGE — not found",
            intent: "warning",
            sections: [{ content: ["○ No knowledge base found in workspace. Run /record once to initialize."] }],
          },
          theme,
        );
      }
      const label = `KNOWLEDGE — ${String(details?.type ?? "index").toUpperCase()}`;
      const lines = knowledgeResultLines(result);
      return createTuiCard(
        {
          title: label,
          intent: "neutral",
          badges: [{ label: "entries", value: String(details?.count ?? lines.length), intent: "neutral" }],
          sections: [{ content: lines.length > 0 ? lines : ["○ No matching entries found"] }],
        },
        theme,
      );
    },
  });

  const registerMessageCard = (customType: string, label: string): void => {
    pi.registerMessageRenderer(customType, (message, _options, theme) => {
      const content =
        message && typeof message === "object" && "content" in message
          ? String(message.content ?? "")
          : "";
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const isPitfall = customType === "knowledge-pitfall";
      return createTuiCard(
        {
          title: label,
          intent: isPitfall ? "warning" : "neutral",
          badges: [
            {
              label: "type",
              value: isPitfall ? "pitfall ledger" : "durable records",
              intent: isPitfall ? "warning" : "neutral",
            },
          ],
          sections: [
            {
              content: lines.length > 0 ? lines : [`○ No ${isPitfall ? "pitfalls" : "records"} recorded yet`],
            },
          ],
          footerActions: [`/${isPitfall ? "pitfall" : "record"} <title> to add`, "Esc: Dismiss"],
        },
        theme,
      );
    });
  };
  registerMessageCard("knowledge-record", "RECORD");
  registerMessageCard("knowledge-pitfall", "PITFALL");
}
