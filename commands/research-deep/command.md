Deep research phase: read the research outline, launch an independent background subagent per item, collect structured JSON results. Phase 2 of the deep-research workflow (after `/research`).

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-deep`

## Workflow

### Step 1: Auto-locate Outline

Anchor to the repo root (`git rev-parse --show-toplevel`). Locate the project under `<root>/.omp/knowledge/research/`: the **most recent** dated directory if the user names no specific one, or the directory matching the user's argument (e.g. `/research-deep 2026-08-03_ai-agent-demo-2025`). Read its `outline.yaml` — items list and execution config (including `items_per_agent`). All paths below are absolute.

### Step 2: Resume Check

- Check completed JSON files in `{project_dir}/results` (or the configured `output_dir`)
- Skip completed items

### Step 3: Batch Execution

- Run batches of `batch_size` agents; **need user approval before each next batch** (ask tool)
- Each agent handles `items_per_agent` items
- Spawn the agents in **parallel** (task subagents, background), each running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path so the subagent loads the strategy modules). Subagent output goes to its file; no chat payload needed.

**Parameters:**
- `{project_dir}`: absolute path of the located project directory (`.omp/knowledge/research/<date>_<topic_slug>/`)
- `{topic}`: `topic` field from `outline.yaml`
- `{item_name}`: the item's `name` field
- `{item_related_info}`: the item's complete yaml content (name + category + description, etc.)
- `{output_dir}`: `execution.output_dir` from `outline.yaml` (default `./results`), **resolved relative to `{project_dir}`** → `{project_dir}/results`
- `{fields_path}`: absolute path to `{project_dir}/fields.yaml`
- `{output_path}`: absolute path to `{output_dir}/{item_name_slug}.json` (slugify `item_name`: replace spaces with `_`, remove special chars)

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

## Output Path
{output_path}

## Validation
After completing JSON output, run validation script to ensure complete field coverage:
python {validate_script_path} -f {fields_path} -j {output_path}
Task is complete only after validation passes.
"""
```

where `{validate_script_path}` is the absolute path of the `validate_json.py` companion file (listed below). The subagent must run the validator itself and only report done after it passes.

### Step 4: Wait and Monitor

- Wait for the current batch to complete
- Launch the next batch (after approval)
- Display progress

### Step 5: Summary Report

After all batches complete, output:
- Completion count
- Failed/uncertain-marked items
- Output directory

## Agent Config

- Background execution: yes
- Task output: disabled (the agent has an explicit output file when complete)
- Resume support: yes (completed items are skipped)

## Follow-up

`/research-report` — generate the markdown report from the JSON results.
