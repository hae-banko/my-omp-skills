# Outcome-Oriented Execution

Apply during planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture; don't preserve smooth intermediate states with throwaway compatibility code.

Optimize directly for the verifiable target architecture rather than building throwaway transitional scaffolding to keep every intermediate commit working.

**Why:** Preserving transitional compatibility across every intermediate refactoring step generates temporary shims, ad hoc adapters, and dual-mode branches that easily become permanent technical debt.

- **Target integrity over transitional stability:** Prioritize reaching the intended final architecture cleanly over preserving temporary compatibility for internal consumers during an active migration.
- **Tolerate planned intermediate breakage:** Temporary compilation failures or broken tests are acceptable across intermediate scratch states when they are planned, scoped to the migration phase, and fully reversible.
- **Establish clear verification gates:** Define strict static and runtime verification gates at phase completion. Every unit must be completely green and verified before the migration wave concludes.
- **Maintain local sanity checks:** Run targeted checks against actively modified modules during the wave to catch regressions early without spending effort maintaining obsolete interfaces.
- **Scope strictly:** Use this principle only for planned internal refactorings and migrations with explicit phase boundaries, never for uncoordinated changes in production systems.
