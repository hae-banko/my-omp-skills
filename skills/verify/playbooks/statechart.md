# Statechart verification and visualization

Use when drawing a system's state transitions as a statechart or showing a bug as an end-to-end path through states.

## 1. Specify invariants and actions in reader terms

Model the system's state transitions in TLA+:
- Write each rule that the reader agrees to as an `INVARIANT`. Rules describe screens, results, stored values, or messages. If the model lacks a variable for a rule, add the variable. Never weaken a rule to make it hold.
- Write `Next` as a disjunction of named actions, such as `YouPressPlay \/ YouPressStop`. Otherwise TLC labels every transition `Next`.
- Prevent false deadlocks on valid terminal states: a state with no outgoing transition violates deadlock checks (`NoDeadlock` or `CHECK_DEADLOCK`). Add a stuttering action to `Next` that holds only in end states and changes nothing, such as `Done == phase \in {"paid", "failed"} /\ UNCHANGED vars`, and assign it a label.

Completion criterion: TLA+ specification written with reader-grounded invariants, named action disjunctions in `Next`, and a terminal stuttering action.

## 2. Scaffold and bound specification under `.omp/specs/<target>/`

Store model files locally in `.omp/specs/<target>/` (e.g. `Spec.tla`, `Spec.cfg`):
- Confirm git ignores `.omp/specs/<target>/x` via `git check-ignore -q .omp/specs/<target>/x`, per [skill://verify/playbooks/formal.md](formal.md). If not ignored, add `.omp/specs/` to `.git/info/exclude`.
- Because TLC continues past bugs to explore downstream states, unbounded models run indefinitely. Bound models using small constants or explicit state `CONSTRAINT` declarations.

Completion criterion: Model files exist in `.omp/specs/<target>/`, are git-ignored, and enforce finite bounds.

## 3. Run TLC and extract state traces

Execute TLC against the specification to generate the state graph:
- Run TLC with `-dump dot,actionlabels .omp/specs/<target>/states.dot .omp/specs/<target>/Spec.tla`.
- TLC explores past violations so the graph captures states after a bug occurs. Extract the counterexample traces for all broken rules from TLC output.
- Pstack's `statechart` tool (https://github.com/cursor/plugins/tree/main/harness/pstack/claude-code/skills/statechart) automates graph extraction and mapping if installed; otherwise extract directly from TLC output.

Completion criterion: TLC execution output captured, invariant violations logged, and `states.dot` generated.

## 4. Map states and author Mermaid statechart

Translate TLC states and transitions into `.omp/specs/<target>/chart.mmd` using `stateDiagram-v2`:
- **State labels:** Use terms the reader sees or cares about (e.g. "Paying", "Lease held, write pending"). Keep variable names and internal action names out of labels.
- **Arrow labels:** Describe what the user sees happen (e.g. "you press play"), placing conditions in brackets (e.g. `you press play [while the file loads]`). Actions yielding identical outcomes share an arrow label.
- **Bug marks:** Assign class `breaks` to states violating a rule, or `mayBreak` if only some underlying model states violate it. Include `classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2px;` and `classDef mayBreak fill:#fff3e6,stroke:#e8730c,stroke-width:2px;` in the chart.
- **Pruning (target ~20 arrows or fewer):**
  - Return coarser labels from equivalent states; omit irrelevant in-flight intermediate details.
  - Keep every state along a bug path, and preserve all bug marks. Never merge states breaking different rules.
  - If still crowded, hide non-essential steps (such as ubiquitous resets). Always keep every chart state reachable from a start state, keep at least one outgoing arrow for non-terminal states, and hide all steps of an arrow or none (never partial). Note hidden steps in the hand-off.

Completion criterion: `.omp/specs/<target>/chart.mmd` written with reader labels, bug styling classes, and at most ~20 arrows.

## 5. Replay bug paths against code

Validate each counterexample against the actual software:
- Translate the shortest path to each `breaks` or `mayBreak` state into a sequential list of concrete actions.
- Replay the sequence against the codebase as an automated regression test or live reproduction script, one step per action.
- If the bug does not reproduce in the real code, treat the formal model as wrong until proven otherwise.

Completion criterion: Every counterexample path is exercised against real code and classified as a confirmed bug or model drift.

## Reply

Hand back:
- Visual chart: display `.omp/specs/<target>/chart.mmd` as a ` ```mermaid ` code block.
- Bug report: one line per bug with the rule name, the reader's rule sentence, and the shortest path through states.
- Scope caveats: state what the model leaves out and list any steps hidden to keep the chart legible.
- Command to regenerate: provide the exact command to re-run TLC and recreate the artifacts.
- Code replay results: test file or live repro showing whether the real code exhibits the bug.
