// Minimal structural contracts for the subset of the omp ExtensionAPI this
// package uses. The runtime passes the full API, which is a structural
// superset, so these stay assignable both ways without depending on the
// `@oh-my-pi/pi-coding-agent` type package.

/** Minimal view of an interactive TUI overlay component that the
 * `ctx.ui.custom(...)` seam accepts. The runtime manages focus, sizing,
 * key routing, and lifecycle; this contract only requires render + input. */
export interface CustomOverlayComponent<T = unknown> {
  render(width?: number, height?: number): unknown;
  handleInput?(data: string): void;
  done?: (result: T) => void;
}

/** Factory shape the omp runtime invokes with its `tui`/`theme`/`keybindings`
 * helpers plus a `done(result)` callback the component uses to resolve. The
 * factory returns the overlay component (render/handleInput pair). */
export type CustomOverlayFactory<T = unknown> = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: (result: T) => void,
) => CustomOverlayComponent<T> | { render: (width?: number, height?: number) => unknown; handleInput?: (data: string) => void };

export interface CommandContext {
  /** True when an interactive UI is available; false in --headless / CI modes. */
  hasUI?: boolean;
  ui?: {
    notify?(message: string, level?: string): void;
    setStatus?(key: string, text: string | undefined): void;
    input?(
      prompt: string,
      placeholder?: string,
      dialogOptions?: unknown,
    ): Promise<string | undefined>;
    editor?(
      title: string,
      prefill?: string,
      dialogOptions?: unknown,
      editorOptions?: { promptStyle?: boolean },
    ): Promise<string | undefined>;
    select?(
      title: string,
      options: Array<{ label: string; description?: string; value?: string } | string>,
      dialogOptions?: unknown,
    ): Promise<string | undefined>;
    /**
     * Launch a modal overlay component. The runtime mounts the component,
     * drives `render`/`handleInput`, and resolves once the component returns
     * `undefined` (user dismissed) or the action it returned.
     */
    custom?<T>(
      factory: CustomOverlayFactory<T>,
      options?: {
        overlay?: boolean;
        overlayOptions?: { width?: string; maxHeight?: string; anchor?: "center" | "top" | "bottom" };
      },
    ): Promise<T | undefined>;
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

export interface SendMessageOptions {
  deliverAs?: "steer" | "followUp" | "nextTurn" | "aside";
  triggerTurn?: boolean;
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
  sendMessage(message: CustomMessagePayload, options?: SendMessageOptions): void;
  on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): void;
  registerTool(def: ToolDefinition): void;
  registerMessageRenderer(
    customType: string,
    renderer: (message: unknown, options: unknown, theme: unknown) => unknown,
  ): void;
  zod: ZodLike;
}
