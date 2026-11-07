# Model the Domain

Apply when writing stateful logic, or when code branches a lot or repeats a shape assumption across files.

Encode core domain rules and invariants into explicit data structures rather than scattering conditionals, boolean flags, and lifecycle checks across call sites.

**Why:** A data model that mirrors the actual domain makes impossible states unrepresentable at compile time and deletes scattered branching logic. Choosing the right structure at write time is fast; untangling ad hoc branching later is expensive.

- **State machines over boolean flags:** Replace scattered booleans (`isPending`, `isProcessed`, `isError`) with explicit enumerated states and permitted transitions.
- **Typed models over loose dictionaries:** Pass validated domain types rather than loose parameter bags or unvalidated string keys.
- **Registries and lookup tables over `if/else` chains:** Replace sprawling conditional trees across files with dispatch maps, registries, or discriminated unions.
- **Cohesive domain modules over temporal phases:** Organize code around cohesive domain concepts rather than sequential execution phases (such as `load`, `validate`, `transform`, `save`). Temporal phase modules duplicate business rules across steps.
- **Command/event or reducer patterns:** Centralize state mutations behind structured actions rather than mutating shared fields from disparate call sites.
- **Avoid speculative abstraction:** Favor plain, boring code when domain logic is simple, local, and stable. Introduce structural abstractions only when they remove invalid states, duplicated invariants, or branching complexity.
- **Warning signs:** Adding a third flag to keep in sync with earlier booleans, growing an existing `switch` by another branch, or seeing identical shape checks repeated across separate files.

For domain modeling workflows and ubiquitous language, see [skill://design/playbooks/domain-model.md](../design/playbooks/domain-model.md).
