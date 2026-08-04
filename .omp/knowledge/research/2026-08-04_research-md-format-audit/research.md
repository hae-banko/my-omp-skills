# `research.md` Living Outline — Format & Data Spec

**Audit target:** `/home/haeba/harness-lab/omp-extensions/my-omp-skills/`
**Date:** 2026-08-04
**Scope:** three command briefs (`commands/research`, `commands/research-deep`, `commands/research-report`) plus the existing TUI custom-message renderer convention in `src/knowledge-tool.ts`.

This report proposes a human-readable **living outline** that lives alongside `outline.yaml` and `fields.yaml` inside each `.omp/knowledge/research/<date>_<topic_slug>/` project directory. Its job is to summarize, in plain Markdown, what is being researched, what must be filled, who is doing it, and how far the work has progressed — without duplicating the YAML/JSON sources of truth.

---

## 1. Where this fits in the existing pipeline

```
/research                 /research-deep             /research-report
(Phase 1: outline)        (Phase 2: OODA waves)      (Phase 3: report)
        │                          │                          │
        ▼                          ▼                          ▼
  outline.yaml  ──── reads ───▶ results/*.json  ── reads ──▶  report.md
  fields.yaml                  (per item, fills fields)
        │
        └── writes ──▶  research.md   ◀── THIS SPEC
                         (human-readable living outline;
                          edited after each phase)
```

- **Phase 1 (`/research`)** writes `outline.yaml` + `fields.yaml`. After confirmation, it can additionally emit a first `research.md` draft so the user has something readable before any subagent runs.
- **Phase 2 (`/research-deep`)** appends/refreshes the progress section of `research.md` at the end of each OODA wave.
- **Phase 3 (`/research-report`)** generates `report.md`. `research.md` stays as the audit trail; it is **not** replaced by `report.md` — they have different audiences (humans / final readers).

The `research.md` file is intentionally machine-parseable enough for the TUI custom-message renderer to summarize, but its source of truth remains `outline.yaml`, `fields.yaml`, and `results/*.json`.

---

## 2. Data sources `research.md` summarizes

### 2.1 `outline.yaml` (Phase 1)

```yaml
topic: "AI agent frameworks, 2025"
items:
  - name: "AutoGPT"
    category: "open-source-agent"
    description: "First widely-hyped autonomous GPT agent loop."
  - name: "LangGraph"
    category: "graph-orchestration"
    description: "LangChain's graph-based orchestration runtime."
  - name: "CrewAI"
    category: "multi-agent"
    description: "Role-based multi-agent coordination."
  # …
execution:
  preset: medium              # small | medium | high
  batch_size: 4               # optional override
  items_per_agent: 2          # optional override
  output_dir: ./results       # resolved relative to project dir
```

`research.md` reads `topic`, every `items[*].{name, category, description}`, and the execution config (`preset`, `batch_size`, `items_per_agent`, `output_dir`).

### 2.2 `fields.yaml` (Phase 1)

```yaml
categories:
  - name: "Basic Info"
    fields:
      - name: "release_date"
        description: "Initial public release date."
        detail_level: brief
  - name: "Technical Features"
    fields:
      - name: "architecture"
        description: "Core architecture / control-flow pattern."
        detail_level: detailed
  # …
uncertain: []   # reserved; auto-filled in Phase 2
```

`research.md` reads every category and field — name, description, and `detail_level` (`brief` / `moderate` / `detailed`). The `detail_level` ladders are exposed as visual hints (e.g. `★` / `★★` / `★★★`) in the rendered card.

### 2.3 `results/*.json` (Phase 2, optional)

```json
{
  "name": "AutoGPT",
  "release_date": "2023-03-30",
  "architecture": "...",
  "_wave": 2,
  "_attempts": [
    { "wave": 1, "angles": ["github-debug"], "modules": ["github-debug"], "outcome": "filled" },
    { "wave": 2, "angles": ["academic-papers"], "modules": ["academic-papers"], "outcome": "partial" }
  ],
  "uncertain": ["funding_history"]
}
```

`research.md` does **not** store this data; it just renders progress counters next to the item list (`✓ filled`, `… partial`, `✗ failed`, with the last `_wave` reached). Internals (`_attempts`, `_wave`, `uncertain`) are surfaced as aggregate counters, never as raw fields, mirroring the filter in `research-report/command.md` requirement 6.

### 2.4 Strategy modules (`commands/research/modules/`)

Five sibling briefs already exist:

| module                  | one-line purpose                                  |
| ----------------------- | ------------------------------------------------- |
| `general-web.md`        | default breadth-first web search                  |
| `github-debug.md`       | GitHub issue / PR / repo forensics                |
| `stackoverflow.md`      | Q&A for error messages and known workarounds      |
| `chinese-tech.md`       | PRC-vendor sources (微信、知乎、CSDN、…)           |
| `academic-papers.md`    | arXiv / OpenReview / conference proceedings       |

These belong in `research.md` as a **Strategy modules** panel: the user sees which sources the subagents will draw on, and `/research-add-items` or future waves can refer to them by name.

---

## 3. `research.md` specification

### 3.1 Path

```
<repo-root>/.omp/knowledge/research/YYYY-MM-DD_<topic_slug>/research.md
```

- Same directory as `outline.yaml` and `fields.yaml`.
- Sibling to `outline.yaml` / `fields.yaml` / `results/` / `report.md` / `generate_report.py`.
- Append-only across phases: each phase **patches** the same file rather than rewriting it (so a manual note survives a re-run).

### 3.2 Top-of-file YAML front-matter (machine-readable summary)

The Markdown body is for humans; the front-matter is for the TUI renderer and `knowledge_read` tool to lift structured fields without re-parsing prose.

```markdown
---
project: 2026-08-04_ai-agent-frameworks-2025
topic: "AI agent frameworks, 2025"
status: outline               # outline | running | converged | reported
phase: 1                       # 1 | 2 | 3
created: 2026-08-04
updated: 2026-08-04T17:12:00Z
execution:
  preset: medium
  batch_size: 4
  items_per_agent: 2
  output_dir: ./results
counts:
  items: 12
  fields: 38
  filled: 0                   # items with no [uncertain] / empty fields
  partial: 0
  pending: 12
waves_run: 0                   # 0 in Phase 1; advances each OODA wave
unresolved_fields: []          # aggregate over all items
modules: [general-web, github-debug, stackoverflow, chinese-tech, academic-papers]
---
```

`status` transitions: `outline` → `running` → `converged` → `reported`. Each phase commits to the next state.

### 3.3 Body structure (human-readable outline)

```markdown
# Research: AI agent frameworks, 2025

> Living outline for `.omp/knowledge/research/2026-08-04_ai-agent-frameworks-2025/`.
> Sources of truth: `outline.yaml`, `fields.yaml`, `results/*.json`.
> Edit history: each phase patches this file; manual notes below are append-only.

## Goals
1. Map the 2025 landscape of autonomous LLM agent frameworks.
2. For each, capture basic info, architecture, performance, ecosystem, and business model.
3. Surface unresolved fields and the attempts made to fill them.

## Strategy modules
- **general-web** — breadth-first web search (default).
- **github-debug** — GitHub forensics for repo age, issue closure, release cadence.
- **stackoverflow** — Q&A for known failure modes.
- **chinese-tech** — PRC-vendor sources (微信 / 知乎 / CSDN).
- **academic-papers** — arXiv / OpenReview / proceedings.

## Items (12 total)

| # | Item          | Category            | Description (truncated)              | Progress      |
|---|---------------|---------------------|--------------------------------------|---------------|
| 1 | AutoGPT       | open-source-agent   | First widely-hyped autonomous GPT…   | ○ pending     |
| 2 | LangGraph     | graph-orchestration | LangChain's graph-based runtime…     | ○ pending     |
| 3 | CrewAI        | multi-agent         | Role-based multi-agent coordination. | ○ pending     |
| 4 | BabyAGI       | open-source-agent   | Task-driven autonomous loop.         | ○ pending     |
| … | …             | …                   | …                                    | …             |

Legend: `✓ filled` · `… partial` · `○ pending` · `✗ failed`.

## Required fields (38 total)

Group by category, with `detail_level` shown as ★/★★/★★★.

### Basic Info
- **release_date** ★ — Initial public release date.
- **license** ★ — OSS license, or proprietary.
- **maintainers** ★★ — Current maintainers / sponsoring org.

### Technical Features
- **architecture** ★★★ — Core control-flow pattern (ReAct / graph / role / …).
- **memory** ★★ — Short/long-term memory strategy.
- **tool_use** ★★ — How external tools are invoked.

(… one section per `fields.yaml` category …)

## Progress

### Phase 1 — outline
- 2026-08-04 12:00 — `/research` drafted `outline.yaml` (12 items) + `fields.yaml` (38 fields across 6 categories).
- 2026-08-04 17:12 — User confirmed scope; execution preset `medium` chosen.

### Phase 2 — deep research
*(populated by `/research-deep` after each wave)*

### Phase 3 — report
*(populated by `/research-report`)*

## Notes
*(free-form; appended by either user or model, never auto-rewritten)*
```

### 3.4 Field-level rendering rules

These mirror the rules in `commands/research-report/command.md` so the renderer behaves consistently across phases.

| Source value                            | Renders as                                |
| --------------------------------------- | ----------------------------------------- |
| top-level scalar                        | `key: value`                              |
| nested dict keyed by category           | `Category Name: …` with inner fields      |
| list of dicts (e.g. `key_events`)       | one entry per line, `k: v \| k: v`         |
| list of scalars, length ≤ 3             | comma-joined                              |
| list of scalars, length > 3             | bullet list                               |
| string length > 100                     | wrapped in blockquote                     |
| value contains `[uncertain]`            | rendered red/strikethrough; item demotes to `… partial` |
| field in `uncertain` array              | rendered red/strikethrough; item demotes to `… partial` |
| underscore-prefixed field (`_attempts`, `_wave`, `_source_file`) | **never** rendered as a regular field |
| field present in JSON but not in `fields.yaml` | collected into an **Other Info** group at the end |

The `_attempts` provenance rule from `commands/research-report/command.md` requirement 6 is lifted into the **Progress** section: for each item still unresolved, list `{wave, angles, modules, outcome}` so the reader sees what was tried without the card becoming noisy.

### 3.5 Item progress classification

`research.md` derives each item's progress from `results/<item_slug>.json` if present:

```text
status        meaning
────────────  ──────────────────────────────────────────────────────
✓ filled       no field contains [uncertain], not in `uncertain`, not empty/null
… partial      at least one uncertain or empty field, but at least one resolved
○ pending      no results/<item_slug>.json yet
✗ failed       file present but `_attempts[-1].outcome === "failed"`
```

Items roll up to the front-matter `counts: {filled, partial, pending}` block.

### 3.6 Append-only contract

- **Phase 1**: write the file from scratch. Items/fields come from `outline.yaml`/`fields.yaml`; progress is empty.
- **Phase 2**: each OODA wave patches **only** the `counts`, `waves_run`, `unresolved_fields`, and per-item progress rows. The **Progress → Phase 2** section is **appended to**, never overwritten; each wave prepends a timestamped subsection (`### Wave N — YYYY-MM-DD HH:MM`).
- **Phase 3**: when `/research-report` finishes, append a `Phase 3` subsection to the **Progress** section noting the report path and convergence reason; do not delete earlier notes.

This matches the existing append-only rule in `commands/research/command.md` ("Never overwrite or modify an existing project directory") — the file lives, it just grows.

---

## 4. Reading `research.md` from a TUI custom-message renderer

`src/knowledge-tool.ts` already shows the pattern: `pi.registerMessageRenderer(customType, …)` returns a `Container` from `@oh-my-pi/pi-tui`, which the runtime draws into the transcript. The same hook is reused here.

### 4.1 Renderer registration

Add to `src/knowledge-tool.ts` (or a new sibling `src/research-tool.ts` — see §4.4 for a split proposal):

```ts
const RESEARCH_RENDERER_TYPE = "research-outline";

pi.registerMessageRenderer(RESEARCH_RENDERER_TYPE, (message, _options, _theme) => {
  // 1. message is the CustomMessagePayload: { customType, content, details }
  // 2. details carries the parsed front-matter + counts:
  //    { project, topic, status, phase, counts, modules, … }
  // 3. content is the markdown body, already capped by the emitter
  const details = (message && typeof message === "object" && "details" in message
    ? (message as { details?: unknown }).details
    : {}) as ResearchOutlineDetails;

  const box = new Container();
  box.addChild(new Text(`RESEARCH — ${details.topic} [${details.status}]`));
  box.addChild(new Text(`  project: ${details.project}  phase ${details.phase}`));
  box.addChild(new Text(`  items ${details.counts.items} · fields ${details.counts.fields}`));
  box.addChild(new Text(`  ✓${details.counts.filled}  …${details.counts.partial}  ○${details.counts.pending}  ✗${details.counts.failed ?? 0}`));
  box.addChild(new Text(`  modules: ${details.modules.join(", ")}`));
  box.addChild(new Text(`  ${details.summaryLine ?? ""}`));
  return box;
});
```

### 4.2 Emitter (Phase-1 / Phase-2 / Phase-3 hooks)

`/research`, `/research-deep`, and `/research-report` already call `pi.sendMessage(...)` for receipts in the existing implementation. Each phase emits one `RESEARCH` card immediately after committing its artifact, e.g.:

```ts
pi.sendMessage(
  {
    customType: "research-outline",
    attribution: "agent",
    display: true,
    content: markdownBody,                       // ≤ 30 lines, capped by emitter
    details: {
      project:  "2026-08-04_ai-agent-frameworks-2025",
      topic:    "AI agent frameworks, 2025",
      status:   "outline",                       // running | converged | reported
      phase:    1,
      counts:   { items: 12, fields: 38, filled: 0, partial: 0, pending: 12, failed: 0 },
      modules:  ["general-web", "github-debug", "stackoverflow", "chinese-tech", "academic-papers"],
      summaryLine: "12 items · 38 fields · preset medium (4 agents × 2 items/wave)",
    },
  },
);
```

The renderer never reads the full Markdown body — `details` is the compact view, `content` is the expanded view the user opens by pressing the standard "expand" affordance on the TUI card.

### 4.3 Where the renderer gets `details` from

Two viable contracts — pick one and stick to it across phases:

1. **Pre-parsed by the emitter.** The command body parses its own front-matter (it wrote the file) and passes the structured `details` alongside the markdown `content`. Cheapest; no parser in the renderer; idempotent.
2. **Parsed by the renderer.** The renderer re-reads `research.md` from disk and parses the YAML front-matter. Slower but lets a stale TUI transcript rehydrate from disk after a restart.

The existing renderers in `knowledge-tool.ts` already take option (1) — the renderer is given `message.content` as a string and just splits it on `\n` to render rows. Recommendation: stay consistent and go with option (1); the emitter controls what reaches the TUI.

### 4.4 File / module split (optional but tidy)

`src/knowledge-tool.ts` is already 87 lines covering three things: the `knowledge_read` tool, the `knowledge-record` renderer, and the `knowledge-pitfall` renderer. A separate `src/research-tool.ts` keeps the surface area obvious:

```
src/research-tool.ts            ~80 lines
  readResearchFrontMatter()     → parse the YAML block, return ResearchOutlineDetails
  installResearchTool(pi)       → register RESEARCH_RENDERER_TYPE + (optional) read tool
  emitResearchCard(pi, project) → called from /research, /research-deep, /research-report
```

`src/index.ts` would then add `installResearchTool(pi)` alongside `installKnowledgeTool(pi)`.

### 4.5 Visual contract

Each phase emits exactly one card; the TUI shows them inline in the transcript so the user can scroll back through phase history:

```
RESEARCH — AI agent frameworks, 2025 [outline]
  project: 2026-08-04_ai-agent-frameworks-2025  phase 1
  items 12 · fields 38
  ✓0  …0  ○12  ✗0
  modules: general-web, github-debug, stackoverflow, chinese-tech, academic-papers
  12 items · 38 fields · preset medium (4 agents × 2 items/wave)
```

After Phase 2:

```
RESEARCH — AI agent frameworks, 2025 [running]
  project: 2026-08-04_ai-agent-frameworks-2025  phase 2 · wave 2/3
  items 12 · fields 38
  ✓5  …4  ○3  ✗0
  modules: general-web, github-debug, stackoverflow, chinese-tech, academic-papers
  Wave 2 — 5 filled, 4 partial, 3 pending; 7 unresolved fields.
```

After Phase 3:

```
RESEARCH — AI agent frameworks, 2025 [reported]
  project: 2026-08-04_ai-agent-frameworks-2025  phase 3
  items 12 · fields 38
  ✓10  …2  ○0  ✗0
  modules: general-web, github-debug, stackoverflow, chinese-tech, academic-papers
  Report written to ./report.md. Unresolved: funding_history (×3 items).
```

### 4.6 Test coverage (mirrors `scripts/selftest.ts`)

Add to `scripts/selftest.ts` near the existing renderer checks (around line 342):

```ts
if (!renderers["research-outline"]) {
  fail("renderer: research-outline not registered");
} else {
  const card = renderers["research-outline"](
    {
      customType: "research-outline",
      attribution: "agent",
      display: true,
      content: "# Research: …\n",
      details: {
        project: "2026-08-04_x",
        topic: "Topic",
        status: "outline",
        phase: 1,
        counts: { items: 12, fields: 38, filled: 0, partial: 0, pending: 12, failed: 0 },
        modules: ["general-web"],
        summaryLine: "12 items · 38 fields",
      },
    },
    {},
    null,
  );
  if (!(card instanceof TuiContainer)) fail("renderer: research-outline did not produce a component");
}
```

And a unit test for `readResearchFrontMatter`:

```ts
const body = "---\nproject: x\nstatus: outline\nphase: 1\ncounts: { items: 1, fields: 1, filled: 0, partial: 0, pending: 1 }\nmodules: [a]\n---\n# body";
const fm = readResearchFrontMatter(body);
if (fm.status !== "outline") fail("front-matter: status");
if (fm.counts.items !== 1)       fail("front-matter: counts.items");
```

---

## 5. Summary — what this buys

| Stakeholder | Before                                                | After                                                  |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------ |
| User        | Two YAML files + a JSON dump; nothing readable       | `research.md` is a plain-Markdown brief in plain sight |
| TUI         | No card per research phase                           | One compact card per phase, mirrors existing record/pitfall receipts |
| `/research-add-items`, future waves | re-parse YAML each time          | read counts + item rows from `research.md` front-matter |
| Future `/research-status` command (TBD) | would have to walk JSONs | render directly off `research.md` |

`research.md` is **derived state** — it's regenerated, not authoritative — but it gives humans and the TUI a single file to look at instead of having to reconcile `outline.yaml`, `fields.yaml`, and `results/*.json` on every glance.

---

## 6. Open questions / non-goals

- **Multi-machine edits.** `research.md` is a plain file; if two phases race, last-write-wins. This matches the existing convention (single user, single repo, sequential phases) and is **not** a goal of this spec.
- **Localization.** Field descriptions are English-only today (`commands/research-deep/command.md` rule 4: "All field values must be in English"). The renderer doesn't translate; it just reflects whatever the YAML says.
- **`/research-status` slash command.** Mentioned as a follow-up but out of scope here; it would be a thin wrapper around `installResearchTool`.
- **Hot-reloading the renderer.** The TUI re-renders cards on transcript scroll, not on file change. A watcher is **not** part of this spec.

---

## 7. File produced by this audit

This report itself is the deliverable: it lives at
`.omp/knowledge/research/2026-08-04_research-md-format-audit/research.md`.

A follow-up implementation patch would:

1. Add `src/research-tool.ts` with `readResearchFrontMatter`, `installResearchTool`, and `emitResearchCard`.
2. Wire `installResearchTool(pi)` into `src/index.ts` next to `installKnowledgeTool(pi)`.
3. Have `/research`, `/research-deep`, `/research-report` call `emitResearchCard` after each phase commits.
4. Extend `scripts/selftest.ts` with the renderer check in §4.6.