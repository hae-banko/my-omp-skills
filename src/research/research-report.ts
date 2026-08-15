// Research Report Generator — Pure TypeScript, Zero-Dependency Report Synthesis
// Synthesizes report.md and summary.md directly from results/*.json and outline.yaml.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readFieldNames, readOutlineItems } from "./research-store.ts";

export interface GenerateReportOptions {
  projectDir: string;
}

export interface GenerateReportResult {
  ok: boolean;
  reportPath: string;
  summaryPath: string;
  itemCount: number;
  unresolvedCount: number;
  sourcesCount: number;
  error?: string;
}

interface ItemResult {
  filename: string;
  name: string;
  data: Record<string, unknown>;
  sources: string[];
}

/**
 * Synthesize a comprehensive research report in pure TypeScript without Python/pyyaml dependencies.
 */
export function generateResearchReport(options: GenerateReportOptions): GenerateReportResult {
  const { projectDir } = options;
  const resultsDir = join(projectDir, "results");
  const reportPath = join(projectDir, "report.md");
  const summaryPath = join(projectDir, "summary.md");

  if (!existsSync(resultsDir) || !statSync(resultsDir).isDirectory()) {
    return {
      ok: false,
      reportPath,
      summaryPath,
      itemCount: 0,
      unresolvedCount: 0,
      sourcesCount: 0,
      error: `Results directory not found: ${resultsDir}`,
    };
  }

  try {
    const files = readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    if (files.length === 0) {
      return {
        ok: false,
        reportPath,
        summaryPath,
        itemCount: 0,
        unresolvedCount: 0,
        sourcesCount: 0,
        error: "No JSON result files found in results/",
      };
    }

    const items: ItemResult[] = [];
    const allSources = new Set<string>();
    let totalFields = 0;
    let filledFields = 0;
    let unresolvedCount = 0;

    for (const f of files) {
      try {
        const raw = readFileSync(join(resultsDir, f), "utf8");
        const parsed = JSON.parse(raw);
        const name = parsed.name || parsed.item_name || f.replace(/\.json$/, "").replace(/^\d+_/, "").replace(/_/g, " ");

        const sources: string[] = [];
        if (Array.isArray(parsed.sources)) {
          for (const s of parsed.sources) {
            if (typeof s === "string" && s.startsWith("http")) {
              sources.push(s);
              allSources.add(s);
            }
          }
        }

        for (const [k, v] of Object.entries(parsed)) {
          if (k.startsWith("_") || k === "name" || k === "sources") continue;
          totalFields++;
          if (v === "[uncertain]" || v === "" || v === null || v === undefined) {
            unresolvedCount++;
          } else {
            filledFields++;
          }
        }

        items.push({
          filename: f,
          name,
          data: parsed,
          sources,
        });
      } catch {
        // Ignore JSON parse errors on partial files
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const projectName = basename(projectDir);

    // Build Full Report Markdown
    const repLines: string[] = [];
    repLines.push(`# Research Report: ${projectName}`);
    repLines.push("");
    repLines.push(`**Date**: ${today} | **Items Evaluated**: ${items.length} | **Field Coverage**: ${filledFields}/${totalFields} (${totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 100}%) | **Sources Cited**: ${allSources.size}`);
    repLines.push("");

    repLines.push("## Executive Summary");
    repLines.push("");
    repLines.push(`This report synthesizes deep research findings across ${items.length} investigation items.`);
    if (unresolvedCount > 0) {
      repLines.push(`There are currently ${unresolvedCount} unresolved or uncertain fields.`);
    } else {
      repLines.push("All requested comparison and validation fields were successfully resolved.");
    }
    repLines.push("");

    repLines.push("## Action Plan & Item Overview");
    repLines.push("");
    repLines.push("| Item | Key Finding / Summary | Status |");
    repLines.push("| :--- | :--- | :--- |");

    for (const it of items) {
      const summary = it.data.summary || it.data.executive_summary || it.data.description || it.data.finding || Object.values(it.data)[0] || "—";
      const cleanSummary = String(summary).replace(/[\r\n]+/g, " ").slice(0, 100);
      const isComplete = !Object.values(it.data).some((v) => v === "[uncertain]");
      repLines.push(`| **[${it.name}](#${it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")})** | ${cleanSummary} | ${isComplete ? "✅ Verified" : "⚠️ Needs Review"} |`);
    }
    repLines.push("");

    repLines.push("## Detailed Findings");
    repLines.push("");

    for (const it of items) {
      repLines.push(`### ${it.name}`);
      repLines.push("");

      for (const [k, v] of Object.entries(it.data)) {
        if (k.startsWith("_") || k === "name" || k === "sources") continue;
        const fieldTitle = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        if (typeof v === "object" && v !== null) {
          repLines.push(`* **${fieldTitle}**: \`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``);
        } else {
          const valStr = String(v ?? "—");
          if (valStr.length > 200 || valStr.includes("\n")) {
            repLines.push(`<details><summary><b>${fieldTitle}</b></summary>\n\n${valStr}\n</details>\n`);
          } else {
            repLines.push(`* **${fieldTitle}**: ${valStr}`);
          }
        }
      }

      if (it.sources.length > 0) {
        repLines.push("");
        repLines.push("**Sources**:");
        for (const src of it.sources) {
          repLines.push(`- [${src}](${src})`);
        }
      }
      repLines.push("");
      repLines.push("---");
      repLines.push("");
    }

    repLines.push("## Appendix: Discovered Sources");
    repLines.push("");
    for (const src of allSources) {
      repLines.push(`- [${src}](${src})`);
    }
    repLines.push("");

    writeFileSync(reportPath, repLines.join("\n"), "utf8");

    // Build Summary Digest Markdown
    const sumLines: string[] = [];
    sumLines.push(`# Summary Digest: ${projectName}`);
    sumLines.push("");
    sumLines.push(`**Date**: ${today} | **Items**: ${items.length} | **Coverage**: ${totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 100}%`);
    sumLines.push("");
    sumLines.push("## Action Items");
    sumLines.push("");
    for (const it of items) {
      const summary = it.data.summary || it.data.executive_summary || it.data.description || "—";
      sumLines.push(`* **${it.name}**: ${String(summary).replace(/[\r\n]+/g, " ").slice(0, 140)}`);
    }
    sumLines.push("");

    writeFileSync(summaryPath, sumLines.join("\n"), "utf8");

    return {
      ok: true,
      reportPath,
      summaryPath,
      itemCount: items.length,
      unresolvedCount,
      sourcesCount: allSources.size,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reportPath,
      summaryPath,
      itemCount: 0,
      unresolvedCount: 0,
      sourcesCount: 0,
      error: msg || "Failed to generate report",
    };
  }
}
