import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";
import { BOTTOM_BORDER, DIVIDER, TOP_BORDER, boxLine, extractPayload } from "./research-format.ts";

export interface AuditSubtopicSpec {
  name: string;
  path?: string;
  status?: string;
}

export interface AuditRevisionSpec {
  version?: string;
  date?: string;
  summary?: string;
  author?: string;
}

export interface AuditCardPayload {
  title?: string;
  slug?: string;
  version?: string;
  status?: string;
  root_report_path?: string;
  rootReportPath?: string;
  subtopics_count?: number;
  subtopicsCount?: number;
  subtopics?: AuditSubtopicSpec[] | string[];
  latest_revision?: string | AuditRevisionSpec;
  latestRevision?: string | AuditRevisionSpec;
  revisions?: AuditRevisionSpec[];
  created?: string;
  updated?: string;
}

export interface TicketItemSpec {
  id?: string | number;
  title: string;
  blocked_by?: Array<string | number>;
  blockedBy?: Array<string | number>;
  status?: string;
  deliverable?: string;
}

export interface TicketBreakdownPayload {
  feature?: string;
  ticket_count?: number;
  ticketCount?: number;
  tracker_path?: string;
  trackerPath?: string;
  tickets?: TicketItemSpec[];
  ready_status?: string;
  readyStatus?: string;
}

export interface BacklogBreakdownSpec {
  unlabeled?: number;
  needs_triage?: number;
  needsTriage?: number;
  agent_ready?: number;
  agentReady?: number;
  needs_info?: number;
  needsInfo?: number;
  ready_for_human?: number;
  readyForHuman?: number;
  wontfix?: number;
}

export interface TriageStatusPayload {
  total_items?: number;
  totalItems?: number;
  backlog?: BacklogBreakdownSpec;
  unlabeled?: number;
  needs_triage?: number;
  needsTriage?: number;
  agent_ready?: number;
  agentReady?: number;
  next_action?: string;
  nextAction?: string;
  recommended_action?: string;
  recommendedAction?: string;
}

export interface ThemeHelper {
  [key: string]: unknown;
}

function parseContentArg(messagePayload: unknown): string | undefined {
  if (messagePayload && typeof messagePayload === "object" && "content" in messagePayload) {
    const rawContent = messagePayload.content;
    const content = typeof rawContent === "string" ? rawContent : String(rawContent ?? "");
    if (content.includes(" — ")) {
      return content.split(" — ").slice(1).join(" — ").trim();
    }
  }
  return undefined;
}

// --- 1. Audit Card -----------------------------------------------------------

export function renderAuditCard(
  payload?: AuditCardPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const contentArg = parseContentArg(payload);
  const rawSlug = p.slug;
  const slug = typeof rawSlug === "string" ? rawSlug : (contentArg ?? "overview");
  const rawTitle = p.title;
  const title = typeof rawTitle === "string" ? rawTitle : (slug ? `Audit: ${slug}` : "Codebase Audit");
  const rawVersion = p.version;
  const version = typeof rawVersion === "string" ? rawVersion : "v0.1.0";
  const rawStatus = p.status;
  const status = typeof rawStatus === "string" ? rawStatus : "active";
  const rawRootReportPath = p.root_report_path ?? p.rootReportPath;
  const rootReportPath =
    typeof rawRootReportPath === "string"
      ? rawRootReportPath
      : (slug === "overview" ? "overview.md" : `.omp/audits/${slug}/overview.md`);

  const rawSubCount = p.subtopics_count ?? p.subtopicsCount;
  const subtopicsCount =
    typeof rawSubCount === "number" && !isNaN(rawSubCount)
      ? rawSubCount
      : (Array.isArray(p.subtopics) ? p.subtopics.length : 0);

  let latestRevisionStr = "v0.1.0 (Initial draft)";
  const rawRev = p.latest_revision ?? p.latestRevision;
  const updatedStr = typeof p.updated === "string" ? p.updated : undefined;
  if (typeof rawRev === "string") {
    latestRevisionStr = rawRev;
  } else if (rawRev && typeof rawRev === "object") {
    const revObj = rawRev as Record<string, unknown>;
    const v = typeof revObj.version === "string" ? revObj.version : version;
    const d = typeof revObj.date === "string" ? revObj.date : (updatedStr ?? "today");
    const s = typeof revObj.summary === "string" && revObj.summary ? ` - ${revObj.summary}` : "";
    latestRevisionStr = `${v} (${d})${s}`;
  } else if (updatedStr) {
    latestRevisionStr = `${version} (${updatedStr})`;
  }

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);
  rawLines.push(boxLine(` AUDIT REPORT — ${title} [${version} | ${status}]`));
  rawLines.push(DIVIDER);

  rawLines.push(boxLine(`   Slug: ${slug}`));
  rawLines.push(boxLine(`   Version: ${version}`));
  rawLines.push(boxLine(`   Status: ${status}`));
  rawLines.push(boxLine(`   Root Report Path: ${rootReportPath}`));
  rawLines.push(boxLine(`   Subtopics Count: ${subtopicsCount}`));
  rawLines.push(boxLine(`   Latest Revision: ${latestRevisionStr}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line) => {
    container.addChild(new Text(line, 0, 0));
  });

  return container;
}

export function installAuditCardRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("audit-card", (message, _options, theme) => {
    const payload = extractPayload<AuditCardPayload>(message);
    return renderAuditCard(payload, theme as ThemeHelper | undefined);
  });
}

// --- 2. Ticket Breakdown Card -------------------------------------------------

export function renderTicketBreakdownCard(
  payload?: TicketBreakdownPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const contentArg = parseContentArg(payload);
  const rawFeature = p.feature;
  const feature = typeof rawFeature === "string" ? rawFeature : (contentArg ?? "feature");
  const rawTrackerPath = p.tracker_path ?? p.trackerPath;
  const trackerPath =
    typeof rawTrackerPath === "string"
      ? rawTrackerPath
      : `.omp/scratch/${feature}/issues/`;

  const rawTickets = Array.isArray(p.tickets) ? p.tickets : [];
  const tickets = rawTickets.filter((t): t is TicketItemSpec => Boolean(t && typeof t === "object"));
  const rawTicketCount = p.ticket_count ?? p.ticketCount;
  const ticketCount =
    typeof rawTicketCount === "number" && !isNaN(rawTicketCount) ? rawTicketCount : tickets.length;
  const rawReadyStatus = p.ready_status ?? p.readyStatus;
  const readyStatus = typeof rawReadyStatus === "string" ? rawReadyStatus : "ready-for-agent";

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);
  rawLines.push(boxLine(` TICKET BREAKDOWN — ${feature} [${readyStatus}]`));
  rawLines.push(DIVIDER);

  rawLines.push(boxLine(`   Tracker Path: ${trackerPath}`));
  rawLines.push(boxLine(`   Ticket Count: ${ticketCount}`));
  rawLines.push(boxLine(`   Ready Status: ${readyStatus}`));

  rawLines.push(DIVIDER);
  rawLines.push(boxLine("   Tickets & Blocking Dependencies:"));

  if (tickets.length === 0) {
    if (ticketCount > 0) {
      rawLines.push(boxLine(`     - ${ticketCount} ticket(s) configured in backlog`));
    } else {
      rawLines.push(boxLine("     (none)"));
    }
  } else {
    const previewTickets = tickets.slice(0, 8);
    for (const t of previewTickets) {
      const idVal = t.id;
      const idStr =
        idVal !== undefined && idVal !== null
          ? String(idVal).startsWith("Ticket") || String(idVal).startsWith("#")
            ? String(idVal)
            : `Ticket ${idVal}`
          : "Ticket";
      const titleStr = typeof t.title === "string" ? t.title : String(t.title ?? "");
      const rawBlockers = t.blocked_by ?? t.blockedBy;
      const blockers = Array.isArray(rawBlockers) ? rawBlockers.filter((b) => b !== null && b !== undefined) : [];

      if (blockers.length > 0) {
        const formattedBlockers = blockers
          .map((b) =>
            String(b).startsWith("Ticket") || String(b).startsWith("#")
              ? String(b)
              : `Ticket ${b}`,
          )
          .join(", ");
        rawLines.push(boxLine(`     - ${formattedBlockers} -> ${idStr}: ${titleStr}`));
      } else {
        rawLines.push(boxLine(`     - ${idStr}: ${titleStr} [ready]`));
      }
    }
    if (tickets.length > 8) {
      rawLines.push(boxLine(`     ... and ${tickets.length - 8} more ticket(s)`));
    }
  }

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line) => {
    container.addChild(new Text(line, 0, 0));
  });

  return container;
}

export function installTicketBreakdownRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("ticket-breakdown", (message, _options, theme) => {
    const payload = extractPayload<TicketBreakdownPayload>(message);
    return renderTicketBreakdownCard(payload, theme as ThemeHelper | undefined);
  });
}

// --- 3. Triage Status Card ----------------------------------------------------

export function renderTriageStatusCard(
  payload?: TriageStatusPayload,
  _theme?: ThemeHelper,
): Container {
  const p = (payload && typeof payload === "object" ? payload : {}) as unknown as Record<string, unknown>;
  const backlog = p.backlog && typeof p.backlog === "object" ? (p.backlog as Record<string, unknown>) : {};

  const getNum = (v: unknown): number | undefined => (typeof v === "number" && !isNaN(v) ? v : undefined);

  const unlabeled = getNum(backlog.unlabeled) ?? getNum(p.unlabeled) ?? 0;
  const needsTriage =
    getNum(backlog.needs_triage) ??
    getNum(backlog.needsTriage) ??
    getNum(p.needs_triage) ??
    getNum(p.needsTriage) ??
    0;
  const agentReady =
    getNum(backlog.agent_ready) ??
    getNum(backlog.agentReady) ??
    getNum(p.agent_ready) ??
    getNum(p.agentReady) ??
    0;

  const totalItems =
    getNum(p.total_items) ??
    getNum(p.totalItems) ??
    unlabeled + needsTriage + agentReady;

  const rawNext =
    p.next_action ??
    p.nextAction ??
    p.recommended_action ??
    p.recommendedAction;

  let nextAction = typeof rawNext === "string" ? rawNext : undefined;

  if (!nextAction) {
    if (unlabeled > 0) {
      nextAction = "Triage unlabeled backlog items into bug/enhancement";
    } else if (needsTriage > 0) {
      nextAction = "Review and grill items in needs-triage state";
    } else if (agentReady > 0) {
      nextAction = "Dispatch ready-for-agent tickets to worker agents";
    } else {
      nextAction = "Backlog fully triaged — no immediate action required";
    }
  }

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);
  rawLines.push(boxLine(" TRIAGE STATUS — Backlog Overview"));
  rawLines.push(DIVIDER);

  rawLines.push(boxLine(`   Total Items: ${totalItems}`));

  rawLines.push(DIVIDER);
  rawLines.push(boxLine("   Backlog Breakdown:"));
  rawLines.push(boxLine(`     - unlabeled: ${unlabeled}`));
  rawLines.push(boxLine(`     - needs-triage: ${needsTriage}`));
  rawLines.push(boxLine(`     - agent-ready: ${agentReady}`));

  rawLines.push(DIVIDER);
  rawLines.push(boxLine(`   Next Recommended Action:`));
  rawLines.push(boxLine(`     ${nextAction}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line) => {
    container.addChild(new Text(line, 0, 0));
  });

  return container;
}

export function installTriageStatusRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("triage-status", (message, _options, theme) => {
    const payload = extractPayload<TriageStatusPayload>(message);
    return renderTriageStatusCard(payload, theme as ThemeHelper | undefined);
  });
}
