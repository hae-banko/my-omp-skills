# Explain the Number

Apply before you measure, and before you trust, report, or act on a number you measured: a speedup, a regression, a throughput, a latency, or an eval result. Find what limits it, and rule out that it measured something other than the work you think.

Before reporting or acting on a measured metric, identify the exact physical or architectural resource that bounds it and prove the measurement reflects the intended workload.

**Why:** A number without a named limiter or noise analysis usually measures an artifact: cache hits, skipped work, unhandled errors, benchmark harness overhead, or run-to-run noise.

- **Write the decision threshold first:** Document the specific delta that justifies an architectural decision before running the benchmark. If the run-to-run spread exceeds the observed improvement, the result is inconclusive.
- **Ask "Why not double?":** Name the concrete physical or architectural limiter (CPU saturation, lock contention, disk I/O, network bandwidth, or load generator limits). Obtain it from runtime profiles (`perf`, CPU sampling, `strace`) or resource telemetry (`top`, `iostat`) mapped directly to source code lines. A guess from reading source is not a limiter.
- **Rule out artifacts with evidence:** Check for the usual measurement pitfalls:
  - Unexpected non-zero exit codes, HTTP errors, or swallowed exceptions (fast because it failed fast).
  - Skipped, cached, or deferred execution.
  - Asymmetric tuning (comparing tuned code against default library configurations).
  - Measurement overhead (profiling during benchmark capture).
- **Sanity check against Amdahl's Law:** If an optimized component accounted for 15% of runtime, the end-to-end gain cannot exceed ~17%. Any larger speedup means something was skipped or cached.
- **Keep evidence with the number:** Record run counts (minimum 5 alternating runs), min/max spread, standard deviation, and the named limiter alongside every reported figure.

For full benchmark execution, see [skill://verify/playbooks/benchmark.md](../verify/playbooks/benchmark.md). Distinct from [skill://principles/prove-it-works.md](prove-it-works.md), which verifies functional correctness rather than performance capacity.
