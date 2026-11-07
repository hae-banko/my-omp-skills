# Diagnose

Use when diagnosing hard bugs, failures, crashes, or performance regressions ("diagnose", "debug this", broken, throwing, failing, slow).

When exploring the codebase, read relevant architecture docs, check existing ADRs in `.omp/adr/` or `docs/adr/`, and consult `.omp/knowledge/` for past pitfalls before modifying code.

## 1. Build a Feedback Loop

Construct a tight, automated pass/fail feedback loop before reading source code to hypothesize. If you have a tight command that goes red on this specific bug, finding the cause is mechanical.

Order of preference to construct the loop:
1. **Failing automated test** at the closest viable seam (unit, integration, or end-to-end).
2. **CLI or HTTP script** against a local process, diffing output against expected snapshot.
3. **Headless browser script** driving the interface and asserting on console/DOM/network state.
4. **Replayed captured trace** (saved payload or network recording run through the isolated code path).
5. **Throwaway harness** spinning up the minimal subsystem in memory.
6. **Property / fuzz test** running randomized inputs to expose edge-case failure modes.
7. **Bisection harness** automating `git bisect run` between known good and bad revisions.
8. **Differential loop** comparing output of old vs new implementations on identical inputs.
9. **Human-in-the-loop script** as a last resort: use `[skill://investigate/scripts/hitl-loop.template.sh](../scripts/hitl-loop.template.sh)` to guide manual terminal verification and capture structured output.

Tighten the loop:
- Ensure the command executes in seconds, not minutes.
- For non-deterministic bugs, increase the reproduction rate: loop the run 100x, apply concurrency, or pin seeds and clocks until the failure reproduces reliably.
- For performance regressions, establish an automated baseline measurement first (profiler, timing harness, or query plan) before inspecting code.

If you genuinely cannot build an automated loop, halt and state what was attempted. Request required environment access, a captured trace artifact, or permission for temporary production instrumentation.

*Completion criterion:* A single reproducible command has executed, caught the user's exact symptom, and produced a clear red signal.

## 2. Reproduce and Minimise

Run the feedback loop and minimize the reproduction scenario to its bare essentials.

1. **Verify symptom match**: Confirm the red signal matches the user's reported symptom rather than an adjacent or unrelated error.
2. **Minimise inputs and state**: Cut input data, configuration keys, extra callers, and setup steps one at a time, re-running the loop after each cut. Keep only load-bearing elements.
3. **Persisted state check**: If the failure occurs only after a restart or reboot, check persisted artifacts first (cached files, database migrations, lockfiles, serialized state).

*Completion criterion:* A minimal reproduction scenario where removing any single remaining input, configuration, or caller causes the loop to pass.

## 3. Hypothesise from Root Cause

Trace backwards from where the symptom surfaced to the originating defect.

1. **Trace backwards, not forwards**: Ask "why" at each boundary step until the answer is an incorrect decision or unhandled state in code, not merely the downstream consequence of an earlier fault.
2. **Evaluate state legitimacy**:
   - Determine whether the state triggering the failure is legitimate.
   - If legitimate: the code handling that state is deficient; handling it properly at that site is the fix.
   - If illegitimate: the state should never exist. Do not add a local guard, retry, clamped value, or swallowed error where the crash occurred—that hides the defect. Trace further back to find what produced the invalid state and fix it at the producer.
3. **Rank falsifiable hypotheses**: Formulate 3–5 distinct hypotheses before testing. Each must state a falsifiable prediction:
   > "If X is the root cause, then modifying Y will eliminate the failure / modifying Z will alter the symptom."
4. **Checkpoint**: If working interactively, present the ranked hypotheses to the user before proceeding. If unattended, proceed with the highest-ranked hypothesis.

*Completion criterion:* 3–5 ranked, falsifiable hypotheses that distinguish root cause origin from downstream symptom.

## 4. Instrument and Test

Test hypotheses by changing one variable at a time.

1. **Instrumentation strategy**:
   - Prefer debugger inspection or REPL execution if available.
   - Insert targeted logs at decision boundaries that differentiate the hypotheses.
   - Tag every debug log with a unique prefix (e.g. `[DEBUG-trace1]`) so cleanup is a single search.
   - Avoid bulk un-targeted logging.
2. **Performance regressions**: Avoid print logs in hot paths. Measure using timing wrappers, profiler samples, or query execution plans against the baseline established in Step 1.
3. **Evaluate predictions**: Run the feedback loop against each instrumented test. When an observation contradicts a hypothesis, eliminate it and proceed down the rank.

*Completion criterion:* One hypothesis confirmed through direct runtime instrumentation and observed state.

## 5. Fix Root Cause and Verify

Apply the fix at the origin and prove it with tests.

1. **Attack the Premise** ([skill://principles/attack-the-premise.md](../../principles/attack-the-premise.md)):
   - If two or more attempted fixes that share a premise fail the feedback loop, STOP.
   - Do not attempt a third variation of the same idea. Write down the shared premise as a single explicit sentence.
   - Test that premise directly using an observable check or isolated probe before designing another fix.
2. **Eliminate the fault, do not compensate** ([skill://principles/fix-root-causes.md](../../principles/fix-root-causes.md)):
   - Fix the code that produces the invalid condition rather than adding compensatory cleanup or masking logic downstream.
   - If a proposed fix requires a multi-sentence comment to justify why an invalid state is tolerated, the fix is wrong. Fix the underlying state transition.
3. **Write a regression test**:
   - Lock in the fix with an automated regression test at the closest valid architectural seam before applying the production fix.
   - If no clean test seam exists, document the architectural coupling as a finding to address after fixing.
4. **Pattern sweep**:
   - Inspect the codebase for identical or analogous error patterns in sibling modules. Fix all instances of the same defect in one clean cutover.
5. **Verify**:
   - Watch the new regression test fail on unpatched code.
   - Apply the fix.
   - Confirm the regression test passes.
   - Re-run the original un-minimised Phase 1 feedback loop to confirm complete resolution.

*Completion criterion:* The regression test and the original feedback loop both pass green with zero regressions across sibling modules.

## 6. Clean Up and Prevent Recurrence

Ensure no debug debris remains and extract structural prevention.

1. **Remove instrumentation**: Grep for debug tags (e.g. `[DEBUG-...]`) and remove all temporary logging, probes, and throwaway harnesses.
2. **Define an always-on signal**: If discovering the root cause required deep digging or complex tracing, identify the cheap assertion, type constraint, or diagnostic metric that would make the issue obvious immediately.
3. **Architectural improvements**: If the bug occurred due to missing test seams, ambiguous ownership, or fragile coupling, note the recommendation for architectural hardening.

*Completion criterion:* Working tree clean of all debug artifacts, all tests passing green, and prevention findings documented.

## Reply

Present the diagnosis report to the user:
- **Root Cause**: The originating defect and why it occurred, distinguishing origin from symptom.
- **The Loop & Repro**: The command used to reproduce and verify the issue.
- **The Fix**: Summary of code changes and the regression test added.
- **Premise Tested**: The shared assumption tested if multiple iterations occurred.
- **Prevention**: The always-on assertion, type guard, or structural improvement to prevent recurrence.
