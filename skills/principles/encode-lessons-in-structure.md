# Encode Lessons in Structure

Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text.

When a correction or instruction recurs, encode the requirement into the repository's structure so contributors and agents cannot repeat the mistake. Instructions are the weakest defense; structural enforcement wins.

**Why:** Documentation and prompt prose rely on memory and compliance. A linter, compiler error, architectural boundary, or failing test rejects the invalid state automatically before code lands.

- **Follow the enforcement hierarchy:**
  1. *Architecture:* Eliminate invalid paths with single sources of truth, private module exports, or isolated boundaries so invalid imports fail to resolve.
  2. *Types and Linters:* Make invalid states unrepresentable in the type system. If invalid patterns compile, write a compiler check or custom AST lint rule that explicitly names the replacement symbol.
  3. *Automated Tests:* Add deterministic tests that break on the regression and pass on compliant code.
  4. *Prose and Rules:* Reserve written rules solely for irreducible judgment calls that cannot be automated.
- **Prove failure against history:** Test the new lint, type, or check against the historical counterexample to prove it fails on the past mistake and passes on the fix.
- **Escalate repeated mistakes:** If an instruction already existed in rules and the failure recurred, escalate immediately to an automated lint, type constraint, or architectural boundary.
- **Add failure examples when judgment is required:** If a rule genuinely requires human judgment and cannot be automated, make the instruction prominent and include a concrete counterexample showing the failure mode.

For the step-by-step remediation workflow, see [skill://improve-skills/playbooks/correct.md](../improve-skills/playbooks/correct.md).
