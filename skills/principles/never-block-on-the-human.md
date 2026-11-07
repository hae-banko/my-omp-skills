# Never Block on the Human

Apply when tempted to ask 'should I do X?' on reversible work.

Proceed autonomously on reversible, reviewable actions; ask the human only before irreversible operations or paid resource commitments.

**Why:** Human supervision is asynchronous. Pausing execution to ask permission for ordinary, reversible edits stalls progress and wastes human and agent attention. Since code changes live in version control, mistakes are cheap to revert.

- **Proceed, then present:** On reversible tasks, choose a reasonable approach, complete the work, and show the result. Explain why the decision was made rather than asking "should I do X?".
- **Make execution self-correcting:** When an issue, edge case, or inconsistency surfaces during execution, log the finding, handle it sensibly, and refine it in the next phase.
- **Require confirmation for irreversible operations:** Stop and confirm with the user before performing destructive or external actions:
  - Deleting production databases, remote branches, or uncommitted user work.
  - Force-pushing or rewriting shared remote git history.
  - Triggering paid external model runs (`omp -p`), large cost-incurring API fan-outs, or sending external notifications.
- **Keep execution unblocked:** Separate product intent (which comes from the human) from mechanical execution (which should never block on trivial choices).

For structuring autonomous multi-phase execution without blocking, see [skill://design/playbooks/figure-it-out.md](../design/playbooks/figure-it-out.md).
