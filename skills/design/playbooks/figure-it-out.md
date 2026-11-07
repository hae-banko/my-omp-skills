# Figure It Out

Use when a large task fits no narrower playbook or command: a migration across many files, an ambitious multi-part change, or a long run the user will review after stepping away ("figure it out"). The first deliverable is the workflow itself, written down before any code: phases sized to the risk, a hypothesis loop for each unit, and a decision log the user can audit.

Not this playbook: a multi-session map of open decisions is `/wayfinder`; splitting an agreed plan into tracker tickets is `/to-tickets`; one module's shape is [playbooks/interface.md](interface.md).

## Steps

1. **Frame before committing.**
   Ground in the code first, then write down:
   - **Done** as a falsifiable predicate checked on the real artifact ("all 40 callers compile against the new API and `npm test` passes", not "migration complete").
   - **Scope** in rough units and effort, plus the blockers grounding surfaced.
   - **Rigor**, biased high. Irreversible steps and wide blast radius get more gates and artifacts; reversible low-stakes steps get fewer. Rigor means gates, not effort.
   - **Spend.** Name every paid or slow resource the run will use (model sessions, subagent fan-out, cloud jobs) with a count and a cost or time ceiling. Anything beyond a few dollars or a long unattended run needs the user's yes before it starts.
   Present the framing and its trade-offs. Reversible work may proceed; a multi-hour run gets one checkpoint with the user first.
   *Completion criterion:* Predicate, scope, rigor level and spend ceiling stated, and the user has seen them.

2. **Design the workflow.**
   - Decompose into atomic units that each land and verify on their own. Put the riskiest unknown first; build scaffolding and verification before features.
   - Build the verification harness before changing anything, capturing a baseline from the current state so every check reads "old value vs new value".
   - For an irreversible design decision, design it twice ([playbooks/interface.md](interface.md)) or ask for a `council`. Skip this for mechanical work whose shape is already settled.
   - Fan out only across real seams, never onto shared files ([skill://design/references/principles.md](../references/principles.md) §4). Give each worker a disjoint file set; a separate worktree only if the user asks for one (`using-git-worktrees`). Run at most a few workers at once.
   - Write the phase list down. That list is what the user reviews.
   *Completion criterion:* A written phase list, each phase with its unit of work, its check, and its order.

3. **Run each unit as an experiment.**
   Put the phases in the todo list. For each unit: state the hypothesis, make the smallest change, check it against the predicate on the real artifact, keep it if it advanced and revert it if it didn't. Verify each unit before starting the next; don't batch checks to the end.
   - Inspect the artifact, never a self-report. A check that passes too easily is suspect: test the observation before trusting the system.
   - Review delegated work against the contract. A worker that games the check means the contract was loose: reset and tighten it. A wrong check is fixed in its own change, never routed around.
   - Each verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass, and a negative is reported, not hidden.
   *Completion criterion:* Every unit has a verdict from a check on the real artifact.

4. **Keep the decision log as you go.**
   One TSV at `.omp/scratch/<slug>/decisions.tsv`, one row per decision, written when the decision lands, not at the end:

   ```
   ts	phase	decision	why	evidence	result
   ```

   Cells are single-line and plain-spoken. `evidence` is a pointer (commit, `file:line`, artifact path), never prose; `result` is the outcome (`tests green`, `reverted`, `INCONCLUSIVE`). Log forks, completed units with their check, reverts with their trigger, blockers, and fixed checks; skip routine steps. The log stays local unless the user asks to commit it.
   *Completion criterion:* Every fork, verdict and revert has a row.

5. **Verify the whole and hand back.**
   Check the whole against the step 1 predicate on the real product, not just the harness. A correction that recurred during the run becomes a check, lint rule or script ([skill://improve-skills/playbooks/correct.md](../../improve-skills/playbooks/correct.md)), not a note.
   *Completion criterion:* The predicate is checked end to end, with output.

## Reply

- The workflow you designed, the rigor level and why.
- The decision log path.
- What is verified against the predicate, with the evidence.
- What is still open or INCONCLUSIVE, and what spend was used against the ceiling.
