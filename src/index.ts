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
import { basename, dirname, join } from "node:path";
import type { CommandContext, ExtensionApi } from "./core/api.ts";
import { installBootstrap } from "./core/bootstrap.ts";
import { installClarify, isClarifyDebugEnabled, isClarifyEnabled, toggleClarifyState } from "./features/clarify.ts";
import { installHerdrTools } from "./features/herdr-tools.ts";
import {
  installHindsight,
  isHindsightEnabled,
  reloadHindsightConfig,
  setHindsightEnabled,
  hindsightToggleMessages,
} from "./features/hindsight.ts";
import { installKnowledgeTool } from "./knowledge/knowledge-tool.ts";
import {
  findFrontierTicket,
  findRepoRoot,
  listArchivedResearchProjects,
  listAuditSlugs,
  listFeatureSpecs,
  listReferences,
  listResearchProjects,
  listRoutines,
  listScratchMarkdown,
  listSpecFiles,
  resolveResearchProjectDir,
} from "./core/locators.ts";
import {
  completeStrings,
  createSubcommandCompleter,
  filterCompletions,
  type CompletionOption,
} from "./core/completions.ts";
import { installPolicy } from "./knowledge/policy.ts";
import { installReferenceResultRenderer, runReferenceCommand } from "./features/references.ts";
import { runRecentCommand } from "./features/recent-command.ts";
import { installTimelineRenderer, runTimelineCommand } from "./features/timeline.ts";
import { installTilt, runTiltCommand } from "./features/tilt.ts";
import {
  archiveResearchProject,
  getResearchDashboardMetrics,
  getResearchReviewPayload,
  listResearchSummaries,
  readProject,
  removeResearchProject,
  unarchiveResearchProject,
} from "./research/research-store.ts";
import { installKbIngestStatus } from "./knowledge/kb-ingest-status.ts";
import { installKbIndexInjector } from "./knowledge/kb-index-injector.ts";
import { installRoutinesTool } from "./features/routines.ts";
import {
  installResearchDashboardRenderer,
  installResearchErrorRenderer,
  installResearchHelpRenderer,
  installResearchReportPreviewRenderer,
  installResearchReviewCardRenderer,
  installResearchWaveProgressRenderer,
  type ResearchDashboardPayload,
  type ResearchErrorPayload,
  type ResearchFieldSpec,
  type ResearchHelpPayload,
  type ResearchItemSpec,
  type ResearchReviewPayload,
} from "./research/research-renderer.ts";
import { EXPECTED_INTERVAL_SECONDS, freshnessOf } from "./research/research-freshness.ts";
import { derivePipelineStatus, phaseOf } from "./research/research-status.ts";
import {
  installAuditCardRenderer,
  installTicketBreakdownRenderer,
  installTriageStatusRenderer,
  type AuditCardPayload,
  type AuditSubtopicSpec,
  type TriageStatusPayload,
} from "./features/telemetry-renderer.ts";
const ROOT = join(import.meta.dirname, "..");
const FRONTMATTER_RE = /^---[\s\S]*?\n---\s*/;
const ARGUMENTS_RE = /\$ARGUMENTS/g;

/** Single source of truth for /research subcommands (completions + help card). */
const RESEARCH_SUBCOMMANDS: Array<{ value: string; label: string; description: string }> = [
  { value: "1", label: "1", description: "Plan research: scaffold outline topics, comparison dimensions & dependencies" },
  { value: "2", label: "2", description: "Execute research: run parallel background search waves (alias for /research-deep)" },
  { value: "3", label: "3", description: "Compile report: synthesize findings into comparative markdown (alias for /research-report)" },
  { value: "dashboard", label: "dashboard", description: "Display lifecycle dashboard card (--compact for 4-line summary, --full for tables)" },
  { value: "review", label: "review", description: "Inspect and edit research outline & field definitions" },
  { value: "add-items", label: "add-items", description: "Add research items/topics to an existing outline.yaml" },
  { value: "add-fields", label: "add-fields", description: "Add comparison field dimensions to an existing fields.yaml" },
  { value: "status", label: "status", description: "Quick status check via floating toast popup (use --bar for footer, --card for chat)" },
  { value: "run", label: "run", description: "Execute parallel web research waves (alias for /research 2)" },
  { value: "list", label: "list", description: "List all active research projects (use --archived for archive)" },
  { value: "archive", label: "archive", description: "Move project to .archive/ (hides from active lists while preserving data)" },
  { value: "unarchive", label: "unarchive", description: "Restore an archived research project back to active research" },
  { value: "remove", label: "remove", description: "Permanently delete a research project directory from disk" },
  { value: "help", label: "help", description: "Display command reference, shortcuts, and recommended next steps" },
  { value: "envcheck", label: "envcheck", description: "Run terminal environment diagnostics for research cards" },
  { value: "off", label: "off", description: "Close the Research Review window" },
];

// findRepoRoot is imported from ./core/locators.ts

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
      if (!matchedDir && !auditSlug && entries.length > 0) {
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

  const notFound = auditSlug.length > 0;
  return {
    title: notFound ? `Audit not found: ${auditSlug}` : "Codebase Audit",
    slug: auditSlug || "overview",
    version: "v0.1.0",
    status: notFound ? "missing" : "active",
    root_report_path: auditSlug ? `.omp/audits/${auditSlug}/overview.md` : ".omp/audits/overview.md",
    subtopics_count: 0,
    latest_revision: "v0.1.0",
    not_found: notFound,
  } as AuditCardPayload & { not_found?: boolean };
}

function getTriageStatusPayload(root: string): TriageStatusPayload {
  const scratchDirs = [join(root, ".omp", "scratch"), join(root, ".scratch")];
  let unlabeled = 0;
  let needsTriage = 0;
  let agentReady = 0;

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

  for (const scratchDir of scratchDirs) {
    if (existsSync(scratchDir)) {
      collect(scratchDir);
    }
  }

  const uniqueFiles = Array.from(new Set(mdFiles));

  for (const file of uniqueFiles) {
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
  const root = findRepoRoot() ?? process.cwd();
  const { dirs, files } = listFeatureSpecs(root);
  const options: CompletionOption[] = [
    ...dirs.map((dir) => ({
      value: dir.name,
      label: dir.name,
      description: `Feature directory under ${dir.relBase}/`,
    })),
    ...files.map((file) => ({
      value: file,
      label: file,
      description: "Spec markdown file",
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const filtered = filterCompletions(options, argumentPrefix);
  return filtered.length > 0 ? filtered : null;
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
    description: "Create a structured research plan (scaffold outline topics, comparison dimensions & dependencies). Follow with /research-deep and /research-report.",
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

      if (head === "status") {
        if (rest.trim() === "off" || rest.includes("--bar off")) {
          ctx.ui?.setStatus?.("research", undefined);
          ctx.ui?.notify?.("Research status bar cleared", "info");
          return;
        }

        const root = findRepoRoot();
        const cleanRest = rest.replace(/\s+--(bar|card|full|compact)\b/g, "").trim();
        const { slug, notFound, payload } = readProject(root, cleanRest);
        if (notFound) {
          ctx.ui?.notify?.(`Research project slug not found: ${slug}`, "warning");
          return;
        }

        const statusWord = typeof payload.status === "string" ? payload.status : `Phase ${payload.current_phase ?? 1}`;
        const m = payload.global_metrics ?? {};

        if (/\s*--bar\b/.test(rest)) {
          ctx.ui?.setStatus?.("research", `Research: ${slug} [${statusWord}] ${m.completed_items ?? 0}/${m.total_items ?? 0}`);
          ctx.ui?.notify?.(`Research status bar enabled for ${slug}`, "info");
          return;
        }

        if (/\s*--card\b/.test(rest)) {
          pi.sendMessage({
            customType: "research-dashboard",
            display: true,
            attribution: "user",
            content: `Research dashboard — ${slug}: ${statusWord} · items ${m.completed_items ?? 0}/${m.total_items ?? 0} · fields ${m.completed_fields ?? 0}/${m.total_fields ?? 0}`,
            details: { ...payload, detail: "compact" },
          });
          return;
        }

        // Default /research status: Zero-scrollback floating toast popup notification
        const nextCmd = payload.next_step_command ?? payload.recommended_next_step ?? "ready";
        const toastMsg = `${slug}: [${statusWord}] · items ${m.completed_items ?? 0}/${m.total_items ?? 0} · fields ${m.completed_fields ?? 0}/${m.total_fields ?? 0} · next: ${nextCmd}`;
        ctx.ui?.notify?.(toastMsg, "info");
        return;
      }

      if (head === "dashboard") {
        const root = findRepoRoot();
        const cleanRest = rest.replace(/\s+--(full|compact)\b/g, "").trim();
        const { slug, notFound, payload } = readProject(root, cleanRest);
        if (notFound) {
          ctx.ui?.notify?.(`Research project slug not found: ${slug}`, "warning");
          pi.sendMessage({
            customType: "my-omp-research-error",
            display: true,
            attribution: "user",
            content: `Research error — project "${slug}" not found`,
            details: {
              slug,
              code: "PROJECT_NOT_FOUND",
              message: `Project "${slug}" not found under .omp/knowledge/research/`,
              hint: "Run '/research status' to list projects, or '/research <topic>' to create one.",
            } satisfies ResearchErrorPayload,
          });
          return;
        }
        const full = /\s--full\b/.test(rest);
        const statusWord = typeof payload.status === "string" ? payload.status : `Phase ${payload.current_phase ?? 1}`;
        const m = payload.global_metrics ?? {};
        const reportReady =
          payload.artifacts && typeof payload.artifacts === "object" && !Array.isArray(payload.artifacts)
            ? payload.artifacts.report_md
              ? "generated"
              : "pending"
            : "pending";
        pi.sendMessage({
          customType: "research-dashboard",
          display: true,
          attribution: "user",
          content: `Research dashboard — ${slug}: ${statusWord} · items ${m.completed_items ?? 0}/${m.total_items ?? 0} · fields ${m.completed_fields ?? 0}/${m.total_fields ?? 0} · report ${reportReady}`,
          details: full ? { ...payload, detail: "full" } : { ...payload, detail: "compact" },
        });
        ctx.ui?.notify?.("Research Dashboard loaded", "info");
        return;
      }

      if (head === "archive") {
        const root = findRepoRoot();
        const result = archiveResearchProject(root, rest);
        if (!result.ok) {
          ctx.ui?.notify?.(result.error ?? "Failed to archive project", "warning");
          return;
        }
        ctx.ui?.notify?.(`Archived research project ${result.slug}`, "info");
        return;
      }

      if (head === "unarchive") {
        const root = findRepoRoot();
        const result = unarchiveResearchProject(root, rest);
        if (!result.ok) {
          ctx.ui?.notify?.(result.error ?? "Failed to unarchive project", "warning");
          return;
        }
        ctx.ui?.notify?.(`Restored research project ${result.slug}`, "info");
        return;
      }

      if (head === "remove" || head === "delete") {
        const root = findRepoRoot();
        const result = removeResearchProject(root, rest);
        if (!result.ok) {
          ctx.ui?.notify?.(result.error ?? "Failed to remove project", "warning");
          return;
        }
        ctx.ui?.notify?.(`Removed research project ${result.slug}`, "info");
        return;
      }

      if (head === "list") {
        const root = findRepoRoot();
        const isArchived = rest.includes("--archived") || rest.includes("-a");
        const summaries = listResearchSummaries(root, isArchived);
        if (summaries.length === 0) {
          const msg = isArchived ? "No archived research projects found in .archive/" : "No active research projects found";
          ctx.ui?.notify?.(msg, "info");
          return;
        }
        const lines = summaries.map(
          (s) => `• ${s.slug} [${s.status}] (${s.completedItems}/${s.totalItems} items) — ${s.topic}`,
        );
        pi.sendMessage({
          customType: "research-dashboard",
          display: true,
          attribution: "user",
          content: `${isArchived ? "Archived" : "Active"} research projects:\n${lines.join("\n")}`,
          details: {
            slug: isArchived ? "Archived Projects" : "Active Projects",
            status: isArchived ? "ARCHIVE" : "PROJECTS",
            topic: `${summaries.length} ${isArchived ? "archived" : "active"} project(s)`,
            next_step_command: isArchived ? "/research unarchive <slug>" : "/research <slug>",
            global_metrics: {
              total_items: summaries.reduce((acc, s) => acc + s.totalItems, 0),
              completed_items: summaries.reduce((acc, s) => acc + s.completedItems, 0),
            },
            detail: "compact",
          },
        });
        ctx.ui?.notify?.(`Found ${summaries.length} ${isArchived ? "archived" : "active"} research project(s)`, "info");
        return;
      }

      if (head === "review") {
        const root = findRepoRoot();
        const cleanRest = rest.replace(/\s+--(full|compact)\b/g, "").trim();
        const { slug, projectDir, notFound } = resolveResearchProjectDir(root, cleanRest);
        if (notFound) {
          ctx.ui?.notify?.(`Research project slug not found: ${slug}`, "warning");
          pi.sendMessage({
            customType: "my-omp-research-error",
            display: true,
            attribution: "user",
            content: `Research error — project "${slug}" not found`,
            details: {
              slug,
              code: "PROJECT_NOT_FOUND",
              message: `Project "${slug}" not found under .omp/knowledge/research/`,
              hint: "Run '/research status' to list projects, or '/research <topic>' to create one.",
            } satisfies ResearchErrorPayload,
          });
          return;
        }
        const full = /\s--full\b/.test(rest);
        const payload = getResearchReviewPayload(projectDir, slug);
        pi.sendMessage({
          customType: "research-review",
          display: true,
          attribution: "user",
          content: `Research review — ${slug}: ${payload.items?.length ?? 0} items · ${payload.fields?.length ?? 0} fields · ${payload.status ?? "DRAFT REVIEW"}`,
          details: full ? { ...payload, detail: "full" } : payload,
        });
        ctx.ui?.notify?.("Research Review Window loaded", "info");
        return;
      }

      if (head === "help" || head === "envcheck") {
        const root = findRepoRoot();
        const cleanRest = rest.replace(/\s+--\w+\b/g, "").trim();
        const { slug, projectDir } = resolveResearchProjectDir(root, cleanRest);
        const dash = projectDir ? getResearchDashboardMetrics(projectDir, slug) : undefined;
        const helpPayload: ResearchHelpPayload = {
          slug: slug === "unknown" ? "research" : slug,
          phase: dash?.current_phase,
          status: dash?.status,
          next_step: dash?.next_step_command,
          commands: RESEARCH_SUBCOMMANDS.map((sc) => ({
            command: `/research ${sc.value}`,
            description: sc.description,
          })),
          shortcuts: [{ key: "F1", description: "Open this research help card (when the extension registers it)" }],
        };
        if (head === "envcheck") {
          helpPayload.env = {
            TERM: process.env.TERM ?? "",
            COLORTERM: process.env.COLORTERM ?? "",
            NO_COLOR: process.env.NO_COLOR ?? "",
            CI: process.env.CI ?? "",
          };
        }
        pi.sendMessage({
          customType: "my-omp-research-help",
          display: true,
          attribution: "user",
          content: `${head === "envcheck" ? "Research environment diagnostics" : "Research help"} — ${slug}`,
          details: helpPayload,
        });
        ctx.ui?.notify?.(
          head === "envcheck" ? "Research environment diagnostics loaded" : "Research Help loaded",
          "info",
        );
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
      const subcommands = RESEARCH_SUBCOMMANDS;

      const lower = argumentPrefix.toLowerCase();
      if (!argumentPrefix.includes(" ")) {
        const matches = subcommands.filter(
          (sc) => sc.label.toLowerCase().startsWith(lower) || sc.value.toLowerCase().startsWith(lower),
        );
        if (argumentPrefix === "") {
          const root = findRepoRoot();
          const { slug, notFound, payload } = readProject(root, "");
          const header = !notFound
            ? (() => {
                const status = payload.status ?? "DRAFT";
                const m = payload.global_metrics ?? {};
                return {
                  value: "",
                  label: "● Active research: " + slug + " (" + status + ")",
                  description:
                    "Phase " +
                    (payload.current_phase ?? 1) +
                    " · items " +
                    (m.completed_items ?? 0) +
                    "/" +
                    (m.total_items ?? 0),
                };
              })()
            : {
                value: "",
                label: "○ No research projects in .omp/knowledge/research/",
                description: "Use /research <topic> to start phase 1",
              };
          return [header, ...matches];
        }
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const firstWord = lower.slice(0, spaceIdx);
      const activeSlugSubcommands = ["2", "3", "dashboard", "review", "add-items", "add-fields", "status", "run", "help", "archive", "remove", "delete"];
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (activeSlugSubcommands.includes(firstWord)) {
        const slugs = listResearchProjects(findRepoRoot());
        const matches = slugs
          .filter((slug) => slug.toLowerCase().startsWith(rest))
          .map((slug) => ({
            value: `${firstWord} ${slug}`,
            label: slug,
            description: "Active research project",
          }));
        return matches.length > 0 ? matches : null;
      }

      if (firstWord === "unarchive") {
        const slugs = listArchivedResearchProjects(findRepoRoot());
        const matches = slugs
          .filter((slug) => slug.toLowerCase().startsWith(rest))
          .map((slug) => ({
            value: `unarchive ${slug}`,
            label: slug,
            description: "Archived research project",
          }));
        return matches.length > 0 ? matches : null;
      }

      if (firstWord === "list") {
        if ("--archived".startsWith(rest)) {
          return [{ value: "list --archived", label: "--archived", description: "List archived research projects in .archive/" }];
        }
      }
      return null;
    },
  },
  {
    name: "research-add-items",
    description: "Add research items/topics to an existing outline.yaml.",
    bodyPath: "commands/research-add-items/command.md",
    companions: ["commands/research/WEB-SEARCH-AGENT.md"],
  },
  {
    name: "research-add-fields",
    description: "Add comparison field dimensions to an existing fields.yaml.",
    bodyPath: "commands/research-add-fields/command.md",
    companions: ["commands/research/WEB-SEARCH-AGENT.md"],
  },
  {
    name: "research-deep",
    description:
      "Execute parallel web research waves: investigate outline items with background agents, outputting verified JSON per item.",
    bodyPath: "commands/research-deep/command.md",
    companions: RESEARCH_ASSETS,
    getArgumentCompletions: (argumentPrefix: string) => {
      const presets = [
        { value: "small", label: "small", description: "Execution preset: 1-2 parallel agents per wave" },
        { value: "medium", label: "medium", description: "Execution preset: 3-5 parallel agents per wave" },
        { value: "high", label: "high", description: "Execution preset: max parallel agents per wave" },
      ];

      const lower = argumentPrefix.toLowerCase();
      if (!argumentPrefix.includes(" ")) {
        const slugs = listResearchProjects(findRepoRoot());
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
        const slugs = listResearchProjects(findRepoRoot());
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
      "Compile deep research into a markdown report with comparative tradeoff tables, execution provenance & source links.",
    bodyPath: "commands/research-report/command.md",
    companions: ["commands/research-report/generate_report.py"],
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const slugs = listResearchProjects(findRepoRoot());

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
        const isNotFound =
          payload && typeof payload === "object"
            ? Boolean(("not_found" in payload && payload.not_found) || ("notFound" in payload && payload.notFound))
            : false;
        if (targetSlug && isNotFound) {
          ctx.ui?.notify?.(`Audit report slug not found: ${targetSlug}`, "warning");
          return;
        }
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
      const audits = listAuditSlugs(root);
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
        const slugOptions = audits.map((slug) => ({
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
        if (argumentPrefix === "") {
          const header =
            audits.length > 0
              ? {
                  value: "",
                  label:
                    "● Audits: " +
                    audits.length +
                    " reports (" +
                    audits.slice(0, 3).join(", ") +
                    (audits.length > 3 ? "..." : "") +
                    ")",
                  description: "Audit reports in .omp/audits/",
                }
              : {
                  value: "",
                  label: "○ No audit reports in .omp/audits/",
                  description: "Use /audit to start an audit",
                };
          return [header, ...matches];
        }
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (["view", "subtopics", "status", "--version"].includes(sub)) {
        const matches = audits
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
    description: "Configure this repo for the workflow commands — issue tracker (local .omp/scratch by default), triage label vocabulary (.omp/agents/), and domain doc layout. Run once per repo.",
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
        { value: "local", label: "local", description: "Configure local Markdown issue tracker (.omp/scratch/)" },
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
      const files = listSpecFiles(findRepoRoot());

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
      const files = listSpecFiles(findRepoRoot());

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
      const uniqueFiles = listScratchMarkdown(root, [join(root, "docs", "specs")]);

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
        if (argumentPrefix === "") {
          const root = findRepoRoot();
          const ticket = findFrontierTicket(root);
          const header = ticket
            ? {
                value: "",
                label: "● Active frontier: " + ticket.feature + " / " + ticket.title,
                description: ticket.file,
              }
            : {
                value: "",
                label: "○ No active frontier ticket",
                description: "Use /wayfinder status or /wayfinder resolve to update",
              };
          return [header, ...matches];
        }
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "resolve") {
        const files = listScratchMarkdown(findRepoRoot());

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
    // /reference is a LOCAL, deterministic command: the handler runs git
    // itself (clone/pull/delete), emits a card + toasts, and never queues a
    // user message — zero agent turns. Root resolution honors the test-only
    // MY_OMP_SKILLS_TEST_ROOT override so the selftest can drive the write
    // paths against a fixture instead of the real corpus (same pattern as
    // the injectable clock in research-freshness.ts).
    handler: (pi) => async (args, ctx) => {
      const override = process.env.MY_OMP_SKILLS_TEST_ROOT;
      const root = override && override.trim() ? override.trim() : findRepoRoot();
      await runReferenceCommand(pi, root, args, ctx);
    },
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
        if (argumentPrefix === "") {
          const root = findRepoRoot();
          const refs = listReferences(root);
          const header =
            refs.length > 0
              ? {
                  value: "",
                  label:
                    "● References: " +
                    refs.length +
                    " installed (" +
                    refs.slice(0, 3).join(", ") +
                    (refs.length > 3 ? "..." : "") +
                    ")",
                  description: "Local reference corpus in .omp/references/",
                }
              : {
                  value: "",
                  label: "○ No reference repositories installed",
                  description: "Use /reference add <url> to clone",
                };
          return [header, ...matches];
        }
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "add") {
        const root = findRepoRoot();
        const projectSlugs = listResearchProjects(root);
        const discovered: Array<{ url: string; name: string; projectSlug: string }> = [];
        for (const pSlug of projectSlugs.slice(0, 5)) {
          const pRead = readProject(root, pSlug);
          if (!pRead.notFound && pRead.payload.discovered_references) {
            for (const ref of pRead.payload.discovered_references) {
              if (!discovered.some((d) => d.url === ref.url)) {
                discovered.push({ url: ref.url, name: ref.name, projectSlug: pSlug });
              }
            }
          }
        }

        const matches = discovered
          .filter((d) => d.url.toLowerCase().includes(rest) || d.name.toLowerCase().includes(rest))
          .map((d) => ({
            value: `add ${d.url}`,
            label: `add ${d.url}`,
            description: `Discovered in research: ${d.projectSlug}`,
          }));
        return matches.length > 0 ? matches : null;
      }

      if (sub === "update" || sub === "remove") {
        const dirs = listReferences(findRepoRoot());
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
        if (argumentPrefix === "") {
          const root = findRepoRoot();
          const routines = listRoutines(root);
          const header =
            routines.length > 0
              ? {
                  value: "",
                  label:
                    "● Routines: " +
                    routines.length +
                    " available (" +
                    routines.slice(0, 3).join(", ") +
                    (routines.length > 3 ? "..." : "") +
                    ")",
                  description: "Programmatic scripts in scripts/routines/",
                }
              : {
                  value: "",
                  label: "○ No routines in scripts/routines/",
                  description: "Use /routinize scan to propose new routines",
                };
          return [header, ...matches];
        }
        return matches.length > 0 ? matches : null;
      }

      const spaceIdx = argumentPrefix.indexOf(" ");
      const sub = lower.slice(0, spaceIdx);
      const rest = lower.slice(spaceIdx + 1).trimStart();

      if (sub === "run") {
        const sortedIds = listRoutines(findRepoRoot());
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
    handler: (pi, { body, companionPaths }) => async (args, ctx) => {
      // --recent bypass: read + emit card in TS, no LLM turn.
      const root = process.cwd();
      const r = await runRecentCommand({ kind: "record", rawArgs: args, root, pi, ctx });
      if (r.handled) return;
      // Free-text finding: fall through to the default body-send flow.
      await runDefaultHandler({
        pi,
        name: "record",
        customType: "knowledge-record",
        body,
        args,
        companionPaths,
        ctx,
      });
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
    handler: (pi, { body, companionPaths }) => async (args, ctx) => {
      // --recent bypass: read + emit card in TS, no LLM turn.
      const root = process.cwd();
      const r = await runRecentCommand({ kind: "pitfall", rawArgs: args, root, pi, ctx });
      if (r.handled) return;
      // Free-text pitfall: fall through to the default body-send flow.
      await runDefaultHandler({
        pi,
        name: "pitfall",
        customType: "knowledge-pitfall",
        body,
        args,
        companionPaths,
        ctx,
      });
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
  {
    name: "clarify",
    description: "Toggle prompt clarification on/off (/clarify on|off|debug|status)",
    bodyPath: "commands/clarify.md",
    // TUI options: typing "/clarify" surfaces the live state as a dim
    // header before the subcommands, then "on"/"off"/"debug"/"status" with
    // the state in their descriptions. The header has an empty value so it
    // doesn't replace the input when selected — it's a read-only hint,
    // matching the rest of the surfaces that show the state once. Values
    // carry a trailing space so tab-completion advances the cursor past it,
    // ready for the next argument (mirrors /hindsight, /routinize run, etc.).
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      const on = isClarifyEnabled();
      const debug = isClarifyDebugEnabled();
      const state = on ? "on" : "off";
      const debugState = debug ? "on" : "off";
      const stateIcon = on ? "●" : "○";
      const header = {
        value: "",
        label: `${stateIcon}  Clarify is currently ${state} (debug: ${debugState})`,
        description: on
          ? "vague prompts are clarified before they reach the agent"
          : "turns settle without a clarification step",
      };
      const options = [
        { value: "on ", label: "on", description: `Enable prompt clarification (currently ${state})` },
        { value: "off ", label: "off", description: `Disable prompt clarification (currently ${state})` },
        { value: "debug ", label: "debug", description: `Toggle prompt clarification debug mode (currently ${debugState})` },
        { value: "status ", label: "status", description: `Show current clarification (${state}) and debug mode (${debugState}) status` },
      ];
      const matches = options.filter((o) => o.label.startsWith(lower));
      // Only show the header when no subcommand is typed yet — once the
      // user starts narrowing, the header is noise.
      return lower === "" ? [header, ...matches] : matches.length > 0 ? matches : null;
    },
    handler: (_pi) => async (args: string, ctx: CommandContext) => {
      toggleClarifyState(args, ctx);
    },
  },
  {
    name: "timeline",
    description: "Generate a unified project history & progress digest — /timeline [limit]. User-invoked: local, zero-agent execution.",
    bodyPath: "commands/timeline.md",
    handler: (pi) => async (args: string, ctx: CommandContext) => {
      const override = process.env.MY_OMP_SKILLS_TEST_ROOT;
      const root = override && override.trim() ? override.trim() : findRepoRoot();
      await runTimelineCommand(pi, root, args, ctx);
    },
  },
  {
    name: "tilt",
    description: "Inspect user tilt level, swear jar balance, and rage leaderboard — /tilt [reset|clear-all]. User-invoked: local, zero-agent execution.",
    bodyPath: "commands/tilt.md",
    getArgumentCompletions: (argumentPrefix: string) => {
      const options = [
        { value: "reset", label: "reset", description: "Reset session strikes to 0 (DEFCON 5)" },
        { value: "clear-all", label: "clear-all", description: "Clear all local project tilt data" },
      ];
      const lower = argumentPrefix.toLowerCase().trim();
      if (!lower) return options;
      return options.filter((o) => o.value.startsWith(lower));
    },
    handler: (pi) => async (args: string, ctx: CommandContext) => {
      const override = process.env.MY_OMP_SKILLS_TEST_ROOT;
      const root = override && override.trim() ? override.trim() : findRepoRoot();
      await runTiltCommand(pi, root, args, ctx);
    },
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
  // installBootstrap MUST register last for `session_start`/`agent_end`/
  // `session_compact`/`context` because the selftest mock stores handlers
  // in a single slot per event (last writer wins). Bootstrap's handlers
  // are the ones tested via `handlers[...]` directly; running it last
  // preserves its behavior under the test mock. In production the omp
  // runtime fans out registrations, so this ordering is harmless.
  // kb-ingest-status registers `tool_call`; installPolicy registers
  // `tool_call` too. The selftest mock stores ONE handler per event slot
  // (last writer wins), so installPolicy must be the last writer for
  // `tool_call` — policy's blocks are the ones the existing test surface
  // inspects. ingest tests run against a separate mock (same pattern as
  // kb-guard-status). In production the omp runtime fans out handlers,
  // so this ordering is harmless.
  installKbIngestStatus(pi);
  installKbIndexInjector(pi);
  installPolicy(pi);
  installKnowledgeTool(pi);
  installClarify(pi);
  installHindsight(pi);
  installHerdrTools(pi);
  installRoutinesTool(pi);
  installResearchReviewCardRenderer(pi);
  installResearchWaveProgressRenderer(pi);
  installResearchReportPreviewRenderer(pi);
  installResearchDashboardRenderer(pi);
  installResearchHelpRenderer(pi);
  installResearchErrorRenderer(pi);
  installAuditCardRenderer(pi);
  installTicketBreakdownRenderer(pi);
  installTriageStatusRenderer(pi);
  installReferenceResultRenderer(pi);
  installTimelineRenderer(pi);
  installTilt(pi);
  installBootstrap(
    pi,
    COMMANDS.map((spec) => ({ name: spec.name, description: spec.description })),
  );
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
