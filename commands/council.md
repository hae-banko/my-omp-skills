---
description: Summon a multi-perspective agent council to deliberate on software architecture, ML research, embedded firmware, and electrical engineering trade-offs.
disable-model-invocation: true
---

# /council — Multi-Perspective Deliberation & Consensus Engine

Summon an internal panel of specialized engineering personas (Software, ML, Embedded Firmware, Electrical Engineering) to deliberate on architectural decisions, evaluate trade-offs, and partition consensus invariants with zero external dependencies.

> Grounded in the 2024–2026 Multi-LLM Debate research (Mozilla Star Chamber, Karpathy `llm-council`, AgentAuditor, Free-MAD).

---

## Invocation

```bash
/council [keywords] <topic or proposal>
/council list
/council init [force]
/council edit

### Natural keyword syntax

The CLI uses natural keywords without any `--` prefix so common invocations read like prose:

| Invocation | Preset / Mode | Effect |
| --- | --- | --- |
| `/council ml <topic>` | `ml-research` | ML-research triad (Model Architect / Eval Critic / Inference Engineer). |
| `/council debate <topic>` | `deep` mode | 3-stage blind cross-critique deliberation. |
| `/council embedded <topic>` | `embedded` | Embedded firmware triad (Realtime / Hardware Safety / Baremetal). |
| `/council ee <topic>` | `electrical-ee` | Electrical-EE triad (Signal & Power Integrity / Component DFM / Safety). |
| `/council save <topic>` | `save` record | Persist the verdict decision record to `.omp/scratch/debates/`. |
| `/council overlay <topic>` | `overlay` | Open the interactive Council Verdict overlay. |
| `/council compact <topic>` | `compact` | 4-line ANSI verdict card for terminal logs. |
| `/council verbose <topic>` | `verbose` | Show detailed multi-stage debate and critique transcripts. |
Keywords combine naturally in any order:
```bash
/council ml debate save Should we replace dense attention with GQA?
/council embedded overlay DMA buffer placement on STM32H5
/council quick Should we use SQLite or Postgres for local caching?
```

### Subcommands

| Subcommand | Purpose |
| --- | --- |
| `/council list` | Print every available council (built-in presets + user-defined entries from `.omp/council.yaml`) with persona details and tool capabilities. |
| `/council init` | Scaffold `.omp/council.yaml` with documentation and an example council. Pass `force` to overwrite an existing file (`/council init force`). |
| `/council edit` | Open `.omp/council.yaml` directly in the built-in TUI text editor to edit presets, personas, prompts, and default selection without leaving the harness (alias `/council config`). |
### Available Keywords

#### Mode
- `quick` *(Default)*: 2-stage fast deliberation (Parallel fan-out → Chairman synthesis in ≈ 4–6s).
- `deep` / `debate`: 3-stage deliberation (Drafts → Chatham-House blind cross-critique → Chairman synthesis).
- `raw`: 1-stage raw multi-perspective fan-out (no Chairman arbitration).

#### Persistence & Output
- `save` / `record`: Persist the deliberation transcript and Ed25519-signed decision record to `.omp/scratch/debates/YYYY-MM-DD_<topic>.md`.
- `actionable`: Include explicit follow-up implementation command suggestions in the verdict card.
- `verbose`: Show detailed multi-stage discussion and persona critique transcripts (by default, discussion is minimal and silent).
- `compact` / `terse` / `summary`: Render a compact 4-line ANSI summary card instead of the full card.
- `overlay` / `modal`: Open the interactive Council Verdict overlay (`[1] Verdict`, `[2/3/4] Persona A/B/C`) when the runtime has an interactive UI. Use `j/k` to scroll, `s` to save, `Enter` to run `/implement` with the consensus invariants, `Esc/q` to dismiss.
- `software` *(Default)*: Use the default software triad (Minimalist / Architect / Security).
- `ml`: Use the ML-research triad (Model Architect / Eval Critic / Inference Engineer).
- `embedded` / `firmware`: Use the embedded triad (Realtime Auditor / Hardware Safety / Baremetal Pragmatist).
- `ee` / `hardware`: Use the electrical-EE triad (Signal & Power Integrity / Component DFM / Safety & Compliance).
- `council <name>` / `preset <name>`: Select a custom or built-in council by id from `.omp/council.yaml`.
When invoked with **no arguments**, open the interactive selector dialog (Mode, Council, Persistence) before launching.

---

## Built-in Council Presets

### `default-triad` (alias `software`)
1. 🟢 **Minimalist (`ponytail`)** — YAGNI, platform-native simplicity, line-count deletion.
2. 🔵 **Systems Architect** — Deep module boundaries, testable seams, maintainability 6 months out.
3. 🟡 **Security & Invariant Auditor** — Adversarial failure modes, boundary validation, safety invariants.

### `ml-research` (alias `ml`)
1. 🧠 **Model Architect** — Deep learning model architectures, loss functions, representation learning, scaling laws. *Tools: `web_search`, `read`, `grep`.*
2. 📊 **Eval Critic** — Benchmark rigor, data leakage, statistical significance, overfitting, ablation validity. *Tools: `web_search`, `read`, `grep`.*
3. ⚡ **Inference Engineer** — KV cache economics, memory footprint, quantization, throughput, latency budgeting. *Tools: `web_search`, `read`, `grep`.*

### `embedded` (alias `firmware`)
1. ⏱️ **Realtime Auditor** — ISR latency, deterministic timing, memory constraints (DTCM/SRAM), zero-allocation invariants. *Tools: `read`, `grep`, `glob`.*
2. 🛡️ **Hardware Safety** — Register configurations, DMA bus access, peripheral contention, brownout recovery. *Tools: `read`, `grep`, `glob`.*
3. 🪶 **Baremetal Pragmatist** — C/Rust zero-cost abstractions, compiler optimizations, minimal HAL dependencies. *Tools: `read`, `grep`.*

### `electrical-ee` (aliases `ee`, `hardware`)
1. 🔌 **Signal & Power Integrity** — Decoupling, impedance matching, power plane topology, ground loops, noise margins. *Tools: `web_search`, `read`, `grep`.*
2. 🧩 **Component DFM** — Part lifecycle/availability, thermal dissipation, pin-mux conflicts, test points. *Tools: `web_search`, `read`.*
3. �️ **Safety & Compliance** — ESD protection, reverse polarity, overvoltage clamp, fail-safe power states. *Tools: `web_search`, `read`.*

---

## Stage 1 — Persona Resolution & Parallel Fan-Out (mandatory)

### SILENT-BY-DEFAULT DIRECTIVE
You MUST be **completely silent** before and during subagent dispatch:
- **ZERO commentary before task dispatch**: NEVER print text like "Spawning personas...", "Drafting tasks...", or intermediate planning walls of text in chat.
- **Immediate dispatch**: Directly issue a single `task({ tasks: [...] })` tool call containing all $N$ personas defined in the injected `Council Execution Contract`.

You MUST spawn **all $N$ active personas in parallel** ($N \ge 1$, matching the project's `.omp/council.yaml` or preset configuration) — never simulate the personas yourself, never inline their prompts into your own response. Each subagent receives its persona system prompt, the user's proposal, the relevant codebase context, AND a `tools` allow-list (so ML researchers, software architects, and embedded engineers know they may execute web searches or read reference repos like `.omp/references/` to back claims with primary sources). Each subagent returns a strict JSON object:

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

Pass a single `tasks[]` batch with $N$ entries (one per active persona in the contract) so the runtime executes them concurrently:

```ts
task({
  tasks: personas.map((p) => ({
    name: `council-${p.id}`,
    agent: "task",
    task: `# Persona\n${p.systemPrompt}\n\n# Tools\n${(p.tools ?? []).join(", ") || "default set"}\n\n# Proposal\n${proposal}\n\n# Codebase Context\n${codebaseContext}\n\n# Output\nRespond with ONLY a JSON object matching this schema:\n{ "personaId": "${p.id}", "personaName": "${p.name}", "stance": "...", "recommendation": "...", "keyInvariants": ["..."], "caveats": ["..."], "confidence": 0.0-1.0 }`,
  })),
})
```
Each subagent MUST:
- Receive the persona system prompt as a **persona prefix** before the proposal.
- Receive the `tools` allow-list as a separate prefix line (so ML/EE personas know they may execute `web_search`).
- Receive any relevant codebase snippets (the calling agent gathers them — never let a subagent invent file paths).
- Emit the strict JSON shape above as its terminal output. No prose, no markdown fences.

Validate each subagent result against the schema before Stage 2/3. If a subagent returned malformed JSON, retry once; if still malformed, fall back to a synthetic opinion with `confidence: 0` and a `caveats` entry recording the parse failure.

---

## Stage 2 — Chatham-House Blind Cross-Critique *(only when `deep` or `debate` is set)*

When the user passes `deep` or `debate`, you MUST run Stage 2 before synthesis. Anonymize the Stage 1 outputs:
- Persona A → Proposal A
- Persona B → Proposal B
- Persona C → Proposal C

Then spawn **3 parallel cross-critique subagents** (one per anonymized proposal). Each critique subagent receives the full set of three anonymized proposals plus this preamble:

> *"You are reviewing Proposal X (anonymized; the original author is unknown to you). Critique it adversarially: identify weaknesses, unstated assumptions, missing invariants, and better alternatives. Do NOT try to identify the original persona — focus on the proposal's engineering merits only."*

Each critique subagent MUST emit the same strict JSON schema, with the new fields:
- `keyInvariants` now lists the **strongest** invariants across all proposals.
- `caveats` now lists the **most serious** weaknesses of Proposal X.
- `confidence` reflects the cross-critique's confidence in its critique.

After Stage 2, merge each persona's draft with their own critique to produce a refined opinion before Stage 3.

---

## Stage 3 — Star Chamber Chairman Synthesis

You are the chairman. Partition the opinions into 4 objective buckets:

- 🟢 **`[CONSENSUS INVARIANTS]` (Consensus)** — Hard constraints and facts explicitly confirmed by all personas. Safe to auto-apply.
- 🟡 **`[MAJORITY RECOMMENDATIONS]` (Majority)** — Directional actions supported by $\ge 60\%$ of personas. Note dissenting caveats.
- 🔵 **`[UNIQUE INSIGHTS]`** — Non-conflicting specialized discoveries (e.g. security edge cases, stdlib shortcuts).
- 🔴 **`[CRITICAL DIVERGENCES]`** — Fundamental architectural clashes. State the exact branching condition.

Render the verdict via the engine's `renderCouncilVerdictCard` over `customType: "council-verdict"`.

### MINIMAL DISCUSSION DIRECTIVE
By default, do NOT print intermediate persona debates or walls of discussion. After emitting the verdict card:
- Provide a **concise 3–5 bullet point executive summary** of the decision.
- Only print detailed persona critique logs and debate transcripts if `verbose: true` was specified.

### SINGLE-TURN DELIBERATION DIRECTIVE
Deliberation is strictly single-turn: once the verdict card and executive summary are emitted, deliberation concludes. Subsequent user turns are handled normally and must NOT be treated as council deliberations unless the user explicitly invokes /council again.

## Stage 4 — Persistence *(only when `save` or `record` is set)*
If the user passed `save` or `record`:

1. Resolve `git rev-parse HEAD` as `snapshot_id`.
2. Build the canonical payload `JSON.stringify({ snapshot_id, topic, consensusInvariants, verdictSummary }, Object.keys(data).sort())`.
3. Sign with `node:crypto` Ed25519 (ADR-034).
4. Write the decision record to `.omp/scratch/debates/YYYY-MM-DD_<topic_slug>.md`.
5. Emit the verdict card with `savedPath` populated.

## Interactive Verdict Overlay (`overlay`)

When `overlay` (alias `modal`) is passed and the runtime exposes `ctx.ui.custom`, launch the interactive Council Verdict overlay immediately so the user can read the verdict while the executing agent runs Stage 1. The overlay is modeled after `src/research/research-overlay.ts` and oh-my-pi TUI conventions.
- **Tabs**: `[1] Verdict & Consensus` (consensus invariants / majority / divergences / summary), `[2] Persona A`, `[3] Persona B`, `[4] Persona C` (un-truncated stance, recommendation, key invariants, caveats, confidence).
- **Keyboard**: `1-4` or `Tab`/`Shift+Tab` to switch tabs; `j`/`k` (or arrow keys) to scroll; `s` to save the record; `Enter` to dispatch `/implement` with the consensus invariants; `Esc` or `q` to close.

The 76-column ANSI verdict card continues to render in standard chat output even when the overlay is used — the overlay is an additional, opt-in inspection surface.

---

## Structured Verdict Presentation

Present the verdict to the user with these exact sections:

```
⚖️  COUNCIL VERDICT ◄ <council> (<MODE>) ►
Topic: <user topic>
Status: Deliberation Concluded · <ISO timestamp>

🟢 Consensus Invariants (3/3)
   • <invariant 1>
   • <invariant 2>

🟡 Majority Recommendations (2/3)
   • <recommendation 1>
   • <recommendation 2>

🔵 Unique Insights
   • [<Persona>] <insight>
   • [<Persona>] <insight>

🔴 Critical Divergences
   ⚡ <divergence issue>
   • <Persona>: <position>
   • <Persona>: <position>

💾 Saved Record: <path when `save`>
⟨Enter: Run /implement⟩ ⟨s: Save Record⟩ ⟨Esc: Dismiss⟩
```

---

When invoked without arguments (`/council`), the command opens an interactive selector dialog to pick Mode, Council, and Persistence before launching. In headless / CI mode, fall back to `quick` with no persistence.
