# Maintain runtime verification skill

Use when auditing or synchronizing an existing runtime verification skill and feature map against code changes.

## Outcomes

Every run concludes with exactly one outcome:
- **clean** — every feature received source review and live execution; no drift or harness gaps detected.
- **changed** — verified updates made to the skill body, feature maps, or harness helpers.
- **blocked** — execution halted due to environmental failures or broken prerequisites that cannot be safely resolved. State the exact blocker.

## Edit scope

Edit only the target verification skill directory (`.omp/skills/verify-<app>/`). Never modify product code during a maintenance pass. If the application behavior diverges from the feature map, determine whether the documentation drifted (update the map) or the product regressed (report as a product defect).

## 1. Locate the target verification skill

Find the project-local verification skill (`.omp/skills/verify-*/`). If multiple exist, match the user-specified application name or prompt for selection. If none exists, direct the user to [skill://verify/playbooks/runtime-skill.md](runtime-skill.md).

Completion criterion: One target `.omp/skills/verify-<app>/` directory is identified and confirmed.

## 2. Verify index hygiene

Read `.omp/skills/verify-<app>/features/README.md` and list all feature files in `.omp/skills/verify-<app>/features/`. Remove dangling links, register unindexed feature files, and resolve naming discrepancies.

Completion criterion: Every feature file in `features/` is accurately referenced in the feature index.

## 3. Review source implementations

Spawn concurrent read-only `task` subagents using the `scout` or `explore` role for each feature file:
- Read the implementation files behind the feature.
- Identify the current user entry points, required parameters, and state transitions.
- Flag any discrepancies between current code and the feature map documentation.
- Formulate a minimal live verification sequence for the feature.

Completion criterion: Every mapped feature has a returned summary comparing documentation to implementation.

## 4. Reconcile and inspect code churn

Aggregate subagent findings. Merge overlapping driving paths to minimize redundant setup cycles. Review git log diffs since the last verification pass to identify newly added user-facing endpoints, commands, or UI screens missing from the map.

Completion criterion: A unified verification plan is assembled and unmapped user surfaces are identified.

## 5. Execute live verification

The coordinating agent drives each feature live following the skill's `Launch` and `Drive` instructions:
- Run the `Doctor` check before the first drive and after any unexpected error.
- Drive every mapped feature at least once through the designated harness (CLI/TUI via PTY/`herdr`, web via `browser`, or HTTP via `curl`).
- Confirm that captured screenshots, transcripts, and logs are written to the artifact directory.
- Execute cleanup. Verify that proof artifacts remain on disk after teardown completes.

Completion criterion: Every active feature is driven live and evidence is confirmed on disk.

## 6. Triage discrepancies

Classify every observed discrepancy:
- **Doc drift:** Application works, but user POV steps or parameters changed. Update the corresponding `features/<feature>.md`.
- **Harness gap:** Application works, but harness commands or selectors failed. Update the harness script or selectors in `SKILL.md`, and re-drive live to verify the fix.
- **Product defect:** Application behavior is broken or fails its own contracts. Record the repro steps and error details in the final report. Do not modify product code.

Completion criterion: All discrepancies are categorized and documented or resolved within the skill directory.

## 7. Deliver results

Review changes to `.omp/skills/verify-<app>/`. Provide a diff of the updated files. Never commit or push changes automatically.

Completion criterion: Output diff generated and run notes compiled.

## Reply

Hand back:
- Outcome: `clean`, `changed`, or `blocked`.
- List of features verified live with artifact paths.
- Details of doc drift or harness gaps updated.
- Details of product defects discovered (with reproduction commands).
