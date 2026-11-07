# Migrate Callers Then Delete Legacy APIs

Apply when introducing a new internal API while old callers still exist. Migrate callers and delete the old API in the same wave instead of preserving compatibility layers.

When replacing internal APIs, migrate all existing callers and eliminate the obsolete interface in the same wave. Do not preserve long-lived compatibility shims for internal consumers.

**Why:** Transitional shims, aliases, and dual-mode compatibility paths linger indefinitely, multiplying maintenance burden, confusing new contributors, and obscuring canonical patterns.

- **Clean cutover by default:** Update all call sites across the codebase in lockstep with the API change. Once callers are updated, delete the legacy interface, obsolete adapters, and dead exports.
- **Update the test suite:** Rewrite tests to assert against the new contract directly. Delete tests that exist solely to protect pre-refactor implementation details or deprecated wrappers.
- **When this applies:**
  - The API is internal to the repository or monorepo, with no external package consumers depending on backward compatibility.
  - The codebase can absorb a single coordinated breaking change.
  - The change is part of an architectural simplification, cleanup, or refactoring effort.
- **When external consumers exist:** When backward compatibility is an external contract, mark the legacy API as deprecated, issue a compiler warning, set a concrete removal milestone, and maintain a minimal compatibility wrapper.
