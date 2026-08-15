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

/**
 * Convert a list of string values (e.g. slugs, filenames) into filtered completion options.
 */
export function completeStrings(
  values: string[],
  prefix: string,
  describe?: (val: string) => string | undefined,
): CompletionOption[] {
  const clean = prefix.trim().toLowerCase();
  const filtered = clean
    ? values.filter((v) => v.toLowerCase().startsWith(clean) || v.toLowerCase().includes(clean))
    : values;

  return filtered.map((v) => ({
    value: v,
    label: v,
    ...(describe ? { description: describe(v) } : {}),
  }));
}

/**
 * Route subcommands and positional arguments declaratively.
 */
export function createSubcommandCompleter(
  subcommands: CompletionOption[],
  positional?: (subcommand: string, rest: string) => CompletionOption[] | null,
): (argumentPrefix: string) => CompletionOption[] | null {
  return (argumentPrefix: string) => {
    const trimmed = argumentPrefix.trimStart();
    const firstSpace = trimmed.indexOf(" ");

    if (firstSpace === -1) {
      return filterCompletions(subcommands, trimmed);
    }

    if (positional) {
      const subcmd = trimmed.slice(0, firstSpace).toLowerCase();
      const rest = trimmed.slice(firstSpace + 1).trimStart();
      return positional(subcmd, rest);
    }

    return null;
  };
}
