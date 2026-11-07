# Minimize Reader Load

Apply when reviewing or shaping code that's hard to trace. Count layers between question and answer, and hidden state in the reader's head; collapse one-caller wrappers and shrink mutable scope.

Reduce the cognitive work required to understand and trace code by minimizing intermediate abstraction layers and reducing hidden mutable state.

**Why:** Maintainability is the effort a reader spends following logic. Two independent factors inflate cognitive load: *layers to trace* (indirections separating a call from the real work) and *state to hold* (ambient or mutable context kept in memory).

- **Collapse low-value layers:** Inline single-caller wrapper functions, adapters without alternative implementations, and speculative indirection layers that do not simplify the model.
- **Require interface compression:** An abstraction layer must change the level of abstraction and hide meaningful complexity. Pass-through functions that simply forward parameters add reader burden without compression.
- **Shrink mutable state scope:**
  - Prefer pure functions (explicit return values over parameter or ambient mutations).
  - Prefer local variables over object fields, instance fields over module-level singletons, and module variables over globals.
  - Derive computed state at read time instead of synchronizing multiple mutable fields across writes.
- **Name invariants at the boundary:** Validate and name core domain constraints at the system boundary once, so readers do not have to verify preconditions at every internal usage site.
- **The 30-second comprehension test:** Can an engineer unfamiliar with the file answer "where does this value come from?" and "what code can modify this value?" in under 30 seconds? If not, inline intermediate layers or eliminate mutable scope.

This is the human counterpart to [skill://principles/guard-the-context-window.md](guard-the-context-window.md). Working memory is finite for human readers and language models alike.
