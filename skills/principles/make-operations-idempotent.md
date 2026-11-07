# Make Operations Idempotent

Apply when designing commands, lifecycle steps, or processing loops that run amid crashes, restarts, and retries. Converge to the same end state regardless of partial prior runs.

Design state-mutating operations and lifecycle loops so they converge to the target state regardless of how many times they run or where a previous execution halted.

**Why:** Real systems face process restarts, container retries, network interrupts, and crashes. When partial mutations alter subsequent outcomes, recovery requires manual intervention and ad hoc debugging.

- **Derive operations from current state:** Read the actual system state, compare it against the target goal, and execute only the diff. Never assume prior execution completed or intended steps succeeded. Repeating an operation on a converged state yields zero pending work.
- **Durable staleness detection:** Design temporary markers (lock files, temporary directories, half-written database records, processing tokens) so subsequent runs can reliably determine whether they are stale. Use crash-safe mechanisms:
  - Write complete outputs to unique temporary files, then atomically rename into the destination path.
  - Rely on content hashing or durable generation markers rather than ephemeral timestamps or creation order.
- **Evaluate crash safety at every point:** Ask three questions for every state mutation:
  1. What happens if this runs twice in immediate succession?
  2. What happens if the process terminates at any point mid-execution?
  3. Does re-running always converge to the identical end state?
- **Reconciliation over manual recovery:** If the answer to any question is "it depends on what partial state was left behind," add an explicit reconciliation check at startup.
