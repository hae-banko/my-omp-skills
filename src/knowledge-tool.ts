// knowledge_read tool + transcript renderers for knowledge-base messages.
// The tool gives the model a sanctioned way to look up past findings; the
// renderers give the TUI compact cards instead of raw text.

import type { ExtensionApi, ToolResult } from "./api.ts";
import { findKnowledgeRoot, readKnowledge, type KnowledgeQuery } from "./knowledge.ts";
import { toolResultCard } from "./research-format.ts";

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
      });
      return { content: [{ type: "text", text: result.text }], details: result.details };
    },
    renderResult: (result, _options, _theme) => {
      // details: { found, type, count, paths } — validated by the execute path.
      const details = result.details as { found?: boolean; type?: string; count?: number };
      if (details && details.found === false) {
        return toolResultCard(["no knowledge base here"], "KNOWLEDGE — not found");
      }
      const label = `KNOWLEDGE — ${String(details?.type ?? "index").toUpperCase()} (${details?.count ?? 0})`;
      return toolResultCard(knowledgeResultLines(result).slice(0, 8), label);
    },
  });

  const registerMessageCard = (customType: string, label: string): void => {
    pi.registerMessageRenderer(customType, (message, _options, _theme) => {
      const content =
        message && typeof message === "object" && "content" in message
          ? String(message.content ?? "")
          : "";
      return toolResultCard(content.split("\n").slice(0, 8), label);
    });
  };
  registerMessageCard("knowledge-record", "RECORD");
  registerMessageCard("knowledge-pitfall", "PITFALL");
}
