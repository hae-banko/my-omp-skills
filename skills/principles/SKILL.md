---
name: principles
description: Engineering principles that playbooks and skills link at the step where each applies (root causes, reader load, idempotence, shared state, laziness, and more). Reference library; read one principle when a step names it.
disable-model-invocation: true
---

# Engineering Principles

A reference library of foundational engineering principles. Read only the specific principle a task or playbook names; never preload or dump the full set into working context.

## Design & code shape

| Principle | Apply when | File |
| :--- | :--- | :--- |
| Boundary Discipline | Wiring validation, error handling, or framework adapters; concentrate guards at boundaries and trust internal types | [skill://principles/boundary-discipline.md](boundary-discipline.md) |
| Exhaust the Design Space | Facing a novel UI interaction or architectural decision with no precedent; build 2-3 competing prototypes | [skill://principles/exhaust-the-design-space.md](exhaust-the-design-space.md) |
| Foundational Thinking | Choosing core types and data structures, sequencing scaffold before features, or designing concurrency | [skill://principles/foundational-thinking.md](foundational-thinking.md) |
| Minimize Reader Load | Reviewing or shaping complex code; count layers to trace and mutable state to hold | [skill://principles/minimize-reader-load.md](minimize-reader-load.md) |
| Model the Domain | Writing stateful logic, or when code branches frequently or repeats shape assumptions across files | [skill://principles/model-the-domain.md](model-the-domain.md) |
| Redesign From First Principles | Integrating a new requirement into an existing architecture without bolting on ad hoc flags | [skill://principles/redesign-from-first-principles.md](redesign-from-first-principles.md) |
| Separate Before Serializing Shared State | Concurrent actors might write to the same file, branch, or key; eliminate sharing before adding locks | [skill://principles/separate-before-serializing-shared-state.md](separate-before-serializing-shared-state.md) |
| Type System Discipline | Designing types or signatures; make illegal states unrepresentable and brand semantic primitives | [skill://principles/type-system-discipline.md](type-system-discipline.md) |

## Debugging & verification

| Principle | Apply when | File |
| :--- | :--- | :--- |
| Attack the Premise | Two or more fixes sharing one premise fail the same gate; test the premise directly | [skill://principles/attack-the-premise.md](attack-the-premise.md) |
| Explain the Number | Measuring, reporting, or acting on performance benchmarks or eval numbers; find the limiter | [skill://principles/explain-the-number.md](explain-the-number.md) |
| Fix Root Causes | Debugging defects; trace symptoms to origin and fix where invalid state is created | [skill://principles/fix-root-causes.md](fix-root-causes.md) |
| Prove It Works | Completing a task before declaring done; verify against the real artifact, not proxies or self-reports | [skill://principles/prove-it-works.md](prove-it-works.md) |
| Test Behavior, Not Implementation | Writing, changing, or reviewing tests; assert observable caller outcomes, not internal mechanics | [skill://principles/test-behavior-not-implementation.md](test-behavior-not-implementation.md) |

## Execution & delegation

| Principle | Apply when | File |
| :--- | :--- | :--- |
| Build the Lever | Approaching non-trivial or repetitive work; build the script, codemod, or subagent skill that does or proves it | [skill://principles/build-the-lever.md](build-the-lever.md) |
| Guard the Context Window | Context fills up with large outputs or long files; route bulk to subagents and keep summaries in main thread | [skill://principles/guard-the-context-window.md](guard-the-context-window.md) |
| Laziness Protocol | Refactoring or evaluating diff size; bias toward deletion and the smallest working diff | [skill://principles/laziness-protocol.md](laziness-protocol.md) |
| Never Block on the Human | Tempted to ask permission on reversible work; proceed autonomously and confirm only for irreversible actions | [skill://principles/never-block-on-the-human.md](never-block-on-the-human.md) |
| Outcome-Oriented Execution | Executing planned rewrites or migrations; converge on target architecture without temporary shims | [skill://principles/outcome-oriented-execution.md](outcome-oriented-execution.md) |
| Sequence Verifiable Units | Multi-step sweeps, migrations, or PR stacking; break work into small verifiable green steps | [skill://principles/sequence-verifiable-units.md](sequence-verifiable-units.md) |

## Change management

| Principle | Apply when | File |
| :--- | :--- | :--- |
| Encode Lessons in Structure | Writing an instruction a second time or catching a recurring mistake; encode in lint, types, or checks | [skill://principles/encode-lessons-in-structure.md](encode-lessons-in-structure.md) |
| Experience First | Product, UX, or scope trade-offs arise; choose user experience over developer convenience | [skill://principles/experience-first.md](experience-first.md) |
| Make Operations Idempotent | Designing commands or loops subject to restarts; derive operations from state and converge safely | [skill://principles/make-operations-idempotent.md](make-operations-idempotent.md) |
| Migrate Callers Then Delete Legacy APIs | Introducing a new internal API; migrate callers and delete obsolete interfaces in the same wave | [skill://principles/migrate-callers-then-delete-legacy-apis.md](migrate-callers-then-delete-legacy-apis.md) |
| Subtract Before You Add | Sequencing additions, refactors, or rewrites; remove dead code, stubs, and redundant guards first | [skill://principles/subtract-before-you-add.md](subtract-before-you-add.md) |

Adapted from cursor/plugins pstack (MIT, Copyright (c) 2026 Lauren Tan).
