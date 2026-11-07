# Redesign From First Principles

Apply when integrating a new requirement into an existing design.

When integrating a substantial new requirement, do not bolt ad hoc flags or branches onto the existing design. Redesign the subsystem as if the requirement had been a core foundation from the start.

**Why:** Patching new capabilities onto architectures designed without them produces accidental complexity, scattered special-casing, and fragile state machines. Designing from clean foundations preserves cohesion and long-term option value.

- **Study the current architecture:** Inspect all affected modules, entry points, and domain interfaces to understand the assumptions of the existing implementation.
- **Ask the clean-slate question:** "If we were building this subsystem from scratch today with this new requirement as a primary invariant, what data models and interfaces would we construct?"
- **Compare clean-slate against incremental patch:** Contrast the clean-slate design against adding flags or wrapper logic. If the clean-slate model eliminates branches or simplifies caller interactions, adopt the foundational redesign.
- **Propagate through all references:** Update affected data structures, types, documentation, examples, and rationale sections to reflect the new architecture uniformly.
- **Deliver incrementally:** Design the target architecture as a unified whole, then decompose implementation into small, verifiable units per [skill://principles/sequence-verifiable-units.md](sequence-verifiable-units.md).

Distinct from [skill://principles/attack-the-premise.md](attack-the-premise.md), which questions an assumed fact when debugging failed fixes. This principle addresses accommodating new requirements into system architecture.
