# Subtract Before You Add

Apply when sequencing an addition, refactor, or rewrite. Remove dead code, redundant validators, and stub references first, then build on the simpler base.

When evolving or expanding a system, remove unnecessary code, dead references, and redundant complexity before adding new capabilities. Default to subtraction.

**Why:** Building features on top of obsolete code multiplies conceptual baggage and testing surface. Pruning dead weight first simplifies mental models and keeps additions minimal and focused.

- **Sequence removal before construction:** Delete obsolete methods, uncalled helpers, dead flags, and legacy configuration keys before writing new features.
- **Cut before you polish:** Strip a design down to its bare essential mechanism before investing time polishing edge cases or optimizing performance.
- **Build for observed requirements:** Reject speculative edge cases, hypothetical configuration flags, and anticipatory extension points. Implement only what is required by real current use cases.
- **Prune redundant guards:** Eliminate defensive validation or parsing checks that duplicate invariants already enforced at system boundaries.
- **Delete content-free references:** If a documentation file, test helper, or reference document contains no actionable or novel knowledge, delete it rather than maintaining a hollow stub.
- **Leave code cleaner than you found it:** Continually reduce surface area; aim to leave systems more capable behind a smaller, simpler interface.

For ruthless simplicity and YAGNI discipline, see `ponytail`.
