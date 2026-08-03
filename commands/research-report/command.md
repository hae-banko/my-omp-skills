Summarize deep-research results into a markdown report: table of contents plus detailed content by field category, skipping uncertain values. Phase 3 of the deep-research workflow (after `/research-deep`).

> Adapted from [Weizhena/deep-research-skills](https://github.com/Weizhena/deep-research-skills) (MIT).

## Trigger

`/research-report`

## Workflow

### Step 1: Locate Results Directory

Find `*/outline.yaml` in the current working directory; read `topic` and `output_dir` config.

### Step 2: Scan Optional Summary Fields

Read all JSON results; extract fields suitable for TOC display (numeric, short metrics), e.g.:
- `github_stars`, `google_scholar_cites`, `swe_bench_score`, `user_scale`, `valuation`, `release_date`

Use the `ask` tool:
- Which fields to display in the TOC besides item name?
- Provide a dynamic options list based on the actual fields present in the JSON

### Step 3: Generate Python Conversion Script

Generate `generate_report.py` in the `{topic}/` directory. Requirements:

- Read all JSON from `output_dir`
- Read `fields.yaml` for the field structure
- Cover all field values from each JSON
- Skip fields whose values contain `[uncertain]`
- Skip fields listed in the `uncertain` array
- Generate markdown report format: table of contents (with anchor links + user-selected summary fields) + detailed content (by field category)
- Save to `{topic}/report.md`

**TOC format requirements:**
- Must include every item
- Each item shows: number, name (anchor link), user-selected summary fields
- Example: `1. [GitHub Copilot](#github-copilot) - Stars: 10k | Score: 85%`

#### Script technical requirements (must follow)

**1. JSON structure compatibility** — support two structures:
- Flat: fields directly at top level `{"name": "xxx", "release_date": "xxx"}`
- Nested: fields in category sub-dicts `{"basic_info": {"name": "xxx"}, "technical_features": {...}}`

Field lookup order: top level → category mapping key → traverse all nested dicts.

**2. Category multi-language mapping** — fields.yaml category names and JSON keys may be any combination (CN-CN, CN-EN, EN-CN, EN-EN). Build bidirectional mapping:

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

**3. Complex value formatting**
- List of dicts (e.g. `key_events`, `funding_history`): one line per dict, kv separated by ` | `
- Normal lists: short lists joined with commas; long lists with line breaks
- Nested dicts: recursive formatting, semicolon or line breaks
- Long text strings (>100 chars): add `<br>` line breaks or use blockquote for readability

**4. Extra fields collection** — collect fields present in JSON but not in fields.yaml into an "Other Info" category. Filter out:
- Internal fields: `_source_file`, `uncertain`
- Nested-structure top-level keys: `basic_info`, `technical_features`, etc.
- `uncertain` array: display each field name on a separate line

**5. Uncertain value skipping** — skip when:
- Field value contains `[uncertain]`
- Field name is in the `uncertain` array
- Field value is `None` or empty string

### Step 4: Execute Script

Run `python {topic}/generate_report.py`

## Output

- `{topic}/generate_report.py` — conversion script
- `{topic}/report.md` — summary report
