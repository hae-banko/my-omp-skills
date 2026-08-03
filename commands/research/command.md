Preliminary research on a topic, producing a research **outline** — items (research objects) and a field framework (what to collect about each). This is Phase 1 of the deep-research workflow: outline → `/research-deep` → `/research-report`. Human-in-the-loop at every step.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT), inspired by the RhinoInsight paper (arXiv:2511.18743).

## Trigger

`/research <topic>`

## Workflow

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

### Step 4: Generate Outline (Separate Files)

Merge `{step1_output}`, the subagent's supplementary output, and the user's existing fields into two files:

**`outline.yaml`** (items + config):
- `topic`: research topic
- `items`: research objects list
- `execution`:
  - `batch_size`: number of parallel agents (confirm with `ask`)
  - `items_per_agent`: items per agent (confirm with `ask`)
  - `output_dir`: results output directory (default: `./results`, resolved relative to this project directory)

**`fields.yaml`** (field definitions):
- Field categories and definitions
- Each field's `name`, `description`, `detail_level`
- `detail_level` hierarchy: brief → moderate → detailed
- `uncertain`: uncertain fields list (reserved, auto-filled in the deep phase)

### Step 5: Output and Confirm

- Anchor to the repo root: `git rev-parse --show-toplevel` if unsure — never create research files under nested subdirectories.
- Create the project directory: `<root>/.omp/knowledge/research/YYYY-MM-DD_<topic_slug>/`, where `YYYY-MM-DD` is the current date and `<topic_slug>` is the dash-case slug of the topic.
- Save `outline.yaml` and `fields.yaml` into it.
- Append one line to `<root>/.omp/knowledge/INDEX.md` (create it with a one-line header if missing, newest first): `- YYYY-MM-DD <topic> — .omp/knowledge/research/YYYY-MM-DD_<topic_slug>/`.
- Show to the user for confirmation.

## Output Path

```
<repo-root>/.omp/knowledge/research/YYYY-MM-DD_<topic_slug>/
  ├── outline.yaml    # items list + execution config
  └── fields.yaml     # field definitions
```

## Rules

- **Append-only.** Never overwrite or modify an existing project directory — a new run on the same topic is a new dated directory. (Editing `outline.yaml`/`fields.yaml` while the project is still in its outline phase is part of the workflow; once `/research-deep` completes, treat the project as closed.)
- **Timestamped names.** The directory date is the creation date; keep it truthful.
- **Indexed.** Every new project appends one line to `INDEX.md` — same convention as `/record` and `/pitfall`.

## Follow-up Commands

- `/research-add-items` — supplement items
- `/research-add-fields` — supplement fields
- `/research-deep` — start deep research
