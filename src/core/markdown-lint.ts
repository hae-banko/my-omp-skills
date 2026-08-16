// Markdown Frontmatter Linter & Validator
// Scans and validates YAML frontmatter in command workflows and skills to catch
// unclosed blocks, duplicate keys, unescaped quotes, and syntax errors.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface MarkdownLintError {
  file: string;
  errors: string[];
}

/**
 * Validate YAML frontmatter in a markdown string.
 * Returns an array of error messages (empty if valid or if no frontmatter is present).
 */
export function validateMarkdownFrontmatter(content: string, filePath = "unknown.md"): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");
  const firstLine = lines[0]?.trim();

  // Frontmatter must begin on line 1 with "---"
  if (firstLine === "---") {
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex === -1) {
      errors.push("Unclosed YAML frontmatter (missing closing ---)");
      return errors;
    }

    const yamlLines = lines.slice(1, closingIndex);
    const seenKeys = new Set<string>();

    for (let i = 0; i < yamlLines.length; i++) {
      const line = yamlLines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Check key-value pair
      const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const val = kvMatch[2].trim();

        if (seenKeys.has(key)) {
          errors.push(`Line ${i + 2}: Duplicate frontmatter key '${key}'`);
        }
        seenKeys.add(key);

        // Check for mismatched quotes
        if (
          (val.startsWith('"') && !val.endsWith('"')) ||
          (val.startsWith("'") && !val.endsWith("'")) ||
          (val.endsWith('"') && !val.startsWith('"')) ||
          (val.endsWith("'") && !val.startsWith("'"))
        ) {
          // Allow multiline YAML block scalar indicators (| or >)
          if (val !== "|" && val !== ">") {
            errors.push(`Line ${i + 2}: Mismatched quotes in value for key '${key}': ${val}`);
          }
        }

        // Check boolean values for known boolean keys
        if (key === "disable-model-invocation" && val !== "true" && val !== "false") {
          errors.push(`Line ${i + 2}: 'disable-model-invocation' must be boolean true/false, got: ${val}`);
        }
      } else if (!line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("-")) {
        errors.push(`Line ${i + 2}: Invalid YAML syntax (not a key-value or list item): '${line}'`);
      }
    }
  }

  return errors;
}

/**
 * Recursively collect all .md files under a root directory.
 */
function collectMarkdownFiles(dir: string, list: string[] = []): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return list;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        collectMarkdownFiles(full, list);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        list.push(full);
      }
    }
  } catch {
    // Ignore directory read errors
  }
  return list;
}

/**
 * Scan and validate all markdown files in a directory tree.
 */
export function scanAndValidateMarkdownDir(dir: string): MarkdownLintError[] {
  const files = collectMarkdownFiles(dir);
  const failures: MarkdownLintError[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf8");
      const errors = validateMarkdownFrontmatter(content, file);
      if (errors.length > 0) {
        failures.push({ file, errors });
      }
    } catch (err) {
      failures.push({
        file,
        errors: [`Failed to read file: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  return failures;
}
