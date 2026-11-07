// Markdown Frontmatter Linter & Validator
// Scans and validates YAML frontmatter in command workflows and skills to catch
// unclosed blocks, duplicate keys, unescaped quotes, and syntax errors.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

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

const FENCE_RE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\S\n]*$/gm;
const LINK_RE = /\[[^\]\n]*\]\(([^)\s]+)\)/g;
const SKILL_URL_RE = /skill:\/\/([a-z0-9][a-z0-9-]*)((?:\/[A-Za-z0-9._-]+)*)/g;
const SKILL_MENTION_RE = /`([a-z][a-z0-9-]*)` skill\b/g;

/**
 * Cross-reference check for the shipped markdown under `<root>/commands` and
 * `<root>/skills`. A skill rename or a moved playbook leaves prose that sends
 * the agent to something that no longer exists; this reports every:
 * - relative markdown link whose target is missing,
 * - `skill://<name>/<path>` whose skill or file is missing,
 * - "`<name>` skill" mention of a skill that doesn't exist (outside
 *   `references/`, whose worked examples cite other repos' skills),
 * - playbook (`skills/<router>/playbooks/*.md`) its router SKILL.md never links.
 * Fenced code blocks and `<placeholder>` link targets are skipped: they are
 * templates, not references.
 */
export function findBrokenSkillReferences(root: string): string[] {
  const skillsDir = join(root, "skills");
  const skills = new Set(
    existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md")))
          .map((e) => e.name)
      : [],
  );
  const problems: string[] = [];
  const files = [...collectMarkdownFiles(join(root, "commands")), ...collectMarkdownFiles(skillsDir)].sort();
  for (const file of files) {
    const where = relative(root, file);
    const text = readFileSync(file, "utf8").replace(FENCE_RE, "");
    for (const [, target] of text.matchAll(LINK_RE)) {
      if (/^[a-z][a-z0-9+.-]*:|^#|^\/|</i.test(target)) continue;
      const path = target.split("#")[0];
      if (path && !existsSync(join(dirname(file), path))) problems.push(`${where}: link target ${target} does not exist`);
    }
    for (const [url, name, sub] of text.matchAll(SKILL_URL_RE)) {
      if (!skills.has(name)) problems.push(`${where}: ${url} names no skill in skills/`);
      else if (sub && !existsSync(join(skillsDir, name, sub))) problems.push(`${where}: ${url} does not exist`);
    }
    if (where.split("/").includes("references")) continue;
    for (const [, name] of text.matchAll(SKILL_MENTION_RE)) {
      if (!skills.has(name)) problems.push(`${where}: mentions the ${name} skill, which does not exist`);
    }
  }
  for (const name of [...skills].sort()) {
    const playbooks = join(skillsDir, name, "playbooks");
    if (!existsSync(playbooks)) continue;
    const router = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
    for (const entry of readdirSync(playbooks).sort()) {
      if (entry.endsWith(".md") && !router.includes(`playbooks/${entry}`)) {
        problems.push(`skills/${name}/SKILL.md: does not route to playbooks/${entry}`);
      }
    }
  }
  return problems;
}
