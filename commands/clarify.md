Prompt Clarification — `/clarify`

Interactive prompt clarification mode for `omp` adapted from `dkmnx/pi-clarify`.

When enabled, the assistant is instructed to ask clarifying questions using the `clarify_prompt` tool whenever the user's prompt is ambiguous, vague, or missing critical specifications.

## Usage Commands

- `/clarify`: Toggle prompt clarification mode on or off.
- `/clarify on`: Enable prompt clarification mode.
- `/clarify off`: Disable prompt clarification mode.

## Single-Turn Bypass (`~` Prefix)

To bypass prompt clarification for a single prompt even when `/clarify` is enabled, prefix your message with `~`:

```
~ fix the bug in auth.ts
```

The `~` prefix is automatically stripped before sending the message to the model, and prompt clarification instructions are omitted for that turn.

## `clarify_prompt` Tool

When clarification mode is active and the assistant detects an ambiguous request, it invokes the `clarify_prompt` tool:

- **Parameters**: `question` (string), `options` (array of strings, minimum 3 items).
- **Interactive TUI**: Presents choices to the user along with a `"Your answer..."` custom text input option using `ctx.ui.select` and `ctx.ui.input`.
- **Cancellation**: If cancelled by the user, aborts execution gracefully.
