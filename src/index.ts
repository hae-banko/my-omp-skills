// my-omp-skills — extension entry point.
//
// Registers every slash command in this package. Workflow bodies are plain
// markdown under ../commands (editable without touching code); companion
// reference files (agent briefs, HTML scaffolds, seed templates, formats)
// are disclosed to the agent as absolute-path pointers in the injected
// message, so they stay out of the prompt until the workflow needs them.
//
// Adapted from Matt Pocock's skills (https://github.com/mattpocock/skills, MIT).
//
// The types in ./api.ts are minimal structural contracts for the subset of the
// omp ExtensionAPI this package uses; the runtime passes the full API, which
// is a structural superset, so this remains assignable both ways.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { CommandContext, ExtensionApi } from "./api.ts";
import { installBootstrap } from "./bootstrap.ts";
import { installHerdrTools } from "./herdr-tools.ts";
import {
  installHindsight,
  isHindsightEnabled,
  reloadHindsightConfig,
  setHindsightEnabled,
  hindsightToggleMessages,
} from "./hindsight.ts";
import { installKnowledgeTool } from "./knowledge-tool.ts";
import { installPolicy } from "./policy.ts";
import { installRoutinesTool } from "./routines.ts";
import {
  installResearchDashboardRenderer,
  installResearchReportPreviewRenderer,
  installResearchReviewCardRenderer,
  installResearchWaveProgressRenderer,
  type ResearchDashboardPayload,
  type ResearchFieldSpec,
  type ResearchItemSpec,
  type ResearchReviewPayload,
} from "./research-renderer.ts";
import {
  installAuditCardRenderer,
  installTicketBreakdownRenderer,
  installTriageStatusRenderer,
  type AuditCardPayload,
  type AuditSubtopicSpec,
  type TriageStatusPayload,
} from "./telemetry-renderer.ts";

const ROOT = join(import.meta.dirname, "..");
const DATED_SLUG_RE = /^\d{4}-\d{2}-\d{2}_/;
const FRONTMATTER_RE = /^---[\s\S]*?\n---\s*/;
const ARGUMENTS_RE = /\$ARGUMENTS/g;

const repoRootCache = new Map<string, string>();
function findRepoRoot(startDir: string = process.cwd()): string {
  const cached = repoRootCache.get(startDir);
  if (cached !== undefined) return cached;
  let dir = startDir;
  for (;;) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, ".omp")) ||
      existsSync(join(dir, ".scratch"))
    ) {
      repoRootCache.set(startDir, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      repoRootCache.set(startDir, startDir);
      return startDir;
    }
    dir = parent;
  }
}

function resolveResearchProjectDir(root: string, slugArg: string): { slug: string; projectDir: string } {
  const researchDir = join(root, ".omp", "knowledge", "research");
  let slug = slugArg.trim();
  let projectDir = "";
  if (slug && existsSync(join(researchDir, slug))) {
    projectDir = join(researchDir, slug);
  } else {
    try {
      const entries = readdirSync(researchDir, { withFileTypes: true })
        .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
        .map((ent) => ent.name)
        .sort()
        .reverse();
      if (slug) {
        const match = entries.find((e) => e === slug || e.includes(slug) || e.endsWith(slug));
        if (match) {
          slug = match;
          projectDir = join(researchDir, match);
        }
      }
      if (!projectDir && entries.length > 0) {
        slug = entries[0];
        projectDir = join(researchDir, entries[0]);
      }
    } catch {
      // ignore
    }
  }
  return { slug: slug || slugArg || "unknown", projectDir };
}

function getResearchDashboardMetrics(projectDir: string, slug: string): ResearchDashboardPayload {
  const hasOutline = projectDir ? (existsSync(join(projectDir, "outline.yaml")) || existsSync(join(projectDir, "outline.yml"))) : false;
  const hasFields = projectDir ? (existsSync(join(projectDir, "fields.yaml")) || existsSync(join(projectDir, "fields.yml"))) : false;
  const hasReport = projectDir ? existsSync(join(projectDir, "report.md")) : false;
  const resultsDir = projectDir ? join(projectDir, "results") : "";
  let jsonFiles: string[] = [];
  if (resultsDir && existsSync(resultsDir)) {
    try {
      jsonFiles = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
    } catch {}
  }

  let totalItems = 0;
  if (hasOutline) {
    const outlinePath = existsSync(join(projectDir, "outline.yaml"))
      ? join(projectDir, "outline.yaml")
      : join(projectDir, "outline.yml");
    try {
      const content = readFileSync(outlinePath, "utf8");
      const matches = content.match(/^\s*-\s*name:\s*(.+)$/gm);
      if (matches) {
        totalItems = matches.length;
      } else {
        const lines = content.split("\n");
        let inItems = false;
        for (const l of lines) {
          if (/^items:/i.test(l.trim())) { inItems = true; continue; }
          if (inItems && /^[a-z0-9_]+:/i.test(l.trim())) { inItems = false; }
          if (inItems && /^\s*-\s*/.test(l)) { totalItems++; }
        }
      }
    } catch {}
  }

  let totalFields = 0;
  if (hasFields) {
    const fieldsPath = existsSync(join(projectDir, "fields.yaml"))
      ? join(projectDir, "fields.yaml")
      : join(projectDir, "fields.yml");
    try {
      const content = readFileSync(fieldsPath, "utf8");
      const matches = content.match(/^\s*-\s*name:\s*(.+)$/gm);
      if (matches) {
        totalFields = matches.length;
      } else {
        const lines = content.split("\n");
        for (const l of lines) {
          if (/^\s*-\s*/.test(l) && !l.trim().startsWith("#")) { totalFields++; }
        }
      }
    } catch {}
  }

  const completedItems = jsonFiles.length;
  let completedFields = 0;
  if (completedItems > 0) {
    let totalValidFieldsAcrossJson = 0;
    for (const file of jsonFiles) {
      try {
        const raw = readFileSync(join(resultsDir, file), "utf8");
        const json = JSON.parse(raw);
        if (json && typeof json === "object") {
          const uncertainList = Array.isArray(json.uncertain) ? json.uncertain : [];
          const keys = Object.keys(json).filter((k) => !k.startsWith("_") && k !== "uncertain");
          const validCount = keys.filter((k) => !uncertainList.includes(k) && String(json[k]).indexOf("[uncertain]") === -1).length;
          totalValidFieldsAcrossJson += validCount;
        }
      } catch {}
    }
    completedFields = totalValidFieldsAcrossJson;
  }

  const coverage = totalItems > 0 ? Math.min(1, completedItems / totalItems) : (hasReport ? 1 : 0);

  let current_phase: 1 | 2 | 3 = 1;
  let pipeline_status = "[Phase 1: Outline] ──> Phase 2: OODA ──> Phase 3: Report";
  let recommended_next_step = "Run /research-deep to execute Phase 2 background research waves.";

  if (hasReport) {
    current_phase = 3;
    pipeline_status = "Phase 1: Outline ──> Phase 2: OODA ──> [Phase 3: Report]";
    recommended_next_step = "Research complete. View report.md for details.";
  } else if (completedItems > 0) {
    current_phase = 2;
    pipeline_status = "Phase 1: Outline ──> [Phase 2: OODA] ──> Phase 3: Report";
    recommended_next_step = "Run /research-report to generate the final report.";
  }

  return {
    slug,
    current_phase,
    pipeline_status,
    global_metrics: {
      total_items: totalItems,
      completed_items: completedItems,
      total_fields: totalFields,
      completed_fields: completedFields,
      coverage,
    },
    artifacts: {
      outline_yaml: hasOutline ? "Ready" : "Pending",
      fields_yaml: hasFields ? "Ready" : "Pending",
      results_json: jsonFiles.length > 0 ? jsonFiles.length : "Pending",
      report_md: hasReport ? "Generated" : "Pending",
    },
    recommended_next_step,
  };
}

function getResearchReviewPayload(projectDir: string, slug: string): ResearchReviewPayload {
  const items: ResearchItemSpec[] = [];
  const fields: ResearchFieldSpec[] = [];
  let hasOutline = false;
  let hasResearchMd = false;

  if (projectDir) {
    const outlinePath = existsSync(join(projectDir, "outline.yaml"))
      ? join(projectDir, "outline.yaml")
      : existsSync(join(projectDir, "outline.yml"))
      ? join(projectDir, "outline.yml")
      : "";
    if (outlinePath) {
      hasOutline = true;
      try {
        const content = readFileSync(outlinePath, "utf8");
        const matches = content.match(/^\s*-\s*name:\s*(.+)$/gm);
        if (matches) {
          for (const m of matches) {
            const name = m.replace(/^\s*-\s*name:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
            items.push({ name, status: "pending" });
          }
        }
      } catch {}
    }

    const fieldsPath = existsSync(join(projectDir, "fields.yaml"))
      ? join(projectDir, "fields.yaml")
      : existsSync(join(projectDir, "fields.yml"))
      ? join(projectDir, "fields.yml")
      : "";
    if (fieldsPath) {
      try {
        const content = readFileSync(fieldsPath, "utf8");
        const matches = content.match(/^\s*-\s*name:\s*(.+)$/gm);
        if (matches) {
          for (const m of matches) {
            const name = m.replace(/^\s*-\s*name:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
            fields.push({ name });
          }
        }
      } catch {}
    }

    const researchMdPath = join(projectDir, "research.md");
    if (existsSync(researchMdPath)) {
      hasResearchMd = true;
    }
  }

  return {
    slug,
    status: (hasOutline || hasResearchMd) ? "READY" : "DRAFT REVIEW",
    items,
    fields,
    modules: [
      "general-web",
      "github-debug",
      "stackoverflow",
      "chinese-tech",
      "academic-papers",
    ],
    execution: {
      preset: "medium",
      agents_per_wave: 4,
      max_waves: 3,
      approval_mode: "auto",
    },
  };
}

function getAuditCardPayload(root: string, slugArg: string): AuditCardPayload {
  const auditsDir = join(root, ".omp", "audits");
  let auditSlug = slugArg.trim();

  if (existsSync(auditsDir)) {
    try {
      const entries = readdirSync(auditsDir, { withFileTypes: true })
        .filter((ent) => !ent.name.startsWith("."));
      
      let matchedDir: string | null = null;
      if (auditSlug) {
        const match = entries.find((e) => e.name === auditSlug || e.name.replace(/\.md$/, "") === auditSlug);
        if (match) matchedDir = match.name;
      }
      if (!matchedDir && entries.length > 0) {
        const sorted = entries.sort((a, b) => b.name.localeCompare(a.name));
        matchedDir = sorted[0].name;
      }

      if (matchedDir) {
        const targetPath = join(auditsDir, matchedDir);
        let reportFile = "";
        let isDir = false;
        if (statSync(targetPath).isDirectory()) {
          isDir = true;
          auditSlug = matchedDir;
          if (existsSync(join(targetPath, "overview.md"))) reportFile = join(targetPath, "overview.md");
          else if (existsSync(join(targetPath, "report.md"))) reportFile = join(targetPath, "report.md");
        } else if (matchedDir.endsWith(".md")) {
          auditSlug = matchedDir.replace(/\.md$/, "");
          reportFile = targetPath;
        }

        if (reportFile && existsSync(reportFile)) {
          const body = readFileSync(reportFile, "utf8");
          const titleMatch = body.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);
          const title = titleMatch?.[1]?.trim() ?? `Audit: ${auditSlug}`;
          const versionMatch = body.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
          const version = versionMatch?.[1]?.trim() ?? "v0.1.0";
          const statusMatch = body.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
          const status = statusMatch?.[1]?.trim() ?? "active";

          let subtopicsCount = 0;
          const subtopicSpecs: AuditSubtopicSpec[] = [];
          if (isDir) {
            const subDir = join(targetPath, "subtopics");
            if (existsSync(subDir)) {
              try {
                const subs = readdirSync(subDir).filter((f) => f.endsWith(".md"));
                subtopicsCount = subs.length;
                for (const s of subs) {
                  subtopicSpecs.push({ name: s.replace(/\.md$/, ""), path: `./subtopics/${s}` });
                }
              } catch {}
            }
          }

          const rootReportRel = isDir
            ? (existsSync(join(targetPath, "overview.md")) ? `.omp/audits/${auditSlug}/overview.md` : `.omp/audits/${auditSlug}/report.md`)
            : `.omp/audits/${auditSlug}.md`;

          return {
            title,
            slug: auditSlug,
            version,
            status,
            root_report_path: rootReportRel,
            subtopics_count: subtopicsCount,
            subtopics: subtopicSpecs,
            latest_revision: version,
          };
        }
      }
    } catch {}
  }

  return {
    title: slugArg ? `Audit: ${slugArg}` : "Codebase Audit",
    slug: auditSlug || "overview",
    version: "v0.1.0",
    status: "active",
    root_report_path: auditSlug ? `.omp/audits/${auditSlug}/overview.md` : ".omp/audits/overview.md",
    subtopics_count: 0,
    latest_revision: "v0.1.0",
  };
}

function getTriageStatusPayload(root: string): TriageStatusPayload {
  const scratchDir = join(root, ".scratch");
  let unlabeled = 0;
  let needsTriage = 0;
  let agentReady = 0;

  if (existsSync(scratchDir)) {
    const mdFiles: string[] = [];
    const collect = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = join(dir, ent.name);
          if (ent.isDirectory() && !ent.name.startsWith(".")) {
            collect(full);
          } else if (ent.isFile() && ent.name.endsWith(".md")) {
            mdFiles.push(full);
          }
        }
      } catch {}
    };
    collect(scratchDir);

    for (const file of mdFiles) {
      try {
        const content = readFileSync(file, "utf8");
        const lower = content.toLowerCase();
        if (lower.includes("needs-triage") || lower.includes("needs_triage")) {
          needsTriage++;
        } else if (lower.includes("agent-ready") || lower.includes("agent_ready")) {
          agentReady++;
        } else {
          unlabeled++;
        }
      } catch {}
    }
  }

  const totalItems = unlabeled + needsTriage + agentReady;
  return {
    total_items: totalItems,
    totalItems,
    backlog: {
      unlabeled,
      needs_triage: needsTriage,
      needsTriage,
      agent_ready: agentReady,
      agentReady,
    },
    unlabeled,
    needs_triage: needsTriage,
    needsTriage,
    agent_ready: agentReady,
    agentReady,
  };
}


function getSpecAndFeatureCompletions(argumentPrefix: string): Array<{ value: string; label: string; description?: string }> | null {
  if (argumentPrefix.includes(" ")) return null;
  const root = findRepoRoot();
  const options: Array<{ value: string; label: string; description?: string }> = [];
  const addedValues = new Set<string>();

  const scanDir = (baseDir: string, relBase: string) => {
    if (!existsSync(baseDir)) return;
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(baseDir, entry.name);
        const relPath = join(relBase, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          if (!addedValues.has(entry.name)) {
            addedValues.add(entry.name);
            options.push({
              value: entry.name,
              label: entry.name,
              description: `Feature directory under ${relBase}/`,
            });
          }
          scanDir(fullPath, relPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          if (!addedValues.has(relPath)) {
            addedValues.add(relPath);
            options.push({
              value: relPath,
              label: relPath,
              description: "Spec markdown file",
            });
          }
        }
      }
    } catch {
      // ignore
    }
  };

  scanDir(join(root, ".scratch"), ".scratch");
  scanDir(join(root, "docs"), "docs");

  options.sort((a, b) => a.label.localeCompare(b.label));

  const lower = argumentPrefix.toLowerCase();
  const matches = options.filter(
    (o) =>
      o.label.toLowerCase().startsWith(lower) ||
      o.label.toLowerCase().includes(lower) ||
      o.value.toLowerCase().startsWith(lower),
  );

  return matches.length > 0 ? matches : null;
}

interface CommandSpec {
  name: string;
  description: string;
  /** path relative to ROOT of the workflow markdown body */
  bodyPath: string;
  /** paths relative to ROOT of companion reference files, disclosed as pointers */
  companions?: string[];
  /** customType for the transcript receipt emitted when the command runs */
  customType?: string;
  /** custom handler replacing the default body-send handler (e.g. toggles) */
  handler?: (
    pi: ExtensionApi,
    resources: { body: string; companionPaths: string[] },
  ) => (args: string, ctx: CommandContext) => Promise<void> | void;
  /** live argument completions shown when the command's argument is typed */
  getArgumentCompletions?: (argumentPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
}

const RESEARCH_ASSETS: string[] = [
  "commands/research/WEB-SEARCH-AGENT.md",
  "commands/research/modules/github-debug.md",
  "commands/research/modules/general-web.md",
  "commands/research/modules/academic-papers.md",
  "commands/research/modules/chinese-tech.md",
  "commands/research/modules/stackoverflow.md",
  "commands/research/validate_json.py",
];

const COMMANDS: CommandSpec[] = [
  {
    name: "research",
    description: "Phase 1 of deep research: generate a research outline (items + field framework) for a topic, human-in-the-loop. Follow with /research-deep and /research-report.",
    bodyPath: "commands/research/command.md",
    companions: RESEARCH_ASSETS,
    handler: (pi, { body, companionPaths }) => async (args, ctx) => {
      const argText = args.trim();
      // Single-digit ergonomic subcommands. Anything else falls through to
      // the default body-send + user-prompt flow so the workflow body can
      // handle subcommands like `review`, `add-items`, `status`, etc.
      const tokens = argText ? argText.split(/\s+/) : [];
      const head = tokens[0] ?? "";
      const rest = tokens.slice(1).join(" ");

      // Phase 1 = bare `/research` or `/research 1 [topic]`.
      if (argText === "" || head === "1") {
        const topic = head === "1" ? rest : argText;
        // Emit a draft Research Review window immediately so the user sees
        // the planned project before the workflow body reaches the model.
        // The agent later replaces this with the real outline payload.
        const date = new Date().toISOString().slice(0, 10);
        const topicSlug = topic
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const slug = `${date}_${topicSlug}`;
        pi.sendMessage({
          customType: "research-review",
          display: true,
          attribution: "user",
          details: {
            slug,
            topic,
            status: "DRAFT REVIEW",
            modules: [
              "general-web",
              "github-debug",
              "stackoverflow",
              "chinese-tech",
              "academic-papers",
            ],
          },
        });
        await runDefaultHandler({
          pi,
          name: "research",
          customType: undefined,
          body,
          args,
          companionPaths,
          ctx,
        });
        return;
      }

      // Phase 2 / Phase 3 = ergonomic shortcuts that delegate to the
      // dedicated commands registered alongside `/research`.
      if (head === "2") {
        await pi.sendUserMessage(`/research-deep ${rest}`.trimEnd());
        return;
      }
      if (head === "3") {
        await pi.sendUserMessage(`/research-report ${rest}`.trimEnd());
        return;
      }

      if (head === "dashboard" || head === "status") {
        const root = findRepoRoot();
        const { slug, projectDir } = resolveResearchProjectDir(root, rest);
        const payload = getResearchDashboardMetrics(projectDir, slug);
        pi.sendMessage({
          customType: "research-dashboard",
          display: true,
          attribution: "user",
          details: payload,
        });
        ctx.ui?.notify?.("Research Dashboard loaded", "info");
        return;
      }

      if (head === "review") {
        const root = findRepoRoot();
        const { slug, projectDir } = resolveResearchProjectDir(root, rest);
        const payload = getResearchReviewPayload(projectDir, slug);
        pi.sendMessage({
          customType: "research-review",
          display: true,
          attribution: "user",
          details: payload,
        });
        ctx.ui?.notify?.("Research Review Window loaded", "info");
        return;
      }

      if (head === "off") {
        ctx.ui?.notify?.("Research Review Window closed", "info");
        return;
      }

      await runDefaultHandler({
        pi,
        name: "research",
        customType: undefined,
        body,
        args,
        companionPaths,
        ctx,
      });
    },
    getArgumentCompletions: (argumentPrefix: string) => {
      const subcommands = [
        { value: "1", label: "1", description: "Phase 1: generate an outline for a new topic" },
        { value: "2", label: "2", description: "Phase 2: run deep research (alias for /research-deep)" },
        { value: "3", label: "3", description: "Phase 3: generate the final report (alias for /research-report)" },
        { value: "dashboard", label: "dashboard", description: "Open the research dashboard" },
        { value: "review", label: "review", description: "Open/emit Research Review Window for a project" },
        { value: "add-items", label: "add-items", description: "Add research items to an existing outline" },
        { value: "add-fields", label: "add-fields", description: "Add field definitions to an existing outline" },
        { value: "status", label: "status", description: "Show status of a research project" },
        { value: "run", label: "run", description: "Run deep research phase for a project" },
        { value: "off", label: "off", description: "Close/disable Research Review Window" },
      ];

      const lower = argumentPrefix.toLowerCase();
      if (!argumentPrefix.includes(" ")) {
        const matches = subcommands.filter(
          (sc) => sc.label.toLowerCase().startsWith(lower) || sc.value.toLowerCase().startsWith(lower),
        );
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const firstWord = lower.slice(0, spaceIdx);
      const slugSubcommands = ["2", "3", "dashboard", "review", "add-items", "add-fields", "status", "run"];
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (slugSubcommands.includes(firstWord)) {
        const root = findRepoRoot();
        const researchDir = join(root, ".omp", "knowledge", "research");
        let slugs: string[] = [];
        try {
          slugs = readdirSync(researchDir, { withFileTypes: true })
            .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
            .map((ent) => ent.name)
            .sort()
            .reverse();
        } catch {
          slugs = [];
        }
        const matches = slugs
          .filter((slug) => slug.toLowerCase().startsWith(rest))
          .map((slug) => ({
            value: `${firstWord} ${slug}`,
            label: slug,
            description: "Research project directory",
          }));
        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "research-add-items",
    description: "Add research items to an existing outline.yaml.",
    bodyPath: "commands/research-add-items/command.md",
    companions: ["commands/research/WEB-SEARCH-AGENT.md"],
  },
  {
    name: "research-add-fields",
    description: "Add field definitions to an existing fields.yaml.",
    bodyPath: "commands/research-add-fields/command.md",
    companions: ["commands/research/WEB-SEARCH-AGENT.md"],
  },
  {
    name: "research-deep",
    description:
      "Phase 2 of deep research ([preset] [slug]): research each outline item with parallel background agents, outputting validated JSON per item.",
    bodyPath: "commands/research-deep/command.md",
    companions: RESEARCH_ASSETS,
    getArgumentCompletions: (argumentPrefix: string) => {
      const presets = [
        { value: "small", label: "small", description: "Execution preset: 1-2 parallel agents per wave" },
        { value: "medium", label: "medium", description: "Execution preset: 3-5 parallel agents per wave" },
        { value: "high", label: "high", description: "Execution preset: max parallel agents per wave" },
      ];

      const getDatedSlugs = (): string[] => {
        const root = findRepoRoot();
        const researchDir = join(root, ".omp", "knowledge", "research");
        try {
          return readdirSync(researchDir, { withFileTypes: true })
            .filter((ent) => ent.isDirectory() && DATED_SLUG_RE.test(ent.name))
            .map((ent) => ent.name)
            .sort()
            .reverse();
        } catch {
          return [];
        }
      };

      const lower = argumentPrefix.toLowerCase();
      if (!argumentPrefix.includes(" ")) {
        const slugs = getDatedSlugs();
        const slugOptions = slugs.map((slug) => ({
          value: slug,
          label: slug,
          description: "Research project directory",
        }));
        const matches = [...presets, ...slugOptions].filter(
          (o) => o.label.toLowerCase().startsWith(lower) || o.value.toLowerCase().startsWith(lower),
        );
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const firstWord = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (["small", "medium", "high"].includes(firstWord)) {
        const slugs = getDatedSlugs();
        const matches = slugs
          .filter((slug) => slug.toLowerCase().startsWith(rest))
          .map((slug) => ({
            value: `${firstWord} ${slug}`,
            label: slug,
            description: "Research project directory",
          }));
        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "research-report",
    description:
      "Phase 3 of deep research ([slug]): convert the deep-research JSON results into a markdown report with table of contents.",
    bodyPath: "commands/research-report/command.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;

      const root = findRepoRoot();
      const researchDir = join(root, ".omp", "knowledge", "research");
      let slugs: string[] = [];
      try {
        slugs = readdirSync(researchDir, { withFileTypes: true })
          .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
          .map((ent) => ent.name)
          .sort()
          .reverse();
      } catch {
        return null;
      }

      const lower = argumentPrefix.toLowerCase();
      const matches = slugs
        .filter((slug) => slug.toLowerCase().startsWith(lower))
        .map((slug) => ({
          value: slug,
          label: slug,
          description: "Research project directory",
        }));

      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "audit",
    description:
      "Perform an independent audit of a codebase area, architecture, or idea into a formal report under .omp/audits/.",
    bodyPath: "commands/audit/command.md",
    companions: ["commands/audit/AUDIT-FORMAT.md"],
    customType: "audit-card",
    handler: (pi, { body, companionPaths }) => async (args, ctx) => {
      const argText = args.trim();
      const tokens = argText ? argText.split(/\s+/) : [];
      const head = tokens[0] ?? "";

      if (head === "status" || head === "list" || head === "view" || head === "--recent" || argText.startsWith("--recent")) {
        const root = findRepoRoot();
        const rest = tokens.slice(1).join(" ").trim();
        const targetSlug = head === "--recent" ? "" : rest;
        const payload = getAuditCardPayload(root, targetSlug);
        pi.sendMessage({
          customType: "audit-card",
          display: true,
          attribution: "user",
          details: payload,
        });
        ctx.ui?.notify?.("Audit status loaded", "info");
        return;
      }

      await runDefaultHandler({
        pi,
        name: "audit",
        customType: "audit-card",
        body,
        args,
        companionPaths,
        ctx,
      });
    },
    getArgumentCompletions: (argumentPrefix: string) => {
      const root = findRepoRoot();
      const auditsDir = join(root, ".omp", "audits");
      const slugs: string[] = [];

      if (existsSync(auditsDir)) {
        try {
          const entries = readdirSync(auditsDir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.name.startsWith(".")) continue;
            if (ent.isDirectory()) {
              if (
                existsSync(join(auditsDir, ent.name, "overview.md")) ||
                existsSync(join(auditsDir, ent.name, "report.md"))
              ) {
                slugs.push(ent.name);
              }
            } else if (ent.isFile() && ent.name.endsWith(".md")) {
              slugs.push(ent.name.replace(/\.md$/, ""));
            }
          }
        } catch {
          // ignore read error
        }
      }
      const lower = argumentPrefix.toLowerCase();
      const subcommands: Array<{ value: string; label: string; description?: string }> = [
        { value: "status", label: "status", description: "Show active audit status" },
        { value: "list", label: "list", description: "List all audit reports" },
        { value: "view ", label: "view", description: "View audit report by slug" },
        { value: "subtopics ", label: "subtopics", description: "List or view audit subtopics" },
        { value: "--recent", label: "--recent", description: "List recent audit reports" },
        { value: "--version ", label: "--version", description: "Specify or filter by audit version" },
      ];

      if (!argumentPrefix.includes(" ")) {
        const slugOptions = slugs.map((slug) => ({
          value: slug,
          label: slug,
          description: "Existing audit report slug",
        }));
        const allOptions = [...subcommands, ...slugOptions];
        const matches = allOptions.filter(
          (o) =>
            o.label.toLowerCase().startsWith(lower) ||
            o.value.toLowerCase().startsWith(lower) ||
            (o.description === "Existing audit report slug" && o.label.toLowerCase().includes(lower)),
        );
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (["view", "subtopics", "status", "--version"].includes(sub)) {
        const matches = slugs
          .filter((slug) => slug.toLowerCase().startsWith(rest) || slug.toLowerCase().includes(rest))
          .map((slug) => ({
            value: `${sub} ${slug}`,
            label: slug,
            description: "Existing audit report slug",
          }));
        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "ask-me",
    description: "Ask which command or flow fits your situation. A router over the commands in this package.",
    bodyPath: "commands/ask-me.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      const categories: Array<{ value: string; label: string; description?: string }> = [
        { value: "plan", label: "plan", description: "Planning & architecture workflows" },
        { value: "ship", label: "ship", description: "Implementation & execution workflows" },
        { value: "research", label: "research", description: "Research & investigation workflows" },
        { value: "knowledge", label: "knowledge", description: "Knowledge base & learning workflows" },
        { value: "upkeep", label: "upkeep", description: "Maintenance, setup & governance workflows" },
      ];

      const commandOptions = COMMANDS.map((c) => ({
        value: c.name,
        label: c.name,
        description: c.description,
      }));

      const all = [...categories, ...commandOptions];
      const matches = all.filter(
        (o) => o.label.toLowerCase().startsWith(lower) || o.value.toLowerCase().startsWith(lower),
      );
      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "grill-me",
    description: "A relentless interview to sharpen a plan or design.",
    bodyPath: "commands/grill-me.md",
    getArgumentCompletions: (argumentPrefix: string) => getSpecAndFeatureCompletions(argumentPrefix),
  },
  {
    name: "grill-with-docs",
    description: "A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.",
    bodyPath: "commands/grill-with-docs.md",
    getArgumentCompletions: (argumentPrefix: string) => getSpecAndFeatureCompletions(argumentPrefix),
  },
  {
    name: "triage",
    description:
      "Move issues and external PRs through a state machine of triage roles [--unlabeled | --needs-triage] — categorise, verify, grill if needed, and write agent-ready briefs.",
    bodyPath: "commands/triage/command.md",
    companions: [
      "commands/triage/AGENT-BRIEF.md",
      "commands/triage/OUT-OF-SCOPE.md",
    ],
    customType: "triage-status",
    handler: (pi, { body, companionPaths }) => async (args, ctx) => {
      const argText = args.trim();
      const tokens = argText ? argText.split(/\s+/) : [];
      const head = tokens[0] ?? "";

      if (head === "status" || head === "--status" || argText.startsWith("status") || argText.startsWith("--status")) {
        const root = findRepoRoot();
        const payload = getTriageStatusPayload(root);
        pi.sendMessage({
          customType: "triage-status",
          display: true,
          attribution: "user",
          details: payload,
        });
        ctx.ui?.notify?.("Triage status loaded", "info");
        return;
      }

      await runDefaultHandler({
        pi,
        name: "triage",
        customType: "triage-status",
        body,
        args,
        companionPaths,
        ctx,
      });
    },
    getArgumentCompletions: (argumentPrefix: string) => {
      const lower = argumentPrefix.toLowerCase();
      const options = [
        { value: "--unlabeled", label: "--unlabeled", description: "Show unlabeled items needing triage" },
        { value: "--needs-triage", label: "--needs-triage", description: "Show items in needs-triage state" },
      ];
      const matches = options.filter((o) => o.label.startsWith(lower));
      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "improve-codebase-architecture",
    description: "Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.",
    bodyPath: "commands/improve-codebase-architecture/command.md",
    companions: ["commands/improve-codebase-architecture/HTML-REPORT.md"],
  },
  {
    name: "omp-setup",
    description: "Configure this repo for the workflow commands — issue tracker (local .scratch by default), triage label vocabulary, and domain doc layout. Run once per repo.",
    bodyPath: "commands/setup/command.md",
    companions: [
      "commands/setup/issue-tracker-local.md",
      "commands/setup/issue-tracker-github.md",
      "commands/setup/issue-tracker-gitlab.md",
      "commands/setup/triage-labels.md",
      "commands/setup/domain.md",
    ],
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      const targets = [
        { value: "local", label: "local", description: "Configure local Markdown issue tracker (.scratch/)" },
        { value: "github", label: "github", description: "Configure GitHub Issues integration" },
        { value: "gitlab", label: "gitlab", description: "Configure GitLab Issues integration" },
        { value: "labels", label: "labels", description: "Configure triage label vocabulary" },
        { value: "domain", label: "domain", description: "Configure domain documentation layout" },
      ];
      const matches = targets.filter((t) => t.label.toLowerCase().startsWith(lower));
      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "to-spec",
    description: "Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.",
    bodyPath: "commands/to-spec.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const root = findRepoRoot();
      const dirs = [
        join(root, ".scratch", "specs"),
        join(root, "docs", "specs"),
      ];
      const files: string[] = [];

      for (const dir of dirs) {
        const collect = (currentDir: string) => {
          try {
            const entries = readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(currentDir, entry.name);
              if (entry.isDirectory()) {
                collect(fullPath);
              } else if (entry.isFile() && entry.name.endsWith(".md")) {
                files.push(relative(root, fullPath));
              }
            }
          } catch {
            // ignore missing dirs
          }
        };
        collect(dir);
      }

      const scratchDir = join(root, ".scratch");
      if (existsSync(scratchDir)) {
        try {
          const entries = readdirSync(scratchDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== "specs" && !entry.name.startsWith(".")) {
              const specFile = join(scratchDir, entry.name, "spec.md");
              if (existsSync(specFile)) {
                files.push(relative(root, specFile));
              }
            }
          }
        } catch {
          // ignore
        }
      }

      files.sort();

      const lower = argumentPrefix.toLowerCase();
      const matches = files
        .filter(
          (file) =>
            file.toLowerCase().startsWith(lower) ||
            file.toLowerCase().includes(lower) ||
            basename(file).toLowerCase().startsWith(lower),
        )
        .map((file) => ({
          value: file,
          label: file,
          description: "Feature spec path",
        }));

      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "to-tickets",
    description:
      "Break a plan, spec, or conversation into a set of tracer-bullet tickets ([spec.md]), each declaring its blocking edges, published to the configured tracker.",
    bodyPath: "commands/to-tickets.md",
    customType: "ticket-breakdown",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const root = findRepoRoot();
      const dirs = [
        join(root, ".scratch", "specs"),
        join(root, "docs", "specs"),
      ];
      const files: string[] = [];

      for (const dir of dirs) {
        const collect = (currentDir: string) => {
          try {
            const entries = readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(currentDir, entry.name);
              if (entry.isDirectory()) {
                collect(fullPath);
              } else if (entry.isFile() && entry.name.endsWith(".md")) {
                files.push(relative(root, fullPath));
              }
            }
          } catch {
            // ignore missing dirs
          }
        };
        collect(dir);
      }

      files.sort();

      const lower = argumentPrefix.toLowerCase();
      const matches = files
        .filter(
          (file) =>
            file.toLowerCase().startsWith(lower) ||
            basename(file).toLowerCase().startsWith(lower),
        )
        .map((file) => ({
          value: file,
          label: file,
          description: "Spec markdown file",
        }));

      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "implement",
    description: "Build the work described by a spec or set of tickets, driving tdd at pre-agreed seams and closing out with code-review before committing.",
    bodyPath: "commands/implement.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const root = findRepoRoot();
      const files: string[] = [];

      const collectMdFiles = (currentDir: string) => {
        try {
          const entries = readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name.startsWith(".")) continue;
              collectMdFiles(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
              files.push(relative(root, fullPath));
            }
          }
        } catch {
          // ignore missing dirs
        }
      };

      const scratchDir = join(root, ".scratch");
      const docsSpecsDir = join(root, "docs", "specs");

      if (existsSync(scratchDir)) collectMdFiles(scratchDir);
      if (existsSync(docsSpecsDir)) collectMdFiles(docsSpecsDir);

      const uniqueFiles = Array.from(new Set(files)).sort();

      const lower = argumentPrefix.toLowerCase();
      const matches = uniqueFiles
        .filter(
          (file) =>
            file.toLowerCase().startsWith(lower) ||
            file.toLowerCase().includes(lower) ||
            basename(file).toLowerCase().startsWith(lower),
        )
        .map((file) => ({
          value: file,
          label: file,
          description: file.includes("/issues/") ? "Issue file path" : "Ticket / spec file path",
        }));

      return matches.length > 0 ? matches : null;
    },
  },
  {
    name: "wayfinder",
    description: "Plan a huge chunk of work — more than one session can hold — as a shared map of decision tickets on the issue tracker, and resolve them one at a time until the way is clear.",
    bodyPath: "commands/wayfinder.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      const lower = argumentPrefix.toLowerCase();
      const subcommands = [
        { value: "status", label: "status", description: "Show wayfinding map status and active frontier" },
        { value: "map", label: "map", description: "Display the decision map" },
        { value: "list", label: "list", description: "List decision tickets and questions" },
        { value: "resolve ", label: "resolve", description: "Resolve a decision ticket" },
      ];

      if (!argumentPrefix.includes(" ")) {
        const matches = subcommands.filter((sc) => sc.label.toLowerCase().startsWith(lower));
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "resolve") {
        const root = findRepoRoot();
        const scratchDir = join(root, ".scratch");
        const files: string[] = [];
        const collect = (currentDir: string) => {
          try {
            const entries = readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(currentDir, entry.name);
              if (entry.isDirectory()) {
                if (!entry.name.startsWith(".")) collect(fullPath);
              } else if (entry.isFile() && entry.name.endsWith(".md")) {
                files.push(relative(root, fullPath));
              }
            }
          } catch {
            // ignore
          }
        };
        if (existsSync(scratchDir)) collect(scratchDir);

        const matches = files
          .filter(
            (file) =>
              file.toLowerCase().includes(rest) ||
              basename(file).toLowerCase().startsWith(rest),
          )
          .map((file) => ({
            value: `resolve ${file}`,
            label: file,
            description: "Decision ticket file to resolve",
          }));
        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "omp-handoff",
    description: "Compact the current conversation into a handoff document for another agent to pick up.",
    bodyPath: "commands/handoff.md",
  },
  {
    name: "plugin-issue",
    description: "Report a bug or missing feature in this plugin as a GitHub issue on hae-banko/my-omp-skills. Auto-posts after a duplicate check.",
    bodyPath: "commands/plugin-issue/command.md",
  },
  {
    name: "reference",
    description:
      "Manage the repo's reference corpus at .omp/references/ — add <url> | update <name> | remove <name> | list. User-invoked: acquisition happens only when you type it.",
    bodyPath: "commands/reference.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      const lower = argumentPrefix.toLowerCase();
      const options = [
        { value: "add ", label: "add", description: "Add reference repository from <url>" },
        { value: "update ", label: "update", description: "Update reference repository by <name>" },
        { value: "remove ", label: "remove", description: "Remove reference repository by <name>" },
        { value: "list", label: "list", description: "List installed reference repositories" },
      ];

      if (!argumentPrefix.includes(" ")) {
        const matches = options.filter((o) => o.label.startsWith(lower));
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "update" || sub === "remove") {
        const root = findRepoRoot();
        const dir = join(root, ".omp", "references");
        let dirs: string[] = [];
        try {
          dirs = readdirSync(dir, { withFileTypes: true })
            .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
            .map((ent) => ent.name)
            .sort();
        } catch {
          return null;
        }
        const matches = dirs
          .filter((name) => name.toLowerCase().startsWith(rest))
          .map((name) => ({
            value: `${sub} ${name}`,
            label: name,
            description: sub === "update" ? "Update reference repository" : "Remove reference repository",
          }));
        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "routinize",
    description:
      "Routinize repeated ad-hoc work from the conversation into canonical, parameterized scripts under scripts/routines/ — /routinize [scan|run <id>|list]. Proposals first; you approve each write.",
    bodyPath: "commands/routinize/command.md",
    companions: [
      "commands/routinize/ROUTINIZE-BRIEF.md",
      "commands/routinize/ROUTINE-FORMAT.md",
    ],
    getArgumentCompletions: (argumentPrefix: string) => {
      const lower = argumentPrefix.toLowerCase();
      const options = [
        { value: "scan", label: "scan", description: "Scan conversation for repeated ad-hoc work to routinize" },
        { value: "run ", label: "run", description: "Execute a routine from scripts/routines/" },
        { value: "list", label: "list", description: "List available routines in scripts/routines/" },
      ];

      if (!argumentPrefix.includes(" ")) {
        const matches = options.filter((o) => o.label.startsWith(lower));
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "run") {
        const root = findRepoRoot();
        const routinesDir = join(root, "scripts", "routines");
        const idsSet = new Set<string>();

        const manifestPath = join(routinesDir, "manifest.json");
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath, "utf8");
            interface ManifestData { routines?: Array<{ id?: string; file?: string }>; }
            const parsed: ManifestData = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.routines)) {
              for (const r of parsed.routines) {
                if (r && typeof r.id === "string") {
                  idsSet.add(r.id);
                } else if (r && typeof r.file === "string") {
                  idsSet.add(r.file);
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        try {
          const entries = readdirSync(routinesDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".sh")) {
              const idWithoutExt = entry.name.slice(0, -3);
              idsSet.add(idWithoutExt);
              idsSet.add(entry.name);
            }
          }
        } catch {
          // ignore missing routines directory
        }

        const sortedIds = Array.from(idsSet).sort();
        const matches = sortedIds
          .filter((id) => id.toLowerCase().startsWith(rest))
          .map((id) => ({
            value: `run ${id}`,
            label: id,
            description: "Execute routine",
          }));

        return matches.length > 0 ? matches : null;
      }

      return null;
    },
  },
  {
    name: "hindsight",
    description:
      "Toggle the Hindsight pass: after each turn that did real work, one hidden reflection pass runs before the turn settles — the model reconsiders design-level changes with its own thinking in context. /hindsight on|off, or bare to toggle.",
    bodyPath: "commands/hindsight/command.md",
    customType: "hindsight",
    handler: (pi) => async (args, ctx) => {
      reloadHindsightConfig(); // edits to ~/.omp/hindsight.json apply on any invocation
      const arg = args.trim().toLowerCase();
      const on = isHindsightEnabled();
      // One-shot feedback: a toast with the configurable message plus the
      // receipt card in the transcript — both transient, nothing persistent
      // on screen. The state itself is just saved. No user message, so the
      // model never replies to a toggle.
      const report = (state: boolean) => {
        const { onMessage, offMessage } = hindsightToggleMessages();
        ctx.ui?.notify?.(state ? onMessage : offMessage, "info");
      };
      // Status: report the current state without toggling.
      if (arg === "status" || arg === "state") {
        pi.sendMessage(
          {
            customType: "hindsight",
            content: `hindsight ${on ? "on" : "off"}`,
            display: true,
            attribution: "user",
          },
          { deliverAs: "followUp" },
        );
        report(on);
        return;
      }
      const next = arg === "on" ? true : arg === "off" ? false : !on;
      setHindsightEnabled(next);
      pi.sendMessage(
        {
          customType: "hindsight",
          content: `hindsight ${next ? "on" : "off"}`,
          display: true,
          attribution: "user",
        },
        { deliverAs: "followUp" },
      );
      report(next);
    },
    // TUI options: typing "/hindsight" surfaces the live state as a dim
    // header before the subcommands, then "on"/"off"/"status" with the
    // state in their descriptions. The header has an empty value so it
    // doesn't replace the input when selected — it's a read-only hint,
    // matching the rest of the surfaces that show the state once.
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      const on = isHindsightEnabled();
      const state = on ? "on" : "off";
      const stateIcon = on ? "●" : "○";
      const header = {
        value: "",
        label: `${stateIcon}  Hindsight is currently ${state}`,
        description: on
          ? "reflection pass runs after each real-work turn"
          : "turns settle after the first pass",
      };
      const options = [
        { value: "on ", label: "on", description: `Enable the reflection pass (currently ${state})` },
        { value: "off ", label: "off", description: `Disable the reflection pass (currently ${state})` },
        { value: "status ", label: "status", description: `Show the current state (${state})` },
      ];
      const matches = options.filter((o) => o.label.startsWith(lower));
      // Only show the header when no subcommand is typed yet — once the
      // user starts narrowing, the header is noise.
      return lower === "" ? [header, ...matches] : matches.length > 0 ? matches : null;
    },
  },
  {
    name: "math",
    description:
      "Explain and demo native LaTeX math rendering — the TUI typesets $...$ inline and $$...$$ / \\[...\\] / \\begin{aligned} display math natively, always on (no toggle).",
    bodyPath: "commands/math/command.md",
  },
  {
    name: "record",
    description:
      "Record a durable finding (lesson, audit, or note) into the repo's local knowledge base at .omp/knowledge/ [<finding> | --recent].",
    bodyPath: "commands/record/command.md",
    companions: ["commands/record/RECORD-FORMAT.md"],
    customType: "knowledge-record",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      if ("--recent".startsWith(lower)) {
        return [
          {
            value: "--recent",
            label: "--recent",
            description: "List recent record entries",
          },
        ];
      }
      return null;
    },
  },
  {
    name: "pitfall",
    description:
      "Something just went wrong — instantly capture the pitfall into the repo's knowledge base (.omp/knowledge/) [<pitfall> | --recent].",
    bodyPath: "commands/pitfall/command.md",
    companions: ["commands/record/RECORD-FORMAT.md"],
    customType: "knowledge-pitfall",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      if ("--recent".startsWith(lower)) {
        return [
          {
            value: "--recent",
            label: "--recent",
            description: "List recent pitfall entries",
          },
        ];
      }
      return null;
    },
  },
  {
    name: "teach",
    description: "Teach the user a new skill or concept over multiple sessions, using the current directory as a stateful teaching workspace.",
    bodyPath: "commands/teach/command.md",
    companions: [
      "commands/teach/MISSION-FORMAT.md",
      "commands/teach/RESOURCES-FORMAT.md",
      "commands/teach/LEARNING-RECORD-FORMAT.md",
      "commands/teach/GLOSSARY-FORMAT.md",
    ],
  },
  {
    name: "writing-great-skills",
    description: "Reference for writing and editing skills well — the vocabulary and principles that make a skill predictable.",
    bodyPath: "commands/writing-great-skills/command.md",
    companions: ["commands/writing-great-skills/GLOSSARY.md"],
  },
];

function loadBody(rel: string): string {
  const raw = readFileSync(join(ROOT, rel), "utf8");
  return raw.replace(FRONTMATTER_RE, "").trim();
}
/**
 * Default body-send + user-prompt flow shared by every command that doesn't
 * override `spec.handler`. Substitutes $ARGUMENTS, appends the user's args
 * and a companion-pointer list, emits the hidden workflow body, queues the
 * user prompt, and (for commands with a customType) appends a follow-up
 * receipt card.
 */
async function runDefaultHandler(args: {
  pi: ExtensionApi;
  name: string;
  customType: string | undefined;
  body: string;
  args: string;
  companionPaths: string[];
  ctx: CommandContext;
}): Promise<void> {
  const { pi, name, customType, body, args: rawArgs, companionPaths, ctx } = args;
  const argText = rawArgs.trim();
  let text = body;
  if (argText) {
    text = text.replace(ARGUMENTS_RE, argText);
    text += `\n\n## User's arguments\n${argText}`;
  } else {
    text = text.replace(ARGUMENTS_RE, "");
  }
  if (companionPaths.length > 0) {
    text += `\n\n## Companion reference files\nRead these files when the workflow refers to them:\n${companionPaths.join(
      "\n",
    )}`;
  }
  pi.sendMessage({
    customType: customType ?? `command:${name}`,
    content: text,
    display: false,
    attribution: "user",
  });
  const userPrompt = `/${name}${argText ? ` ${argText}` : ""}`;
  await pi.sendUserMessage(userPrompt);
  if (customType) {
    pi.sendMessage(
      {
        customType,
        content: `${name} requested${argText ? ` — ${argText}` : ""}`,
        display: true,
        attribution: "user",
      },
      { deliverAs: "followUp" },
    );
  }
  ctx.ui?.notify?.(`Running ${name}`, "info");
}

export default function (pi: ExtensionApi): void {
  installBootstrap(
    pi,
    COMMANDS.map((spec) => ({ name: spec.name, description: spec.description })),
  );
  installPolicy(pi);
  installKnowledgeTool(pi);
  installHindsight(pi);
  installHerdrTools(pi);
  installRoutinesTool(pi);
  installResearchReviewCardRenderer(pi);
  installResearchWaveProgressRenderer(pi);
  installResearchReportPreviewRenderer(pi);
  installResearchDashboardRenderer(pi);
  installAuditCardRenderer(pi);
  installTicketBreakdownRenderer(pi);
  installTriageStatusRenderer(pi);
  for (const spec of COMMANDS) {
    const body = loadBody(spec.bodyPath);
    const companionPaths = (spec.companions ?? []).map((p) => join(ROOT, p));

    pi.registerCommand(spec.name, {
      description: spec.description,
      getArgumentCompletions: spec.getArgumentCompletions,
      handler: async (args: string, ctx: CommandContext) => {
        if (spec.handler) {
          await spec.handler(pi, { body, companionPaths })(args, ctx);
          return;
        }
        await runDefaultHandler({
          pi,
          name: spec.name,
          customType: spec.customType,
          body,
          args,
          companionPaths,
          ctx,
        });
      },
    });
  }
}
