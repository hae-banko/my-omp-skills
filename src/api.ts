// Minimal structural contracts for the subset of the omp ExtensionAPI this
// package uses. The runtime passes the full API, which is a structural
// superset, so these stay assignable both ways without depending on the
// `@oh-my-pi/pi-coding-agent` type package.

export interface CommandContext {
  ui?: {
    notify?(message: string, level?: string): void;
  };
}

export interface CommandHandlerDef {
  description?: string;
  getArgumentCompletions?: (
    argumentPrefix: string,
  ) => Array<{ value: string; label: string; description?: string }> | null;
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
}

/** Shape accepted by `pi.sendMessage` for a custom message entry. */
export interface CustomMessagePayload {
  customType?: string;
  content?: string;
  display?: boolean;
  details?: unknown;
  attribution?: "user" | "agent";
}

/** Minimal view of the `tool_call` event (pre-exec, may block or revise). */
export interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolCallEventResult {
  block?: boolean;
  reason?: string;
}

/** Minimal view of the `context` event (messages about to hit the LLM). */
export interface ContextEvent {
  messages: unknown[];
}

export interface ContextEventResult {
  messages?: unknown[];
}

export interface ContentBlock {
  type: string;
  text: string;
}

export interface ToolResult {
  content: ContentBlock[];
  details?: unknown;
}

/** Minimal view of a `registerTool` definition. */
export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd: string; hasUI?: boolean; ui?: unknown; abort?: (() => void) | undefined },
  ): Promise<ToolResult>;
  renderCall?(
    args: Record<string, unknown>,
    options: { expanded: boolean },
    theme: unknown,
  ): unknown;
  renderResult?(
    result: ToolResult,
    options: { expanded: boolean },
    theme: unknown,
    args?: Record<string, unknown>,
  ): unknown;
}

/** Minimal zod/v4 chain used to author tool parameter schemas. */
export interface ZodLike {
  object(shape: Record<string, unknown>): unknown;
  enum(values: readonly string[]): { default(value: string): unknown; optional(): unknown };
  string(): { optional(): unknown };
  record(keyType: unknown, valueType?: unknown): { optional(): unknown };
  number(): { int(): { min(n: number): { max(n: number): { optional(): unknown } } } };
  boolean(): { optional(): unknown };
}

/** The subset of the omp ExtensionAPI this package registers against. */
export interface ExtensionApi {
  registerCommand(name: string, def: CommandHandlerDef): void;
  sendUserMessage(content: string, options?: { deliverAs?: string }): Promise<unknown>;
  sendMessage(message: CustomMessagePayload, options?: Record<string, unknown>): void;
  on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void;
  registerTool(def: ToolDefinition): void;
  registerMessageRenderer(
    customType: string,
    renderer: (message: unknown, options: unknown, theme: unknown) => unknown,
  ): void;
  zod: ZodLike;
}
