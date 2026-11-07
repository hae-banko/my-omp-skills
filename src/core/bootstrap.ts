// Session bootstrap: makes the model aware of this package's commands without
// the user having to type /help.
//
// Invariant: The runtime context event is ephemeral and per-request (Fact R6).
// To maintain prompt awareness across turns, /new, and compactions while
// preserving KV-cache prefix stability (AGENTS.md §8), bootstrap commands are
// injected on every `context` event of an interactive session (`ctx.hasUI !== false`),
// positioned at a stable location immediately following any leading compaction
// summaries. Subagents (`hasUI === false`) never receive bootstrap commands.
// The injection is idempotent: if the marker is already present in messages,
// it is not injected again.

import { asEventContext, type ContextEvent, type ContextEventResult, type ExtensionApi } from "./api.ts";

const BOOTSTRAP_MARKER = "my-omp-skills:available-commands";

export interface BootstrapCommand {
  name: string;
  description: string;
}

export function installBootstrap(pi: ExtensionApi, commands: BootstrapCommand[]): void {
  pi.on("context", (event, rawCtx) => {
    const ctx = asEventContext(rawCtx);
    // Only inject for interactive UI sessions; task subagents (hasUI === false)
    // must never receive slash command bootstrap.
    if (ctx.hasUI === false) return;

    // The runtime context event carries `messages` per the documented event contract.
    const eventPayload = event as ContextEvent;
    if (!eventPayload || !Array.isArray(eventPayload.messages)) return;

    if (eventPayload.messages.some(messageContainsBootstrap)) return;

    const insertAt = firstNonCompactionSummaryIndex(eventPayload.messages);
    const result: ContextEventResult = {
      messages: [
        ...eventPayload.messages.slice(0, insertAt),
        {
          role: "user",
          content: [{ type: "text", text: buildBootstrap(commands) }],
          timestamp: 0,
        },
        ...eventPayload.messages.slice(insertAt),
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
