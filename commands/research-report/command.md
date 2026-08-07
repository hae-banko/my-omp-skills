Summarize deep-research results into a markdown report: table of contents plus detailed content by field category, skipping uncertain values. Phase 3 of the deep-research workflow (after `/research-deep`).

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-report`

## Workflow

### Step 1: Locate Results Directory

Anchor to the repo root (`git rev-parse --show-toplevel`). Locate the project under `<root>/.omp/knowledge/research/`: the **most recent** dated directory if the user names no specific one, or the directory matching the user's argument (e.g. `/research-report 2026-08-03_ai-agent-demo-2025`). Read its `outline.yaml` — `topic` and `output_dir` config; `{project_dir}` is the absolute path of the located project.

### Step 2: Scan Optional Summary Fields

Read all JSON results; extract fields suitable for TOC display (numeric, short metrics), e.g.:
- `github_stars`, `google_scholar_cites`, `swe_bench_score`, `user_scale`, `valuation`, `release_date`

Use the `ask` tool:
- Which fields to display in the TOC besides item name?
- Provide a dynamic options list based on the actual fields present in the JSON

### Step 3: Generate Report

Run the canonical conversion script **`commands/research-report/generate_report.py`** (companion file) against the project — **do not copy it into `{project_dir}` and do not write your own script**:

```bash
python3 {absolute_path_of_generate_report_py} {project_dir}
```

The script is generic (reads `fields.yaml` for structure, `results/` for items) and implements the report structure and technical requirements below. No per-project copy exists — the package script is the single source of truth. (A project-local copy from an older run still works: it falls back to its own directory when no argument is given.)

The script must satisfy:

- Read all JSON from `output_dir`
- Read `fields.yaml` for the field structure
- Cover all field values from each JSON
- Skip fields whose values contain `[uncertain]`
- Skip fields listed in the `uncertain` array
- Save to `{project_dir}/report.md`

**Report structure (summary-first, detail-preserving):**

1. **Header stats** — items, field coverage, unresolved fields, distinct sources cited.
2. **Executive Summary** — one coverage paragraph (waves, strategy modules, coverage, unresolved, sources); priority / severity / effort mix lines ordered by rank (P0 before P1, blocker before cosmetic); **Top findings** = every P0 + P1 item with anchor link and a one-line summary; **Most-affected surfaces** histogram (top 5, bucketed by the component string before `(`).
3. **Action Plan** — a table of every item (`# | Finding | Severity | Priority | Effort | Affected component`) sorted by priority then severity then item number, so the report opens with "what to fix first". Long affected-component values are truncated in the table; full value lives in the item meta line.
4. **Table of Contents** — every item: number, name (anchor link), plus short badges (priority, effort) when present. Never truncate names; the Action Plan carries the summary fields.
5. **Findings** — one section per item:
   - Meta line first (severity, priority, effort, affected component) — these fields are **not** repeated in the body.
   - One-line summary blockquote (`ux_issue` by convention; fall back to the first short field) — the item's essence at a glance.
   - Body fields grouped by category. Fields ≤160 chars render inline; longer fields collapse into `<details><summary>Category — Field names</summary>…</details>` so the page stays scannable without losing detail. Skip in the body any field already in the meta line or the one-line summary.
   - `**Sources:**` line listing the item's evidence URLs (deduped, `https://`-normalized link destinations).
6. **Sources** — deduped appendix: every distinct URL with the item numbers it grounds. Bare domains (`w3.org/TR/WCAG22`) are matched as sources; file paths (`src/foo.ts`, `README.md`) and mid-word truncations (`CustomMessagePayload.co` inside `.content`) are not.
7. **Unresolved Fields & Attempts** — per-item provenance for uncertain/empty fields, from `_attempts` (see requirement 7 below).

**TOC format requirements:**
- Must include every item
- Each item shows: number, name (anchor link), optional short badges
- Example: `1. [GitHub Copilot](#github-copilot) — P1 · M`

#### Script technical requirements (must follow)

**1. Single-pass processing & fast lookups** — optimize execution speed and resource usage:
- Single-pass processing: open and parse each JSON file exactly once with context managers; compile markdown outputs into in-memory lists before writing.
- Precomputed dictionary lookups: invert `CATEGORY_MAPPING` into an $O(1)$ lookup dictionary `CATEGORY_LOOKUP = {alt.lower(): canonical for canonical, alts in CATEGORY_MAPPING.items() for alt in alts}` at top level.
- Minimal file handles & string building: use `'\n'.join(...)` list buffers instead of repeated string concatenations (`+=`).

**2. JSON structure compatibility** — support two structures:
- Flat: fields directly at top level `{"name": "xxx", "release_date": "xxx"}`
- Nested: fields in category sub-dicts `{"basic_info": {"name": "xxx"}, "technical_features": {...}}`

Field lookup order: top level → category mapping key → traverse all nested dicts.

**3. Category multi-language mapping** — fields.yaml category names and JSON keys may be any combination (CN-CN, CN-EN, EN-CN, EN-EN). Build bidirectional mapping:

```python
CATEGORY_MAPPING = {
    "Basic Info": ["basic_info", "Basic Info"],
    "Technical Features": ["technical_features", "technical_characteristics", "Technical Features"],
    "Performance Metrics": ["performance_metrics", "performance", "Performance Metrics"],
    "Milestone Significance": ["milestone_significance", "milestones", "Milestone Significance"],
    "Business Info": ["business_info", "commercial_info", "Business Info"],
    "Competition & Ecosystem": ["competition_ecosystem", "competition", "Competition & Ecosystem"],
    "History": ["history", "History"],
    "Market Positioning": ["market_positioning", "market", "Market Positioning"],
}
```

**4. Complex value formatting**
- List of dicts (e.g. `key_events`, `funding_history`): one line per dict, kv separated by ` | `
- Normal lists: short lists joined with commas; long lists with line breaks
- Nested dicts: recursive formatting, semicolon or line breaks
- Long text strings (>100 chars): add `<br>` line breaks or use blockquote for readability

**5. Extra fields collection** — collect fields present in JSON but not in fields.yaml into an "Other Info" category. Filter out:
- Internal fields: any underscore-prefixed field — `_source_file`, `_attempts`, `_wave`, plus `uncertain`. `_attempts` and `_wave` are internal bookkeeping and are NEVER displayed as regular fields: `_attempts` is consumed by requirement 7 (attempts provenance), `_wave` is wave bookkeeping only.
- Nested-structure top-level keys: `basic_info`, `technical_features`, etc.
- `uncertain` array: display each field name on a separate line

**6. Uncertain value skipping** — skip when:
- Field value contains `[uncertain]`
- Field name is in the `uncertain` array
- Field value is `None` or empty string

**7. Attempts provenance** — for each item whose JSON still has unresolved uncertain fields (per requirement 6: `[uncertain]` value, name in the `uncertain` array, or empty/`None`), the report must document what was tried instead of silently skipping. Render a per-item provenance note listing:
- The unresolved field names.
- The attempts made, read from the item's internal `_attempts` array. Each entry is `{wave, angles, modules, outcome}` — render the wave number, the query angles tried, the strategy modules used, and the outcome.
- Format: a subsection under the item, e.g. `**Unresolved:** field_a, field_b` followed by an attempts list (`Wave 1 — angles: [...], modules: [...], outcome: ...`), so a reader sees the fields that could not be filled and exactly what was tried.
- If `_attempts` is absent (pre-OODA results), fall back to listing just the unresolved field names without an attempts list.
- `_attempts` entries are never rendered as part of the regular field body — only inside this provenance note.

### Step 3b: Report Preview Custom Message

Before executing the script to write `report.md` (or before writing `report.md`), emit the report preview custom message so the TUI renders a preview card alongside the report run:

```ts
pi.sendMessage({
  customType: "research-report-preview",
  display: true,
  content: `Research report preview — ${slug}: ${resolved_items}/${total_items} items resolved · ${unresolved_fields_count} unresolved fields`,
  details: previewPayload
})
```

`previewPayload` is a `ResearchReportPreviewPayload` (see `src/research-renderer.ts`) populated from the JSON results and the user-selected TOC fields:

- `slug`, `topic`
- `coverage` (overall field-coverage ratio, 0–1)
- `verified_sources_count` / `verified_sources` (count of distinct sources the report cites)
- `executive_summary` / `summary_preview` (one-paragraph summary or the first ~500 chars of the rendered report body)
- `unresolved_provenance` / `unresolved_fields_provenance` — the per-item provenance list of fields still marked `[uncertain]` or empty, each entry `{field, attempts, reason}` where `attempts` is a short list of `{wave, angles, modules, outcome}` (sourced from the item's `_attempts`)
- All of the following are **rendered** on the preview card (previously ignored): `toc` (array of `{name, summary}` entries or strings — rendered as a "Table of Contents" section), `summary_fields` (the user-selected field names), `total_items`, `resolved_items`, `unresolved_fields_count`, `preview_content` (a short markdown excerpt used as the card body)
- The card also carries `content` (a plain-text one-liner) so non-TTY/CI/print mode degrades to readable prose

Emit this **before** running `generate_report.py` (Step 4) — the preview reflects the planned report; if Step 4 fails or the user edits `generate_report.py`, re-emit with the updated `preview_content`.

### Step 4: Execute Script

Run `python3 {absolute_path_of_generate_report_py} {project_dir}` (or, for a legacy project-local copy, `python {project_dir}/generate_report.py`).

After `report.md` is written, close out Phase 3:

- **Front-matter upkeep** — update `research.md` front-matter: `status: REPORT_READY`, `phase: 3`, `updated` (ISO-8601 UTC).

**Contract — research.md front-matter ↔ code**: the TUI research cards read a project through `src/research-store.ts` (the module owning every read of `.omp/knowledge/research/<slug>/`), which uses the front-matter fields as the read source for `total_items` / `total_fields` / `waves_run` / `status`. Keep them truthful on every write: `status` is the canonical pipeline word (`OUTLINE` | `RUNNING` | `CONVERGED` | `REPORT_READY` | `PAUSED` | `CANCELLED` | `ERROR` | `STALE`); `counts.items` / `counts.fields` are the defined totals; `counts.filled` / `counts.partial` / `counts.pending` the item completion state; `waves_run` the completed waves; `updated` an ISO-8601 UTC timestamp. `src/research-store.ts` and `commands/research/validate_json.py` are the two adapters on this seam — one adapter would be a hypothetical seam, two make it real. The store falls back to scanning `outline.yaml` / `fields.yaml` / `results/` only when a front-matter value is absent.
- **Dashboard emission** — emit a `research-dashboard` card with `status: REPORT_READY` (details from the project directory) so the TUI lands on the final lifecycle state:
  ```ts
  pi.sendMessage({
    customType: "research-dashboard",
    display: true,
    content: `Research — ${slug}: REPORT_READY · report generated`,
    details: dashboardPayload // ResearchDashboardPayload (see src/research-renderer.ts)
  })
  ```

## Output

- `{project_dir}/report.md` — summary report (generated by the package script `commands/research-report/generate_report.py`; no per-project script file)
