# Maintain formal verification

Use when bringing formal specifications and invariants back in sync with application code after merges, refactors, or feature modifications.

## Outcomes

Every check receives one outcome:
- **in sync** — no changes alter verified properties, and the formal check passes on current code.
- **updated** — code changed, specification updated to describe the new code, and the formal check passes.
- **bug** — specification accurately describes current code, and the code violates the invariant.
- **blocked** — check could not run or cannot be reconciled with current code.

## Edit scope

Edit only formal specifications under `.omp/specs/<target>/`, documentation under `docs/formal/`, and regression tests. Never edit product code during a maintenance pass unless explicitly instructed. Do not weaken invariants to make a failing check pass.

## 1. Locate verification target and sync commit

Read the verification documentation (`docs/formal/<target>.md`) and the local model files (`.omp/specs/<target>/`). Extract:
- Verified source files and functions.
- Stated invariants and model bounds.
- Execution command.
- Last recorded `sync commit` hash.

If no formal verification exists, direct the user to [skill://verify/playbooks/formal.md](formal.md). If no sync commit is recorded, use the commit that last modified the specification files.

Completion criterion: Target specification, covered source paths, and sync commit are identified.

## 2. Run check in baseline state

Run the formal verification check before modifying any files. Record whether the existing model passes or fails against current tooling. Note that an old passing check may merely describe obsolete code.

Completion criterion: Initial execution status recorded.

## 3. Diff covered code against sync commit

Run `git diff <sync-commit>..HEAD` for all covered source files. Categorize every change:
- **No effect:** Formatting, comments, or unverified helper paths.
- **Verification drift:** Action granularity changed (one step split into two), new branches added, or variable bounds changed. The model must be updated.
- **Intentional promise change:** The contract changed deliberately, supported by commit messages, docs, or tests. Invariants must be updated with cited justification.
- **Potential bug:** Implementation changed behavior without evidence of intentional contract modification.

Completion criterion: Every diff hunk in covered files is categorized into one of the four types.

## 4. Update specification from code

Update the model files in `.omp/specs/<target>/` to reflect current code structure:
- Ensure each indivisible step in the code maps to one indivisible action in the model.
- Update variable domains and state transitions to match current logic.
- Do not adjust models to make checks pass; write the model purely from code inspection before re-running.

Completion criterion: Specification files in `.omp/specs/<target>/` reflect current codebase logic.

## 5. Rerun and evaluate: drift versus bug

Execute the updated verification check:

- **Check passes:** Verify that the check retains the ability to fail. Inject a deliberate mutant break (e.g. drop a guard), confirm the tool detects it, and revert the mutant.
- **Check fails:** Translate the counterexample into a sequential list of steps in the code's domain language. Replay each step against the real application code:
  - If a step cannot physically occur in real code: the failure is **drift** (the model is inaccurate). Refine the specification.
  - If all steps can occur in real code: the failure is a confirmed **bug**. Identify the introducing commit, author a reproducible regression test in the test suite, and document the specific harm.

Completion criterion: Outcome evaluated with mutant proof for passes, or plain-language counterexample replay for failures.

## 6. Update sync commit and documentation

Update `docs/formal/<target>.md`:
- Advance the `sync commit` hash to current HEAD (do not advance for `blocked` checks).
- Document changes made to model structure or invariants.
- Record rerun results, state counts, and any confirmed bugs.

Completion criterion: Documentation reflects current HEAD commit and outcome.

## Reply

Hand back:
- Outcome: `in sync`, `updated`, `bug`, or `blocked`.
- Commits evaluated between sync commit and current HEAD.
- Summary of model updates made and rationale.
- For confirmed bugs: step-by-step counterexample in code terms, introducing commit, and link to added regression test.
- Proof of failure log from mutant testing.
