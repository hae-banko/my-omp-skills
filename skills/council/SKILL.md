---
name: council
description: Summon a multi-perspective agent council to deliberate on software architecture, ML research, embedded firmware, or electrical engineering trade-offs. Built-in presets include default-triad (software), ml-research (ml), embedded (firmware), and electrical-ee (ee / hardware). Use when the user asks for a second opinion, wants to debate an architectural decision, mentions council/deliberation/jury, or faces a high-stakes technical fork.
---

# Multi-Perspective Council Deliberation (SPEC-002)

Use this skill when you face an ambiguous architectural fork, a high-risk refactoring decision, or when the user explicitly asks for a panel review / second opinion.

This skill orchestrates a real multi-agent deliberation: it spawns 3 specialized subagents in parallel, optionally runs a Chatham-House blind cross-critique, then performs Star Chamber consensus partitioning. Never simulate the personas yourself — the value comes from genuine parallel execution over isolated contexts.

The personas may declare a `tools` allow-list (e.g. `web_search`, `read`, `grep`, `glob`) so ML researchers, software architects, and embedded engineers know they can execute web searches or inspect reference repos (`.omp/references/`) to back claims with primary sources.

---

## When to Summon the Council

1. **High-Stakes Architectural Decisions**: Choosing between databases, protocols, frameworks, or state management paradigms.
2. **Breaking Refactors**: Large codebase restructurings where safety invariants and maintainability clash with simplicity.
3. **Resolving Technical Disagreements**: When two valid engineering approaches have competing trade-offs that cannot be trivialized.

---

## Built-in Council Presets

The `/council` command ships with four triads; pick the one that matches the domain:

- `default-triad` (alias `software`) — Minimalist · Systems Architect · Security Auditor. For software architecture, refactors, breaking changes.
- `ml-research` (alias `ml`) — Model Architect · Eval Critic · Inference Engineer. For ML research, benchmarking, and serving economics. Personas have `web_search` + `read` + `grep` so they can cite arXiv papers, official model repos, and `.omp/references/`.
- `embedded` (alias `firmware`, `embedded`) — Realtime Auditor · Hardware Safety · Baremetal Pragmatist. For firmware, RTOS, and baremetal work. Personas have `read` + `grep` so they can inspect linker maps and HAL callsites.
- `electrical-ee` (alias `ee`, `hardware`) — Signal & Power Integrity · Component DFM · Safety & Compliance. For SI/PI, DFM, and electrical safety. Personas have `web_search` + `read` so they can cite IPC / UL / IEC standards and reference designs.

### Natural keyword syntax

The `/council` command uses clean natural keywords without any `--` prefix:

- `/council ml <topic>` → ML-research triad
- `/council debate <topic>` → 3-stage blind cross-critique
- `/council embedded <topic>` → Embedded firmware triad
- `/council save <topic>` → Persist decision record to `.omp/scratch/debates/`
- `/council overlay <topic>` → Open the interactive verdict overlay
- `/council verbose <topic>` → Show detailed multi-stage debate and critique transcripts
- `/council edit` (or `/council config`) → Open `.omp/council.yaml` in the built-in text editor directly

All keywords combine naturally: `quick`, `deep`, `debate`, `raw`, `save`, `record`, `actionable`, `verbose`, `compact`, `terse`, `summary`, `overlay`, `modal`, `software`, `ml`, `embedded`, `firmware`, `ee`, `hardware`, plus `council <name>` and `preset <name>`.
---

## Stage 1 — Persona Resolution & Parallel Fan-Out (mandatory)

### SILENT-BY-DEFAULT DIRECTIVE
You MUST be **completely silent** before and during subagent dispatch:
- **ZERO commentary before task dispatch**: NEVER print text like "Spawning personas...", "Drafting tasks...", or intermediate planning walls of text in chat.
- **Immediate dispatch**: Directly issue a single `task({ tasks: [...] })` tool call containing all active personas in parallel.

You MUST spawn **all active personas in parallel** ($N \ge 1$, matching the project's `.omp/council.yaml` or preset configuration) — never simulate the personas yourself, never inline their prompts into your own response. Each subagent receives its persona system prompt, the user's proposal, the relevant codebase context, AND a `tools` allow-list (so ML researchers, software architects, and embedded engineers know they may execute web searches or read reference repos like `.omp/references/` to back claims with primary sources). Each subagent returns a strict JSON object:

```json
{
  "personaId": "minimalist",
  "personaName": "Minimalist",
  "stance": "1-2 sentence position summary",
  "recommendation": "Concrete actionable recommendation",
  "keyInvariants": ["non-negotiable invariant 1", "non-negotiable invariant 2"],
  "caveats": ["edge case / risk 1", "edge case / risk 2"],
  "confidence": 0.95
}
```

### Spawn Pattern

For each persona, construct a subagent task containing:

```text
# Persona
<system prompt from the chosen triad>

# Tools
<comma-separated tool allow-list from the persona — e.g. "web_search, read, grep">
When you need primary sources (papers, datasheets, IPC/IEC standards, .omp/references/
entries), execute the listed tools before stating an invariant.

# Proposal
<the user's exact topic or proposal>

# Codebase Context
<relevant snippets you have already gathered — paths, functions, types>
Do NOT let the subagent invent file paths; it must work from the snippets you provide.

# Output Contract
Respond with ONLY a JSON object matching this schema and nothing else:
{
  "personaId": "<persona.id>",
  "personaName": "...",
  "stance": "...",
  "recommendation": "...",
  "keyInvariants": ["..."],
  "caveats": ["..."],
  "confidence": <0.0–1.0>
}
```

Validate each subagent result against the schema. If a subagent returns malformed JSON, retry once; if still malformed, fall back to a synthetic opinion with `confidence: 0` and record the parse failure in `caveats`.

---

## Stage 2 — Chatham-House Blind Cross-Critique *(only on `deep` or `debate`)*

Anonymize the Stage 1 outputs as Proposal A / Proposal B / Proposal C. Spawn **3 parallel critique subagents**, each reviewing one anonymized proposal against the others. The critique preamble:

> *"You are reviewing Proposal X (anonymized; the original author is unknown to you). Critique it adversarially: identify weaknesses, unstated assumptions, missing invariants, and better alternatives. Do NOT try to identify the original persona — focus on the proposal's engineering merits only."*

Each critique subagent emits the same JSON schema, but reinterpreted:
- `keyInvariants` → the strongest invariants observed across **all** proposals.
- `caveats` → the most serious weaknesses of Proposal X.
- `confidence` → confidence in the critique.

Merge each persona's Stage 1 draft with their own Stage 2 critique before Stage 3.

---

## Stage 3 — Star Chamber Chairman Synthesis

Partition the (refined) opinions into 4 objective buckets:

- � **`[CONSENSUS INVARIANTS]` (3/3)** — Hard requirements agreed upon across all lenses (e.g. *"Must be backward-compatible with existing JSON on disk"*).
- � **`[MAJORITY RECOMMENDATIONS]` (2/3)** — Concrete architectural steps supported by 2 of 3 lenses with explicit trade-off notes.
- 🔵 **`[UNIQUE INSIGHTS]` (1/3)** — Critical edge-case warnings or platform-native shortcuts surfaced by a single specialist.
- � **`[CRITICAL DIVERGENCE]`** — Irreconcilable philosophical clashes (e.g. *Performance vs Simplicity*). Clearly state the exact condition under which each branch is preferred.
Render via `renderCouncilVerdictCard` over `customType: "council-verdict"`.

### MINIMAL DISCUSSION DIRECTIVE
By default, do NOT print intermediate persona debates or walls of discussion. After emitting the verdict card:
- Provide a **concise 3–5 bullet point executive summary** of the decision.
- Only print detailed persona critique logs and debate transcripts if `verbose` was specified.

---
## Stage 4 — Persistence *(only on `save` or `record`)*

When the user requested persistence:

## Interactive Verdict Overlay

When the user passed `overlay` (alias `modal`) and the runtime exposes `ctx.ui.custom`, launch the interactive Council Verdict overlay immediately. The overlay is modeled after `src/research/research-overlay.ts` and oh-my-pi TUI conventions.

- **Tabs**: `[1] Verdict & Consensus` (consensus invariants / majority / divergences / summary), `[2] Persona A`, `[3] Persona B`, `[4] Persona C` (un-truncated stance, recommendation, key invariants, caveats, confidence).
- **Keyboard**: `1-4` or `Tab`/`Shift+Tab` to switch tabs; `j`/`k` (or arrow keys) to scroll; `s` to save the record; `Enter` to dispatch `/implement` with the consensus invariants; `Esc` or `q` to close.

---

## Structured Verdict Output

Present the verdict to the user using clean visual sections and propose the actionable consensus path forward:

```
⚖️  COUNCIL VERDICT ◄ <council> (<MODE>) ►
Topic: <topic>
Status: Deliberation Concluded · <ISO timestamp>

🟢 Consensus Invariants (3/3)
   • <invariant>
   • <invariant>

🟡 Majority Recommendations (2/3)
   • <recommendation>
   • <recommendation>

🔵 Unique Insights
   • [<Persona>] <insight>
   • [<Persona>] <insight>

🔴 Critical Divergences
   ⚡ <divergence issue>
   • <Persona>: <position>
   • <Persona>: <position>

💾 Saved Record: <path>          ← only when `save`
