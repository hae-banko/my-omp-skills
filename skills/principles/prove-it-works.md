# Prove It Works

Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'

Verify every output directly against the real system artifact before claiming completion. Never infer success from proxies, agent self-reports, or "it compiles cleanly".

**Why:** Unverified work carries unknown correctness. Indirect signals—cached files, timestamps, clean builds, or subagent assertions—often hide runtime crashes, missing files, or broken edge cases. Discovering defects downstream costs significantly more than direct observation upfront.

- **Check the real artifact directly:**
  - Execute the actual command, query, or runtime binary and inspect the printed output.
  - Read the generated file on disk and verify its content, headers, and line count directly.
  - Verify process liveness using operating system tooling, not derived state flags.
- **Reject proxies:** Clean compilation is not runtime correctness; a non-empty return is not a valid payload; a passing test suite that did not execute the modified path proves nothing.
- **Script the verification check:** The strongest verification is a deterministic script or automated test that reruns the validation command and diffs against expected output. A script turns "trust my inspection" into a reproducible command a reviewer can run.
- **Investigate anomalous passes:** When a check passes suspiciously fast or with zero errors on the first attempt, test the observation method before assuming the system works. Ensure the test fails when the implementation is intentionally broken.
- **Keep verification evidence visible:** Include the exact command executed and its unedited output in completion reports so reviewers can audit the proof directly.

For orchestrating multi-step verification and delivery, see [skill://principles/sequence-verifiable-units.md](sequence-verifiable-units.md) and [skill://principles/build-the-lever.md](build-the-lever.md).
