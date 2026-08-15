// Shared Test Utilities & Mock Extension Harness
// Provides failure tracking, mock ExtensionApi, and TUI line collectors.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container as TuiContainer } from "@oh-my-pi/pi-tui";
import { z } from "zod";
import type { ExtensionApi } from "../src/core/api.ts";
import extension from "../src/index.ts";

export interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: { ui?: { notify?: (msg: string, level?: string) => void; setStatus?: (k: string, t?: string) => void }; hasUI?: boolean }) => Promise<void> | void;
  getArgumentCompletions?: (argumentPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
}

export interface RegisteredTool {
  name: string;
  description: string;
  parameters?: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd: string; hasUI?: boolean; ui?: unknown; abort?: () => void },
  ): Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
  renderCall?: (
    args: Record<string, unknown>,
    options: { expanded: boolean },
    theme: unknown,
  ) => unknown;
  renderResult?: (
    result: { content: Array<{ type: string; text: string }>; details?: unknown },
    options: { expanded: boolean },
    theme: unknown,
    args?: Record<string, unknown>,
  ) => unknown;
}

export const EXPECTED_COMMANDS: Record<string, { companions?: number; silent?: boolean }> = {
  "ask-me": {},
  "grill-me": {},
  "grill-with-docs": {},
  hindsight: { silent: true },
  clarify: { silent: true },
  math: {},
  audit: { companions: 1 },
  triage: { companions: 2 },
  "improve-codebase-architecture": { companions: 1 },
  "omp-setup": { companions: 5 },
  "to-spec": {},
  "to-tickets": {},
  implement: {},
  wayfinder: {},
  "omp-handoff": {},
  "plugin-issue": {},
  reference: { silent: true },
  timeline: { silent: true },
  tilt: { silent: true },
  record: { companions: 1 },
  pitfall: { companions: 1 },
  routinize: { companions: 2 },
  research: { companions: 7 },
  "research-add-items": { companions: 1 },
  "research-add-fields": { companions: 1 },
  "research-deep": { companions: 7 },
  "research-report": { companions: 1 },
  teach: { companions: 4 },
  "writing-great-skills": { companions: 1 },
};

let globalFailures = 0;

export function fail(msg: string): void {
  globalFailures += 1;
  console.error(`FAIL: ${msg}`);
}

export function getFailures(): number {
  return globalFailures;
}

export function resetFailures(): void {
  globalFailures = 0;
}

export interface TestContext {
  pi: ExtensionApi;
  registered: Record<string, RegisteredCommand>;
  sent: string[];
  customMessages: Array<Record<string, unknown>>;
  handlers: Record<string, (event: unknown, ctx?: unknown) => unknown>;
  eventListeners: Record<string, Array<(event: unknown, ctx?: unknown) => unknown>>;
  tools: RegisteredTool[];
  renderers: Record<string, (message: unknown, options: unknown, theme: unknown) => unknown>;
  collectLines: (container: unknown) => string[];
}

export function createTestContext(): TestContext {
  const registered: Record<string, RegisteredCommand> = {};
  const sent: string[] = [];
  const customMessages: Array<Record<string, unknown>> = [];
  const handlers: Record<string, (event: unknown, ctx?: unknown) => unknown> = {};
  const eventListeners: Record<string, Array<(event: unknown, ctx?: unknown) => unknown>> = {};
  const tools: RegisteredTool[] = [];
  const renderers: Record<string, (message: unknown, options: unknown, theme: unknown) => unknown> = {};

  const collectLines = (container: unknown): string[] => {
    if (!(container instanceof TuiContainer)) return [];
    return (container.children ?? []).map((c) => {
      if (c && typeof c === "object" && "text" in c) {
        return String(c.text ?? "");
      }
      return "";
    });
  };

  const mockPi: ExtensionApi = {
    registerCommand(
      name: string,
      def: { description: string; handler: RegisteredCommand["handler"]; getArgumentCompletions?: RegisteredCommand["getArgumentCompletions"] },
    ): void {
      registered[name] = def;
    },
    async sendUserMessage(content: string): Promise<void> {
      sent.push(content);
    },
    sendMessage(message: Record<string, unknown>): void {
      customMessages.push(message);
    },
    on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void {
      if (event === "input") {
        if (!eventListeners["input"]) eventListeners["input"] = [];
        eventListeners["input"].push(handler);
        handlers["input"] = (evt: unknown, ctx?: unknown) => {
          let lastResult: unknown = undefined;
          for (const listener of eventListeners["input"]) {
            const res = listener(evt, ctx);
            if (res !== undefined && res !== null) {
              if (
                typeof res === "object" &&
                "action" in (res as Record<string, unknown>) &&
                (res as Record<string, unknown>).action !== "continue"
              ) {
                return res;
              }
              lastResult = res;
            }
          }
          return lastResult ?? { action: "continue" };
        };
        return;
      }
      handlers[event] = handler;
    },
    registerTool(def: unknown): void {
      tools.push(def as RegisteredTool);
    },
    registerMessageRenderer(
      customType: string,
      renderer: (message: unknown, options: unknown, theme: unknown) => unknown,
    ): void {
      renderers[customType] = renderer;
    },
    zod: z as unknown as ExtensionApi["zod"],
  };
  extension(mockPi);

  return {
    pi: mockPi,
    registered,
    sent,
    customMessages,
    handlers,
    eventListeners,
    tools,
    renderers,
    collectLines,
  };
}

export function createTempFixture(prefix = "omp-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}
