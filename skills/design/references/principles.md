# Architectural & Design Principles

Core behaviour-changing rules for designing modules, boundaries, domain logic, and concurrent processes.

## 1. Boundary Discipline

Concentrate validation, parsing, and defensive guards at system boundaries (CLI flags, network protocols, config files, third-party APIs). Trust internal code and internal types unconditionally.

- **Validate at the edge**: Parse raw or unstructured data into typed domain models immediately when entering the system.
- **Never re-validate inside**: Eliminate redundant nil/type checks deep in call chains when the boundary has already established the invariant.
- **Expose domain concepts**: Do not leak transport types, ORM entities, or wire formats through the domain surface. Keep general-purpose mechanism inside and special-purpose policy at the edges.
- **Pure domain logic**: Keep business logic in pure functions without framework dependencies.

## 2. Type System Discipline

Make the compiler reject impossible states, mismatched primitives, and unhandled variants. Prefer defining errors and edge cases out of existence over proliferating runtime handlers.

- **Brand semantic primitives**: `UserId` and `OrderId` are strings at runtime but must not be interchangeable. Brand primitive values at creation (e.g. branded types or newtypes), validate once, and trust downstream.
- **External data is untyped until parsed**: Do not cast incoming JSON or API payloads directly to domain types. Use a parsing step that validates shape before returning the domain type.
- **Derive types from authoritative schemas**: Derive types from protobufs, OpenAPI schemas, or database migrations rather than maintaining parallel handwritten types.

## 3. Model the Domain

Encode the real domain invariants in data structures instead of scattering conditionals and flags across call sites. Choosing the right structure at write time eliminates invalid states and deletes branches.

- **State machine over boolean flags**: Replace scattered booleans and lifecycle checks with explicit states and legal transitions.
- **Lookups over scattered branching**: Use maps, registries, or discriminated unions instead of growing `if/else` chains across files.
- **Domain knowledge over temporal decomposition**: Organize modules around cohesive domain concepts, not execution steps (such as `load`, `validate`, `transform`, `save`). Temporal pipelines repeat domain rules across phases.
- **Avoid speculative abstraction**: Prefer plain, boring code when the domain logic is simple, local, and stable. Add structure only when it removes invalid states, branches, or duplication.

## 4. Separate Before Serializing Shared State

When concurrent actors (processes, subagents, background jobs) might share mutable state, first ask whether they need the same mutable object.

- **Default to eliminating sharing**: Give each actor its own file, key, branch, or state directory. Merge results only at the final read or reporting boundary. Two workers writing independent fields to one `state.json` is still shared mutation; splitting into `worker-a.json` and `worker-b.json` eliminates the race.
- **Serialize structurally only when sharing is an invariant**: Only when a single shared target is non-negotiable, enforce serialization through locks, sequential phases, or compare-and-swap. Conventions and written instructions are not concurrency control.

## 5. Make Operations Idempotent

Design operations and processing loops to converge to the correct state regardless of run count or where a prior attempt stopped.

- **Derive steps from current state**: Compare current state against the target goal and apply only the difference. Do not rely on what a previous run meant to do. A step designed this way is safe to repeat because a subsequent run finds zero remaining work.
- **Durable staleness evidence**: Judge leftover markers (locks, temp files, partial records) using evidence that remains true across crashes (e.g. write to a temporary file and atomically rename into place; content hashing over timestamps).
- **The idempotence test**: If repeating the operation or crashing halfway leaves state that requires manual cleanup, add an explicit reconciliation step.

## 6. Exhaust the Design Space

When facing a novel interaction, unproven state model, or architectural choice with no precedent in the codebase: build 2–3 competing prototypes side-by-side before committing.

- **Feel over paper**: Compare usability, ergonomics, and structural trade-offs by testing interactive variations rather than arguing hypothetical merits.
- **Radical divergence**: Ensure candidates explore structurally different points in the design space (e.g. minimal surface vs maximum caller flexibility vs ports and adapters).
