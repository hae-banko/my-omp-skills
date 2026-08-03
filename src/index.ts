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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandContext, ExtensionApi } from "./api.ts";
import { installBootstrap } from "./bootstrap.ts";
import { installPolicy } from "./policy.ts";

const ROOT = join(import.meta.dirname, "..");

interface CommandSpec {
  name: string;
  description: string;
  /** path relative to ROOT of the workflow markdown body */
  bodyPath: string;
  /** paths relative to ROOT of companion reference files, disclosed as pointers */
  companions?: string[];
  /** customType for the transcript receipt emitted when the command runs */
  customType?: string;
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
    description: "Phase 2 of deep research: research each outline item with parallel background agents, outputting validated JSON per item.",
    bodyPath: "commands/research-deep/command.md",
    companions: RESEARCH_ASSETS,
  },
  {
    name: "research-report",
    description: "Phase 3 of deep research: convert the deep-research JSON results into a markdown report with table of contents.",
    bodyPath: "commands/research-report/command.md",
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
    description: "Move issues and external PRs through a state machine of triage roles — categorise, verify, grill if needed, and write agent-ready briefs.",
    bodyPath: "commands/triage/command.md",
    companions: [
      "commands/triage/AGENT-BRIEF.md",
      "commands/triage/OUT-OF-SCOPE.md",
    ],
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
    description: "Break a plan, spec, or conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker.",
    bodyPath: "commands/to-tickets.md",
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
    name: "record",
    description: "Record a durable finding (lesson, audit, or note) into the repo's local knowledge base at .omp/knowledge/. Supports --recent to list entries.",
    bodyPath: "commands/record/command.md",
    companions: ["commands/record/RECORD-FORMAT.md"],
    customType: "knowledge-record",
  },
  {
    name: "pitfall",
    description: "Something just went wrong — instantly capture the pitfall into the repo's knowledge base (.omp/knowledge/) before the context fades. Supports --recent.",
    bodyPath: "commands/pitfall/command.md",
    companions: ["commands/record/RECORD-FORMAT.md"],
    customType: "knowledge-pitfall",
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
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) return raw.slice(end + 4).trim();
  }
  return raw.trim();
}

export default function (pi: ExtensionApi): void {
  installBootstrap(
    pi,
    COMMANDS.map((spec) => ({ name: spec.name, description: spec.description })),
  );
  installPolicy(pi);

  for (const spec of COMMANDS) {
    const body = loadBody(spec.bodyPath);
    const companionPaths = (spec.companions ?? []).map((p) => join(ROOT, p));

    pi.registerCommand(spec.name, {
      description: spec.description,
      handler: async (args: string, ctx: CommandContext) => {
        const argText = args.trim();
        let text = body;
        if (argText) {
          text = text.replace(/\$ARGUMENTS/g, argText);
          text += `\n\n## User's arguments\n${argText}`;
        } else {
          text = text.replace(/\$ARGUMENTS/g, "");
        }
        if (companionPaths.length > 0) {
          text += `\n\n## Companion reference files\nRead these files when the workflow refers to them:\n${companionPaths.join(
            "\n",
          )}`;
        }
        await pi.sendUserMessage(text);
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
