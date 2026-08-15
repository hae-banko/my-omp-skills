# 0001: OMP-IAP/v1 Inter-Agent Communication Protocol

We adopted a standardized application-layer Inter-Agent Protocol (`omp-iap/v1`) for autonomous subagents running inside `oh-my-pi`. Subagents communicate using explicit performatives (`INFORM`, `QUERY`, `PROPOSE`, `BLOCKED`, `COMPLETED`, `FAILED`), dual transport (reactive `hub` messaging + persistent blackboard files), threshold-gated pointer envelopes (payloads >2 KB offloaded to `local://` URIs with SHA-256 epistemic digests), and reactive event-driven suspension when encountering missing dependencies.

## Context & Problem
Prior multi-agent flows (deep research waves, parallel code reviews, decision ticket handoffs) relied on conversational prose or unstructured JSON written to disk. Subagents could not exchange real-time discoveries mid-wave, could not express structured blocker states, and suffered from context pollution and token burn when transmitting large artifacts across agent boundaries.

## Decisions

1. **Dual Transport (Live Actor Messaging + File Blackboard)**:
   - Agents emit reactive IAP envelopes across the `hub` message bus for real-time peer unblocking and event signaling.
   - Definitive artifacts and structured states are simultaneously written to the workspace filesystem (`results/*.json`, `outline.yaml`) to ensure crash resilience, offline reproducibility, and compaction survival.

2. **Threshold-Gated Pointer Envelopes**:
   - Payloads $\le 2\text{ KB}$ are transmitted inline within `envelope.payload`.
   - Payloads $> 2\text{ KB}$ are written to `local://` or workspace files and transmitted as lightweight URI references with SHA-256 epistemic digests in `envelope.artifacts`.

3. **Reactive Blocker Suspension**:
   - When a subagent emits a `BLOCKED` envelope, the orchestrator immediately parks the worker node without busy-waiting or burning LLM tokens.
   - The worker is automatically resumed and supplied with resolved upstream context when the required dependency emits a `COMPLETED` or `INFORM` envelope.

## Considered Options
- *In-Memory Hub Stream Only*: Rejected due to total loss of research state upon session compaction or harness restarts.
- *Static File Inbox Only*: Rejected due to lack of reactive real-time peer wakeups and the need for expensive disk polling.
- *Synchronous Polling Loop (`hub.wait`)*: Rejected due to worker process exhaustion and token burn during large parallel waves.
