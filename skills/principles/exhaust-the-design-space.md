# Exhaust the Design Space

Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase. Build 2-3 competing prototypes and compare side by side before committing.

When facing an unproven interaction, novel state model, or architectural choice without established codebase precedent, build competing prototypes side by side before committing.

**Why:** Paper arguments and speculative debate cannot reveal ergonomic flaws, operational edge cases, or usability feel. Concrete side-by-side implementations expose structural trade-offs immediately.

- **Explore radical divergence:** Ensure candidate prototypes occupy distinct points in the design space (e.g. minimal surface vs maximum caller flexibility, functional pipelines vs object state machines).
- **Feel over paper:** Compare ergonomics, API friction, and interactive feel by exercising working variants rather than arguing hypothetical merits.
- **Throwaway prototypes:** Keep prototypes minimal and disposable. Do not polish production internals before settling the interface shape.
- **Product and interaction feel:** Apply to product and UX decisions where usability depends on immediate interaction feel rather than abstract logic.
- **Decide and discard:** Choose the winning prototype based on concrete evidence, discard the alternatives, and build the chosen design cleanly.

For module interface exploration and designing twice, see [skill://design/playbooks/interface.md](../design/playbooks/interface.md).
