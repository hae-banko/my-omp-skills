// Routing observer for `omp -p` runs: appends one JSON line per tool call to
// $ROUTE_LOG and ends the run at the first non-skill action after a skill was
// read (routing is decided by then), or after 8 calls. Load with `-e <this file>`.
import { appendFileSync } from "node:fs";

interface ToolCall {
  toolName: string;
  input?: { path?: string; command?: string; pattern?: string };
}

export default function (pi: { on(event: "tool_call", handler: (event: ToolCall) => void): void }): void {
  const log = process.env.ROUTE_LOG;
  if (!log) throw new Error("route-observer: set ROUTE_LOG to the log file path");
  let calls = 0;
  let skillReads = 0;
  pi.on("tool_call", (event) => {
    calls++;
    const target = String(event.input?.path ?? event.input?.command ?? event.input?.pattern ?? "").slice(0, 160);
    const isSkill = event.toolName === "read" && target.startsWith("skill://");
    appendFileSync(log, `${JSON.stringify({ tool: event.toolName, target })}\n`);
    if (isSkill) skillReads++;
    if ((skillReads > 0 && !isSkill) || calls >= 8) process.exit(0);
  });
}
