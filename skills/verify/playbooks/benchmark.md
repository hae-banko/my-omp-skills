# Benchmark checklist

Use when measuring performance, benchmarking alternatives, or validating a speedup or regression claim before reporting.

## 1. Define the claim and decision boundary

Before running any benchmark:
- Write down the exact claim to evaluate (e.g. "batch insertion is 25% faster at p50 on 10,000 items").
- Define the decision threshold: what delta would justify accepting or rejecting the change?
- Identify the system noise floor. If the run-to-run variation exceeds the claimed improvement, the result is inconclusive.
- Inspect system load with `uptime` and core count with `nproc`. Ensure the test environment is not competing with background processes.

Completion criterion: Claim sentence, decision threshold, and system baseline load are documented.

## 2. Name the limiter ("Why not double?")

Identify the physical or architectural constraint that caps performance. If you cannot explain why the result is not twice as fast, the benchmark is not understood:
- Profile in a dedicated run separate from reported measurements (profiling overhead distorts benchmarks).
- Use runtime profiling (`perf`, Node.js CPU profiling, `py-spy`, `strace -c`) or resource telemetry (`top`, `iostat`).
- Map the primary hot spot directly to source lines.
- Verify whether the load generator saturated before the application under test.

Completion criterion: Concrete limiter identified (CPU execution, lock contention, disk I/O, network bandwidth, or load generator limit) with supporting profile data.

## 3. Verify tuning parity

Ensure both sides are evaluated under true production conditions:
- Use release and optimized compiler flags and production environment settings.
- Align database indexes, batch sizes, connection pooling, and worker concurrency.
- Ensure cache states (cold startup vs warm cache) are identical across both runs.
- Do not compare default configurations against tuned configurations; this measures tuning, not implementation.

Completion criterion: Configuration and tuning parity verified across all compared implementations.

## 4. Perform arithmetic sanity checks

Compare measured gains against physical and theoretical limits:
- Check throughput against network interface and storage hardware bandwidth limits.
- Apply Amdahl's Law: removing a component that accounts for 15% of total runtime can yield at most an ~17% end-to-end improvement.
- If reported numbers exceed physical maximums, investigate whether work was skipped, cached, or deferred.

Completion criterion: Arithmetic calculation confirms measured gain does not exceed theoretical limits.

## 5. Verify error and validity rates

Confirm that fast operations are not simply failing fast:
- Track non-zero exit codes, HTTP non-2xx status codes, and exception counts.
- Validate that output payloads are complete and semantically correct, not just non-empty.
- Add error counters to the benchmark harness if omitted.

Completion criterion: Execution logs confirm zero unexpected errors and validate output correctness.

## 6. Measure reproducibility with alternating runs

Eliminate thermal throttling, background interference, and warmup bias:
- Execute at least 5 runs per variant, alternating order (A, B, A, B, A, B...).
- Calculate median, minimum, maximum, and standard deviation.
- If the difference between variants is smaller than the run-to-run spread, report no measurable difference.

Completion criterion: At least 5 alternating runs recorded per variant with median and spread calculated.

## 7. Validate end-to-end impact and execution reality

Ensure the measured work actually occurred and matters to users:
- **Execution reality:** Confirm that the timed code path executed fully. Verify that compiler dead-code elimination, lazy evaluation, unawaited asynchronous promises, or mock bypasses did not skip the work.
- **End-to-end relevance:** Measure the micro-benchmark improvement against the complete user-facing request latency.

Completion criterion: Proof of real execution verified (via output assertions or side-effect checks) and end-to-end impact calculated.

## Reply

Hand back:
- Verdict: `faster`, `slower`, `no measurable difference`, or `inconclusive`.
- Formal measurement summary: median, range, run count, and units (e.g. "p50: 42 ms -> 31 ms, median of 7 runs, range 30-33 ms").
- Named limiter and supporting profiling evidence.
- Sanity validation: error counts (0), proof that work executed, and end-to-end relevance.
- If inconclusive: state the exact flaw (unnamed limiter, untuned comparison, high noise floor, or unverified work).
