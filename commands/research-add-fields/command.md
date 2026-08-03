Add field definitions to an existing research outline. Phase-1 extension of the deep-research workflow.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-add-fields`

## Workflow

### Step 1: Auto-locate Fields File

Anchor to the repo root (`git rev-parse --show-toplevel`). Locate the project under `<root>/.omp/knowledge/research/`: the **most recent** dated directory if the user names no specific one, or the directory matching the user's argument. Read its `fields.yaml`.

### Step 2: Get Supplement Source

Ask the user to choose:
- **A. User direct input**: user provides field names and descriptions
- **B. Web search**: spawn a background subagent running the `WEB-SEARCH-AGENT.md` brief (companion file listed below) to find common fields in this domain

### Step 3: Display and Confirm

- Display the suggested new fields list
- User confirms which fields to add
- User specifies each field's category and `detail_level`

### Step 4: Save Update

Append confirmed fields to `fields.yaml` and save.

## Output

Updated `<project>/.omp/knowledge/research/<date>_<topic_slug>/fields.yaml` (in-place modification, requires user confirmation; allowed while the project is in its outline phase).
