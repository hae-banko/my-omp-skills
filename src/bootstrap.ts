// Session-start bootstrap: makes the model aware of this package's commands
// without the user having to type /help. The pattern (session_start →
// context → session_compact → agent_end, dedup guard, insert after leading
// compaction summaries) is adapted from the superpowers extension, which has
// shipped it in production. The body is injected once per session as a
// user-role message; it is cleared on agent_end and re-armed on compaction.
//
// Subagent guard (issue #7): `installBootstrap` tracks whether ANY prior
// `agent_end` has fired during this extension module's lifetime. A
// `session_start` (or `session_compact`) that arrives after the main session
// has already ended is almost certainly a subagent (or a follow-on) — the
// main session already received its bootstrap, so we MUST NOT re-arm
// injection. Without this guard, the bootstrap block was being injected into
// every subagent's transcript, wasting tokens and noise the subagent never
// acts on.

import type { ContextEvent, ContextEventResult, ExtensionApi } from "./api.ts";

const BOOTSTRAP_MARKER = "my-omp-skills:available-commands";

export interface BootstrapCommand {
  name: string;
  description: string;
}

// Module-scoped: tracks whether any agent_end has fired during this
// extension's process lifetime. Read by session_start and session_compact to
// decide whether re-arming injection is safe (main session) or a leak
// (subagent).
let hasSeenAgentEnd = false;

/**
 * Test seam — zeroes the module-scoped bootstrap state so the selftest can
 * isolate scenarios (first-session / subagent / post-compact) without
 * bleeding flags across runs. Not exported for production callers.
 */
export function __resetBootstrapForTests(): void {
  hasSeenAgentEnd = false;
}

export function installBootstrap(pi: ExtensionApi, commands: BootstrapCommand[]): void {
  let injectBootstrap = true;

  pi.on("session_start", () => {
    // If a prior session has already ended in this extension lifetime, this
    // session_start is almost certainly a subagent (or follow-on), and the
    // main session already received its bootstrap. Skip re-arming to prevent
    // the bootstrap from leaking into the subagent transcript.
    if (hasSeenAgentEnd) return;
    injectBootstrap = true;
  });
  pi.on("session_compact", () => {
    // Compaction re-arms for the main session (the summary that just landed
    // in the tail clears the bootstrap). After an agent_end, any compaction
    // is subagent-shaped and must NOT re-arm — the main session already
    // received its bootstrap before it ended.
    if (hasSeenAgentEnd) return;
    injectBootstrap = true;
  });
  pi.on("agent_end", () => {
    injectBootstrap = false;
    hasSeenAgentEnd = true;
  });

  pi.on("context", (event) => {
    if (!injectBootstrap) return;
    // The runtime context event carries `messages` per the documented event
    // contract (omp://extensions.md); the API shim types it as unknown.
    const ctx = event as ContextEvent;
    if (ctx.messages.some(messageContainsBootstrap)) return;

    const insertAt = firstNonCompactionSummaryIndex(ctx.messages);
    const result: ContextEventResult = {
      messages: [
        ...ctx.messages.slice(0, insertAt),
        {
          role: "user",
          content: [{ type: "text", text: buildBootstrap(commands) }],
          timestamp: Date.now(),
        },
        ...ctx.messages.slice(insertAt),
      ],
    };
    return result;
  });
}

function buildBootstrap(commands: BootstrapCommand[]): string {
  const lines = commands.map((c) => `- /${c.name} — ${c.description}`);
  return `<${BOOTSTRAP_MARKER}>

You have my-omp-skills installed. The commands below are user-invoked slash commands — you have no tool for them. Suggest the right one when the user's situation fits it; when the user invokes one, follow its workflow body. The model-invoked skills in this package are listed separately in your system prompt.

${lines.join("\n")}

Do not list these commands unless asked, and never call them as tools.`;
}

function messageContainsBootstrap(message: unknown): boolean {
  if (!message || typeof message !== "object" || !("content" in message)) return false;
  const content: unknown = message.content;
  if (typeof content === "string") return content.includes(BOOTSTRAP_MARKER);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || typeof part !== "object" || !("type" in part) || !("text" in part)) return false;
    return part.type === "text" && typeof part.text === "string" && part.text.includes(BOOTSTRAP_MARKER);
  });
}

function firstNonCompactionSummaryIndex(messages: unknown[]): number {
  let index = 0;
  for (;;) {
    const message = messages[index];
    if (!message || typeof message !== "object" || !("role" in message)) return index;
    if (message.role !== "compactionSummary") return index;
    index += 1;
  }
}
