Add field definitions to an existing research outline. Phase-1 extension of the deep-research workflow.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-add-fields`

## Workflow

### Step 1: Auto-locate Fields File

Find `*/fields.yaml` in the current working directory and read the existing field definitions.

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

Updated `{topic}/fields.yaml` (in-place modification, requires user confirmation).
