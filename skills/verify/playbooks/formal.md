# Formal verification

Use when formally verifying critical invariants, concurrency races, retry loops, protocols, or state machines where bugs cost the most and unit tests reach the least.

## 1. Choose the target from the code

Inspect the codebase to identify critical invariants where a failure causes severe harm (data corruption, deadlock, financial loss, security bypass) and concurrency or state complexity makes standard testing insufficient. Target the highest-risk promise in the code:
- Concurrent state machines and race-prone workflows.
- Distributed protocols, two-phase commits, and retry policies.
- Resource locking, lease renewal, and transaction boundaries.
- Parsing logic and stateful protocol decoders.

State the promise and the safety or liveness invariant in plain language.

Completion criterion: Target source files, guarded state variables, and explicit invariant definitions are documented.

## 2. Select the verification tool

Select the verification tool that addresses the question with lowest overhead:
- **Model checker (TLA+/TLC, Spin, Alloy):** Best for verifying whether events can occur in an invalid order or deadlocks can arise in concurrent workflows. TLA+ is the standard default.
- **Code-level or SMT verifier (Kani, CBMC, Z3):** Best for checking memory safety, arithmetic bounds, or data-structure invariants directly against code implementations.
- **Proof assistant (Coq, Lean):** Reserved for universal mathematical properties requiring unbounded verification.
- **Property-based test generator:** Fallback when no formal verifier supports the language runtime.

Completion criterion: Tool selected with documented justification and runnable toolchain verified.

## 3. Scaffold local specification under `.omp/specs/<target>/`

Per standing project convention, formal model files are local design artifacts:
- Confirm `git check-ignore -q .omp/specs/<target>/x` succeeds. If it doesn't, add `.omp/specs/` to `.git/info/exclude` (local to this clone; leaves tracked files alone) rather than `.gitignore`.
- Create `.omp/specs/<target>/` and place all specification files there (e.g. `Spec.tla`, `Spec.cfg`, runner scripts).
- Keep the model true to the code: every transition in the model must map to an indivisible operation in the real code, using matching identifier names.
- Explicitly define finite model bounds, state constraints, and constants.

Completion criterion: Model files exist under `.omp/specs/<target>/` and `git check-ignore` reports them ignored.

## 4. Prove the model can fail (mutant check)

A formal check that has never been observed to fail proves nothing. Validate the specification by injecting a defect:
1. Create a broken mutant of the specification (e.g., remove a guard, reorder two actions, or widen an input range).
2. Run the verifier. Confirm that the tool catches the defect and emits a counterexample trace.
3. If the verifier passes on the broken model, the specification is vacuous. Correct the model until it reliably fails on the mutant.
4. Restore the correct specification and run the verifier to confirm a clean pass.

Completion criterion: Verifier output logs show an invariant failure on the mutant model and a clean pass on the restored model.

## 5. Replay counterexamples as real-code regression tests

When the verifier uncovers an invariant violation or bug:
1. Translate the counterexample trace into a plain sequential step list using the code's domain language (e.g., "1. Worker A acquires lease; 2. Worker B expires lease; 3. Worker A writes without lease").
2. Write a regression test against the actual application code that executes that exact step sequence.
3. Confirm whether the real code allows the sequence. If the real code allows it, a genuine product bug is proven; if the real code prevents it, the formal model made an invalid assumption (drift).
4. Keep the regression test in the repository's standard test suite.

Completion criterion: Any counterexample is converted into a plain step list and instantiated as an executable regression test in the codebase.

## 6. Record verification doc

Record the formal verification findings in a durable project document (such as `docs/formal/<target>.md`):
- Covered source files and the exact git commit hash at verification time (`sync commit`).
- Invariant statement in one plain English sentence.
- Tool, version, bounds, and exact command to run the verifier.
- Verification rounds, state space size, and execution duration.
- Links to corresponding regression tests in the test suite.
- Upkeep procedure reference pointing to [skill://verify/playbooks/formal-maintain.md](formal-maintain.md).

Do not commit the raw `.omp/specs/<target>/` model files unless explicitly requested by the user.

Completion criterion: Verification record document is written and saved under `docs/formal/<target>.md`.

## Reply

Hand back:
- Target verified and plain-language invariant statement.
- Tool chosen and execution command.
- Path to local specification files (`.omp/specs/<target>/`).
- Proof of failure log from the mutant check.
- Regression test file path for any counterexample identified.
- Path to durable documentation file.
