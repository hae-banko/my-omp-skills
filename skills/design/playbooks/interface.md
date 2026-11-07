# Module Interface Design

Use when designing or improving a module's interface, finding deepening opportunities, deciding where a seam goes, making code more testable or AI-navigable, or exploring alternative interface designs.

## Steps

1. **Define the module boundary and seam**:
   Identify the module, its callers, and where the seam lives using the vocabulary in [skill://design/references/GLOSSARY.md](../references/GLOSSARY.md) (**module**, **interface**, **seam**, **adapter**). Classify its dependencies using [skill://design/references/DEEPENING.md](../references/DEEPENING.md) (in-process, local-substitutable, remote owned, true external). Apply boundary discipline from [skill://design/references/principles.md](../references/principles.md): parse untyped data into typed domain models at the boundary, trust internal types unconditionally, and keep business logic in pure functions without framework dependencies.
   *Completion criterion*: Module boundary defined, seam location identified, dependencies classified, and boundary validation isolated from internal logic.

2. **Measure depth and minimize interface surface**:
   Evaluate interface leverage against the deep-module criteria in [skill://design/references/GLOSSARY.md](../references/GLOSSARY.md): maximize behaviour behind a small interface. Apply type system discipline from [skill://design/references/principles.md](../references/principles.md): make illegal states unrepresentable, brand semantic primitives (e.g. `UserId`, `OrderId`), and simplify parameters to hide internal coordination. Apply the deletion test: verify that if the module is deleted, complexity reappears across callers rather than vanishing.
   *Completion criterion*: Proposed interface surface is minimal (few methods, simple typed parameters) with high leverage per entry point.

3. **Exhaust the design space (Design It Twice)**:
   When designing a new interface or evaluating significant restructuring, follow [skill://design/references/DESIGN-IT-TWICE.md](../references/DESIGN-IT-TWICE.md). Frame the problem space (constraints and dependency categories), then generate 2–3 radically different interface designs (e.g. minimal entry points maximizing leverage, caller-optimized defaults, or ports and adapters) per [skill://design/references/principles.md](../references/principles.md). Compare candidates on depth, locality, and seam placement.
   *Completion criterion*: 2–3 distinct interface candidates produced, compared across depth/locality/seams, and an opinionated recommendation formulated.

4. **Design for testability and enforce seam discipline**:
   Ensure callers and tests cross the exact same seam ("the interface is the test surface"). Accept dependencies instead of instantiating them internally; return transformation results rather than producing hidden side effects. Apply seam discipline from [skill://design/references/DEEPENING.md](../references/DEEPENING.md): one adapter represents a hypothetical seam; two adapters (production + test stand-in) justify a real seam. Replace old unit tests on internal components with tests crossing the deepened interface.
   *Completion criterion*: Test surface verified to match the interface, test stand-ins/adapters documented, and internal seams kept private.

## Reply

Hand back:
1. Interface specification: method signatures, parameter types, invariants, ordering constraints, and error modes.
2. Seam and adapter analysis: dependency categories, adapter implementations (production vs test stand-in), and rationale for seam placement.
3. Design-it-twice comparison: trade-offs across candidates regarding depth (caller leverage), locality (maintenance focus), and seam placement, plus your final recommendation.
4. Test strategy: how callers and tests exercise the seam without testing past the interface.
