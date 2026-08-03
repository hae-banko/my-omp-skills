// Session-start bootstrap: makes the model aware of this package's commands
// without the user having to type /help. The pattern (session_start →
// context → session_compact → agent_end, dedup guard, insert after leading
// compaction summaries) is adapted from the superpowers extension, which has
// shipped it in production. The body is injected once per session as a
// user-role message; it is cleared on agent_end and re-armed on compaction.

import type { ContextEvent, ContextEventResult, ExtensionApi } from "./api.ts";

const BOOTSTRAP_MARKER = "my-omp-skills:available-commands";

export interface BootstrapCommand {
  name: string;
  description: string;
}

export function installBootstrap(pi: ExtensionApi, commands: BootstrapCommand[]): void {
  let injectBootstrap = true;

  pi.on("session_start", () => {
    injectBootstrap = true;
  });
  pi.on("session_compact", () => {
    injectBootstrap = true;
  });
  pi.on("agent_end", () => {
    injectBootstrap = false;
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
