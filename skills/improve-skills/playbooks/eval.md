# Evaluating Skill Changes

Use when evaluating or A/B testing a skill change, asking "did this skill change help", or benchmarking competing skill variants.

You own the experiment design: plan, blind, run, and synthesize.

## Blinding Guardrails

Blinding prevents confirmation bias and prompt leakage. Maintain these invariants on every evaluation run:

- **No evaluative terms in candidate view**: never include words such as `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory name, file path, or candidate prompt.
- **Organic user prompt**: the candidate prompt must mirror a realistic user request. State the practical goal without meta-instructions.
- **No chain-eliciting cues**: do not prompt candidates to list which skills, playbooks, or principles they followed. Grade adherence from code structure and observed tool calls, never self-report.
- **Sanitized environments**: use realistic workspace names (e.g. `/tmp/work-alpha/`, `/tmp/work-beta/` or isolated git worktrees per `using-git-worktrees`).
- **Mutual isolation**: candidates must not be informed that other runs or variants exist.
- **Blinded evaluation**: the judge subagent sees outputs labeled with sanitized identifiers (e.g. `Implementation A`, `Implementation B`), never skill variant names or model details.
- **Single-pass judgment**: when comparing two variants or baseline vs variant, a single judge evaluates all candidate outputs against the same rubric in one pass.

## Procedure

1. **Frame the experiment and derive the rubric.**
   Define the baseline skill and the proposed variant under test. State the target behavioral change. Write a concrete rubric consisting of 3 to 6 observable, gradeable criteria. Hold the rubric back from all candidates; it is provided only to the judge.
   _Completion criterion:_ Written rubric specifying 3 to 6 concrete criteria with explicit pass/fail conditions.

2. **Set up isolated, sanitized environments.**
   A `task` subagent inherits this session's skills, so it cannot run a skill variant. Give each arm its own throwaway project directory with a project-shaped name (`/tmp/<project>-<n>/`, never a judging word): a small git repo with the files an organic task would touch, and the arm's skill set copied to `<dir>/.omp/skills/` (omp discovers project skills walking up from cwd). Baseline from `git archive <base> skills`; variant from the working tree.
   _Completion criterion:_ One directory per run, identical except for `.omp/skills/`.

3. **Author organic task prompts.**
   Draft natural prompts a user would type for each branch the change touches, plus one or two that should *not* route to it. Do not mention the skill name, testing, or evaluation criteria.
   _Completion criterion:_ A prompt set covering every changed branch, each with its expected skill or playbook written down before any run.

4. **Run each arm in a real `omp` process.**
   Per prompt and arm, from that arm's directory: `ROUTE_LOG=<log> omp -p --no-session --no-title --no-extensions -e <observer> --skills=<arm's skill names> --max-cost 0.5 "<prompt>"`. `--skills` limits the run to the arm's skills so unrelated ones don't compete; the observer is [skill://improve-skills/references/route-observer.ts](../references/route-observer.ts), which logs every tool call and stops the run once routing is decided. Two or more repetitions per prompt; run arms concurrently.
   _Completion criterion:_ A log per run listing the `skill://` URLs read, in order.

5. **Score routing from the logs, not from what the agent says.**
   Per run: did it read a skill at all, and was it the expected skill or playbook? Tabulate hits per arm. For changes to what a playbook makes the agent *do*, let runs continue (drop the observer's early exit) and read each run's output and tool calls yourself.
   _Completion criterion:_ A per-prompt table: expected target, what each arm read, hit or miss.

6. **Spawn one blinded judge.**
   Collect candidate outputs, stripping any environment paths or variant markers. Label outputs neutrally (e.g. `Candidate 1`, `Candidate 2`). Spawn a reviewer subagent via `task` providing only the labeled outputs and the rubric from Step 1.
   _Completion criterion:_ Judge evaluation report returned with per-criterion scores for each candidate.

7. **Synthesize results and recommend adoption.**
   Review all candidate outputs and compare your assessment with the judge's scoring. Investigate discrepancies to verify whether criteria were ambiguous or edge cases were missed. Formulate an evidence-backed recommendation on whether to adopt, refine, or reject the skill variant.
   _Completion criterion:_ Synthesis report documenting rubric results, transcript observations, and adoption decision.

## Reply

Hand back:
- Variant under test and baseline description.
- Rubric criteria used by the judge.
- Transcript findings: exact `skill://` URLs read and tool call chains observed per candidate.
- Blinded judge verdict and score breakdown.
- Synthesis and recommendation: whether the skill variant improved predictability and should be promoted.
