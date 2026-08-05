import { Container, Text } from "@oh-my-pi/pi-tui";
import type { ExtensionApi } from "./api.ts";

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

const BOX_WIDTH = 76;
const INNER_WIDTH = BOX_WIDTH - 2; // 74

function formatContentLine(text: string): string {
  const truncated = text.length > INNER_WIDTH ? text.slice(0, INNER_WIDTH - 3) + "..." : text;
  return `│${truncated.padEnd(INNER_WIDTH, " ")}│`;
}

const TOP_BORDER = `┌${"─".repeat(INNER_WIDTH)}┐`;
const DIVIDER = `├${"─".repeat(INNER_WIDTH)}┤`;
const BOTTOM_BORDER = `└${"─".repeat(INNER_WIDTH)}┘`;

function extractPayload<T>(message: unknown): T | undefined {
  if (message && typeof message === "object") {
    if ("details" in message && message.details && typeof message.details === "object") {
      return message.details as T;
    }
    return message as T;
  }
  return undefined;
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
  const contentArg = parseContentArg(payload);
  const slug = payload?.slug ?? contentArg ?? "overview";
  const title = payload?.title ?? (slug ? `Audit: ${slug}` : "Codebase Audit");
  const version = payload?.version ?? "v0.1.0";
  const status = payload?.status ?? "active";
  const rootReportPath =
    payload?.root_report_path ??
    payload?.rootReportPath ??
    (slug === "overview" ? "overview.md" : `.omp/audits/${slug}/overview.md`);

  const subtopicsCount =
    payload?.subtopics_count ??
    payload?.subtopicsCount ??
    (Array.isArray(payload?.subtopics) ? payload.subtopics.length : 0);

  let latestRevisionStr = "v0.1.0 (Initial draft)";
  const rawRev = payload?.latest_revision ?? payload?.latestRevision;
  if (typeof rawRev === "string") {
    latestRevisionStr = rawRev;
  } else if (rawRev && typeof rawRev === "object") {
    const v = rawRev.version ?? version;
    const d = rawRev.date ?? payload?.updated ?? "today";
    const s = rawRev.summary ? ` - ${rawRev.summary}` : "";
    latestRevisionStr = `${v} (${d})${s}`;
  } else if (payload?.updated) {
    latestRevisionStr = `${version} (${payload.updated})`;
  }

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);
  rawLines.push(formatContentLine(` AUDIT REPORT — ${title} [${version} | ${status}]`));
  rawLines.push(DIVIDER);

  rawLines.push(formatContentLine(`   Slug: ${slug}`));
  rawLines.push(formatContentLine(`   Version: ${version}`));
  rawLines.push(formatContentLine(`   Status: ${status}`));
  rawLines.push(formatContentLine(`   Root Report Path: ${rootReportPath}`));
  rawLines.push(formatContentLine(`   Subtopics Count: ${subtopicsCount}`));
  rawLines.push(formatContentLine(`   Latest Revision: ${latestRevisionStr}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
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
  const contentArg = parseContentArg(payload);
  const feature = payload?.feature ?? contentArg ?? "feature";
  const trackerPath =
    payload?.tracker_path ??
    payload?.trackerPath ??
    `.scratch/${feature}/issues/`;

  const tickets = payload?.tickets ?? [];
  const ticketCount =
    payload?.ticket_count ?? payload?.ticketCount ?? tickets.length;
  const readyStatus = payload?.ready_status ?? payload?.readyStatus ?? "ready-for-agent";

  const rawLines: string[] = [];

  rawLines.push(TOP_BORDER);
  rawLines.push(formatContentLine(` TICKET BREAKDOWN — ${feature} [${readyStatus}]`));
  rawLines.push(DIVIDER);

  rawLines.push(formatContentLine(`   Tracker Path: ${trackerPath}`));
  rawLines.push(formatContentLine(`   Ticket Count: ${ticketCount}`));
  rawLines.push(formatContentLine(`   Ready Status: ${readyStatus}`));

  rawLines.push(DIVIDER);
  rawLines.push(formatContentLine("   Tickets & Blocking Dependencies:"));

  if (tickets.length === 0) {
    if (ticketCount > 0) {
      rawLines.push(formatContentLine(`     - ${ticketCount} ticket(s) configured in backlog`));
    } else {
      rawLines.push(formatContentLine("     (none)"));
    }
  } else {
    const previewTickets = tickets.slice(0, 8);
    for (const t of previewTickets) {
      const idStr =
        t.id !== undefined
          ? String(t.id).startsWith("Ticket") || String(t.id).startsWith("#")
            ? String(t.id)
            : `Ticket ${t.id}`
          : "Ticket";
      const blockers = t.blocked_by ?? t.blockedBy ?? [];

      if (blockers.length > 0) {
        const formattedBlockers = blockers
          .map((b) =>
            String(b).startsWith("Ticket") || String(b).startsWith("#")
              ? String(b)
              : `Ticket ${b}`,
          )
          .join(", ");
        rawLines.push(formatContentLine(`     - ${formattedBlockers} -> ${idStr}: ${t.title}`));
      } else {
        rawLines.push(formatContentLine(`     - ${idStr}: ${t.title} [ready]`));
      }
    }
    if (tickets.length > 8) {
      rawLines.push(formatContentLine(`     ... and ${tickets.length - 8} more ticket(s)`));
    }
  }

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
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
  const unlabeled = payload?.backlog?.unlabeled ?? payload?.unlabeled ?? 0;
  const needsTriage =
    payload?.backlog?.needs_triage ??
    payload?.backlog?.needsTriage ??
    payload?.needs_triage ??
    payload?.needsTriage ??
    0;
  const agentReady =
    payload?.backlog?.agent_ready ??
    payload?.backlog?.agentReady ??
    payload?.agent_ready ??
    payload?.agentReady ??
    0;

  const totalItems =
    payload?.total_items ??
    payload?.totalItems ??
    unlabeled + needsTriage + agentReady;

  let nextAction =
    payload?.next_action ??
    payload?.nextAction ??
    payload?.recommended_action ??
    payload?.recommendedAction;

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
  rawLines.push(formatContentLine(" TRIAGE STATUS — Backlog Overview"));
  rawLines.push(DIVIDER);

  rawLines.push(formatContentLine(`   Total Items: ${totalItems}`));

  rawLines.push(DIVIDER);
  rawLines.push(formatContentLine("   Backlog Breakdown:"));
  rawLines.push(formatContentLine(`     - unlabeled: ${unlabeled}`));
  rawLines.push(formatContentLine(`     - needs-triage: ${needsTriage}`));
  rawLines.push(formatContentLine(`     - agent-ready: ${agentReady}`));

  rawLines.push(DIVIDER);
  rawLines.push(formatContentLine(`   Next Recommended Action:`));
  rawLines.push(formatContentLine(`     ${nextAction}`));

  rawLines.push(BOTTOM_BORDER);

  const container = new Container();
  rawLines.forEach((line, index) => {
    container.addChild(new Text(line, 0, index));
  });

  return container;
}

export function installTriageStatusRenderer(pi: ExtensionApi): void {
  pi.registerMessageRenderer("triage-status", (message, _options, theme) => {
    const payload = extractPayload<TriageStatusPayload>(message);
    return renderTriageStatusCard(payload, theme as ThemeHelper | undefined);
  });
}
