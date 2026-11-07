# Type System Discipline

Apply when designing types, reviewing a function signature, or writing code in any statically-typed language. Make illegal states unrepresentable, brand semantic primitives, parse external data at boundaries, exhaust variants, derive from authoritative schemas.

Use the type system to make impossible states unrepresentable, prevent primitive confusion, and guarantee compile-time exhaustiveness. Prefer defining errors out of existence over proliferating runtime error handlers.

**Why:** Runtime guards and defensive type checks can be omitted or drift out of sync. Compile-time enforcement catches defects during compilation and documents domain invariants directly in code.

- **Brand semantic primitives:** Distinguish interchangeable primitives (`UserId` vs `OrderId` vs `SessionId`) using branded types or nominal wrappers (newtypes). Validate the value once at creation time and trust the brand downstream. If two function arguments share a primitive type but convey different domain meanings, brand them.
- **Parse external data at boundaries:** Never cast unvalidated input (HTTP request bodies, CLI arguments, database rows, configuration files, IPC messages) directly to internal domain types. Use a parsing step that validates structure before returning a typed model per [skill://principles/boundary-discipline.md](boundary-discipline.md).
- **Make illegal states unrepresentable:** Use discriminated unions rather than multiple optional fields to represent mutually exclusive states (e.g. `Loading | Success(data) | Failure(error)` instead of `{ isLoading: bool, data?: T, error?: Error }`).
- **Exhaust variants at compile time:** When handling discriminated unions or enums, ensure the compiler enforces exhaustive checks on all variants so adding a new variant breaks compilation at unhandled call sites.
- **Derive types from authoritative schemas:** When a database migration, OpenAPI specification, protobuf schema, or config schema owns a data structure, generate code or derive types directly from the schema rather than writing manual duplicate interfaces per [skill://principles/encode-lessons-in-structure.md](encode-lessons-in-structure.md).
