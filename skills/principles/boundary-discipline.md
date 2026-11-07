# Boundary Discipline

Apply when wiring validation, error handling, or framework adapters. Concentrate guards at system boundaries (CLI, config, network, external APIs); trust internal types and keep business logic in pure functions.

Place validation, type narrowing, and error handling at system boundaries. Trust internal code unconditionally. Business logic lives in pure functions; the shell is thin and mechanical.

**Why:** Scattered validation is noisy, redundant, and gives a false sense of safety. Keeping logic out of framework wiring lets domain behavior run and test without framework dependencies.

- **At boundaries** (CLI args, config files, external APIs, network protocols, database rows): validate shape, parse into typed domain models, and handle errors defensively.
- **Inside the system:** work with typed data, propagate errors, and eliminate redundant nil or type checks deep in call chains. Trust established invariants.
- **Across the boundary:** expose domain concepts, never the boundary's transport, storage, ORM entity, or wire format through the public surface. Keep general-purpose mechanisms inside and special-purpose policy at the edges.
- **Pure domain logic:** structure core behavior as pure functions (raw bytes to typed state, structured state to output string, domain state to calculation results).
- **The boundary test:** ask "is this data crossing a system boundary right now?" If not, validation is redundant. Ask "can this be a pure function that the outer shell calls?" If yes, extract it.
