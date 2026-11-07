# Attack the Premise

Apply when two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it.

When two or more fixes that share one premise have failed the same gate, suspect the premise, not the fixes. Do not attempt a third variation of the same idea.

**Why:** Each failed fix is evidence against the belief it assumed. A third fix on the same premise spends effort where the evidence already says the cause is not.

- **Write the premise down.** State the premise as a single explicit sentence that every failed fix assumed.
- **Test the premise directly.** Find an observable check or isolated probe that would come out differently if the premise were false, and run it. Look at how failures are distributed, not only at how large they are. Make the check rerunnable per [skill://principles/build-the-lever.md](build-the-lever.md).
- **Follow the evidence.** If the check contradicts the premise, the cause is elsewhere; look for what the failures have in common that the premise did not predict. If it confirms the premise, trace the next "why" per [skill://principles/fix-root-causes.md](fix-root-causes.md).
- **Remove the condition instead of compensating.** Change what produces the losing condition instead of adding cleanup or masking logic downstream per [skill://principles/laziness-protocol.md](laziness-protocol.md).
- **Stop before the next fix.** Do not start another fix until the premise is written down and tested.

Distinct from [skill://principles/redesign-from-first-principles.md](redesign-from-first-principles.md), which rebuilds a design around a new requirement. This principle questions an assumed fact in the current design.
