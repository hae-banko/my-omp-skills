# How It Works

Use when explaining subsystem architecture, tracing runtime execution flow, or answering "how does X work" with concrete file:line evidence. Read the real code path before any summary of it ([skill://principles/experience-first.md](../../principles/experience-first.md)).

This playbook is strictly read-only. Do not edit files, run destructive commands, or modify environment state.

## 1. Scope Target and Assess Complexity

Identify the target component, function, subsystem, or runtime path from the user's question.

Assess complexity:
- **Simple** (single module, utility function, or narrow flow): trace directly within this session using `find`, `grep`, and `read`.
- **Complex** (subsystem spanning multiple packages/services, cross-cutting pipeline, or layered architecture): decompose into 2–4 distinct architectural angles (such as entry/dispatch points, state transformations, storage/I/O boundaries, and error/fallback paths).

*Completion criterion:* Target identified with an explicit choice of inline trace or 2–4 defined decomposition angles.

## 2. Trace the Execution Path

Follow the execution sequence from trigger to output.

For simple targets:
- Trace the call path directly using `find` to locate symbols and `read` to inspect implementation ranges.
- Record the exact sequence of calls, data transformations, and branch conditions.

For complex targets:
- Use the `task` tool to spawn read-only subagents (`agent: "scout"` or `agent: "explore"`), assigning each one a specific angle to trace concurrently.
- Each exploration must gather:
  - Component names and exact `file:line` locations.
  - Runtime inputs, arguments, and return types.
  - State changes, event emissions, and downstream calls.
  - Error branches, early returns, and fallback behavior.

*Completion criterion:* A contiguous chain of execution from initial entry point to termination, documented with exact `file:line` citations for every major hop.

## 3. Map Boundaries and Dependencies

Examine the boundaries between the target and the rest of the codebase.

1. **External dependencies & I/O**: Identify network requests, database transactions, disk operations, or third-party library calls.
2. **Shared state & concurrency**: Identify caches, global singletons, mutexes, locks, or transactional boundaries.
3. **Implicit contracts**: Document assumptions about calling order, lifecycle hooks, data invariants, and environment variables.

*Completion criterion:* All boundary interfaces, shared state interactions, and external I/O points accounted for with specific file citations.

## 4. Synthesize the Architectural Walkthrough

Consolidate findings into a coherent walkthrough designed for an engineer onboarding to the subsystem.

Guidelines:
- **Concrete over abstract**: Write "the `OrderService` invokes `PaymentGateway.charge()` in `services/order.ts:45`", never vague statements like "the service talks to the gateway".
- **Structured flow**: Walk through the chronological lifecycle: what initiates the flow, what steps run in order, what decision points fork execution, and how results return.
- **Visual diagrams**: Include a Mermaid sequence diagram (` ```mermaid `) or concise ASCII diagram when multiple components or async pipelines interact across boundaries. Omit if a short prose sequence is clearer.
- **Surface gotchas**: Highlight non-obvious design choices, subtle failure modes, or ordering constraints.

*Completion criterion:* Synthesized walkthrough completed with verified file:line citations and architectural diagrams where appropriate.

## Reply

Present the walkthrough to the user:
- **Overview**: 1–2 paragraphs explaining what the subsystem does, why it exists, and its primary trigger.
- **Key Concepts**: Core abstractions, interfaces, and data models required to understand the subsystem.
- **Execution Flow**: Step-by-step trace through the code path, citing `file:line` references for every step, accompanied by a Mermaid or ASCII sequence diagram if multi-component.
- **Where Things Live**: File and directory map showing the responsibility of each file involved.
- **Gotchas & Edge Cases**: Non-obvious behaviors, timing caveats, and common failure modes.
