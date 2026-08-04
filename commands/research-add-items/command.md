Add items (research objects) to an existing research outline. Phase-1 extension of the deep-research workflow.

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-add-items`

## Workflow

### Step 1: Auto-locate Outline

Anchor to the repo root (`git rev-parse --show-toplevel`). Locate the project under `<root>/.omp/knowledge/research/`: the **most recent** dated directory if the user names no specific one, or the directory matching the user's argument (e.g. `/research-add-items 2026-08-03_ai-agent-demo-2025`). Read its `outline.yaml`.

### Step 2: Get Supplement Sources in Parallel

- **A. Ask the user**: what items to supplement? Any specific names?
- **B. Ask if web search is needed**: if so, spawn a background subagent running the `WEB-SEARCH-AGENT.md` brief (companion file listed below — include its absolute path and the modules directory path) to search for additional items in the domain.

### Step 3: Merge and Update

- Append new items to `outline.yaml`
- Display to the user for confirmation
- Avoid duplicates
- Save the updated `outline.yaml`
- Update `research.md` living outline:
  - Update `counts.items` and `counts.pending` (and `updated` ISO timestamp) in YAML front-matter
  - Append/update new items in the `## Items` table in `research.md`
  - Save updated `research.md`

### Step 4: Re-emit Research Review Message

- Emit custom message to trigger/refresh the TUI Research Review Window:
  ```ts
  pi.sendMessage({
    customType: "research-review",
    display: true,
    details: payload
  })
  ```
  Where `payload` contains updated project details (`project`, `topic`, `status`, `phase`, `counts`, `execution`, `path`, `researchMdPath`, `modules`).

## Output

Updated `<project>/.omp/knowledge/research/<date>_<topic_slug>/outline.yaml` & `research.md` (in-place modification; allowed while the project is in its outline phase).
