# CONTEXT

Domain model and ubiquitous language for `my-omp-skills`.

## Terms

### Inter-Agent Protocol (IAP)
The standardized application-layer envelope and communication contract (`omp-iap/v1`) governing live interaction, task handoffs, dependency signaling, and artifact exchange between autonomous agents running inside `oh-my-pi`.

### Performative
The explicit communicative intent attached to an IAP message envelope, establishing the semantic contract of the transmission:
- `INFORM`: Asserts verified facts, discoveries, or completed artifact locations.
- `QUERY`: Formally requests a specific fact, upstream artifact, or schema property from another agent.
- `PROPOSE`: Submits an execution plan, outline mutation, or strategy proposal for coordination.
- `BLOCKED`: Signals that the sender cannot proceed due to a missing prerequisite, external blocker, or failed dependency.
- `COMPLETED`: Declares task completion with an attached artifact manifest.
- `FAILED`: Signals terminal or unrecoverable execution failure.

### Dual Transport
The hybrid delivery model where agents emit reactive, live envelopes across the `hub` message bus for real-time peer unblocking while simultaneously persisting definitive structured state to the workspace filesystem (Blackboard model).

### Pointer Envelope
An optimization pattern where payloads exceeding the token threshold (>2 KB) are offloaded to `local://` virtual files or workspace artifacts, transmitting lightweight URI references and cryptographic digests across the message bus instead of raw inline blobs.

### Epistemic Digest
A deterministic cryptographic hash (`sha256:...`) attached to an artifact or payload reference within an envelope, verifying content integrity, enabling subgraph memoization, and ensuring downstream agents do not consume stale or mutated evidence.

### Synthesized Envelope
An IAP envelope automatically reconstructed by the coordinator or DAG orchestrator from blackboard workspace files (`results/*.json`, `outline.yaml`) when a subagent yields without emitting an explicit message, guaranteeing full backward compatibility with legacy workers, external scripts, and non-protocol LLM outputs.
