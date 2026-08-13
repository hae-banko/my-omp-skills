// Canonical research pipeline status vocabulary.
//
// One vocabulary for every research card, mapped to the AG-UI run lifecycle
// (RUN_STARTED / RUN_FINISHED / RunError / interrupts). Previously three
// inconsistent systems coexisted: the documented OUTLINE/RUNNING/CONVERGED/
// REPORT_READY words (never emitted), phase-arrow display strings (emitted by
// the dashboard), and a dead 'RUNNING' value in the review card status type.

export type PipelineStatus =
  | "OUTLINE"
  | "RUNNING"
  | "CONVERGED"
  | "REPORT_READY"
  | "PAUSED"
  | "CANCELLED"
  | "ERROR"
  | "STALE";

export type ResearchPhase = 1 | 2 | 3;

export const PIPELINE_STATUSES: readonly PipelineStatus[] = [
  "OUTLINE",
  "RUNNING",
  "CONVERGED",
  "REPORT_READY",
  "PAUSED",
  "CANCELLED",
  "ERROR",
  "STALE",
];

export function isPipelineStatus(s: unknown): s is PipelineStatus {
  return typeof s === "string" && (PIPELINE_STATUSES as readonly string[]).includes(s);
}

/** AG-UI run lifecycle mapping (used by docs, help card and diagnostics). */
export const AGUI_MAPPING: Record<PipelineStatus, string> = {
  OUTLINE: "not started (pre-run)",
  RUNNING: "RUN_STARTED — wave loop active",
  CONVERGED: "RUN_FINISHED — all items resolved",
  REPORT_READY: "RUN_FINISHED + report.md generated",
  PAUSED: "interrupt — user stop, resumable",
  CANCELLED: "interrupt — aborted",
  ERROR: "RunError — recoverable",
  STALE: "derived — RUNNING data past freshness",
};

export interface StatusFacts {
  hasReport?: boolean;
  completedItems?: number;
  totalItems?: number;
  /** Workflow-supplied override (RUNNING during waves, PAUSED/CANCELLED/ERROR on stop). */
  explicit?: string;
}

/** Deterministic derivation for static file snapshots (no clock, no state). */
export function derivePipelineStatus(facts: StatusFacts): PipelineStatus {
  if (facts.explicit && isPipelineStatus(facts.explicit)) return facts.explicit;
  if (facts.hasReport) return "REPORT_READY";
  const completed = facts.completedItems ?? 0;
  const total = facts.totalItems ?? 0;
  if (total > 0 && completed >= total) return "CONVERGED";
  if (completed > 0) return "RUNNING";
  return "OUTLINE";
}

export function phaseOf(status: PipelineStatus): ResearchPhase {
  switch (status) {
    case "OUTLINE":
      return 1;
    case "REPORT_READY":
      return 3;
    default:
      return 2; // RUNNING, CONVERGED, PAUSED, CANCELLED, ERROR, STALE
  }
}

/** "1. Outline ✓ → [2. OODA] → 3. Report" — completed/current/upcoming marks. */
export function phaseStepper(current: ResearchPhase): string {
  const labels: Record<ResearchPhase, string> = { 1: "Outline", 2: "OODA", 3: "Report" };
  const steps = ([1, 2, 3] as ResearchPhase[]).map((n) => {
    if (n < current) return `${n}. ${labels[n]} ✓`;
    if (n === current) return `[${n}. ${labels[n]}]`;
    return `${n}. ${labels[n]}`;
  });
  return steps.join(" → ");
}
