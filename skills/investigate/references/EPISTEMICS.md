# Epistemics Framework

How to reason about confidence when evidence is historical, fragmentary, and sometimes contradictory, and how to communicate certainty without flattening it into false confidence. Code shows what it does, not why it exists. Intent lives in commit messages, PR reviews, issue trackers, architecture decision records (ADRs), and team conversations.

## Confidence Tiers

Every historical claim must sit in exactly one tier. The tier dictates the phrasing and required evidence.

### 1. Direct
An explicit textual statement from an author answers the question.
- **Sources**: PR descriptions, commit messages, issue discussions, ADR records, or explicit code comments explaining rationale.
- **Phrasing**: Confident, factual, with immediate adjacent citation. ("This exists because [PR #123](<url>) stated customer Acme required pagination for >1000 items.")

### 2. Supported
Multiple pieces of indirect evidence converge on one conclusion. No single source states the motivation outright, but the pattern across sources makes it probable.
- **Sources**: Corroborating commit titles, test additions covering specific edge cases, issue labels, and incident timing.
- **Phrasing**: Confident but explicitly derived. ("The evidence points strongly to rate-limiting defense: [PR #456] touched the error handling path during the outage window described in incident 89.")

### 3. Inferred
A logical reading of context that nothing explicitly states. It represents deductive interpretation, not documented historical fact.
- **Sources**: Architectural patterns, common naming conventions, proximity to known changes.
- **Phrasing**: Explicitly hedged, exposing the reasoning chain. ("Given that the service retries three times and neighboring clients share a 3-retry convention, this likely aligns with team retry policies.")

### 4. Speculative
A plausible hypothesis on thin evidence, where alternative explanations are equally valid.
- **Phrasing**: Marked explicitly as a candidate hypothesis. ("One possibility is a workaround for an upstream timing bug, but no contemporary issue or comment confirms this.") Lives under Competing Hypotheses.

### 5. Unknown
The search was executed and yielded no historical explanation. Documenting what was searched and found absent is a valuable negative result.
- **Phrasing**: Concrete report of the searched surface. ("Searched git history across 14 commits and issue tracker queries for 'timeout_ms'; neither recorded why 5000ms was chosen.")

## Phrasing Rules

- **Strong verbs require direct citation**: Do not write "because", "the reason is", "was designed to", "fixes", or "decided" unless an explicit citation follows immediately.
- **Hedge inferences**: Always use calibrated hedges for Inferred and Speculative tiers: "appears to", "seems to", "likely", "suggests", "is consistent with", "one reading is".
- **Avoid hollow certitude**: Do not use "obviously", "clearly", "of course", or dismissive "just" (e.g. "it is just for performance").
- **Avoid subjective framing**: Use "the evidence indicates", never "I think" or "I believe".

## Investigative Traps

- **Circular reasoning**: Never cite the code's behavior as proof of its own design intent. The fact that code clamps a number does not explain *why* clamping was necessary.
- **Rationalization**: Do not invent a clean retrospective justification for messy code. Code may have been an unvetted workaround, copy-pasted, or written under constraints that no longer apply.
- **The sycophancy trap**: When the user asks "Why do we do X, is it for Y?", do not assume Y is correct. Treat the user's suggestion as one hypothesis to test against the evidence.
- **Recency bias**: Do not assume the most recent commit reflects the foundational motivation. Trace through renames and blame layers to the originating change.
