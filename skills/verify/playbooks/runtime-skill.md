# Create runtime verification skill

Use when generating a project-local verification skill to drive the real application surface (CLI/TUI, web, or API) the way a user does.

## 1. Interview the repository surface

Inspect the codebase directly to determine how a user interacts with the application and how an automated agent can drive it. Do not prompt the user for details observable in the code:

- **Surface:** Identify the primary user surface: Web UI, CLI/TUI, HTTP API, or background service. Note any secondary surfaces.
- **Run:** Locate native startup commands (package scripts, Makefiles, container targets). Identify required ports, environment variables, database migrations, and seed fixtures.
- **Drive mechanism:** Select the native driving tool based on the surface:
  - CLI/TUI: Interactive PTY or `herdr` terminal panes.
  - Web: The `browser` eval global (`browser.navigate()`, `browser.click()`, ARIA role selectors, screenshots).
  - HTTP: `curl` commands checking response codes, headers, and JSON payloads.
- **Observe:** Identify observable evidence: ARIA snapshots, screenshots, terminal transcripts, HTTP payloads, database records. Direct observation is mandatory: never infer behavior from build logs, unverified compiler passes, or proxy caches.
- **Isolate:** Ensure verification runs in isolated directories or dedicated ports (`/tmp/verify-$RUN_ID`) to prevent collisions with user sessions.

If the application cannot start cleanly from scratch, identify and resolve the missing prerequisites before generating the skill.

Completion criterion: Surface, start command, driving tool, evidence directory, and isolation parameters are documented directly from codebase files.

## 2. Generate the project-local skill

Write `.omp/skills/verify-<app>/SKILL.md` (where `<app>` is the target application name). Include YAML frontmatter with `name: verify-<app>` and a model-facing `description` naming the app, surface, and triggers. Ground every section in repo reality:

- **Launch:** Exact command starting the application from an empty state into a usable state (including migrations and seeds). Define the explicit readiness signal (specific log string, HTTP status, or terminal prompt). For CLI/TUI apps without long-running daemons, define the build step once and launch isolated sessions per drive.
- **Doctor:** One fast, read-only preflight check answering "is this instance healthy and driving-ready?" Verify process PID, expected port ownership, build version, and auth validity.
- **Drive:** Harness execution commands using stable identifiers (ARIA roles, accessible names, CLI flags, API endpoints) instead of volatile pixel positions or CSS classes.
- **Evidence:** Explicit output artifact paths. Require capturing both user action and resulting state. Verify side effects (files created, rows inserted) alongside UI responses.
- **Cleanup:** Exact commands to terminate started processes and remove scratch directories. Ensure proof artifacts survive cleanup.
- **Helpers:** Document executable helper scripts placed in the skill folder, including exact invocation syntax.

Completion criterion: `.omp/skills/verify-<app>/SKILL.md` exists with all six sections populated and zero placeholders.

## 3. Seed the feature map

Create `.omp/skills/verify-<app>/features/README.md` and 3 to 5 initial feature files (`features/<feature-name>.md`) following [skill://verify/references/feature-map-example/README.md](../references/feature-map-example/README.md).

Each feature file must use these four H2 sections:
1. `Sub-features`: Bulleted list of short identifiers and single-sentence descriptions.
2. `How to get to it (user POV)`: User navigation steps and entry points.
3. `Driving it with <harness>`: Preconditions, followed by exact action-to-observable-result steps.
4. `Gotchas`: Common failure modes, debounce delays, asynchronous transitions, or state requirements.

Completion criterion: Feature index and at least 3 feature files exist, each containing all four mandatory sections.

## 4. Prove the skill against a baseline and a scratch mutant

Prove the verification skill before delivery:
1. **Run baseline:** Execute launch, doctor, drive for one feature, evidence capture, and cleanup. Confirm proof artifacts exist at the designated path and survived cleanup.
2. **Inject scratch mutant:** Introduce a deliberate defect in product code that breaks the driven feature (e.g. comment out a persistence call or invert a validation condition).
3. **Confirm detection:** Re-run the drive step against the mutant. The check must fail and catch the defect. If the check passes on broken code, refine the harness assertions.
4. **Restore clean state:** Revert the scratch mutant and re-run to confirm a clean pass.

Completion criterion: Test execution confirms baseline pass, mutant failure, clean revert, and persistent evidence on disk.

## 5. Link maintenance

Add a reference in `.omp/skills/verify-<app>/SKILL.md` pointing to [skill://verify/playbooks/runtime-skill-maintain.md](runtime-skill-maintain.md) for keeping the map synchronized as features change.

Completion criterion: Maintenance pointer is present in the generated skill documentation.

## Reply

Hand back:
- Primary surface identified and harness driver selected (CLI/TUI via PTY/`herdr`, web via `browser`, or HTTP via `curl`).
- Path to created skill directory (`.omp/skills/verify-<app>/`) and seeded feature files.
- Execution log of the scratch mutant proof confirming the check catches breaks.
- Paths to surviving evidence artifacts.
