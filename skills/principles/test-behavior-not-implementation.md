# Test Behavior, Not Implementation

Apply when you write, change, or keep a test. Assert what the code's users can observe, so that the test fails when that behavior breaks and keeps passing when only the internals change.

Assert observable contract behavior through public interfaces rather than inspecting private state, internal helper functions, or execution mechanics.

**Why:** Tests tied to private implementation details break on every internal refactor while failing to catch real behavioral defects. Testing observable behavior ensures tests remain green during refactoring and catch regressions when requirements break.

- **The two-edit test:** Evaluate every automated test against two scenarios:
  1. *Break the behavior:* Intentionally corrupt a return value, skip an external side effect, or duplicate an operation. The test MUST fail. If it still passes, the test is hollow or asserts unconstrained mock state.
  2. *Change internal implementation:* Refactor private helpers, data structures, or call orders while preserving public output. The test MUST remain green. If it fails, the test is pinned to implementation details.
- **Drive through the public interface:** Invoke code through the interface its callers use (public methods, CLI entry points, HTTP routes, IPC endpoints). Derive expected values from external specifications, not by executing the code under test to generate snapshots.
- **Observable effects vs private mechanics:**
  - *Observable behavior:* Returned results, thrown error types, database rows committed, messages sent across network boundaries, external HTTP requests made.
  - *Internal implementation:* Private helper calls, internal method invocation counts, intermediate object shapes, or which specific class handled the step.
- **Contract decides assertion shape:** When testing error cases, assert the error type or invariant that callers branch on, rather than fragile human-facing string messages.

For test-driven workflows and refactoring cycles, see `tdd`.
