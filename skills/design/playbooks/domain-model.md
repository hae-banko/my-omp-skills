# Domain Modeling

Use when pinning down domain terminology, maintaining a ubiquitous language in `CONTEXT.md`, establishing context boundaries in `CONTEXT-MAP.md`, or recording architectural decisions (ADRs).

## Steps

1. **Locate or establish context structure**:
   Inspect the repository for existing context files: root `CONTEXT.md`, or `CONTEXT-MAP.md` mapping multiple bounded contexts per [skill://design/references/CONTEXT-FORMAT.md](../references/CONTEXT-FORMAT.md). If neither exists, identify whether the project requires a single root context or multiple contexts, and prepare to create the appropriate file lazily when the first term resolves. Check existing system decisions in `.omp/adr/` (or legacy `docs/adr/`).
   *Completion criterion*: Context file structure determined and target path confirmed (`CONTEXT.md` or `src/<context>/CONTEXT.md`).

2. **Challenge fuzzy language and sharpen terms**:
   Actively challenge domain language during discussions. When the user uses a term that contradicts the existing glossary, call it out immediately. Disambiguate overloaded words (e.g. "account" referring to User vs Customer). Propose canonical terms and maintain explicit `_Avoid_` lists of rejected synonyms per [skill://design/references/CONTEXT-FORMAT.md](../references/CONTEXT-FORMAT.md). Reorganize temporal phase descriptions (e.g. "load, validate, save") into cohesive domain concepts per [skill://principles/model-the-domain.md](../../principles/model-the-domain.md).
   *Completion criterion*: Conflicting or overloaded terms disambiguated into canonical concepts with distinct `_Avoid_` entries.

3. **Probe scenarios, edge cases, and code alignment**:
   Invent concrete edge-case scenarios to stress-test concept boundaries. Cross-reference stated domain rules with existing implementation code; surface discrepancies immediately (e.g. code cancels an entire order when business rule permits partial cancellation). Apply [skill://principles/model-the-domain.md](../../principles/model-the-domain.md) and [skill://principles/type-system-discipline.md](../../principles/type-system-discipline.md): encode domain invariants in data structures (such as explicit state machines over boolean flags, discriminated unions over scattered `if/else` checks, and branded primitives like `CustomerId` and `OrderId` over unbranded primitives).
   *Completion criterion*: Edge cases probed, code contradictions identified, and domain invariant representations verified.

4. **Update CONTEXT.md inline**:
   Update `CONTEXT.md` immediately as terms resolve — do not batch updates. Follow [skill://design/references/CONTEXT-FORMAT.md](../references/CONTEXT-FORMAT.md): one or two sentence definitions explaining what the concept IS (not what it does or how it is implemented). Keep `CONTEXT.md` strictly as a domain glossary; exclude implementation details, specs, and general programming utilities.
   *Completion criterion*: `CONTEXT.md` updated with resolved terms, definitions, and `_Avoid_` lists.

5. **Evaluate and record ADRs sparingly**:
   Assess whether any resolved decision warrants an Architecture Decision Record using the criteria in [skill://design/references/ADR-FORMAT.md](../references/ADR-FORMAT.md). Offer an ADR only when all three conditions hold:
   - **Hard to reverse**: The cost of changing later is meaningful.
   - **Surprising without context**: A future reader would wonder why it was done this way.
   - **The result of a real trade-off**: Genuine alternatives were evaluated and rejected for specific reasons.
   If all three hold, write the ADR to `.omp/adr/NNNN-slug.md` (creating `.omp/adr/` automatically, or using `docs/adr/` if that directory already exists in the repo) using the concise single-paragraph format from [skill://design/references/ADR-FORMAT.md](../references/ADR-FORMAT.md). Increment the highest existing sequence number. If any condition is missing, skip the ADR.
   *Completion criterion*: ADR written to `.omp/adr/` with sequential numbering, or explicitly skipped if criteria are unmet.

## Reply

Hand back:
1. Summary of domain terms added, refined, or deprecated.
2. The exact content or diff applied to `CONTEXT.md` (and `CONTEXT-MAP.md` if applicable).
3. Any ADRs created (path, title, and one-paragraph trade-off rationale) or explanation why no decision met ADR thresholds.
