# Sequence Verifiable Units

Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. Break work into small units that each end in a verifiable state, check each before the next, and order delivery so the sequence proves itself to a reviewer.

Decompose complex tasks, migrations, and code sweeps into small units that each terminate in an independently verifiable green state. Verify each unit before starting the next.

**Why:** A regression discovered immediately at the unit that introduced it is trivial to diagnose and revert. A failure discovered after batching ten changes is buried, forcing bisection across a broken base.

- **Before/after bracket execution:** Treat each unit as a discrete experiment: start from a clean baseline, apply one change, run the automated verification check, and advance only when green. Revert immediately if the check fails.
- **Stack delivery to prove the work:** Order commits and PRs so the sequence serves as a logical demonstration to a reviewer:
  - Commit the failing test or baseline capture first.
  - Commit the fix or implementation on top, turning the check green.
  - Apply dead code subtractions before architectural reshapes.
  - Place foundational scaffolding before dependent feature code.
- **Run per-unit checks even with automated levers:** When using a script or codemod to execute bulk edits, run the automated verification on each unit or batch. Low execution cost makes per-unit checking fast and reliable.
- **Avoid batching unverified work:** Never accumulate multiple speculative edits before running verification checks.

For verifying real artifacts directly, see [skill://principles/prove-it-works.md](prove-it-works.md); for scripting automated checks, see [skill://principles/build-the-lever.md](build-the-lever.md).
