# Correcting Recurring Agent Mistakes

Use when eliminating recurring corrections or repeated agent mistakes ("/correct", recurring corrections, repeated mistakes).

Change the repository so future agents cannot repeat the mistake. Assume every contributor is an agent that inspects only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the codebase so a change that looks right locally is right globally.

## The Enforcement Hierarchy

Fix each mistake class at the highest level that works:

1. **Eliminate it with architecture.**
   Give each piece of state one owner and each task one supported path. Hide private internals so the wrong import fails to resolve. Replace hand-synced lists with a single source of truth. Delete obsolete patterns and dead code an agent could copy.
2. **Enforce it with types and linters.**
   Structure types so invalid state cannot be constructed. If bad code still compiles, add a compiler check, custom linter, or AST assertion whose error message explicitly names the file, type, or function to use instead.
3. **Test the behavior.**
   Write deterministic automated tests verifying observable behavior. Ensure the test fails when the regression is reintroduced and passes when properly implemented.
4. **Write docs or agent rules last.**
   Reserve documentation and instruction files (`AGENTS.md`) solely for irreducible judgment calls. Nothing fails when an agent overlooks prose; instructions are the weakest layer of defense.

## Procedure

1. **Identify and group mistake classes.**
   Review recent git history (commits, reverts, review feedback, agent transcripts, and issue notes). Group repeated mistakes into classes. A mistake pattern qualifies once it has occurred at least twice.
   _Completion criterion:_ A catalog of mistake classes with citations to past commits or transcripts where each occurred.

2. **Select the highest enforcement tier.**
   Evaluate the mistake against the hierarchy:
   - Can an architectural boundary or single source of truth eliminate the possibility?
   - Can TypeScript/schema typing or an automated lint rule make the bad pattern unrepresentable?
   - Can an automated test suite assert the invariant?
   - Does it strictly require judgment that only an agent instruction can address?
   Select the highest feasible tier and document why higher tiers were not used.
   _Completion criterion:_ Justification recorded for the chosen enforcement level.

3. **Implement the fix.**
   Build the architectural change, type constraint, linter check, or automated test. Ensure error messages name the correct replacement path.
   _Completion criterion:_ Working implementation of the enforcement mechanism in the codebase.

4. **Prove the check fails on past mistakes.**
   Validate the enforcement mechanism against a historical counterexample. Verify that the check, test, or linter fails on the real past mistake and passes on the remediated code.
   _Completion criterion:_ Proof of failure against the historical bug or bad code pattern demonstrated.

5. **Update the rule table in AGENTS.md.**
   Record or update the rule in the repository's `AGENTS.md` rule table:
   `| Rule | Enforced By | Failure Prevented |`
   If an agent instruction already existed without automated backing and the mistake occurred again, escalate enforcement to a higher tier immediately. Delete rules once architectural refactoring makes the failure impossible.
   _Completion criterion:_ `AGENTS.md` rule table updated to reflect the new enforcement mechanism.

## Reply

Hand back:
- Mistake class identified with historical citations.
- Enforcement tier chosen (Architecture, Types/Lint, Test, or Docs).
- Rationale for why higher tiers were unavailable or insufficient.
- Proof of failure: evidence that the check catches the historical mistake.
- Updates made to code, checks, and the `AGENTS.md` rule table.
