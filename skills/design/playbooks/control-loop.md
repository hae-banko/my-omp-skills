# Agentic Control Loop Design

Use when designing or building an agentic control loop (sensor, controller, actuator under disturbances) tailored to a codebase to drive a target property through small, low-risk, scheduled changes.

## Steps

1. **Understand repository context and tooling**:
   Before interviewing the user, inspect the repository to discover existing tooling: package manager and install commands, test and lint commands, static-analysis tools, CI configurations (`.github/workflows/`), existing agent skills, and application structure. Review [skill://design/references/control-loop/control-loop-taxonomy.md](../references/control-loop/control-loop-taxonomy.md) and [skill://design/references/control-loop/example-control-loop.md](../references/control-loop/example-control-loop.md).
   *Completion criterion*: Documented repo package manager, validation commands, CI platform, and candidate sensing tools.

2. **Interview and agree on loop design**:
   Interview the user to define the control loop components grounded in repo capabilities:
   - **Set point**: The target property to drive (invariant, threshold, or reduction metric) and file scope.
   - **Sensor**: Tool, query, or script measuring the current gap to the set point repeatably.
   - **Controller**: Logic choosing the next small, reviewable increment. Ensure idempotence per [skill://design/references/principles.md](../references/principles.md): derive steps from current state rather than prior intentions so re-execution converges cleanly.
   - **Actuator**: Coding agent (CLI runner and credentials selected from [skill://design/references/control-loop/agent-runner-templates.md](../references/control-loop/agent-runner-templates.md)), golden codebase patterns to mirror, and required validation commands.
   - **Disturbances & Dampener**: Name external disturbances (teammates, dependencies, generated code) and offer an optional dampener (a PR regression check preventing metric degradation).
   *Completion criterion*: Written loop specification agreed with the user defining set point, sensor, controller, actuator, and dampener strategy.

3. **Build the repo-local actuator skill**:
   Author a repo-local skill capturing the actuator's judgement (e.g. `.claude/skills/<skill-name>/SKILL.md` or `.agents/skills/...` matching repo conventions). Use [skill://design/references/control-loop/skill-template.md](../references/control-loop/skill-template.md) and [skill://design/references/control-loop/example-skill.md](../references/control-loop/example-skill.md). Encode golden patterns discovered in the codebase. Require the agent to format its final response as the PR body using [skill://design/references/control-loop/response-template.md](../references/control-loop/response-template.md).
   *Completion criterion*: Repo-local skill written with frontmatter name matching directory slug and checkable procedural steps.

4. **Make each component runnable locally**:
   Before wiring into CI, implement sensor and controller scripts as version-controlled commands in the project's script location. Enforce separation of shared state per [skill://design/references/principles.md](../references/principles.md) so parallel runs or workers do not write to shared mutable files. Test each piece locally:
   - Run the sensor standalone and verify repeatable output.
   - Run the controller on sensor output to confirm selection of a single low-risk increment.
   - Run the actuator headless CLI locally on a selected target and verify validation checks pass.
   *Completion criterion*: Sensor, controller, and actuator CLI each verified runnable locally by hand from the command line.

5. **Wire the recurring CI workflow and steering controls**:
   Assemble the recurring workflow (defaulting to GitHub Actions) using [skill://design/references/control-loop/workflow-template.yml](../references/control-loop/workflow-template.yml) and [skill://design/references/control-loop/prompt-template.md](../references/control-loop/prompt-template.md):
   - Sequence discrete steps: sensor → controller → actuator → validation → commit and open PR.
   - Configure cadence (e.g. cron schedule) and manual `workflow_dispatch`.
   - Implement flow control: bound work-in-progress (default: maximum one open PR per loop; scheduled runs no-op when the limit is reached).
   - Configure human steering: create a memory file using [skill://design/references/control-loop/memory-template.md](../references/control-loop/memory-template.md) loaded on every run, and wire optional PR iteration via [skill://design/references/control-loop/agent-iteration.ts](../references/control-loop/agent-iteration.ts).
   *Completion criterion*: Workflow YAML validated and committed, referencing existing local scripts, actuator skill, and memory file.

## Reply

Hand back:
1. Control loop architecture: set point, sensor command, controller logic, actuator skill, and CI schedule.
2. Local execution commands for running sensor, controller, and actuator standalone.
3. Paths of created files: local scripts, repo-local skill, CI workflow YAML, and agent memory file.
4. Validation status of workflow YAML and dry-run instructions.
