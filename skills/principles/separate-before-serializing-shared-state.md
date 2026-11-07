# Separate Before Serializing Shared State

Apply when concurrent actors might write to the same file, branch, key, or state object. Eliminate the sharing first; serialize structurally only when one shared writer is a real invariant.

When concurrent processes, subagents, or background jobs might share mutable state, default to eliminating the shared target entirely. Enforce serialization structurally only when a single shared target is an inescapable invariant.

**Why:** Concurrent writes to shared mutable state cause race conditions, data corruption, and deadlocks that are intermittent and difficult to reproduce. Eliminating shared state prevents concurrency bugs by design.

- **Identify shared mutable state:** Locate files, database rows, cache keys, memory objects, or git branches that multiple concurrent actors read and write simultaneously.
- **Default to eliminating sharing:** Ask whether workers truly need to mutate a single canonical object or if they are emitting independent facts. Give each actor its own file, partition key, branch, or scratch directory, and aggregate results only at the final reporting boundary.
  - *Example:* Two worker tasks writing independent fields into a single `state.json` is still a race condition. Splitting into `worker-a.json` and `worker-b.json` eliminates the race entirely.
- **Serialize structurally only when sharing is an invariant:** Only when a single shared target is non-negotiable, enforce access through structural controls: lockfiles, atomic compare-and-swap (CAS), or sequential execution phases.
- **Conventions are not concurrency control:** Written instructions, prompt warnings, and informal agreements cannot prevent race conditions. Treat "we need a lock" as a design smell to investigate before adopting it as the default.

For coordinating multi-worker tasks and managing agent workpools, see [skill://design/playbooks/figure-it-out.md](../design/playbooks/figure-it-out.md).
