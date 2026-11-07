# Build the Lever

Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks. Build the tool that does it or proves it (codemod, script, generator, or a skill your subagents follow) instead of working by hand. The tool is the artifact a reviewer can rerun.

When work is not trivial, build the tool that executes or verifies it instead of doing it by hand. Deterministic scripts turn "trust me" into "run this".

**Why:** A codemod, generator, or script executes identically every time and reruns for free. Hand-applied changes can only be verified by repeating manual work.

- **Do the first unit by hand, then build the tool.** Complete one unit manually to discover the exact recipe, automate it, and diff the automated output against your manual baseline.
- **Choose the right lever:** codemod or script for source edits, generator for repetitive files, local database queries for structured analysis, rerunnable check for verification.
- **Deterministic levers beat subagent fan-out.** If a single script can process every unit deterministically in one pass, run it locally. Do not fan out delegates to apply edits a script can handle.
- **Lever as subagent contract.** When delegating work to `task` subagents, codify the lever as a skill or playbook they all read: recipe, verification contract, and forbidden paths in one artifact kept outside their write scope.
- **Deliver the lever.** Applying this principle produces an artifact. If the diff lacks the script, codemod, generator, or skill definition, the principle was not applied. Commit the lever when its utility outlives the session.
- **Build minimally.** Per [skill://principles/laziness-protocol.md](laziness-protocol.md), write the smallest working script, never a speculative framework.

Distinct from [skill://principles/encode-lessons-in-structure.md](encode-lessons-in-structure.md), which turns recurring guidance into permanent repo guardrails. For scripting verification specifically, see [skill://principles/prove-it-works.md](prove-it-works.md).
