import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";

export type ResearchPreset = "small" | "medium" | "high";
export type ResearchStatus = "DRAFT REVIEW" | "READY" | "RUNNING";

export interface ResearchItemSpec {
  name: string;
  category?: string;
  description?: string;
  status?: string;
}

export interface ResearchFieldSpec {
  name: string;
  category?: string;
  description?: string;
  detail_level?: string;
}

export interface ExecutionSettingsSpec {
  preset?: ResearchPreset;
  agents_per_wave?: number;
  max_waves?: number;
  approval_mode?: string;
}

export interface ResearchReviewPayload {
  slug: string;
  status?: ResearchStatus;
  items?: ResearchItemSpec[];
  fields?: ResearchFieldSpec[];
  modules?: string[];
  execution?: ExecutionSettingsSpec;
}

export interface ThemeHelper {
  [key: string]: unknown;
}

const BOX_WIDTH = 76;
const INNER_WIDTH = BOX_WIDTH - 2; // 74

function formatContentLine(text: string): string {
  const content =
    text.length > INNER_WIDTH ? text.slice(0, INNER_WIDTH - 3) + "..." : text.padEnd(INNER_WIDTH, " ");
  return `│${content}│`;
}

const TOP_BORDER = `┌${"─".repeat(INNER_WIDTH)}┐`;
const DIVIDER = `├${"─".repeat(INNER_WIDTH)}┤`;
const BOTTOM_BORDER = `└${"─".repeat(INNER_WIDTH)}┘`;

export function renderResearchReviewCard(
  payload?: ResearchReviewPayload,
  _theme?: ThemeHelper,
): Container {
  const slug = payload?.slug ?? "unknown";
  const status = payload?.status ?? "DRAFT REVIEW";

  const rawLines: string[] = [];

  // Top border
  rawLines.push(TOP_BORDER);

  // Header
  const headerText = `RESEARCH DRAFT REVIEW — ${slug} [${status}]`;
  rawLines.push(formatContentLine(` ${headerText}`));

  // Divider
  rawLines.push(DIVIDER);

  // Section 1: Living Outline (research.md)
  rawLines.push(formatContentLine(" Section 1: Living Outline (research.md)"));

  const items = payload?.items ?? [];
  const itemsCount = items.length;
  rawLines.push(formatContentLine(`   Items (${itemsCount}):`));
  if (itemsCount === 0) {
    rawLines.push(formatContentLine("     (none)"));
  } else {
    const previewItems = items.slice(0, 5);
    for (const item of previewItems) {
      let desc = item.name;
      if (item.category) desc += ` (${item.category})`;
      if (item.description) desc += `: ${item.description}`;
      if (item.status) desc += ` [${item.status}]`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (itemsCount > 5) {
      rawLines.push(formatContentLine(`     ... and ${itemsCount - 5} more item(s)`));
    }
  }

  const fields = payload?.fields ?? [];
  const fieldsCount = fields.length;
  rawLines.push(formatContentLine(`   Fields (${fieldsCount}):`));
  if (fieldsCount === 0) {
    rawLines.push(formatContentLine("     (none)"));
  } else {
    const previewFields = fields.slice(0, 4);
    for (const field of previewFields) {
      let desc = field.name;
      if (field.category) desc += ` (${field.category})`;
      if (field.detail_level) desc += ` [${field.detail_level}]`;
      if (field.description) desc += `: ${field.description}`;
      rawLines.push(formatContentLine(`     - ${desc}`));
    }
    if (fieldsCount > 4) {
      rawLines.push(formatContentLine(`     ... and ${fieldsCount - 4} more field(s)`));
    }
  }

  const modules = payload?.modules ?? [];
  const modulesText = modules.length > 0 ? modules.join(", ") : "none";
  rawLines.push(formatContentLine(`   Strategy Modules: ${modulesText}`));

  rawLines.push(DIVIDER);

  // Section 2: Execution Settings
  const exec = payload?.execution;
  rawLines.push(formatContentLine(" Section 2: Execution Settings"));
  rawLines.push(formatContentLine(`   Preset Scale: ${exec?.preset ?? "medium"}`));
  rawLines.push(formatContentLine(`   Agents/Wave: ${exec?.agents_per_wave ?? 4}`));
  rawLines.push(formatContentLine(`   Max Waves: ${exec?.max_waves ?? 3}`));
  rawLines.push(formatContentLine(`   Approval Mode: ${exec?.approval_mode ?? "auto"}`));

  // Divider
  rawLines.push(DIVIDER);

  // Section 3: Interactive Action Options
  rawLines.push(formatContentLine(" Section 3: Interactive Action Options"));
  rawLines.push(formatContentLine("   [1] Launch Deep Waves"));
  rawLines.push(formatContentLine("   [2] Refine Items"));
  rawLines.push(formatContentLine("   [3] Edit Fields"));
  rawLines.push(formatContentLine("   [4] Direct File Edit"));

  // Bottom border
  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installResearchReviewCardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("research-review", (message, _options, theme) => {
    let payload: ResearchReviewPayload | undefined;
    if (message && typeof message === "object") {
      if ("details" in message && message.details && typeof message.details === "object") {
        payload = message.details as ResearchReviewPayload;
      } else if (
        "slug" in message ||
        "items" in message ||
        "fields" in message ||
        "execution" in message
      ) {
        payload = message as ResearchReviewPayload;
      }
    }
    return renderResearchReviewCard(payload, theme as ThemeHelper | undefined);
  });
}
