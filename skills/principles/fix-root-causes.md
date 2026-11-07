# Fix Root Causes

Apply when debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.

Fix defects where invalid state originates, not downstream where the symptom becomes visible.

**Why:** Symptom fixes mask underlying bugs and leave defects free to trigger secondary failures elsewhere. Each local workaround adds complexity and obscures system invariants.

- **Reproduce with an automated loop:** Construct a reproducible command, failing test, or minimal script that triggers the symptom before modifying code.
- **Trace backwards with "Why":** Ask "why" at each boundary until reaching an incorrect code decision or missing state handler, rather than a downstream consequence.
- **Distinguish legitimate from illegitimate states:**
  - *Legitimate state:* The system is permitted to enter this state. The code failing to handle it is the defect; handling it there is the correct fix.
  - *Illegitimate state:* The state should never exist. Adding local null checks, defensive guards, swallowed errors, retries, or clamped values at the crash site hides the bug. Trace back to the producer that created the invalid state and fix it there.
- **Inspect persisted state on restart bugs:** If an issue surfaces only across restarts or clean boots, examine caches, disk state, configuration files, database migrations, or lockfiles first.
- **Fix the pattern across callers:** When a bug is identified, grep for all callers and sibling implementations that share the flawed assumption. Fix the root cause in the shared component once rather than patching one callsite.
- **Code over comments:** If a workaround requires an explanatory comment justifying why invalid state is tolerated, the fix is wrong. Fix the underlying state transition.
- **Add durable prevention:** Pair the fix with an automated regression test, type constraint, or always-on assertion that flags the condition immediately if reintroduced.

For diagnostic procedures, see [skill://investigate/playbooks/diagnose.md](../investigate/playbooks/diagnose.md).
