# Foundational Thinking

Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious.

Structure data shapes and infrastructure foundations before implementing feature logic. Sound data structures make downstream logic simple, while flawed structures force scattered complexity.

**Why:** Code-level decisions protect immediate simplicity; structural decisions protect long-term option value. Getting data shapes right eliminates branches, synchronization hazards, and speculative layers.

- **Data structures first:** Define core domain types early, map access patterns, and choose structures aligned with dominant read and write paths.
- **Scaffold before features:** If an artifact benefits every subsequent phase, build it first. Shared types, test harnesses, CI checks, and lint configurations come before feature logic.
- **Sequence for option value:** Subtract dead code first, build foundational types and scaffolding second, and implement feature logic on top of the simplified base.
- **DRY the structure, not every line:** Converge core domain types and data models. Three similar statements in local logic beat an unrequested premature abstraction.
- **Evaluate concurrency upfront:** Before sharing state between concurrent actors, ask: "What happens if another actor modifies this concurrently?" If the answer is not "nothing", isolate state per [skill://principles/separate-before-serializing-shared-state.md](separate-before-serializing-shared-state.md).
- **Deepen existing abstractions:** Ensure each addition lands a cohesive abstraction or deepens an existing one, rather than scattering special-case coordination across callers.

For orchestrating large, unstructured multi-phase tasks, see [skill://design/playbooks/figure-it-out.md](../design/playbooks/figure-it-out.md).
