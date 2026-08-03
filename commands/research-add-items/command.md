Add items (research objects) to an existing research outline. Phase-1 extension of the deep-research workflow.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-add-items`

## Workflow

### Step 1: Auto-locate Outline

Find `*/outline.yaml` in the current working directory and read it.

### Step 2: Get Supplement Sources in Parallel

- **A. Ask the user**: what items to supplement? Any specific names?
- **B. Ask if web search is needed**: if so, spawn a background subagent running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path) to search for additional items in the domain.

### Step 3: Merge and Update

- Append new items to `outline.yaml`
- Display to the user for confirmation
- Avoid duplicates
- Save the updated outline

## Output

Updated `{topic}/outline.yaml` (in-place modification).
