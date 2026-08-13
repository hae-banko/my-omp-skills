import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Container } from "@oh-my-pi/pi-tui";
import type { ExtensionApi, ToolResult } from "../core/api.ts";
import { toolResultCard } from "../research/research-format.ts";

const UNDERSCORE_RE = /_/g;
const repoRootCache = new Map<string, string>();
export interface RoutineParameter {
  name: string;
  default?: string;
  description?: string;
}

export interface RoutineEntry {
  id: string;
  name: string;
  file: string;
  description?: string;
  parameters?: RoutineParameter[];
  tags?: string[];
}

export interface RoutineManifest {
  routines: RoutineEntry[];
}

export interface RoutineExecutionDetails {
  routineId: string;
  name: string;
  file?: string;
  scriptPath?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  args?: Record<string, string>;
  success: boolean;
  error?: string;
}

export function findRoutinesRepoRoot(startDir: string = process.cwd()): string {
  const cached = repoRootCache.get(startDir);
  if (cached !== undefined) return cached;
  let dir = startDir;
  for (;;) {
    const manifestPath = join(dir, "scripts", "routines", "manifest.json");
    if (existsSync(manifestPath)) {
      repoRootCache.set(startDir, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: search for root marker (.git, .omp, .scratch, package.json)
  dir = startDir;
  for (;;) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, ".omp")) ||
      existsSync(join(dir, ".scratch")) ||
      existsSync(join(dir, "package.json"))
    ) {
      repoRootCache.set(startDir, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      repoRootCache.set(startDir, startDir);
      return startDir;
    }
    dir = parent;
  }
}

export function renderRoutineResult(result: ToolResult): Container {
  const details = result.details as RoutineExecutionDetails | undefined;
  const name = details?.name ?? details?.routineId ?? "Routine";
  const code = details?.exitCode ?? (details?.success === false ? 1 : 0);
  const label = `ROUTINE — ${name} (exit ${code})`;
  const summary = details?.stdout || details?.stderr || details?.error || (result.content[0]?.text ?? "");
  const lines = summary
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(0, 8);
  if (lines.length === 0) lines.push(code === 0 ? "completed with no output" : "failed with no output");

  return toolResultCard(lines, label);
}

export function installRoutinesTool(pi: ExtensionApi): void {
  const { zod } = pi;

  pi.registerTool({
    name: "run_routine",
    label: "Run Routine",
    description:
      "Execute a parameterized routine script from scripts/routines/ using metadata from manifest.json",
    parameters: zod.object({
      routineId: zod.string(),
      args: zod.record(zod.string(), zod.string()).optional(),
    }),
    execute: async (_toolCallId, rawParams, signal, _onUpdate, ctx) => {
      const params = rawParams as { routineId: string; args?: Record<string, string> };
      const repoRoot = findRoutinesRepoRoot(ctx.cwd);
      const routinesDir = join(repoRoot, "scripts", "routines");
      const manifestPath = join(routinesDir, "manifest.json");

      const resolvedRoutine = resolve(routinesDir, params.routineId);
      const relRoutine = relative(routinesDir, resolvedRoutine);
      if (relRoutine.startsWith("..") || isAbsolute(relRoutine)) {
        const msg = `Error: Path traversal attempt detected for routineId "${params.routineId}"`;
        return {
          content: [{ type: "text", text: msg }],
          details: {
            routineId: params.routineId,
            name: params.routineId,
            exitCode: 1,
            stdout: "",
            stderr: msg,
            success: false,
            error: msg,
          },
        };
      }

      let routineEntry: RoutineEntry | undefined;
      let scriptFile: string | undefined;
      let routineName: string | undefined;

      if (existsSync(manifestPath)) {
        try {
          const raw = readFileSync(manifestPath, "utf8");
          const manifest = JSON.parse(raw) as RoutineManifest;
          if (manifest && Array.isArray(manifest.routines)) {
            routineEntry = manifest.routines.find(
              (r) =>
                r &&
                typeof r === "object" &&
                (r.id === params.routineId ||
                  r.file === params.routineId ||
                  (typeof r.file === "string" && basename(r.file) === params.routineId) ||
                  (typeof r.name === "string" && r.name.toLowerCase() === params.routineId.toLowerCase())),
            );
          }
        } catch {
          // Ignore manifest parse errors
        }
      }

      if (routineEntry) {
        scriptFile = routineEntry.file;
        routineName = routineEntry.name;
      } else {
        const candidateSh = params.routineId.endsWith(".sh")
          ? params.routineId
          : `${params.routineId}.sh`;
        if (existsSync(join(routinesDir, params.routineId))) {
          scriptFile = params.routineId;
          routineName = params.routineId;
        } else if (existsSync(join(routinesDir, candidateSh))) {
          scriptFile = candidateSh;
          routineName = params.routineId;
        }
      }

      if (!scriptFile) {
        const msg = `Error: Routine "${params.routineId}" not found in scripts/routines/manifest.json or scripts/routines/`;
        return {
          content: [{ type: "text", text: msg }],
          details: {
            routineId: params.routineId,
            name: params.routineId,
            exitCode: 1,
            stdout: "",
            stderr: msg,
            success: false,
            error: `Routine "${params.routineId}" not found`,
          },
        };
      }

      const scriptPath = resolve(routinesDir, scriptFile);
      const relScript = relative(routinesDir, scriptPath);
      if (relScript.startsWith("..") || isAbsolute(relScript)) {
        const msg = `Error: Path traversal attempt detected for script "${scriptFile}"`;
        return {
          content: [{ type: "text", text: msg }],
          details: {
            routineId: params.routineId,
            name: routineName ?? params.routineId,
            file: scriptFile,
            scriptPath,
            exitCode: 1,
            stdout: "",
            stderr: msg,
            success: false,
            error: msg,
          },
        };
      }
      if (!existsSync(scriptPath)) {
        const msg = `Error: Routine script file "${scriptPath}" does not exist.`;
        return {
          content: [{ type: "text", text: msg }],
          details: {
            routineId: params.routineId,
            name: routineName ?? params.routineId,
            file: scriptFile,
            scriptPath,
            exitCode: 1,
            stdout: "",
            stderr: msg,
            success: false,
            error: `Script file not found: ${scriptPath}`,
          },
        };
      }

      const effectiveArgs: Record<string, string> = {};
      if (routineEntry?.parameters && Array.isArray(routineEntry.parameters)) {
        for (const p of routineEntry.parameters) {
          if (p && p.default !== undefined && typeof p.name === "string" && p.name.length > 0) {
            effectiveArgs[p.name] = p.default;
          }
        }
      }
      for (const [k, v] of Object.entries(params.args ?? {})) {
        if (typeof v === "string") {
          effectiveArgs[k] = v;
        }
      }

      const env: Record<string, string | undefined> = { ...process.env };
      const cliFlags: string[] = [];

      for (const [k, v] of Object.entries(effectiveArgs)) {
        env[k] = v;
        env[k.toUpperCase()] = v;
        if (k.startsWith("-")) {
          cliFlags.push(k, v);
        } else if (k.length === 1) {
          cliFlags.push(`-${k}`, v);
        } else {
          cliFlags.push(`--${k.toLowerCase().replace(UNDERSCORE_RE, "-")}`, v);
        }
      }

      const isSh = scriptPath.endsWith(".sh");
      const cmd = isSh ? "bash" : scriptPath;
      const cmdArgs = isSh ? [scriptPath, ...cliFlags] : cliFlags;

      return new Promise<ToolResult>((resolve) => {
        execFile(
          cmd,
          cmdArgs,
          { env: env as Record<string, string>, cwd: repoRoot, signal, timeout: 60000 },
          (error, stdoutBuf, stderrBuf) => {
            const stdout = String(stdoutBuf ?? "");
            const stderr = String(stderrBuf ?? "");
            let exitCode = 0;
            if (error) {
              if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "number") {
                exitCode = error.code;
              } else {
                exitCode = 1;
              }
            }

            const outputLines: string[] = [];
            if (stdout) outputLines.push(stdout);
            if (stderr) outputLines.push(`Stderr:\n${stderr}`);
            if (error && !stdout && !stderr) outputLines.push(`Execution error: ${error.message}`);
            const text = outputLines.join("\n\n") || `Routine completed with exit code ${exitCode}`;

            resolve({
              content: [{ type: "text", text }],
              details: {
                routineId: params.routineId,
                name: routineName ?? params.routineId,
                file: scriptFile,
                scriptPath,
                exitCode,
                stdout,
                stderr,
                args: effectiveArgs,
                success: exitCode === 0,
                ...(error ? { error: error.message } : {}),
              },
            });
          },
        );
      });
    },
    renderResult: renderRoutineResult,
  });
}
