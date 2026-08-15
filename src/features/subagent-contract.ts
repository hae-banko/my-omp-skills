// Subagent Context & File Contract Injector
// Enforces deterministic output file paths and schema contracts for subagents.

import { join } from "node:path";
import { slugifyItemId } from "../research/research-dag.ts";

export interface SubagentFileContractOptions {
  itemId: string;
  itemName: string;
  itemIndex?: number;
  projectDir: string;
  fieldsPath?: string;
  upstreamContextPrompt?: string;
}

export interface SubagentFileContract {
  itemId: string;
  itemName: string;
  targetJsonRelPath: string;
  targetJsonAbsPath: string;
  fieldsPath?: string;
  contractPrompt: string;
}

/**
 * Generate a standardized File Contract for subagents dispatched on research items.
 */
export function generateSubagentFileContract(options: SubagentFileContractOptions): SubagentFileContract {
  const { itemId, itemName, itemIndex, projectDir, fieldsPath, upstreamContextPrompt } = options;
  const slug = slugifyItemId(itemId || itemName, itemIndex ?? 0);

  const idxPrefix = itemIndex !== undefined && itemIndex >= 0
    ? `${String(itemIndex + 1).padStart(2, "0")}_`
    : "";

  const filename = `${idxPrefix}${slug}.json`;
  const targetJsonRelPath = join("results", filename);
  const targetJsonAbsPath = join(projectDir, targetJsonRelPath);

  const lines: string[] = [
    "<file-contract>",
    `Target Item: "${itemName}" (id: ${slug})`,
    `Output JSON Path: ${targetJsonRelPath}`,
    `Output Absolute Path: ${targetJsonAbsPath}`,
    ...(fieldsPath ? [`Fields Schema: ${fieldsPath}`] : []),
    "Execution Invariant:",
    "1. Write the verified result JSON directly to the Output JSON Path upon completing investigation.",
    "2. The JSON object must strictly conform to fields.yaml (keys matching field definitions, no markdown wrappers).",
    "3. Never guess alternate output filenames or leave extracted findings solely in chat responses.",
    "</file-contract>",
  ];

  if (upstreamContextPrompt && upstreamContextPrompt.trim()) {
    lines.push("");
    lines.push(upstreamContextPrompt.trim());
  }

  return {
    itemId: slug,
    itemName,
    targetJsonRelPath,
    targetJsonAbsPath,
    fieldsPath,
    contractPrompt: lines.join("\n"),
  };
}

/**
 * Parse an existing <file-contract> block from a prompt or string.
 */
export function parseFileContract(text: string): { itemId?: string; targetPath?: string } | null {
  const match = text.match(/<file-contract>([\s\S]*?)<\/file-contract>/);
  if (!match) return null;

  const body = match[1];
  const itemMatch = body.match(/id:\s*([a-z0-9_]+)/i);
  const pathMatch = body.match(/Output JSON Path:\s*([^\r\n]+)/i);

  return {
    itemId: itemMatch?.[1]?.trim(),
    targetPath: pathMatch?.[1]?.trim(),
  };
}
