# Laziness Protocol

Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading. Bias toward deletion and the smallest change that solves the problem.

Choose the simplest, shortest, and most direct solution that solves the problem. The best code is code never written.

**Why:** Over-engineered layers, speculative abstractions, and bloated diffs create immediate maintenance debt and 3am production incidents. Small, focused changes are easier to understand, review, and keep reliable.

- **Follow the laziness ladder:**
  1. *Does this need to exist?* Question whether speculative requirements are necessary (YAGNI).
  2. *Already in the codebase?* Reuse existing helpers, types, and patterns instead of re-implementing adjacent utilities.
  3. *Standard library does it?* Reach for built-in runtime modules before writing custom solutions.
  4. *Platform native feature covers it?* Prefer native runtime and language capabilities over external dependencies.
  5. *Can it be one line?* Write the direct expression rather than a multi-line helper.
  6. *Minimum code that works:* Implement the tightest diff that satisfies the real acceptance criteria.
- **Lazy bug fixing addresses the root cause:** Patching one symptom callsite leaves sibling callers broken. Fixing the single shared function that all callers route through is both smaller and complete.
- **Consolidate decisions:** Avoid scattering identical decisions across multiple files. Place the evaluation behind a single source of truth and pass the result as a simple flag or value.
- **Reject unrequested abstractions:** No interface with a single implementation, no factory for a single product, no configuration knobs for constants that never change.
- **Deletion over addition:** Bias toward deleting code, collapsing layers, and shrinking the overall codebase footprint.

For the parent skill channeling these instincts, see `ponytail`.
