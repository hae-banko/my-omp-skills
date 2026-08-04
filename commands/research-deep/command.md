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

### Step 3: OODA Waves

Phase 2 runs repeated waves until convergence (replaces single-pass batch execution). Each wave is an OODA loop:

- **Orient** — gap analysis from the previous wave's results: for each item JSON, list what remains unfilled — fields still marked `[uncertain]`, empty fields, items with no JSON yet, and the angles/modules already tried (from `_attempts`) so follow-ups do not repeat them. Wave 1 has no previous results: the pending set is the full outline item list minus completed files from Step 2.
- **Decide** — build the next-wave plan: which items to research or follow up, what new query angles to add, which strategy modules to reroute, and the wave scale from the preset (resolution order above). By default no user approval is needed before a wave; with `--approve-each`, use the `ask` tool to confirm the plan before Act.
- **Act** — dispatch the batch in **parallel** (task subagents, background), each running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path so the subagent loads the strategy modules). Dispatch up to `batch_size` agents per the wave scale, each handling `items_per_agent` items. In the subagent task description (outside the hard-constraint template below), pass the current wave number and this wave's query angles and strategy modules. Subagent output goes to its file; no chat payload needed.
- **Observe** — collect the wave's results and update every item the wave touched:
  - Resolve `[uncertain]` values **in place** when the wave confirms them
  - Prune resolved entries from the item's `uncertain` array
  - Append one entry to `_attempts` per touching wave: `{wave, angles, modules, outcome}` — `angles`/`modules` list what this wave tried (the agent records which strategies/angles returned nothing, per the template below); `outcome` is a short result (e.g. `filled`, `partial`, `failed`). If the agent left no valid entry, append one from the wave plan.
  - Set `_wave` to the last wave number
  - `_attempts` and `_wave` are internal underscore fields (the report script already filters `_source_file`-style fields)

**Convergence** — stop the wave loop when ANY holds:
- (a) the last wave produced zero new `[uncertain]`/empty items
- (b) two consecutive waves produced no improvement (no reduction in the total `[uncertain]`/empty field count across items)
- (c) `max_waves` reached (default 3; `--max-waves N` overrides)
- (d) the user stops it

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
