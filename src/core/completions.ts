// Declarative Completion Router & Helpers
// Eliminates repetitive prefix filtering boilerplate across slash commands.

export interface CompletionOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Filter an array of completion options against an argument prefix.
 * If prefix is empty, returns all options (including header hints).
 */
export function filterCompletions(
  options: CompletionOption[],
  prefix: string,
): CompletionOption[] {
  const clean = prefix.trim().toLowerCase();
  if (!clean) return options;

  return options.filter((opt) => {
    // Retain display-only header hints if any
    if (opt.value === "") return true;
    return (
      opt.value.toLowerCase().startsWith(clean) ||
      opt.label.toLowerCase().startsWith(clean)
    );
  });
}
