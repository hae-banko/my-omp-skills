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
import { installResearchReviewCardRenderer } from "./research-renderer.ts";

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
  handler?: (pi: ExtensionApi) => (args: string, ctx: CommandContext) => Promise<void> | void;
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
    getArgumentCompletions: (argumentPrefix: string) => {
      const subcommands = [
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
      const rest = lower.slice(spaceIdx + 1).trimStart();

      const slugSubcommands = ["review", "add-items", "add-fields", "status", "run"];
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
    name: "ask-me",
    description: "Ask which command or flow fits your situation. A router over the commands in this package.",
    bodyPath: "commands/ask-me.md",
  },
  {
    name: "grill-me",
    description: "A relentless interview to sharpen a plan or design.",
    bodyPath: "commands/grill-me.md",
  },
  {
    name: "grill-with-docs",
    description: "A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.",
    bodyPath: "commands/grill-with-docs.md",
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
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
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
  },
  {
    name: "to-spec",
    description: "Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.",
    bodyPath: "commands/to-spec.md",
  },
  {
    name: "to-tickets",
    description:
      "Break a plan, spec, or conversation into a set of tracer-bullet tickets ([spec.md]), each declaring its blocking edges, published to the configured tracker.",
    bodyPath: "commands/to-tickets.md",
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
  },
  {
    name: "wayfinder",
    description: "Plan a huge chunk of work — more than one session can hold — as a shared map of decision tickets on the issue tracker, and resolve them one at a time until the way is clear.",
    bodyPath: "commands/wayfinder.md",
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
    // TUI options: typing "/hindsight " shows the subcommands with the live
    // state in their descriptions — the intuitive on/off affordance, with
    // nothing persistent on screen.
    getArgumentCompletions: (argumentPrefix: string) => {
      if (argumentPrefix.includes(" ")) return null;
      const lower = argumentPrefix.toLowerCase();
      const on = isHindsightEnabled();
      const state = on ? "on" : "off";
      const options = [
        { value: "on ", label: "on", description: `Enable the reflection pass (currently ${state})` },
        { value: "off ", label: "off", description: `Disable the reflection pass (currently ${state})` },
        { value: "status ", label: "status", description: `Show the current state (${state})` },
      ];
      const matches = options.filter((o) => o.label.startsWith(lower));
      return matches.length > 0 ? matches : null;
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
  for (const spec of COMMANDS) {
    const body = loadBody(spec.bodyPath);
    const companionPaths = (spec.companions ?? []).map((p) => join(ROOT, p));

    pi.registerCommand(spec.name, {
      description: spec.description,
      getArgumentCompletions: spec.getArgumentCompletions,
      handler: async (args: string, ctx: CommandContext) => {
        if (spec.handler) {
          await spec.handler(pi)(args, ctx);
          return;
        }
        const argText = args.trim();
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
          customType: spec.customType ?? `command:${spec.name}`,
          content: text,
          display: false,
          attribution: "user",
        });
        const userPrompt = `/${spec.name}${argText ? ` ${argText}` : ""}`;
        await pi.sendUserMessage(userPrompt);
        if (spec.customType) {
          pi.sendMessage(
            {
              customType: spec.customType,
              content: `${spec.name} requested${argText ? ` — ${argText}` : ""}`,
              display: true,
              attribution: "user",
            },
            { deliverAs: "followUp" },
          );
        }
        ctx.ui?.notify?.(`Running ${spec.name}`, "info");
      },
    });
  }
}
