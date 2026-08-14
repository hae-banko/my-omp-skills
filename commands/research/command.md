Preliminary research on a topic, producing a research **outline** — items (research objects) and a field framework (what to collect about each). This is Phase 1 of the deep-research workflow: outline → `/research-deep` → `/research-report`. Human-in-the-loop at every step.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT), inspired by the RhinoInsight paper (arXiv:2511.18743).

## Trigger & Subcommands

- `/research 1 [topic]` — Phase 1: Outline Generation. Produce the research outline (items + field framework) for `{topic}`. The handler emits a draft Research Review Window immediately; the workflow body replaces it with the real outline payload.
- `/research 2 [slug]` — Phase 2: Deep Research OODA Waves. Run deep research phase for a project (equivalent to `/research-deep [slug]`).
- `/research 3 [slug]` — Phase 3: Summary Report Generation. Convert deep-research JSON results into a markdown report (equivalent to `/research-report [slug]`).
- `/research dashboard [slug] [--compact]` — Research Lifecycle Dashboard. Emit the lifecycle dashboard (`pi.sendMessage({ customType: "research-dashboard", display: true, details: payload })`) for a research project (or the most recent dated project if `slug` is omitted). `--compact` sets `detail: "compact"` on the payload.
- `/research review [slug] [--full | --compact]` — Open/emit the Research Review Window (`pi.sendMessage({ customType: "research-review", display: true, details: payload })`) for an existing research project slug (or the most recent if omitted). `--full` sets `detail: "full"` (lists more items/fields, shows detailed field levels); `--compact` (default) caps previews.
- `/research add-items [slug]` — Add items to an existing research outline, update `research.md`, and re-emit `research-review`.
- `/research add-fields [slug]` — Add field definitions to an existing research fields framework, update `research.md`, and re-emit `research-review`.
- `/research status [slug]` — Display current progress and status summary for a research project (emits `research-dashboard`).
- `/research run [slug]` — Start deep research phase for a project (equivalent to `/research 2 [slug]` / `/research-deep [slug]`).
- `/research help [slug]` — Open the research help card: the full subcommand surface, shortcuts, and the recommended next step for the project. Emits `customType: "my-omp-research-help"` (namespaced `ResearchHelpPayload`).
- `/research envcheck [slug]` — Terminal environment diagnostics for the research cards. Same help card plus `env` (`TERM`, `COLORTERM`, `NO_COLOR`, `CI`). Emits `customType: "my-omp-research-help"` with the `env` field populated.
- `/research off` — Close/disable the Research Review Window.

## Subcommand Execution Details

When `/research` is invoked with a subcommand:

- **`1 [topic]`**: Run Phase 1 outline generation workflow for `{topic}`.
- **`2 [slug]`**: Delegate to Phase 2 deep research workflow (equivalent to `/research-deep [slug]`).
- **`3 [slug]`**: Delegate to Phase 3 summary report compilation (equivalent to `/research-report [slug]`).
- **`dashboard [slug]`** or **`status [slug]`** — Research Lifecycle Dashboard:
  1. Locate the project directory under `<repo-root>/.omp/knowledge/research/` matching `slug` (or the most recent dated directory if `slug` is omitted).
  2. Read `research.md` front-matter (the workflow-owned counts/status — see Contract below), fall back to scanning `outline.yaml` & `fields.yaml` only when a front-matter value is absent; scan completed JSON results; check whether `report.md` exists.
  3. **Emit the `research-dashboard` custom message** to trigger the Research Lifecycle Dashboard card:
     ```ts
     pi.sendMessage({
       customType: "research-dashboard",
       display: true,
       details: payload
     })
     ```
     `payload` is a `ResearchDashboardPayload` (see `src/research-renderer.ts`) populated from the project directory:
     - `slug`, `topic`, `status` (canonical pipeline word — `OUTLINE` | `RUNNING` | `CONVERGED` | `REPORT_READY` | `PAUSED` | `CANCELLED` | `ERROR` | `STALE`), `current_phase` (1|2|3)
     - `pipeline_status` (legacy phase-arrow display string — kept for compatibility, superseded by `status`)
     - `global_metrics`: `total_items`, `completed_items`, `total_fields`, `completed_fields` (capped at `total_fields`), `coverage`
     - `artifacts`: `outline_yaml`, `fields_yaml`, `results_json`, `report_md` (presence/size)
     - `recommended_next_step` (the next subcommand the user should run), `next_step_command` (the concrete command with the slug filled in, e.g. `/research-deep 2026-08-07_<topic_slug>`)
     - `as_of` (ISO-8601 UTC), `freshness` (`"fresh"` | `"warn"` | `"stale"` — only meaningful while `RUNNING`), `expected_interval_seconds`
     - `waves_run`, `max_waves`, `pending_items`, `unresolved_fields_count`, `detail` (`"compact"` | `"full"`), `errors` (string[]), `project_path`
     `--compact` sets `detail: "compact"` on the payload.
  4. Summarize progress and lifecycle status to the user in prose.
- **`review [slug]`**:
  1. Locate the project directory under `<repo-root>/.omp/knowledge/research/` matching `slug` (or the most recent dated directory if `slug` is omitted).
  2. Read `research.md` (or `outline.yaml` & `fields.yaml`).
  3. Emit custom message to trigger the TUI Research Review Window:
     ```ts
     pi.sendMessage({
       customType: "research-review",
       display: true,
       details: payload
     })
     ```
- **`add-items [slug]`**: Delegate to the item addition workflow (same as `/research-add-items [slug]`), then update `research.md` (counts, items list, `updated` timestamp) and re-emit `research-review`.
- **`add-fields [slug]`**: Delegate to the field addition workflow (same as `/research-add-fields [slug]`), then update `research.md` (counts, required fields list, `updated` timestamp) and re-emit `research-review`.
- **`run [slug]`**: Delegate to the deep research workflow (equivalent to `/research-deep [slug]`).
- **`help [slug]`** / **`envcheck [slug]`**:
  1. Resolve the project directory under `<repo-root>/.omp/knowledge/research/` matching `slug` (or the most recent dated directory if `slug` is omitted); if none resolves, the payload falls back to `slug: "research"` with no phase/status.
  2. Emit the research help card via the **namespaced** customType `my-omp-research-help`:
     ```ts
     pi.sendMessage({
       customType: "my-omp-research-help",
       display: true,
       attribution: "user",
       content: `${head === "envcheck" ? "Research environment diagnostics" : "Research help"} — ${slug}`,
       details: payload
     })
     ```
     `payload` is a `ResearchHelpPayload` (`src/research-renderer.ts`): `slug`, `phase` (1|2|3), `status` (canonical word), `commands` (`[{command, description}]` — the full `/research` subcommand surface), `shortcuts` (`[{key, description}]`), `next_step` (the dashboard's `next_step_command`). `envcheck` additionally sets `env` (`TERM`, `COLORTERM`, `NO_COLOR`, `CI`) for terminal diagnostics.
  3. Toast `Research Help loaded` (help) or `Research environment diagnostics loaded` (envcheck). No user message is queued.
- **Project-not-found errors**: `dashboard`, `status`, and `review` emit a **namespaced** error card instead of a toast-only path:
  ```ts
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
    }
  })
  ```
  `my-omp-research-error` carries a `ResearchErrorPayload` (`{slug, code, message, hint}`). Both `my-omp-research-help` and `my-omp-research-error` are namespaced customTypes registered with the renderer (see `src/research-renderer.ts`).
If invoked with `/research <topic>` (or a new research topic): execute Phase 1 workflow below.

## Workflow (Phase 1 Outline Generation)

### Step 1: Generate Initial Framework from Model Knowledge

Based on the topic, use your existing knowledge to generate:
- The main research objects/items list in this domain
- A suggested research field framework

Output as `{step1_output}`, use the `ask` tool to confirm with the user:
- Need to add/remove items?
- Does the field framework meet requirements?

### Step 2: Web Search Supplement

Use the `ask` tool to ask for a time range (e.g., last 6 months, since 2024, unlimited).

**Parameters:**
- `{topic}`: user's research topic
- `{YYYY-MM-DD}`: current date
- `{step1_output}`: complete output from Step 1
- `{time_range}`: user-specified time range

**Hard constraint:** the following prompt must be strictly reproduced, only replacing variables in `{xxx}` — do not modify structure or wording.

Spawn **one background subagent** running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path in the subagent prompt so it loads the strategy modules).

**Prompt template:**

```python
prompt = f"""## Task
Research topic: {topic}
Current date: {YYYY-MM-DD}

Based on the following initial framework, supplement latest items and recommended research fields.

## Existing Framework
{step1_output}

## Goals
1. Verify if existing items are missing important objects
2. Supplement items based on missing objects
3. Continue searching for {topic} related items within {time_range} and supplement
4. Supplement new fields

## Output Requirements
Return structured results directly (do not write files):

### Supplementary Items
- item_name: Brief explanation (why it should be added)
...

### Recommended Supplementary Fields
- field_name: Field description (why this dimension is needed)
...

### Sources
- [Source1](url1)
- [Source2](url2)
"""
```

The subagent uses the `web_search` tool (and `read` for fetching) against the sources in the strategy modules; it reports the supplementary items/fields/sources directly.

### Step 3: Ask User for Existing Fields

Use the `ask` tool: does the user have an existing field definition file? If so, read and merge it.

### Step 4: Generate Outline (YAML & Markdown Files)

Merge `{step1_output}`, the subagent's supplementary output, and the user's existing fields into three files:

**`outline.yaml`** (items + config):
- `topic`: research topic
- `items`: research objects list. Items can be flat strings or structured objects:
  ```yaml
  items:
    - id: repo_discovery
      name: "Find official repository and specs"
    - id: cipher_audit
      name: "Audit encryption cipher"
      depends_on: [repo_discovery] # DAG dependency edge
  ```
- `execution`:
  - `preset`: optional execution scale — `small` | `medium` | `high` (default `medium`); explicit `batch_size`/`items_per_agent` values override it:
    - `small`: 1–2 parallel agents per wave, `items_per_agent` 1
    - `medium`: 3–5 parallel agents per wave, `items_per_agent` 2
    - `high`: as many parallel agents as pending items (no artificial cap), `items_per_agent` 1
  - `batch_size`: number of parallel agents per wave (optional — overrides `preset`; confirm the preset or the explicit number with `ask`)
  - `items_per_agent`: items per agent (optional — overrides `preset`; confirm the preset or the explicit number with `ask`)
  - `output_dir`: results output directory (default: `./results`, resolved relative to this project directory)
**`fields.yaml`** (field definitions):
- Field categories and definitions
- Each field's `name`, `description`, `detail_level`
- `detail_level` hierarchy: brief → moderate → detailed
- `uncertain`: uncertain fields list (reserved, auto-filled in the deep phase)

**`research.md`** (human-readable living outline):
Create `research.md` living outline in the project directory alongside `outline.yaml` and `fields.yaml`:
- **YAML Front-matter**:
  ```yaml
  ---
  project: YYYY-MM-DD_<topic_slug>
  topic: "<topic>"
  status: OUTLINE
  phase: 1
  created: YYYY-MM-DD
  updated: YYYY-MM-DDTHH:MM:SSZ
  execution:
    preset: medium
    batch_size: <batch_size>
    items_per_agent: <items_per_agent>
    output_dir: ./results
  counts:
    items: <num_items>
    fields: <num_fields>
    filled: 0
    partial: 0
    pending: <num_items>
  waves_run: 0
  unresolved_fields: []
  modules: [general-web, github-debug, stackoverflow, chinese-tech, academic-papers]
  ---
  ```
- **Markdown Body**:
  - Header `# Research: <topic>`
  - `## Goals`: Bulleted research goals.
  - `## Strategy modules`: List strategy modules (`general-web`, `github-debug`, `stackoverflow`, `chinese-tech`, `academic-papers`).
  - `## Items (<N> total)`: Table listing items (`#`, `Item`, `Category`, `Description`, `Progress`).
  - `## Required fields (<N> total)`: Grouped by category, showing field names, descriptions, and `detail_level` (★/★★/★★★).
  - `## Progress`: Timestamped log starting with `### Phase 1 — outline`.
  - `## Notes`: Free-form notes section.

### Contract — research.md front-matter ↔ code

The TUI research cards (dashboard, review, wave progress, report preview) read a research project through `src/research-store.ts` — that module owns every read of `.omp/knowledge/research/<slug>/`. This workflow body is the authoring surface; the store is the reading surface. They meet at the `research.md` front-matter fields this workflow MUST keep truthful on every write:

- `status` — the canonical pipeline word: `OUTLINE` | `RUNNING` | `CONVERGED` | `REPORT_READY` | `PAUSED` | `CANCELLED` | `ERROR` | `STALE`
- `counts.items` / `counts.fields` — defined totals
- `counts.filled` / `counts.partial` / `counts.pending` — item completion state
- `waves_run` — completed waves
- `updated` — ISO-8601 UTC timestamp

`src/research-store.ts` and `commands/research/validate_json.py` are the two adapters reading these files — one adapter would be a hypothetical seam, two make the seam real. The store reads the front-matter counts first and falls back to scanning `outline.yaml` / `fields.yaml` / `results/` only when a front-matter value is absent — keep the counts truthful so the cards never re-derive them.

### Step 5: Save Files and Update Index

- Anchor to the repo root: `git rev-parse --show-toplevel` if unsure — never create research files under nested subdirectories.
- Create the project directory: `<root>/.omp/knowledge/research/YYYY-MM-DD_<topic_slug>/`, where `YYYY-MM-DD` is the current date and `<topic_slug>` is the dash-case slug of the topic.
- Save `outline.yaml`, `fields.yaml`, and `research.md` into it.
- Append one line to `<root>/.omp/knowledge/INDEX.md` (create it with a one-line header if missing, newest first): `- YYYY-MM-DD <topic> — .omp/knowledge/research/YYYY-MM-DD_<topic_slug>/`.

### Step 6: Emit TUI Research Review Window

Emit the `research-review` custom message to trigger the TUI Research Review Window:

```ts
pi.sendMessage({
  customType: "research-review",
  display: true,
  details: payload
})
```

Where `payload` contains the project metadata (`project`, `topic`, `status`, `phase`, `counts`, `execution`, `path`, `researchMdPath`, `modules`).

Show summary to the user for confirmation.

## Output Path

```
<repo-root>/.omp/knowledge/research/YYYY-MM-DD_<topic_slug>/
  ├── outline.yaml    # items list + execution config
  ├── fields.yaml     # field definitions
  └── research.md     # human-readable living outline
```

## Rules

- **Append-only.** Never overwrite or modify an existing project directory — a new run on the same topic is a new dated directory. (Editing `outline.yaml`/`fields.yaml`/`research.md` while the project is still in its outline phase is part of the workflow; once `/research-deep` completes, treat the project as closed.)
- **Timestamped names.** The directory date is the creation date; keep it truthful.
- **Indexed.** Every new project appends one line to `INDEX.md` — same convention as `/record` and `/pitfall`.

## Follow-up Commands

- `/research add-items [slug]` (or `/research-add-items`) — supplement items
- `/research add-fields [slug]` (or `/research-add-fields`) — supplement fields
- `/research review [slug]` — open/emit TUI Research Review Window
- `/research status [slug]` — show project status
- `/research help [slug]` — open the research help card (commands, shortcuts, next step)
- `/research run [slug]` (or `/research-deep`) — start deep research: it runs in feedback-driven OODA waves (no per-wave approval by default; `--approve-each` restores it)
