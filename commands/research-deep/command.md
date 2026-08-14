Deep research phase: read the research outline, launch independent background subagents per item in repeated OODA waves until convergence, collect structured JSON results. Phase 2 of the deep-research workflow (after `/research`).

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-deep [preset] [--approve-each] [--max-waves N]`

- `preset` (optional): `small` | `medium` | `high` — the per-wave execution scale (definitions below). A positional argument that is not one of these presets is the project directory name from Step 1 (e.g. `/research-deep 2026-08-03_ai-agent-demo-2025`). Flags are order-independent.
- `--approve-each`: ask the user before each wave instead of dispatching automatically (off by default).
- `--max-waves N`: cap the wave loop at `N` waves (default 3).

**Presets** (per-wave execution scale):
- `small`: 1–2 parallel agents per wave, `items_per_agent` 1 (limited)
- `medium`: 3–5 parallel agents per wave, `items_per_agent` 2
- `high`: as many parallel agents as pending items (no artificial cap), `items_per_agent` 1

**Resolution order** for each wave's execution scale:
1. Explicit `execution.batch_size` / `execution.items_per_agent` in `outline.yaml` override the presets — use them verbatim
2. Else `execution.preset` from `outline.yaml` — use its preset definitions above
3. Else default `medium`

## Workflow

### Step 1: Auto-locate Outline

Anchor to the repo root (`git rev-parse --show-toplevel`). Locate the project under `<root>/.omp/knowledge/research/`: the **most recent** dated directory if the user names no specific one, or the directory matching the user's argument (e.g. `/research-deep 2026-08-03_ai-agent-demo-2025`). Read its `outline.yaml` — items list and execution config (including `items_per_agent`). All paths below are absolute.

### Step 2: Resume Check

- Check completed JSON files in `{project_dir}/results` (or the configured `output_dir`)
- Skip completed items
- If the front-matter `status` is `PAUSED` (or the directory already holds completed item JSONs from a prior run), announce **`skips N completed item(s)`** — N = the number of items with finished JSON — before starting the next wave, so the user knows exactly what the resume will reuse.

### Step 3: OODA Waves

Phase 2 runs repeated waves until convergence (replaces single-pass batch execution). Each wave is an OODA loop:

- **Orient** — gap & dependency analysis: inspect `outline.yaml` for item dependencies (`depends_on`). For each item, evaluate whether its upstream dependencies have finished result JSONs. List what remains unfilled — unblocked items ready for research (`status == ready`), items with `[uncertain]` or empty fields, and items currently blocked waiting on upstream dependencies (`status == pending/blocked`).
- **Decide** — build the next-wave plan: select unblocked ready items (frontier nodes in the Research DAG) and follow-up items with remaining uncertain fields. For items with completed upstream dependencies, prepare upstream context payloads. By default no user approval is needed before a wave; with `--approve-each`, use the `ask` tool to confirm the plan before Act.
- **Act** — dispatch the batch in **parallel** (task subagents, background), each running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path so the subagent loads the strategy modules). For items that depend on upstream nodes, inject the `<upstream-context>` block (extracted verified URLs, repository sources, and facts from completed upstream JSONs) into the task description so the agent grounds its investigation directly on upstream discoveries. Dispatch up to `batch_size` agents per the wave scale, each handling `items_per_agent` items. Subagent output goes to its JSON file.
- **Observe** — collect the wave's results and update every item the wave touched:
  - Resolve `[uncertain]` values **in place** when the wave confirms them
  - Prune resolved entries from the item's `uncertain` array
  - Append one entry to `_attempts` per touching wave: `{wave, angles, modules, outcome}` — `angles`/`modules` list what this wave tried (the agent records which strategies/angles returned nothing, per the template below); `outcome` is a short result (e.g. `filled`, `partial`, `failed`). If the agent left no valid entry, append one from the wave plan.
  - Set `_wave` to the last wave number
  - `_attempts` and `_wave` are internal underscore fields (the report script already filters `_source_file`-style fields)
- **Wave Progress Emission** — at the end of each wave iteration (after Observe and the per-item updates above), emit the wave progress custom message so the TUI updates between waves:
  ```ts
  pi.sendMessage({
    customType: "research-wave-progress",
    display: true,
    content: `Research wave ${wave}/${max_waves} — ${slug}: ${completed_items}/${total_items} items · ${completed_fields}/${total_fields} fields`,
    details: wavePayload
  })
  ```
  `wavePayload` is a `ResearchWaveProgressPayload` (see `src/research-renderer.ts`) populated from the wave's Observe step:
  - `slug`, `topic` — project identity
  - `status` (canonical word — `RUNNING` on per-wave cards; `PAUSED`/`CANCELLED`/`ERROR` on the terminal stop card)
  - `wave` (current wave number, 1-indexed), `max_waves` (the convergence cap)
  - `field_completion`, `completed_fields`, `total_fields` (resolved/total field coverage)
  - `active_subagents` (count or list of dispatched names/ids for this wave), `active_modules` (modules used this wave)
  - `uncertainty_delta` / `delta_u` (reduction in unresolved field count vs. the previous wave) — send **only when a real reduction was observed**; omit the field entirely when the value is unknown or unchanged. Never fabricate a value (the renderer no longer renders a default `-0.15`).
  - Operational metrics: `total_items`, `completed_items`, `pending_items`, `wave_items`, `unresolved_fields_count`, `preset`, `failed_items`, `failed_count`, `per_item_status` (`[{name, status}]` — per-item state for the wave)
  - Time semantics: `elapsed_seconds`, `eta_seconds` (rendered as `Time: elapsed 3m12s · ETA ≈ 4m` when present), `indeterminate` (`true` when the wave is running with no results yet — the TUI shows "RUNNING… (indeterminate — no results yet)" instead of a 0% bar), `as_of` (ISO-8601 UTC)
  Emit on **every** wave (including wave 1) — do not skip the first emission; the TUI uses it to render the initial progress frame. Every wave card carries `content` (a plain-text one-liner) so non-TTY/CI/print mode degrades to readable prose.
- **Front-matter upkeep** — after each wave's Observe updates (and the wave-progress emission), keep `research.md`'s front-matter truthful:
  - `counts.filled` / `counts.partial` / `counts.pending` recomputed from the item JSONs: `filled` = items fully resolved, `partial` = items with `[uncertain]`/empty fields remaining, `pending` = items with no JSON yet
  - `waves_run` incremented per completed wave
  - `status: RUNNING` (canonical word) while the loop continues
  - `updated` (ISO-8601 UTC)
  At convergence, set `status: CONVERGED` (keeping `waves_run` and `counts` truthful).

**Contract — research.md front-matter ↔ code**: the TUI research cards read a project through `src/research-store.ts` (the module owning every read of `.omp/knowledge/research/<slug>/`), which uses these front-matter fields as the read source for `total_items` / `total_fields` / `waves_run` / `status`. Keep them truthful on every write: `status` is the canonical pipeline word (`OUTLINE` | `RUNNING` | `CONVERGED` | `REPORT_READY` | `PAUSED` | `CANCELLED` | `ERROR` | `STALE`); `counts.items` / `counts.fields` are the defined totals; `counts.filled` / `counts.partial` / `counts.pending` the item completion state; `waves_run` the completed waves; `updated` an ISO-8601 UTC timestamp. `src/research-store.ts` and `commands/research/validate_json.py` are the two adapters on this seam — one adapter would be a hypothetical seam, two make it real. The store falls back to scanning `outline.yaml` / `fields.yaml` / `results/` only when a front-matter value is absent.
- **Lifecycle Dashboard Emission** — keep the TUI's lifecycle dashboard current at phase boundaries, at **most one dashboard card per wave**:
  - At the **start of each wave** (before dispatching the batch), emit a `research-dashboard` card with `status: RUNNING`, details from the project directory.
  - After **convergence**, emit a `research-dashboard` card with `status: CONVERGED`.
  - Dedupe: if the payload would be **byte-identical to the previous dashboard card's payload**, skip the emission.
  ```ts
  pi.sendMessage({
    customType: "research-dashboard",
    display: true,
    content: `Research — ${slug}: ${status} · wave ${wave}/${max_waves} · ${completed_items}/${total_items} items`,
    details: dashboardPayload // ResearchDashboardPayload (see src/research-renderer.ts)
  })
  ```
- **Convergence Check** — stop the wave loop when ANY holds:
- (a) the last wave produced zero new `[uncertain]`/empty items
- (b) two consecutive waves produced no improvement (no reduction in the total `[uncertain]`/empty field count across items)
- (c) `max_waves` reached (default 3; `--max-waves N` overrides)
- (d) the user stops it (interrupt) — run the **Stop / Pause / Resume** path below

**Stop / Pause / Resume** — when the user stops a run mid-loop:
1. **Cancel outstanding jobs**: cancel the dispatched wave subagent jobs (`hub cancel` on the wave's task jobs, or abort the parent tool call) so no orphaned agents keep writing results.
2. **Write the stop state to `research.md` front-matter**: `status: PAUSED` when completed items exist and the run is resumable, `status: CANCELLED` for a hard abort; update `updated` (ISO-8601 UTC) and keep `counts` / `waves_run` truthful.
3. **Emit exactly ONE terminal card** (wave-progress or dashboard) carrying the `PAUSED` or `CANCELLED` status so the TUI leaves a definitive end state — no further emissions after it.
4. **On resume** (re-running `/research-deep`), Step 2 Resume Check announces `skips N completed item(s)` before starting the next wave.

**Parameters:**
- `{project_dir}`: absolute path of the located project directory (`.omp/knowledge/research/<date>_<topic_slug>/`)
- `{topic}`: `topic` field from `outline.yaml`
- `{item_name}`: the item's `name` field
- `{item_related_info}`: the item's complete yaml content (name + category + description, etc.)
- `{output_dir}`: `execution.output_dir` from `outline.yaml` (default `./results`), **resolved relative to `{project_dir}`** → `{project_dir}/results`
- `{fields_path}`: absolute path to `{project_dir}/fields.yaml`
- `{output_path}`: absolute path to `{output_dir}/{item_name_slug}.json` (slugify `item_name`: replace spaces with `_`, remove special chars)
- `{preset}`: the effective preset (`small` | `medium` | `high`, default `medium`) per the resolution order — drives per-wave scale
- `{max_waves}`: wave-loop cap (default 3; `--max-waves N` overrides)
- `{wave}`: current wave number (passed in the subagent task description; used for `_attempts` and `_wave`)

Each item JSON carries internal underscore fields: `_wave` (last wave that touched the item) and `_attempts` (one `{wave, angles, modules, outcome}` entry per touching wave). The agent appends its own `_attempts` entry for the current wave — recording which strategies/angles returned nothing for `[uncertain]` fields — and sets `_wave`; the Observe step normalizes entries if missing.

**Hard constraint:** the following prompt must be strictly reproduced, only replacing variables in `{xxx}` — do not modify structure or wording.

**Prompt template:**

```python
prompt = f"""## Task
Research {item_related_info}, output structured JSON to {output_path}

## Field Definitions
Read {fields_path} to get all field definitions

## Output Requirements
1. Output JSON according to fields defined in fields.yaml
2. Mark uncertain field values with [uncertain]
3. Add uncertain array at the end of JSON, listing all uncertain field names
4. All field values must be in English
5. When a field cannot be filled with confidence after thorough search, mark it [uncertain] and record in the _attempts entry which strategies/angles returned nothing

## Output Path
{output_path}

## Validation
After completing JSON output, run validation script to ensure complete field coverage:
python {validate_script_path} -f {fields_path} -j {output_path}
Task is complete only after validation passes.
"""
```

where `{validate_script_path}` is the absolute path of the `validate_json.py` companion file (listed below). The subagent must run the validator itself and only report done after it passes.

### Step 4: Summary Report

After the wave loop converges, output:
- Completion count (items whose JSON is fully filled)
- Failed/uncertain items (fields still `[uncertain]` or empty, with their `_attempts`)
- Waves run
- Output directory

## Agent Config

- Background execution: yes
- Task output: disabled (the agent has an explicit output file when complete)
- Resume support: yes (completed items are skipped)
- Wave feedback: yes (each wave's results feed the next wave's Orient/Decide; the loop stops at convergence or `max_waves`)

## Follow-up

`/research-report` — generate the markdown report from the JSON results; it lists unresolved uncertain fields and the attempts made (`_attempts`) for each item.
