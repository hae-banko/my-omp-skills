# Prototype

Use when building a throwaway prototype to answer a design question: sanity-checking whether a state model or logic feels right, or exploring what a UI should look like.

## Steps

1. **Pick the branch and state the question**:
   Identify which question the prototype answers:
   - **"Does this logic / state model feel right?"** → Logic branch, following [skill://design/references/LOGIC.md](../references/LOGIC.md).
   - **"What should this look like?"** → UI branch, following [skill://design/references/UI.md](../references/UI.md).
   If ambiguous, default to the branch matching the surrounding code (backend module → logic; page or component → UI) and state the assumption. Write down the design question explicitly in one paragraph in the prototype file or its README. Exhaust the design space per [skill://principles/exhaust-the-design-space.md](../../principles/exhaust-the-design-space.md) by evaluating competing models or layouts side by side; for UI, judge them by what the user experiences, not by what is easiest to build ([skill://principles/experience-first.md](../../principles/experience-first.md)).
   *Completion criterion*: Design question stated in writing with the target branch and decision criteria identified.

2. **Isolate core logic or draft UI variants**:
   - **Logic branch**: Write a pure, portable module answering the question behind a small interface per [skill://design/references/LOGIC.md](../references/LOGIC.md) (a pure reducer `(state, action) => state`, a state machine with explicit legal transitions, or pure functions per [skill://principles/model-the-domain.md](../../principles/model-the-domain.md)). Keep it completely free of I/O, terminal escapes, and logging so it can lift cleanly into production code once settled.
   - **UI branch**: Draft 2–4 structurally distinct variants (`VariantA`, `VariantB`, `VariantC`) per [skill://design/references/UI.md](../references/UI.md). Make variants structurally different (different layouts, information hierarchies, or affordances — not minor cosmetic tweaks). Strongly prefer sub-shape A (mounting variants inside an existing page gated by `?variant=`) over sub-shape B (a throwaway route).
   Follow throwaway rules: keep state in memory by default, skip tests and error handling beyond what makes the prototype runnable, and skip speculative abstractions.
   *Completion criterion*: Portable logic module or 2–4 structurally distinct UI components implemented without production polish.

3. **Build the runner and state viewer**:
   - **Logic branch**: Build a lightweight TUI that clears the screen on every tick, renders the full current state (bolding field names, dimming timestamps/IDs), lists keyboard shortcuts, reads one input at a time, and updates the display.
   - **UI branch**: Mount a floating switcher bar at the bottom-center of the screen with previous/next controls and keyboard arrow navigation (`←`/`→`), updating the `?variant=` URL parameter so states are shareable and reload-stable. Hide the switcher in production builds (`process.env.NODE_ENV !== 'production'`).
   *Completion criterion*: Interactive runner displays full state changes on every action or variant switch.

4. **Wire single-command execution**:
   Configure or confirm a single command in the project's task runner (`package.json` scripts, `Makefile`, `justfile`, `pyproject.toml`) so the user can run `pnpm run <prototype>`, `python <path>`, or `bun <path>` without memorizing paths.
   *Completion criterion*: Prototype executes locally via a single documented command.

5. **Drive, validate, and capture the outcome**:
   Drive the prototype through edge cases with the user to discover bugs in the concept. Once the question is settled:
   - Extract the validated logic module or winning UI variant into the real codebase.
   - Capture the prototype as a primary source on a throwaway branch (out of main) and reference it in the implementation ticket or commit.
   - Remove throwaway scaffolding (TUI runner, losing variants, switcher bar) from the main branch.
   *Completion criterion*: Validated logic or layout folded into production code; throwaway artifacts cleaned up or preserved on a separate branch.

## Reply

Hand back:
1. The exact single command to run the prototype.
2. File paths of the prototype and instructions for interacting with it (keybindings or `?variant=` options).
3. The design question settled and notable edge cases observed during execution.
4. Clean-up plan: what was kept for production and what was discarded.
