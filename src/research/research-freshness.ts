// Freshness model for research cards.
//
// WARN at age > 1x expected interval, STALE at age > 2x (Prometheus 2x rule;
// dbt warn_after/error_after two-threshold pattern). STALE/WARN are derived
// ONCE at emission time and frozen in the payload — the renderer has no
// clock, and render-time derivation would rewrite frozen transcript history
// (deterministic-replay violation).

export type Freshness = "fresh" | "warn" | "stale" | "unknown";

export interface FreshnessFacts {
  asOfIso?: string;
  expectedIntervalSeconds?: number;
  /** Injectable clock (tests). */
  now?: number;
}

/** Expected freshness interval per pipeline status (seconds). */
export const EXPECTED_INTERVAL_SECONDS: Readonly<Record<string, number>> = {
  RUNNING: 15 * 60,
};

export function freshnessOf(facts: FreshnessFacts): Freshness {
  if (!facts.asOfIso) return "unknown";
  const ageMs = (facts.now ?? Date.now()) - Date.parse(facts.asOfIso);
  if (Number.isNaN(ageMs) || ageMs < 0) return "unknown";
  const intervalMs = (facts.expectedIntervalSeconds ?? EXPECTED_INTERVAL_SECONDS.RUNNING) * 1000;
  if (ageMs > 2 * intervalMs) return "stale";
  if (ageMs > intervalMs) return "warn";
  return "fresh";
}

export function freshnessLabel(freshness: Freshness): string {
  switch (freshness) {
    case "fresh":
      return "fresh";
    case "warn":
      return "WARN";
    case "stale":
      return "STALE";
    default:
      return "";
  }
}
