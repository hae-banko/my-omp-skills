# State machines — my-omp-skills

Every explicit and implicit state machine in the extension: what state it holds, where that state lives, the invariants the code relies on, and the transitions that move it. The last section lists invalid states and transitions the code can actually reach — through retries, overlapping events, and concurrent sessions — with their evidence and fix status.

Keep this file current: a change that adds, removes, or re-keys a state variable, event handler, or on-disk lifecycle field updates the matching machine here in the same commit.

## 0. Runtime model (the environment every machine runs in)

Facts below are source-verified against the reference `oh-my-pi` checkout (`.omp/references/oh-my-pi`, `@oh-my-pi/pi-coding-agent` 18.0.4) plus one bun 1.3.14 module-identity experiment. The installed `omp` is a newer bundled binary; re-check these if the runtime changes.

| # | Fact | Consequence for state here | Evidence |
|---|---|---|---|
| R1 | Each load imports `src/index.ts` with a unique `?mtime=` query and calls the factory again. Task subagents load the extension again in the same process. | `src/index.ts` module state and every `install*()` closure is **per binding** (main session, each subagent). | `extensibility/plugins/legacy-pi-compat.ts:2794-2817`, `sdk.ts:2040-2088`, `task/executor.ts:3117-3126` |
| R2 | Only the entry module is re-evaluated; its transitive imports resolve to plain paths and stay cached. | Module-level `let`/`Map` state in any non-entry module (`core/bootstrap.ts`, `features/*.ts`, `knowledge/*.ts`, …) is **shared by the main session and every in-process subagent**. | bun experiment: entry `?mtime=1`/`?mtime=2` → child counter `1`, then `2` |
| R3 | `/new`, resume, reload, fork, branch, and tree navigation do **not** re-run the factory and do **not** emit `session_start`; they emit `session_switch` / `session_branch` / `session_tree`. | Closure and module state survive every in-process session change. Anything “reset per session” on `session_start` is only reset at process start and at subagent start. | `agent-session.ts:6937-7037,7979-8122,8334-8402` |
| R4 | A subagent emits its own `session_start` (its binding), and never `session_stop`. | A subagent's `session_start` handler runs against the module state the main session is using (R2). | `task/executor.ts:3323-3335`, `agent-session.ts:3564-3570` |
| R5 | Handlers for one event run sequentially and are awaited; a thrown error is logged and dispatch continues. `tool_call` errors/timeouts fail closed (block). | A `tool_call` observer registered before the policy guard sees calls the guard later blocks. | `extensions/runner.ts:1257-1546` |
| R6 | `context` results are per-request and ephemeral: the transformed array feeds one provider request and is never written to the transcript. | Content injected in `context` is absent from every later request unless injected again. | `sdk.ts:3257-3260`, `agent/src/agent-loop.ts:1535-1540` |
| R7 | `agent_end` is fire-and-forget on normal settle (`void …`), payload `{ messages, willContinue? }`. `session_stop` fires only for main sessions; returning `{ continue: true, additionalContext }` queues one hidden continuation turn (cap 8) and sets `stop_hook_active`. | `agent_end` is not a reliable “before the next turn” barrier. | `agent-session.ts:2878-2887,3551-3607` |
| R8 | Slash-command handlers run immediately, even while the agent streams; there is no command mutex. A focused overlay/dialog takes editor focus. `ctx.ui.custom` `done()` is idempotent. | Command handlers can overlap with turns and with each other. | `agent-session.ts:5489-5522`, `tui/src/components/editor.ts:2381-2401`, `extension-ui-controller.ts:1061-1139` |
| R9 | `ctx.ui.setStatus` entries persist across `/new`/resume until cleared. | Status text from a previous session stays on screen. | `status-line/component.ts:384,693-699` |
| R10 | The same extension tool can execute concurrently for parallel tool calls in one assistant message; all `tool_call` events for that message are dispatched first, in order. | Tool `execute()` bodies that read-modify-write shared files or state interleave. | `agent/src/agent-loop.ts:2150-2248,2719-2759` |

## 1. Machine index

Kinds: **explicit** = a named state field or enum drives behavior; **implicit** = state is spread across flags, caches, files, or event ordering. Scopes follow §0: *per-binding* (closure, re-created per session binding), *process-shared* (non-entry module state, shared by the main session and in-process subagents), *on-disk*, *per-call*.

| Machine | Kind | Section | Scope |
|---|---|---|---|
| WorkspaceContextResolver | implicit | §2 | process-shared module (`workspaceCache`) |
| BacklogTriageClassifier | implicit | §2 | per-call |
| AuditCardStatus | implicit | §2 | per-call |
| FrontierTicketWalker | implicit | §2 | per-call |
| ReferenceCorpus | implicit | §2 | on-disk (`.omp/references/<name>/`), one machine per directory name |
| RoutinesExecution | implicit | §2 | per-binding closure & process-shared cache |
| HerdrWaitOutputLoop | explicit | §2 | per-call |
| HerdrAgentSettlement | implicit | §2 | per-call |
| RecentCommandBypass | implicit | §2 | per-call |
| IAPPerformativeDAG | explicit (Reachability Analysis) | §2 | `src/protocol/iap.ts:224-275`, `src/protocol/iap-hub.ts:27-51` |
| Policy Guard (`policy.ts`) | implicit | §3 | process-shared module + on-disk |
| Ingest Counter & Status Widget (`kb-ingest-status.ts`) | implicit | §3 | per-binding closure + process-shared per-session map `sessionIngestStates` |
| Guardrail Block Counter & Detail Ring (`kb-guard-status.ts`) | implicit | §3 | per-binding closure + process-shared per-session map `sessionGuardStates` |
| System Prompt Knowledge Index Injector (`kb-index-injector.ts`) | implicit | §3 | per-call (`before_agent_start` chain); no retained state |
| Knowledge Root Cache (`knowledge.ts`) | implicit | §3 | process-shared module `Map<string, string \| null>` |
| Audit Report Lifecycle (`commands/audit/`, `policy.ts`) | explicit | §3 | on-disk + policy guard |
| Knowledge Base Query Engine (`knowledge.ts`) | implicit | §3 | per-call read-only query engine |
| Knowledge Relevance Retrieval Engine (`knowledge.ts`) | implicit | §3 | per-call search engine |
| Research Project On-Disk Lifecycle | implicit | §4 | on-disk filesystem state & front-matter metadata |
| Research Project Locators & Deletion | implicit | §4 | process-shared filesystem resolution |
| Research DAG Node State | explicit/implicit | §4 | per-call DAG data structure |
| YAML Outline & Fields Mini-Parsers | implicit | §4 | per-call parser functions |
| Interactive Research Dashboard Overlay Component (Reducer) | explicit | §4 | per-instance custom overlay component |
| Research Card Freshness Derivation | explicit | §4 | per-call freshness derivation |
| Research Status-Line Pin | explicit | §4 | session/UI status line (`ctx.ui.setStatus`) |
| Council Deliberation Lifecycle | implicit | §5 | per-binding closure (main session & subagents) |
| Council Configuration & YAML Parser | explicit | §5 | per-call parser reading on-disk `.omp/council.yaml` |
| CLI Argument & Subcommand Parser | implicit | §5 | per-call argument tokenizer |
| Interactive Verdict Overlay Reducer | explicit | §5 | per-modal instance state |
| Star Chamber Semantic Consensus Partitioner | implicit | §5 | per-call analytical helper (test-only helper at runtime; LLM acts as chairman in workflow stage 3) |
| Decision Record Persistence & Frontmatter Parser | implicit | §5 | on-disk `.omp/scratch/debates/` markdown records |
| Bootstrap Injection Machine | implicit | §6 | per-request provider context (`context` event, R6) |
| Hindsight Reflection Loop Machine | implicit | §6 | process-shared module + per-session state |
| Clarify Prompt Interception Machine | implicit | §6 | process-shared module + per-prompt token matching |
| System Prompt Contributor Chain (`before_agent_start`) | implicit | §6 | per-turn, runtime-owned |
| Tilt DEFCON Swear Jar Machine | implicit & persisted | §6 | repository root on disk (`<root>/.omp/tilt.json`), global disk (`~/.omp/tilt.json`), and in-memory session strikes |
| Timeline History Aggregator | stateless | §6 | per-call execution |

## 2. Core dispatch, workspace roots & tools

### WorkspaceContextResolver — implicit
**Where:** `src/core/workspace.ts:44-75, 171-174`; scope = process-shared module (`workspaceCache`)
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `Uncached` | `!workspaceCache.has(startDir)` | Working directory root has not been cached |
| `RepoCached` | `workspaceCache.has(startDir) && ctx.isRepo === true` | Valid git or .omp repository root cached |
| `FallbackUncached` | `ctx.isRepo === false` | Non-repo directory; evaluated on-demand and NEVER cached |

**Invariants:**
- `I1`: Fallback non-repo results are never cached in `workspaceCache` (`src/core/workspace.ts:171-173`).
- `I2`: Strong markers (`.git`, `.omp`) anywhere up the directory hierarchy take strict precedence over weak markers (`.scratch`, `scripts/routines`) nested below (`src/core/workspace.ts:46-66`), with `~/.omp` (omp global user config directory at `os.homedir()`) excluded so non-git projects under `$HOME` resolve to their project root.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `Uncached` | `getWorkspaceContext(dir)` | `.git` or `.omp` found up tree | `RepoCached` | Caches `WorkspaceContext` with `isRepo: true` in `workspaceCache` | `src/core/workspace.ts:48-51, 171-173` |
| `Uncached` | `getWorkspaceContext(dir)` | only `.scratch` / `scripts/routines` found, no `.git` | `FallbackUncached` | Returns `isRepo: false` without saving to `workspaceCache` | `src/core/workspace.ts:58-66, 171-173` |
| `FallbackUncached` | `getWorkspaceContext(dir)` | `.git` created mid-session | `RepoCached` | Discovers newly initialized `.git`, returns `isRepo: true`, caches in `workspaceCache` | `src/core/workspace.ts:48-51, 171-173` |
| `RepoCached` | `getWorkspaceContext(dir)` | Cache hit | `RepoCached` | Returns cached context | `src/core/workspace.ts:70-71` |


### BacklogTriageClassifier — implicit
**Where:** `src/index.ts:211-270`; scope = per-call
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `Scanning` | Traversing scratch directories | Collecting files from `**/issues/*.md` |
| `Classifying` | Iterating collected files | Matching status labels |
| `Result` | `TriageStatusPayload` constructed | Emitted to telemetry card / caller |

**Invariants:**
- `I1`: Only markdown files located under an `issues/` directory (`basename(dir) === "issues"`) are considered tickets (`src/index.ts:227-231`). Specs and debates are excluded.
- `I2`: Both `ready-for-agent` (canonical) and `agent-ready` are recognized as `agent_ready` tickets (`src/index.ts:251-256`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `Scanning` | File entry encountered | `basename(dir) === "issues" && name.endsWith(".md")` | `Classifying` | Adds path to candidate issue files | `src/index.ts:227-231` |
| `Scanning` | File entry encountered | `basename(dir) !== "issues"` (e.g. `spec.md`, `debates/*.md`) | `Scanning` | Skips file | `src/index.ts:227-231` |
| `Classifying` | Ticket content parsed | contains `ready-for-agent` or `agent-ready` | `Classifying` | Increments `agentReady` count | `src/index.ts:251-256` |
| `Classifying` | Ticket content parsed | contains `needs-triage` | `Classifying` | Increments `needsTriage` count | `src/index.ts:249-250` |
| `Classifying` | Ticket content parsed | neither matches | `Classifying` | Increments `unlabeled` count | `src/index.ts:258-260` |


### AuditCardStatus — implicit
**Where:** `src/index.ts` (`getAuditCardPayload`, `/audit` handler); scope = per-call, read-only over `.omp/audits/`
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `Unparsed` | report (`overview.md`, legacy `report.md`, or `<slug>.md`) read into string | Raw frontmatter present |
| `StatusExtracted` | Status captured and cleaned | Stripped of inline YAML `#` comments |
| `NotFound` | explicit slug matches no entry | `not_found: true`; handler notifies instead of rendering |

**Invariants:**
- `I1`: Captured status never retains a trailing `#` comment or whitespace.
- `I2`: `/audit list` renders one card per report under `.omp/audits/`, newest report first; `status`/`view`/`--recent` render one card (named slug, else the newest by name). All are zero-turn.

**Transitions:**
| From | Trigger | Guard | To | Effect |
|---|---|---|---|---|
| `Unparsed` | frontmatter status match | `statusMatch[1]` exists | `StatusExtracted` | `/#.*$/` removed, trimmed; empty → `active` |
| — | `/audit list` | ≥ 1 report | one `StatusExtracted` per slug | one `audit-card` per report, sorted by report mtime desc |
| — | `/audit list` | no reports | — | notice: `/audit <topic>` creates one |
| — | `/audit status\|view <slug>` | slug unknown | `NotFound` | warning notice, no card |

### FrontierTicketWalker — implicit
**Where:** `src/core/locators.ts:369-498`; scope = per-call
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `Collecting` | Scanning `.omp/scratch/` and `.scratch/` | Parsing tickets with feature, status, and blockers |
| `Resolving` | Evaluating unblocked tickets | Checking ticket blockers against resolved tickets |
| `Found` | Unblocked ticket located | Returns `FrontierTicket` |
| `None` | All tickets resolved or blocked | Returns `null` |

**Invariants:**
- `I1`: Dependency slug resolution is strictly scoped to the same feature (`src/core/locators.ts:474-489`). A resolved ticket in feature A never satisfies a dependency in feature B.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `Collecting` | Tickets collected | `allTickets.length > 0` | `Resolving` | Builds `resolvedSlugsByFeature: Map<string, Set<string>>` | `src/core/locators.ts:474-484` |
| `Resolving` | Evaluating ticket `t` | `!t.isResolved && t.blockedBy.every(dep => resolvedForFeature.has(dep))` | `Found` | Returns `FrontierTicket` | `src/core/locators.ts:488-497` |
| `Resolving` | All tickets evaluated | no unblocked ticket found | `None` | Returns `null` | `src/core/locators.ts:499` |


### ReferenceCorpus — implicit
**Where:** `src/features/references.ts` (`addReference`, `updateReference`, `removeReference`, `listCorpus`), `src/core/locators.ts` (`listReferences`, `listUnmanagedReferences`); scope = on-disk (`.omp/references/<name>/`), one machine per directory name
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `NonExistent` | `!existsSync(target)` | Directory does not exist |
| `Installed(origin)` | `existsSync(join(target, ".git"))`; `origin` = `git remote get-url origin` | Valid git reference repo cloned from `origin` |
| `UnmanagedLeftover` | `existsSync(target) && !existsSync(join(target, ".git"))` | Leftover non-git directory |

**Invariants:**
- `I1`: A failed clone removes its partial target directory.
- `I2`: Unmanaged directories are listed by `/reference list` and removable with `/reference remove <name>`.
- `I3`: Every refusal names a command that works for that state: `update` only for the same repository, `remove` for leftovers, `add <url> <other-name>` for a different repository under the same name.
- `I4`: `<name>` (derived or explicit) is one safe path segment — never `..`, `/`, or a leading `.` (`safeReferenceTarget`).

**Transitions:**
| From | Trigger | Guard | To | Effect |
|---|---|---|---|---|
| `NonExistent` | `/reference add <url> [name]` | clone succeeds | `Installed(url)` | clones into `.omp/references/<name>` |
| `NonExistent` | `/reference add <url> [name]` | clone fails | `NonExistent` | `rmSync` partial target, error |
| any | `/reference add <url> <name>` | `name` unsafe | unchanged | rejected, nothing written |
| `Installed(o)` | `/reference add <url> [name]` | `normalizeRepoUrl(o) === normalizeRepoUrl(url)` | `Installed(o)` | "already exists — use /reference update <name>" |
| `Installed(o)` | `/reference add <url> [name]` | origins differ | `Installed(o)` | "already exists (origin: o) — use /reference add <url> <other-name>" |
| `UnmanagedLeftover` | `/reference add <url> [name]` | — | `UnmanagedLeftover` | advises `/reference remove <name>` |
| `Installed(o)` | `/reference update <name>` | — | `Installed(o)` | `git pull`, reports HEAD before → after |
| `Installed` \| `UnmanagedLeftover` | `/reference remove <name>` | target exists | `NonExistent` | `rmSync` |

### RoutinesExecution — implicit
**Where:** `src/features/routines.ts:209-243, 301-331, 420-464`; scope = per-binding closure & process-shared cache
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `ManifestLoaded` | `manifest.json` parsed successfully | Script parameters and defaults loaded |
| `ManifestCorrupted` | `manifest.json` exists but JSON parse throws | Fails run immediately; does not execute with empty defaults |
| `Executing` | Process running via `execFile` | Child process running |
| `ExitedSuccess` | Exited 0 | Success |
| `ExitedFailure` | Exited non-zero or error | Tool content always includes failure/error text even with stdout |

**Invariants:**
- `I1`: If `manifest.json` is corrupted, execution halts with an error ToolResult rather than silently proceeding (`src/features/routines.ts:316-330`).
- `I2`: When execution fails or errors, `content[0].text` includes error/failure message regardless of whether stdout is non-empty (`src/features/routines.ts:457-461`).
- `I3`: Kebab-case parameter names are bound to bash-compatible environment variables with uppercase underscores (`src/features/routines.ts:422`).
- `I4`: `repoRootCache` only serves cached roots that contain `scripts/routines/manifest.json`, allowing newly created manifests to be discovered (`src/features/routines.ts:210-213`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `Uncached` | `findRoutinesRepoRoot` | Manifest created in subproject | `Cached` | Updates `repoRootCache` with subproject dir | `src/features/routines.ts:210-218` |
| `Executing` | Script produces stdout and exits >0 | `exitCode !== 0` | `ExitedFailure` | `content[0].text` includes stdout, stderr, and failure status | `src/features/routines.ts:455-462` |
| `ParsingManifest` | `JSON.parse` fails | `manifest.json` exists | `ManifestCorrupted` | Returns error ToolResult immediately | `src/features/routines.ts:316-330` |


### HerdrWaitOutputLoop — explicit
**Where:** `src/features/herdr-tools.ts:285-321`; scope = per-call
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `Validating` | Checking match pattern | Rejects empty match |
| `Polling` | Loop reading pane text | Polling pane output every 1000ms |
| `Matched` | `lastText.includes(match)` | Exact literal match detected |
| `TimedOut` | `Date.now() >= deadline` | Match not detected within timeout |

**Invariants:**
- `I1`: Empty match string is rejected immediately (`src/features/herdr-tools.ts:287-292`).
- `I2`: Matches are literal string checks (`lastText.includes(match)`), preventing accidental regex metacharacter misinterpretation (`src/features/herdr-tools.ts:310`).


### HerdrAgentSettlement — implicit
**Where:** `src/features/herdr-tools.ts:421-469`; scope = per-call
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `PromptSubmitted` | Running `herdr agent prompt <target> <text> --wait --until idle --until done --until blocked --timeout <ms>` | Awaiting herdr settlement |
| `Settled` | Subprocess exits successfully | Agent observed settled after submission |
| `TimedOut` | Subprocess returns timeout or prompt stalled | Reports timeout explicitly |

**Invariants:**
- `I1`: `prompt` uses herdr's atomic submission and post-submission wait (`--wait --until idle --until done --until blocked --timeout <ms>`) (`src/features/herdr-tools.ts:423-440`).
- `I2`: `wait` passes `--until` (never `--status`) (`src/features/herdr-tools.ts:454`).
- `I3`: `send` maps to `agent prompt <target> <text>` (herdr 0.8.2 non-waiting submit primitive; the old 0.7 `agent send` was the submit half of prompt) (`src/features/herdr-tools.ts:468`).
- `I4`: Timeout is reported as timeout, not false settlement (`src/features/herdr-tools.ts:442-446`).


### RecentCommandBypass — implicit
**Where:** `src/features/recent-command.ts:40-46`; scope = per-call
**Invariants:**
- `I1`: `parseRecentCount` clamps non-positive or invalid counts to `DEFAULT_LIMIT` (`src/features/recent-command.ts:44`).


### IAPPerformativeDAG — explicit (Reachability Analysis)
**Where:** `src/protocol/iap.ts:224-275`, `src/protocol/iap-hub.ts:27-51`
- **Reachability at Runtime:** UNREACHABLE.
- **Evidence:** `resolveEnvelopePayload`, `serializeEnvelopeForHub`, and `extractEnvelopesFromHubInbox` are defined in `src/protocol/` but never imported or invoked by any slash command, event handler, tool execution, or runtime DAG loop. Only test files (`tests/protocol.test.ts`) reference them. The active research DAG engine in `src/research/research-dag.ts` only consumes synthetic envelopes from completed file artifacts via `synthesizeCompletedEnvelope`.
- Per assignment contract: recorded as unreachable rather than speculating refactors.

## 3. Knowledge base, append-only guard & telemetry

### Policy Guard (`policy.ts`) — implicit
**Where:** `src/knowledge/policy.ts:28-440`; scope = process-shared module + on-disk
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `UNPROTECTED` | Path outside `.omp`, `.omp/knowledge`, and `.omp/audits`, or research working files (`outline.yaml`, `fields.yaml`) | Free read, write, edit, and bash operations permitted without guard restrictions |
| `KB_ABSENT` | Path under `.omp/knowledge/{records,pitfalls,INDEX.md}` does not exist on disk | Initial creation allowed via single `write` tool call |
| `KB_PROTECTED` | Path under `.omp/knowledge/{records,pitfalls,INDEX.md}`, or `.omp/knowledge`, or `.omp` | Append-only invariant active: `edit` blocked, `write` overwrite blocked, destructive `bash` (`rm`, `mv`, `cp`, `sed -i`, `truncate`, `1>`, `N>`) blocked; shell append `>>` and `2>&1` allowed |
| `AUDIT_ACTIVE` | Root report (`overview.md` / `report.md`) or subtopic file under `.omp/audits/<slug>/` | Controlled revision allowed only if SemVer is strictly increasing (`newVersion > oldVersion`), `## Revision History` exists, and the status is one of `active \| superseded \| archived` (YAML comment stripped); or for subtopic files without own version, parent root report was revised at/after subtopic and has `## Revision History` |
| `AUDIT_SNAPSHOT` | File under `.omp/audits/<slug>/archive/*.md` | Historical audit snapshot: immutable, edits and overwrites blocked unconditionally |

**Invariants:**
- I1: Records, pitfalls, and `INDEX.md` are append-only; existing files cannot be overwritten or modified in place (`policy.ts:409-425`).
- I2: Ancestors and protected directories (`.omp`, `.omp/knowledge`, `.omp/audits`) cannot be deleted, moved, or overwritten (`policy.ts:52-64,97-231`).
- I3: Audit reports can only be updated with strictly increasing SemVer, a documented status value, and an entry in `## Revision History` (`policy.ts:298-404`).
- I4: Subtopic audit files without own version are revisable after parent root report has been revised (`policy.ts:352-384`).
- I5: Historical audit snapshots under `archive/` are immutable once written (`policy.ts:290-293`).
- I6: Every blocked tool call records a block keyed by session id (`policy.ts:418,422,437,441,451`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `KB_ABSENT` | `tool_call` ("write") | `!existsSync(resolve(cwd, path))` | `KB_PROTECTED` | File written to disk, eligible for ingest | `policy.ts:409-414` |
| `KB_PROTECTED` | `tool_call` ("write") | `existsSync(resolve(cwd, path))` | `KB_PROTECTED` | Blocked with `KB_REASON`, calls `recordBlock("write", path, "knowledge", sessId)` | `policy.ts:421-424` |
| `KB_PROTECTED` | `tool_call` ("edit") | `isProtectedPath(cwd, path)` | `KB_PROTECTED` | Blocked with `KB_REASON`, calls `recordBlock("edit", path, "knowledge", sessId)` | `policy.ts:402-405` |
| `KB_PROTECTED` | `tool_call` ("bash") | `isDestructiveBashAgainstProtected` returns `blocked: true` | `KB_PROTECTED` | Blocked with `KB_REASON`/`AUDIT_REASON`, calls `recordBlock("bash", target, reason, sessId)` | `policy.ts:448-457` |
| `AUDIT_ACTIVE` | `tool_call` ("write" \| "edit") | `isControlledAuditUpdate` returns `true` | `AUDIT_ACTIVE` | Controlled revision allowed through to execution | `policy.ts:400,419` |
| `AUDIT_ACTIVE` | `tool_call` ("write" \| "edit") | `isControlledAuditUpdate` returns `false` | `AUDIT_ACTIVE` | Blocked with `AUDIT_REASON`, calls `recordBlock(tool, path, "audit", sessId)` | `policy.ts:401,420` |
| `AUDIT_SNAPSHOT` | `tool_call` ("write" \| "edit") | `path.includes("/archive/") && existsSync` | `AUDIT_SNAPSHOT` | Blocked with `AUDIT_REASON`, snapshot immutable | `policy.ts:290-293` |


### Ingest Counter & Status Widget (`kb-ingest-status.ts`) — implicit
**Where:** `src/knowledge/kb-ingest-status.ts` (`sessionIngestStates`, `installKbIngestStatus`); scope = per-binding closure + process-shared per-session map `sessionIngestStates`
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `UNINITIALIZED` | Session unmapped or `recordCount === 0`, `pitfallCount === 0` | Initial state prior to session events |
| `SESSION_ACTIVE_QUIET` | UI session active; status bar text `"KB: 0 records · 0 pitfalls"` | Session active with 0 verified ingests |
| `SESSION_ACTIVE_INGESTED` | `recordCount > 0 \|\| pitfallCount > 0` | One or more new files successfully created on disk; status bar reflects count |

**Invariants:**
- I1: Counters increment only on verified post-execution tool results where target exists on disk and has not been counted previously this session (`kb-ingest-status.ts:67-83,222-237`).
- I2: Counters are keyed per session ID; subagent sessions with `hasUI: false` cannot reset main session counts (`kb-ingest-status.ts:178-193`).
- I3: Session switch (`session_switch`, `session_branch`, `session_tree`) switches active session state and reflects fresh counts (`kb-ingest-status.ts:195-215`).
- I4: Footer status bar text is rendered via `ctx.ui.setStatus` whenever available and resolves knowledge root from subdirectories (`kb-ingest-status.ts:114-126,173-177`).
- I5: The map holds only live sessions: `session_shutdown` (emitted by every disposed session, including each finished task subagent) deletes that session's entry, and the read accessors (`getRecordCount`/`getPitfallCount`, also used by the index injector) never create entries.
- I6: A successful `write` to an *existing* record cannot be counted: the policy guard blocks overwrites in `tool_call`, the runtime throws before `execute` (`agent/…/extensions/wrapper.ts:222-225`), so no successful `tool_result` follows.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `UNINITIALIZED` \| `SESSION_ACTIVE_*` | `session_start` | `!isSubagent` | `SESSION_ACTIVE_QUIET` | Sets `currentSessionId`, resets session counts, syncs UI, refreshes status | `kb-ingest-status.ts:178-193` |
| `SESSION_ACTIVE_*` | `session_switch` \| `session_branch` \| `session_tree` | `hasUI !== false` | `SESSION_ACTIVE_QUIET` | Switches `currentSessionId`, initializes fresh session state, refreshes status | `kb-ingest-status.ts:195-215` |
| `SESSION_ACTIVE_*` | `tool_result` ("write") | `!event.isError && existsSync(target) && !state.ingestedPaths.has(target)` | `SESSION_ACTIVE_INGESTED` | Adds `target` to `ingestedPaths`, increments record/pitfall count, refreshes status | `kb-ingest-status.ts:67-83,222-237` |
| `SESSION_ACTIVE_*` | `agent_end` | None | `SESSION_ACTIVE_*` | Pushes latest status bar text to UI | `kb-ingest-status.ts:217-220` |
| any | `session_shutdown` | `sessionIdOf(ctx)` defined | *(entry removed)* | Deletes that session's counters and `ingestedPaths` | `installKbIngestStatus` |


### Guardrail Block Counter & Detail Ring (`kb-guard-status.ts`) — implicit
**Where:** `src/knowledge/kb-guard-status.ts` (`sessionGuardStates`, `installKbGuardStatus`); scope = per-binding closure + process-shared per-session map `sessionGuardStates`
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `UNINITIALIZED` | Session unmapped or `blockCount === 0`, `blockDetails = []` | Initial state prior to first session start |
| `GUARD_QUIET` | Session active, 0 blocks | Status text `"KB append-only · 0 blocks"` |
| `GUARD_BLOCKED` | `blockCount > 0` | Policy violation intercepted this session; status text `"KB append-only · N block(s)"` |

**Invariants:**
- I1: `blockCount` increments for policy blocks keyed by session ID (`kb-guard-status.ts:77-90`).
- I2: `blockDetails` retains a bounded FIFO ring of the last 8 block events (`kb-guard-status.ts:86-88`).
- I3: Counters are isolated per session ID; subagent sessions cannot zero main session state (`kb-guard-status.ts:151-168`).
- I4: Status text renders for subdirectories and audit-only workspaces (`kb-guard-status.ts:120-133`).
- I5: The map holds only live sessions: `session_shutdown` deletes the disposed session's entry; `getBlockCount`/`getBlockDetails` never create entries.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `UNINITIALIZED` \| `GUARD_*` | `session_start` | `!isSubagent` | `GUARD_QUIET` | Caches cwd, resets session counts, syncs UI, refreshes status | `kb-guard-status.ts:151-168` |
| `GUARD_*` | `session_switch` \| `session_branch` \| `session_tree` | `hasUI !== false` | `GUARD_QUIET` | Switches `currentSessionId`, initializes fresh session state, refreshes status | `kb-guard-status.ts:170-186` |
| `GUARD_*` | `recordBlock(tool, path, reason, sessId)` | None | `GUARD_BLOCKED` | Increments session `blockCount`, pushes detail, refreshes status | `kb-guard-status.ts:77-90` |
| `GUARD_*` | `agent_end` | None | `GUARD_*` | Pushes latest status bar text to UI | `kb-guard-status.ts:187-190` |
| any | `session_shutdown` | `sessionIdOf(ctx)` defined | *(entry removed)* | Deletes that session's block counter and detail ring | `installKbGuardStatus` |


### System Prompt Knowledge Index Injector (`kb-index-injector.ts`) — implicit
**Where:** `src/knowledge/kb-index-injector.ts:89-103`; scope = per-call (`before_agent_start` chain); no retained state
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `EMPTY_STORE` | `formatIndexSection(cwd) === ""` | No records/pitfalls under the knowledge root; prompt untouched |
| `UNINJECTED` | no block of `event.systemPrompt` contains `SECTION_MARKER` | Index not yet in this turn's prompt |
| `INJECTED` | a block contains `SECTION_MARKER` | Index present (this handler, or a duplicate install earlier in the chain) |

**Invariants:**
- I1: `systemPrompt` is the runtime's `string[]`; existing blocks are never rewritten — the section is one new tail block (`kb-index-injector.ts:101`, AGENTS.md §8).
- I2: At most one index block per turn (`kb-index-injector.ts:97`). Turns never inherit the previous turn's section: the runtime rebuilds the base prompt every turn (`agent-session.ts:5832`).
- I3: Entries capped at 5 per kind, newest mtime first (`formatIndexSection`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `UNINJECTED` | `before_agent_start` | store non-empty | `INJECTED` | returns `{ systemPrompt: [...blocks, section] }` | `kb-index-injector.ts:94-101` |
| `INJECTED` | `before_agent_start` | marker already present | `INJECTED` | returns `undefined` | `kb-index-injector.ts:97` |
| any | `before_agent_start` | payload not `string[]` | unchanged | returns `undefined` (malformed event) | `api.ts` `asBeforeAgentStartEvent` |

### Knowledge Root Cache (`knowledge.ts`) — implicit
**Where:** `src/knowledge/knowledge.ts:196-222`; scope = process-shared module `Map<string, string | null>`
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `UNCACHED` | `!knowledgeRootCache.has(startDir)` | Directory has not yet been resolved |
| `CACHED` | `knowledgeRootCache.get(startDir) === rootDir` | Directory mapped to cached knowledge root |

**Invariants:**
- I1: `findKnowledgeRoot` walks up ancestor tree to locate nearest directory containing `.omp/knowledge` or `.omp/audits` (`knowledge.ts:197-217`).
- I2: Cache can be invalidated via `clearKnowledgeRootCache()` (`knowledge.ts:220-222`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `UNCACHED` | `findKnowledgeRoot(startDir)` | Ancestor contains `.omp/knowledge` or `.omp/audits` | `CACHED` | Records `dir` in `knowledgeRootCache`, returns `dir` | `knowledge.ts:208-210` |
| `CACHED` | `clearKnowledgeRootCache()` | None | `UNCACHED` | Clears all entries from `knowledgeRootCache` | `knowledge.ts:220-222` |


### Audit Report Lifecycle (`commands/audit/`, `policy.ts`) — explicit
**Where:** `commands/audit/AUDIT-FORMAT.md`, `commands/audit/command.md`, `src/knowledge/policy.ts:277-405`; scope = on-disk + policy guard
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `ACTIVE` | Frontmatter `status: active`, SemVer `vX.Y.Z` | Living primary audit report |
| `SUPERSEDED` | Frontmatter `status: superseded` | Deprecated audit replaced by newer direction |
| `ARCHIVED` | Frontmatter `status: archived` | Decommissioned audit report |
| `SNAPSHOT` | File under `.omp/audits/<slug>/archive/*.md` | Frozen historical point-in-time snapshot |

**Invariants:**
- I1: Revisions require strictly increasing SemVer (`policy.ts:389-392`).
- I2: `status` is one of `active | superseded | archived`; any transition between them is allowed with a version bump (the format documents no transition order) (`policy.ts` `readStatus`).
- I3: Snapshots in `archive/` are immutable (`policy.ts:290-293`).
- I4: Subtopic files without own version are revisable after root report revision (`policy.ts:352-384`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| Absent | Write Initial Report | Initial `write` tool call | `ACTIVE` | Writes report with `version: "v0.1.0"` | `commands/audit/command.md:58-62` |
| `ACTIVE` | Controlled Revision | `isControlledAuditUpdate` passes | `ACTIVE` | Updates report with strictly bumped version and revision history | `policy.ts:298-404` |
| `ACTIVE` | Snapshot Archive | Read active, write `archive/vX.Y.Z.md` | `SNAPSHOT` | Creates immutable snapshot in `archive/` | `commands/audit/command.md:31-32` |
| `ACTIVE` | Supersede / Archive | Version bump + status update | `SUPERSEDED` \| `ARCHIVED` | Frontmatter `status` updated | `policy.ts:336-342` |


### Knowledge Base Query Engine (`knowledge.ts`) — implicit
**Where:** `src/knowledge/knowledge.ts:274-935`; scope = per-call read-only query engine
**Invariants:**
- I1: Read-only calls never mutate or create `.omp/knowledge` directories on disk (`knowledge.ts:275`).
- I2: Index queries (`type="index"`) return newest tail entries excluding markdown headers (`knowledge.ts:415-423`).


### Knowledge Relevance Retrieval Engine (`knowledge.ts`) — implicit
**Where:** `src/knowledge/knowledge.ts:38-182`; scope = per-call search engine
**Invariants:**
- I1: Research projects in `INDEX.md` retain distinct `refPath` values preventing duplicate deduplication suppression (`knowledge.ts:74-75`).
- I2: Classified kind includes `"research"` alongside `"pitfall"`, `"record"`, and `"index"` (`knowledge.ts:25,82-88`).

## 4. Research pipeline

### Research Project On-Disk Lifecycle — implicit
**Where:** `src/research/research-status.ts:9-87`, `src/research/research-store.ts:210-285, 599-609, 805-975`; scope = on-disk filesystem state & front-matter metadata
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `OUTLINE` | `research.md` `status: OUTLINE`, or derived (`hasReport: false`, `completedItems: 0`) | Phase 1: outline and fields defined; 0 item results |
| `RUNNING` | `research.md` `status: RUNNING`, or derived (`completedItems > 0` & `< totalItems`) | Phase 2: wave loop execution in flight |
| `PAUSED` | `research.md` `status: PAUSED` | Phase 2: wave loop paused by user; resumable |
| `CANCELLED` | `research.md` `status: CANCELLED` | Phase 2: wave loop aborted |
| `ERROR` | `research.md` `status: ERROR` | Phase 2: wave loop encountered recoverable error |
| `CONVERGED` | `research.md` `status: CONVERGED`, or derived (`completedItems >= totalItems`) | Phase 2: all items resolved or max waves reached |
| `REPORT_READY` | `research.md` `status: REPORT_READY`, or derived (`hasReport: true`) | Phase 3: report.md and summary.md synthesized |
| `STALE` | `freshness: "stale"` | Derived: RUNNING project with mtime > 2x interval |
| `ARCHIVED` | Directory under `.archive/<slug>/`, front-matter `status: ARCHIVED` | Project moved out of active directory |
| `DELETED` | Directory removed from disk | Project permanently removed via `removeResearchProject` |

**Invariants:**
- I1: `derivePipelineStatus` maps `hasReport: true` to `REPORT_READY` regardless of explicit front-matter status. (`src/research/research-status.ts:58`)
- I2: Restoring an archived project via `unarchiveResearchProject` restores the lifecycle status supported by its files (report -> `REPORT_READY`, all items completed -> `CONVERGED`, partial items -> prior `PAUSED` or `RUNNING`, 0 items -> `OUTLINE`), preserving phase alignment. (`src/research/research-store.ts:909-932`)
- I3: Phase number strictly follows status (`OUTLINE` -> 1, `REPORT_READY` -> 3, all active Phase 2 statuses -> 2). (`src/research/research-status.ts:67-76`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `(none)` | `/research <topic>` | Directory absent | `OUTLINE` | Creates directory, writes outline.yaml, fields.yaml, research.md | `commands/research/command.md:165-248` |
| `OUTLINE` | `/research-deep` | Outline present | `RUNNING` | Starts background wave, sets front-matter status `RUNNING` | `commands/research-deep/command.md:37-75` |
| `RUNNING` | Interrupt signal | Partial results | `PAUSED` | Halts wave loop, sets status `PAUSED` | `commands/research-deep/command.md:95-99` |
| `PAUSED` | `/research-deep` | Prior results | `RUNNING` | Resumes wave loop | `commands/research-deep/command.md:29-34` |
| `RUNNING` | All items done | `completed >= total` | `CONVERGED` | Sets status `CONVERGED` | `commands/research-deep/command.md:74` |
| `CONVERGED` | `/research-report` | Results valid | `REPORT_READY` | Writes report.md, summary.md, sets status `REPORT_READY` | `src/research/research-report.ts:32-205` |
| Any active | `archiveResearchProject` | `slugArg.trim().length > 0` & exists | `ARCHIVED` | Moves to `.archive/<slug>`, preserves prior status | `src/research/research-store.ts:806-840` |
| `ARCHIVED` | `unarchiveResearchProject` | `slugArg.trim().length > 0` & archive exists | File-derived | Moves to active, derives status from artifacts | `src/research/research-store.ts:851-935` |
| Any | `removeResearchProject` | `slugArg.trim().length > 0` & exists | `DELETED` | Removes directory recursively | `src/research/research-store.ts:941-975` |


### Research Project Locators & Deletion — implicit
**Where:** `src/research/research-store.ts:210-214, 806-810, 851-855, 941-945`, `src/index.ts:438-442, 500-516, 540-585, 649-667`; scope = process-shared filesystem resolution
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `FOUND_ACTIVE` | `projectDir !== ""` & exists under `.omp/knowledge/research/` | Active project located by slug or prefix |
| `FOUND_ARCHIVED` | `projectDir !== ""` & exists under `.archive/` | Archived project located by slug |
| `NOT_FOUND` | `notFound: true` or `projectDir === ""` | Project slug not found on disk, or repository has 0 projects |

**Invariants:**
- I1: Destructive and archival operations (`removeResearchProject`, `archiveResearchProject`, `unarchiveResearchProject`) require a non-empty trimmed `slugArg` and reject empty/whitespace input with `{ ok: false, error: ... }`. (`src/research/research-store.ts:807, 852, 942`)
- I2: Locating an empty research directory via `readProject` or `resolveResearchProjectDir` yields `notFound: true`, never fabricating phantom `"unknown"` projects or proceeding to card dispatch. (`src/research/research-store.ts:212`, `src/index.ts:439, 501, 650`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `(any)` | `removeResearchProject` | `!slugArg.trim()` | `(same)` | Returns error, no filesystem deletion | `src/research/research-store.ts:942-944` |
| `(any)` | `archiveResearchProject` | `!slugArg.trim()` | `(same)` | Returns error, no directory move | `src/research/research-store.ts:807-809` |
| `(any)` | `unarchiveResearchProject` | `!slugArg.trim()` | `(same)` | Returns error, no directory move | `src/research/research-store.ts:852-854` |
| `(any)` | `readProject` | 0 projects on disk | `NOT_FOUND` | Returns `notFound: true`, displays not-found warning | `src/research/research-store.ts:212`, `src/index.ts:439` |


### Research DAG Node State — explicit/implicit
**Where:** `src/research/research-dag.ts:26-55, 89-141, 175-385`; scope = per-call DAG data structure
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `pending` | `node.status = "pending"` | Has uncompleted upstream dependencies or unresolved missing dependencies |
| `ready` | `node.status = "ready"` | Root node or all upstream dependencies completed; eligible for wave dispatch |
| `running` | `node.status = "running"` | Assigned to active search agent |
| `completed` | `node.status = "completed"` | Exact, parseable non-empty result JSON exists on disk |
| `blocked` | `node.status = "blocked"` | Suspended awaiting external prerequisite |
| `failed` | `node.status = "failed"` | Execution failure |

**Invariants:**
- I1: `findItemResultFile` matches only exact slugs (`fClean === idSlug || fClean === nameSlug`) or numbered prefixes (`^\d+_` + exact slug), rejecting loose substrings. (`src/research/research-dag.ts:125-128`)
- I2: Result files must be valid non-empty parseable JSON (`isValidResultJsonFile`); 0-byte or corrupted JSON is rejected and does not mark a node completed. (`src/research/research-dag.ts:89-100, 115, 118, 132`)
- I3: Dangling / missing dependencies are recorded in `missingDependencies` and do not participate in Kahn's algorithm in-degrees, preventing non-cyclic DAGs from setting `hasCycles: true` or suppressing epistemic hash computation. (`src/research/research-dag.ts:206-233, 275-305`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Initial | `buildResearchDag` | Exact valid JSON exists | `completed` | Marks node completed, assigns `resultFile` | `src/research/research-dag.ts:173, 181` |
| Initial | `buildResearchDag` | No result, 0 deps, 0 missing | `ready` | Eligible for wave 1 dispatch | `src/research/research-dag.ts:356-357` |
| Initial | `buildResearchDag` | Has missing or uncompleted deps | `pending` | Suspended until deps met | `src/research/research-dag.ts:358-364` |
| `pending` / `running` | `ingestIapEnvelope` | Envelope COMPLETED | `completed` | Unblocks child nodes whose deps are now met | `src/research/research-dag.ts:500-520` |


### YAML Outline & Fields Mini-Parsers — implicit
**Where:** `src/research/research-store.ts:303-439`; scope = per-call parser functions
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `SCANNING_HEADER` | `inItems = false` | Scanning file looking for `items:` |
| `IN_ITEMS` | `inItems = true`, `currentItem = null` | Inside items block, awaiting next item marker |
| `IN_ITEM_BODY` | `inItems = true`, `currentItem !== null` | Parsing attributes of current item |
| `IN_DEPENDS_LIST` | Inner loop in `depends_on:` | Parsing multi-line dependency list elements |

**Invariants:**
- I1: Multi-line `depends_on:` consumes lines only if line indentation is strictly greater than `currentItemIndent` and does not match item keys (`- id:`, `- name:`). (`src/research/research-store.ts:420-428`)
- I2: Item scanning exits `inItems` only on unindented column-0 non-dash keys (`!l.startsWith(" ") && !l.startsWith("\t") && !trimmed.startsWith("-")`). (`src/research/research-store.ts:326, 365`)
- I3: `readOutlineItems` uses `readOutlineItemSpecs` first to guarantee correct multi-line item extraction. (`src/research/research-store.ts:307-310`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SCANNING_HEADER` | Line `items:` | Column 0 or section | `IN_ITEMS` | `inItems = true` | `src/research/research-store.ts:322, 361` |
| `IN_ITEMS` | Line starts with `- ` | New item dash | `IN_ITEM_BODY` | Finalizes previous item, records `currentItemIndent` | `src/research/research-store.ts:381-384` |
| `IN_ITEM_BODY` | Line `depends_on:` | Multi-line list | `IN_DEPENDS_LIST` | Enters inner while loop | `src/research/research-store.ts:417-420` |
| `IN_DEPENDS_LIST` | Sibling `- id:` / indent `<= currentItemIndent` | Sibling item | `IN_ITEM_BODY` | Breaks inner loop, advances outer loop to sibling item | `src/research/research-store.ts:423-426` |
| `IN_ITEMS` | Column-0 non-dash key | `!indent && !dash` | `SCANNING_HEADER` | `inItems = false`, finalizes item | `src/research/research-store.ts:326, 365` |


### Interactive Research Dashboard Overlay Component (Reducer) — explicit
**Where:** `src/research/research-overlay.ts:82-105, 185-745`, `src/index.ts:466-498, 625-647`; scope = per-instance custom overlay component
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `OVERVIEW_TAB` | `activeTab = "overview"`, `showProjectPicker = false` | Overview dashboard with status and next step |
| `ITEMS_TAB` | `activeTab = "items"`, `showProjectPicker = false` | Outline items list |
| `FIELDS_TAB` | `activeTab = "fields"`, `showProjectPicker = false` | Field dimensions list |
| `ARTIFACTS_TAB` | `activeTab = "artifacts"`, `showProjectPicker = false` | Artifacts checklist |
| `PROJECT_PICKER` | `showProjectPicker = true` | Project picker modal open over dashboard |
| `DISMISSED` | Action `{ action: "dismiss" }` returned | Overlay closes without dispatching command |
| `ACTION_DISPATCHED` | Action `{ action: "run", command }` returned | Overlay closes, returns slash command to runner |

**Invariants:**
- I1: `runCommandForActive()` dispatches only slash commands starting with `"/"` (for Phase 3, returns `/research status <slug>`). (`src/research/research-overlay.ts:596, 693`)
- I2: Project switching via `cycleProject` or `setActiveSlug` resets scroll offsets across all tabs (`TABS`) to 0 and clears cache. (`src/research/research-overlay.ts:231-235, 705-709`)
- I3: Hotkeys `q` and `Ctrl+C` (`\x03`) dismiss the overlay immediately from any state, including when the project picker modal is open. (`src/research/research-overlay.ts:616-620, 638-642`)
- I4: Custom UI wrapper in `src/index.ts` returns string array from `renderLines` and forwards `handleInput` action value to host TUI. (`src/index.ts:630, 635`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Any | Key `q` or `\x03` | None (including picker) | `DISMISSED` | Returns `{ action: "dismiss" }`, triggers `done` | `src/research/research-overlay.ts:616, 638` |
| Any tab | Key `[` or `]` | `projects.length > 0` | Same tab (new proj) | Cycles project, resets all tab scroll offsets to 0 | `src/research/research-overlay.ts:648, 703-709` |
| Any tab | Key `p` | `projects.length > 0` | `PROJECT_PICKER` | Sets `showProjectPicker = true` | `src/research/research-overlay.ts:644` |
| `PROJECT_PICKER` | Key `p` or `\x1b` | None | Prior tab | Sets `showProjectPicker = false` | `src/research/research-overlay.ts:621-622` |
| Any tab | Key `\r` (Enter) | `projects.length > 0` | `ACTION_DISPATCHED` | Dispatches valid `/...` slash command | `src/research/research-overlay.ts:691-697` |


### Research Card Freshness Derivation — explicit
**Where:** `src/research/research-freshness.ts:9-44`, `src/research/research-store.ts:630-655`; scope = per-call freshness derivation
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `fresh` | `ageSeconds <= interval` (900s) | Artifacts recently updated; wave active |
| `warn` | `interval < ageSeconds <= 2 * interval` | Artifacts nearing staleness threshold |
| `stale` | `ageSeconds > 2 * interval` | Artifacts past freshness threshold |
| `unknown` | `asOfIso` absent or invalid | Timestamp unavailable |

**Invariants:**
- I1: Freshness is evaluated once during metrics snapshot creation and frozen in payload. (`src/research/research-store.ts:635-645`)
- I2: Freshness is applied only when pipeline status is `"RUNNING"`. (`src/research/research-store.ts:641`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `unknown` | Evaluate mtime | `age <= interval` | `fresh` | Standard card styling | `src/research/research-freshness.ts:30` |
| `fresh` | Age advances | `interval < age <= 2*interval` | `warn` | Renders WARN badge | `src/research/research-freshness.ts:29, 38` |
| `warn` | Age advances | `age > 2*interval` | `stale` | Renders STALE badge | `src/research/research-freshness.ts:28, 40` |


### Research Status-Line Pin — explicit
**Where:** `src/index.ts:447-451, 551, 582`; scope = session/UI status line (`ctx.ui.setStatus`)
**States:**
| State | Encoding | Meaning |
| :--- | :--- | :--- |
| `PINNED` | `ctx.ui.setStatus("research", <text>)` | Status bar visible in TUI footer with project metrics |
| `CLEARED` | `ctx.ui.setStatus("research", undefined)` | Status bar removed from TUI footer |

**Invariants:**
- I1: Running `/research archive <slug>` or `/research remove <slug>` clears the `"research"` status line from the UI. (`src/index.ts:551, 582`)
- I2: Running `/research status off` explicitly clears the status line. (`src/index.ts:431`)

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CLEARED` | `/research status <slug> --bar` | Project found | `PINNED` | Sets footer status text | `src/index.ts:448` |
| `PINNED` | `/research status off` | None | `CLEARED` | Clears status key | `src/index.ts:431` |
| `PINNED` | `/research archive <slug>` | Archive successful | `CLEARED` | Clears status key | `src/index.ts:551` |
| `PINNED` | `/research remove <slug>` | Remove successful | `CLEARED` | Clears status key | `src/index.ts:582` |

## 5. Council

### Council Deliberation Lifecycle — implicit
**Where:** `src/council/council.ts:1295-1478`, `commands/council.md:96-187`; scope = per-binding closure (main session & subagents)
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `IDLE` | No active council invocation | System ready for `/council` command |
| `INTERACTIVE_SELECT` | `!rawArgs.trim() && ctx.hasUI && ctx.ui.select` | Dialog open for triad/action selection |
| `SUBCOMMAND_EXEC` | `parseCouncilSubcommand(rawArgs) !== null` | Executing `list`, `init`, `edit`/`config`, or `recent`/`history` subcommand |
| `DELIBERATING` | `ctx.ui.setStatus("council", ...)` active | Deliberation active; persists until next settled `agent_end` |
| `STAGE_1_FANOUT` | `task` tool dispatched with $N$ personas | Parallel execution of independent persona drafts |
| `STAGE_2_CRITIQUE` | Anonymized cross-critique subagents active | Chatham-House blind review (`deep`/`debate` mode) |
| `STAGE_3_SYNTHESIS` | Star Chamber partitioning active | Chairman grouping invariants into Consensus/Majority/Insights/Divergence |
| `STAGE_4_PERSIST` | `saveCouncilRecord` running | Writing Ed25519-signed markdown decision record to `.omp/scratch/debates/` |
| `CONCLUDED` | Verdict card emitted to chat; status cleared on `agent_end` | Deliberation finished; single turn concluded |

**Invariants:**
- I1: Status bar displays active deliberation text throughout deliberation and is cleared on the binding's next settled `agent_end` (`src/council/council.ts:1394-1404`).
- I2: Deliberation spawns all $N$ active personas in parallel matching config ($N \ge 1$) (`commands/council.md:103, 119-129`).
- I3: Single-turn deliberation: deliberation concludes after emitting the verdict card; subsequent turns are not council deliberations (`commands/council.md:176-177`, `src/council/council.ts:1379`).
- I4: ADR-0008 invariant: No sub-mode routing stamps (e.g. `QUICK`, `RAW`) in status bar or visible receipt card (`src/council/council.ts:1394-1398`).
- I5: ADR-0008 invariant: Zero command echoing into user prompt buffer via `pi.sendUserMessage` (`src/council/council.ts:1414-1422`).
- I6: Subcommands (`list`, `init`, `edit`, `recent`, `history`) execute locally without triggering agent turns (`src/council/council.ts:1303-1321`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `IDLE` | `/council [subcommand]` | `parseCouncilSubcommand(rawArgs) !== null` | `SUBCOMMAND_EXEC` | Dispatches to `list`, `init`, `edit`, or `runCouncilRecentCommand` | `council.ts:1303-1321` |
| `IDLE` | `/council` (bare) | `!rawArgs.trim() && ctx.hasUI && ctx.ui.select` | `INTERACTIVE_SELECT` | Opens `ctx.ui.select` dialog | `council.ts:1283` |
| `INTERACTIVE_SELECT` | Selection made | Option chosen | `IDLE` / `SUBCOMMAND_EXEC` | Re-invokes `runCouncilCommand` with selected triad & prompt | `council.ts:1337` |
| `IDLE` | `/council <topic>` | `rawArgs.trim().length > 0` | `DELIBERATING` | Sets status widget, registers `agent_end` clear handler, notifies user, queues receipt | `council.ts:1394-1404` |
| `DELIBERATING` | Stage 1 dispatch | Model calls `task()` | `STAGE_1_FANOUT` | Dispatches $N$ parallel subagent tasks | `commands/council.md:122` |
| `STAGE_1_FANOUT` | Personas settle | Mode is `quick` or `raw` | `STAGE_3_SYNTHESIS` | Collects opinions, skips cross-critique | `commands/council.md:31` |
| `STAGE_1_FANOUT` | Personas settle | Mode is `deep` / `debate` | `STAGE_2_CRITIQUE` | Anonymizes drafts, dispatches cross-critique agents | `commands/council.md:140` |
| `STAGE_2_CRITIQUE` | Critiques settle | All critiques returned | `STAGE_3_SYNTHESIS` | Merges critiques with original drafts | `commands/council.md:156` |
| `STAGE_3_SYNTHESIS` | Verdict partitioned | `save === true` | `STAGE_4_PERSIST` | Saves Ed25519-signed record with collision avoidance | `commands/council.md:179`, `council.ts:846` |
| `STAGE_3_SYNTHESIS` | Verdict partitioned | `save === false` | `CONCLUDED` | Emits verdict card over `council-verdict` customType | `commands/council.md:169` |
| `STAGE_4_PERSIST` | Record written | File write finishes | `CONCLUDED` | Populates `savedPath` on verdict card | `commands/council.md:186` |
| `DELIBERATING` | `agent_end` event | Binding settlement | `CONCLUDED` | Calls `ctx.ui.setStatus(COUNCIL_STATUS_KEY, undefined)` | `council.ts:1400-1404` |


### Council Configuration & YAML Parser — explicit
**Where:** `src/council/council.ts:377-533`; scope = per-call parser reading on-disk `.omp/council.yaml`
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `ROOT` | `currentCouncil === ""` | Parsing top-level configuration keys (`default:`, `mode:`, `timeout:`, `councils:`) |
| `IN_COUNCIL` | `currentCouncil !== "" && currentPersona === null` | Council block active; expecting persona list items |
| `IN_PERSONA` | `currentPersona !== null && inToolsList === false` | Parsing persona attributes (`name`, `id`, `role`, `prompt`, `color`) |
| `IN_TOOLS` | `currentPersona !== null && inToolsList === true` | Parsing list items under `tools:` |
| `COMMITTED` | `pushPersona` executed | Persona added to `councils[currentCouncil]` with auto-derived `id` fallback |

**Invariants:**
- I1: `config.councils` always contains all 4 built-ins (`default-triad`, `ml-research`, `embedded`, `electrical-ee`) (`src/council/council.ts:379, 583-591`).
- I2: `config.defaultCouncil` must exist in `config.councils`; unknown default falls back to `"default-triad"` (`src/council/council.ts:520-522`).
- I3: Personas parse reliably regardless of field ordering (e.g. `name:` preceding `id:`) (`src/council/council.ts:451-490`).
- I4: Only list items under `tools:` are appended to `persona.tools`; non-tool lists (e.g. `guidelines:`) do not leak (`src/council/council.ts:505-512`).
- I5: Councils indented at any consistent level (0, 2, or 4 spaces) are parsed without silent drop (`src/council/council.ts:430-448`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `ROOT` | `default: <name>` | Match regex | `ROOT` | `explicitDefaultCouncil = resolveCouncilPreset(rawVal)` | `council.ts:398-402` |
| `ROOT` | `mode: <mode>` | Match regex | `ROOT` | Sets `explicitDefaultMode` | `council.ts:405-413` |
| `ROOT` | `councils:` | Match regex | `ROOT` | Header skipped | `council.ts:422-424` |
| `ROOT` / `IN_COUNCIL` / `IN_PERSONA` / `IN_TOOLS` | `[indent]<name>:` | `councilMatch && !trimmed.startsWith("-") && indent <= councilIndent` | `IN_COUNCIL` | Commits pending persona; resets `councils[name] = []`; updates `councilIndent` | `council.ts:430-448` |
| `IN_COUNCIL` / `IN_PERSONA` / `IN_TOOLS` | `[indent]- <key>: <val>` | `key in personaKeys` | `IN_PERSONA` | Commits pending persona; allocates new `currentPersona`; assigns key/val; resets `inToolsList = false` | `council.ts:451-490` |
| `IN_PERSONA` | `<key>: <val>` | Attribute match | `IN_PERSONA` | Populates attribute on `currentPersona` | `council.ts:492-504` |
| `IN_PERSONA` | `tools:` | Match regex | `IN_TOOLS` | Sets `inToolsList = true` | `council.ts:505-507` |
| `IN_TOOLS` | ` - <tool>` | `inToolsList && !keyColon` | `IN_TOOLS` | Appends tool to `currentPersona.tools` | `council.ts:507-509` |
| `IN_TOOLS` | `<otherKey>:` | Key-value line | `IN_PERSONA` | Sets `inToolsList = false` | `council.ts:510-512` |
| Any | End of input | `currentPersona && (id \|\| name)` | `COMMITTED` | Commits final persona to `councils[currentCouncil]` | `council.ts:516-518` |


### CLI Argument & Subcommand Parser — implicit
**Where:** `src/council/council.ts:1181-1278`, `src/council/council-history.ts:78-96`; scope = per-call argument tokenizer
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `HEAD_CHECK` | Inspecting `tokens[0]` | Detecting subcommand (`list`, `init`, `edit`/`config`, `recent`/`history`) |
| `LEADING_KEYWORDS` | `inLeadingKeywords === true` | Consuming leading bare keywords, flags, and council presets |
| `TOPIC_PROSE` | `inLeadingKeywords === false` | Preserving topic prose tokens verbatim; `--flags` still parsed |
| `RESOLVED` | `ParsedCouncilArgs` returned | Structured arguments ready for deliberation or subcommand dispatch |

**Invariants:**
- I1: Subcommands (`list`, `init`, `edit`, `config`, `recent`, `history`) short-circuit deliberation before triggering agent turns (`src/council/council.ts:1260-1277, 1303-1321`).
- I2: Bare keywords are recognized only as a leading run; once non-keyword prose begins, natural language words (`save`, `deep`, etc.) are preserved verbatim (`src/council/council.ts:1193-1249`).
- I3: Explicit `--flags` (`--save`, `--deep`, `--ml`, etc.) are accepted anywhere in the argument string (`src/council/council.ts:1196-1211`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `HEAD_CHECK` | `tokens[0]` matches subcommand | `sub in ["list", "init", "edit", "config", "recent", "history"]` | `SUBCOMMAND_EXEC` | Returns `{ sub, rest }` | `council.ts:1258-1278` |
| `HEAD_CHECK` | Non-subcommand head | No subcommand match | `LEADING_KEYWORDS` | Begins token scan with `inLeadingKeywords = true` | `council.ts:1192` |
| `LEADING_KEYWORDS` | `--flag` | Starts with `--` | `LEADING_KEYWORDS` | Sets matching boolean/preset/mode flag | `council.ts:1196-1211` |
| `LEADING_KEYWORDS` | Bare keyword | Token in modes/flags/presets/known councils | `LEADING_KEYWORDS` | Sets matching mode/preset/flag | `council.ts:1212-1244` |
| `LEADING_KEYWORDS` | Non-keyword token | Neither `--flag` nor bare keyword | `TOPIC_PROSE` | `inLeadingKeywords = false`; `topicParts.push(tok)` | `council.ts:1245-1248` |
| `TOPIC_PROSE` | `--flag` | Starts with `--` | `TOPIC_PROSE` | Sets matching flag; not added to `topicParts` | `council.ts:1196-1211` |
| `TOPIC_PROSE` | Any non-`--` token | Regular word or bare keyword string | `TOPIC_PROSE` | `topicParts.push(tok)` (preserved verbatim) | `council.ts:1249` |
| `TOPIC_PROSE` / `LEADING_KEYWORDS` | End of tokens | `i === tokens.length` | `RESOLVED` | Returns `ParsedCouncilArgs` | `council.ts:1251` |


### Interactive Verdict Overlay Reducer — explicit
**Where:** `src/council/council-overlay.ts` (`CouncilOverlay`); scope = per-modal instance state
**States:** tabs are derived from the verdict: `tabs = ["verdict", "persona-0", …, "persona-(N-1)"]` for a verdict with N opinions.
| State | Encoding | Meaning |
|---|---|---|
| `TAB_VERDICT` | `state.activeTab === "verdict"` | Star Chamber consensus / majority / divergence summary |
| `TAB_PERSONA_i` | `state.activeTab === "persona-i"`, `0 ≤ i < N` | Persona *i*'s stance, recommendation, invariants, caveats; bar label `Persona A…`, body header = persona name |
| `DISMISSED` | `done === true` via `q`/`Esc`/Ctrl+C | `onDone({ action: "dismiss" })` emitted |
| `SETTLED` | `done === true` via `s`/`Enter` | Structured action emitted (not dispatched — see §5 CLI parser); further input ignored |

**Invariants:**
- I1: `onDone` is invoked at most once per overlay; input after `done` returns `undefined`.
- I2: `activeTab ∈ tabs` at all times — including after `setVerdict` with fewer opinions (falls back to `verdict`).
- I3: Every persona of the verdict is reachable (digits `1..min(9, tabs)`, Tab/Shift+Tab wrap over all tabs) and no tab exists without an opinion (no phantom `Persona C` for a duo).
- I4: Each tab's scroll offset is within `[0, maxScrollForTab(tab)]`; `setVerdict` rebuilds the offset map for the new tabs and clamps (X-COUNCIL-16).
- I5: The tab bar fits the overlay width (labels depend only on persona count; line truncated to the inner width).

**Transitions:**
| From | Trigger | Guard | To | Effect |
|---|---|---|---|---|
| any tab | digit `k` | `!done && k ≤ min(9, tabs.length)` | `tabs[k-1]` | `activeTab = tabs[k-1]` |
| any tab | digit `k` | `k > tabs.length` | same | ignored |
| any tab | `Tab` / `Shift+Tab` | `!done` | next / previous tab (wraps over `tabs`) | rotates `activeTab` |
| any tab | `j`/Down, `k`/Up | `!done` | same | scroll offset ± 1, clamped |
| any tab | `q` / `Esc` / Ctrl+C | `!done` | `DISMISSED` | `done = true`; `onDone({ action: "dismiss" })` |
| any tab | `s` | `!done` | `SETTLED` | `done = true`; `onDone({ action: "save", topic })` |
| any tab | `Enter` | `!done` | `SETTLED` | `done = true`; `onDone({ action: "implement", topic, invariants })` |
| any | any input | `done` | same | no-op |
| any tab | `setVerdict(v)` | — | same tab if `∈ tabs(v)`, else `TAB_VERDICT` | rebuilds `tabs` and clamped offsets |

### Star Chamber Semantic Consensus Partitioner — implicit
**Where:** `src/council/council.ts:681-772`; scope = per-call analytical helper (test-only helper at runtime; LLM acts as chairman in workflow stage 3)
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `EMPTY` | `opinions.length === 0` | No opinions provided; returns fallback summary |
| `COLLECTING` | Scanning opinions | Deduplicating invariants per persona and incrementing distinct persona support |
| `BUCKETING` | Invariant counts evaluated | Categorizing into Consensus (unanimous) vs Majority ($\ge 60\%$) |
| `DIVERGENCE_CHECK` | Comparing stances | Identifying unique stances across personas |
| `PARTITIONED` | `PartitionResult` returned | Buckets assembled into structured result |

**Invariants:**
- I1: Consensus invariants require unanimous confirmation across distinct personas; single-persona repetition does not increment support count (`src/council/council.ts:696-708`).
- I2: Majority recommendations require support from $\ge 60\%$ of personas without unanimous consensus (`src/council/council.ts:720`).
- I3: Divergences reflect unique stance differences across personas (`src/council/council.ts:748-759`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `EMPTY` | `opinions.length > 0` | Valid array | `COLLECTING` | Maps key invariants with per-persona deduplication | `council.ts:696-708` |
| `COLLECTING` | Invariants gathered | All opinions scanned | `BUCKETING` | Partitions into consensus & majority | `council.ts:709-723` |
| `BUCKETING` | Buckets populated | Empty fallback check | `DIVERGENCE_CHECK` | Adds recommendations fallback if empty | `council.ts:725-732` |
| `DIVERGENCE_CHECK` | Stance scan | `uniqueStances.length > 1` | `PARTITIONED` | Records divergence issue & persona positions | `council.ts:748-759` |


### Decision Record Persistence & Frontmatter Parser — implicit
**Where:** `src/council/council.ts:846-934`, `src/council/council-history.ts:134-209`; scope = on-disk `.omp/scratch/debates/` markdown records
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `UNPARSED` | Content read from disk | Raw debate markdown string |
| `IN_FRONTMATTER` | Leading `---` block matched | Iterating scalar key-value rows |
| `IN_LIST` | `currentList === "consensus_invariants"` | Parsing indented bullet items |
| `PARSED` | Trailing `---` reached | Valid `DebateFrontmatter` returned |

**Invariants:**
- I1: `saveCouncilRecord` prevents filename collisions on same-day deliberations with identical topics by appending numeric suffixes (`_2.md`, `_3.md`) (`src/council/council.ts:861-868`).
- I2: `parseDebateFrontmatter` tolerates CRLF (`\r\n`) and LF (`\n`) line endings (`src/council/council-history.ts:146, 149`).
- I3: `saveCouncilRecord` persists `public_key_ed25519` with newline escaping, enabling mathematical verification via `verifyCouncilSignature` (`src/council/council.ts:879`, `src/council/council-history.ts:184`).
- I4: History card rendering calculates topic budgets with the exact date prefix width (` [YYYY-MM-DD] ` = 14 cols), preserving `🔏 signed` / `unsigned` metadata badges without truncation (`src/council/council-history.ts:286-290`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `UNPARSED` | `content.match(/^---\r?\n([\s\S]*?)\r?\n---/)` | Match success | `IN_FRONTMATTER` | Extracts frontmatter block | `council-history.ts:146` |
| `IN_FRONTMATTER` | Scalar row `key: value` | Matches regex | `IN_FRONTMATTER` | Assigns unquoted value to `result[key]` | `council-history.ts:155-185` |
| `IN_FRONTMATTER` | `consensus_invariants:` (empty) | Match regex | `IN_LIST` | `currentList = "consensus_invariants"` | `council-history.ts:186-189` |
| `IN_LIST` | `  - "..."` bullet | `currentList !== null` | `IN_LIST` | Appends unquoted item to list | `council-history.ts:194-199` |
| `IN_LIST` | Scalar key or blank | Non-bullet row | `IN_FRONTMATTER` | Resets `currentList = null` | `council-history.ts:159` |

## 6. Session features: bootstrap, system prompt, hindsight, clarify, tilt, timeline

### Bootstrap Injection Machine — implicit
**Where:** `src/core/bootstrap.ts:22`; scope = per-request provider context (`context` event, R6)
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `INTERACTIVE_PENDING` | `ctx.hasUI !== false && !hasMarker` | Interactive user session context needing slash command awareness |
| `INJECTED` | `messages` modified with marker | Slash commands injected at stable index after compaction summaries |
| `IDEMPOTENT_PASS` | `ctx.messages.some(messageContainsBootstrap)` | Context already has commands; left untouched |
| `SUBAGENT_BLOCKED` | `ctx.hasUI === false` | Task subagent session; injection blocked to prevent noise and prompt pollution |

**Invariants:**
- `I1`: Every interactive session request (`hasUI !== false`) discloses installed slash commands (`bootstrap.ts:27`).
- `I2`: Subagents (`hasUI === false`) never receive bootstrap commands (`bootstrap.ts:27`).
- `I3`: Prefix stability: Injection is placed at a stable position (`firstNonCompactionSummaryIndex`), preserving the leading compaction summary prefix (AGENTS.md §8, `bootstrap.ts:35-46`).
- `I4`: Idempotence: If `BOOTSTRAP_MARKER` is already present, no duplicate message is added (`bootstrap.ts:33`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `*` | `context` | `ctx.hasUI === false` | `SUBAGENT_BLOCKED` | Return `undefined` | `bootstrap.ts:27` |
| `*` | `context` | `ctx.hasUI !== false && hasMarker` | `IDEMPOTENT_PASS` | Return `undefined` | `bootstrap.ts:33` |
| `*` | `context` | `ctx.hasUI !== false && !hasMarker` | `INJECTED` | Insert bootstrap user message after compaction summaries | `bootstrap.ts:35-46` |


### Hindsight Reflection Loop Machine — implicit
**Where:** `src/features/hindsight.ts:67-245`; scope = process-shared module + per-session state
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `DISABLED` | `enabled === false` | Reflection pass inactive; `session_stop` returns `undefined` |
| `ARMED` | `enabled === true && nudgedTurnBySession.get(sessionId) !== lastUserMessageId` | Reflection pass ready to evaluate turn for user prompt |
| `NUDGED_IN_YIELD` | `nudgedTurnBySession.get(sessionId) === userMessageId` | Reflection nudge fired for this user prompt; subsequent internal turns suppressed |
| `CONTINUATION_PASS` | `stop_hook_active === true` | In-flight reflection continuation turn; skipped to prevent recursion |

**Invariants:**
- `I1`: Once per yield: Each unique user prompt in a session is nudged at most once (`hindsight.ts:224-225`).
- `I2`: Substantial work gate: Reflection triggers if the last assistant message has tool calls/$\ge 400$ chars of thinking, OR any turn messages since the last user message executed tools (`hindsight.ts:185-206, 215`).
- `I3`: Runaway loop prevention: Continuation turns carrying `stop_hook_active: true` never trigger reflection (`hindsight.ts:214`).
- `I4`: Session isolation: Tracked by session id + last user message identity, preventing `/new` or compacted sessions from suppressing turn 1 (`hindsight.ts:217-225`).
- `I5`: Live config reload: Config reloaded on every `session_stop` invocation (`hindsight.ts:212`).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `DISABLED` | `/hindsight on` | - | `ARMED` | `enabled = true` | `hindsight.ts:144` |
| `ARMED` | `/hindsight off` | - | `DISABLED` | `enabled = false` | `hindsight.ts:144` |
| `ARMED` | `session_stop` | `!stop_hook_active && didTurnDoRealWork() && !nudged` | `NUDGED_IN_YIELD` | Records turn identity; returns `{ continue: true, additionalContext: buildNudge() }` | `hindsight.ts:210-226` |
| `ARMED` | `session_stop` | `!didTurnDoRealWork()` | `ARMED` | Settle without nudge | `hindsight.ts:215` |
| `NUDGED_IN_YIELD` | User submits new prompt | New user prompt identity | `ARMED` | Implicit via new user prompt identity | `hindsight.ts:224` |


### Clarify Prompt Interception Machine — implicit
**Where:** `src/features/clarify.ts:56-235`; scope = process-shared module + per-prompt token matching
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `DISABLED` | `enabled === false` | Clarification guidelines omitted from system prompt |
| `ENABLED_ACTIVE` | `enabled === true && !pendingBypasses.has(promptText)` | Guidelines injected into system prompt via `before_agent_start` |
| `BYPASS_QUEUED` | `enabled === true && pendingBypasses.has(promptText)` | User prefixed input with `~`; guidelines omitted for this exact prompt |

**Invariants:**
- `I1`: Single-turn bypass: `~` prefix bypass is bound to the stripped prompt text and consumed by its `before_agent_start` (`clarify.ts:150-151, 171`).
- `I2`: Subagent immunity: Concurrent subagent `agent_end` events cannot clear or corrupt parent prompt bypass state (`clarify.ts:171`).
- `I3`: Abort resilience: An aborted tilde command (which never enters `before_agent_start`) cannot leave a generic flag that disables clarification on a later normal prompt (`clarify.ts:171`).
- `I4`: `pendingBypasses` holds at most 16 entries and never slash-command text; an aborted `~prompt` can at most exempt a later prompt with identical text (`clarify.ts:65-68,159-168`).
- `I5`: `/clarify` is registered once, from `COMMANDS` in `src/index.ts`.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `DISABLED` | `/clarify on` | - | `ENABLED_ACTIVE` | `enabled = true` | `clarify.ts:102` |
| `ENABLED_ACTIVE` | `/clarify off` | - | `DISABLED` | `enabled = false` | `clarify.ts:104` |
| `ENABLED_ACTIVE` | `input` | `shouldBypassClarify(text)` | `BYPASS_QUEUED` | Strips `~`, adds stripped text to `pendingBypasses` | `clarify.ts:149-156` |
| `BYPASS_QUEUED` | `before_agent_start` | `pendingBypasses.has(promptText)` | `ENABLED_ACTIVE` | Consumes bypass from set; skips injecting `CLARIFY_PROMPT` | `clarify.ts:171-183` |
| `ENABLED_ACTIVE` | `before_agent_start` | `!pendingBypasses.has(promptText)` | `ENABLED_ACTIVE` | Appends the `## Prompt Clarification Active` tail block | `clarify.ts:175-182` |


### System Prompt Contributor Chain (`before_agent_start`) — implicit
**Where:** runtime `extensions/runner.ts` `emitBeforeAgentStart`; contributors `src/features/clarify.ts:169-214`, `src/knowledge/kb-index-injector.ts:93-103`; scope = per-turn, runtime-owned
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `BASE` | `systemPrompt: string[]` as built by the runtime this turn | Runtime blocks only |
| `EXTENDED` | `[...base, ...appended]` | Clarify guidelines, `<relevant-knowledge>`, KB index appended as separate tail blocks |

**Invariants:**
- I1: Every contributor reads `event.systemPrompt` as `string[]` (`asBeforeAgentStartEvent`) and returns `{ systemPrompt: string[] }`; the runtime chains results handler to handler and wraps a returned string as `[string]`.
- I2: Blocks `0..k` of `BASE` are byte-identical in `EXTENDED` (prefix stability, AGENTS.md §8).
- I3: Each appended block appears at most once per turn (marker checks on all blocks).

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `BASE` | clarify handler | clarify on and prompt not `~`-bypassed, or prompt matches KB terms | `EXTENDED` | appends `## Prompt Clarification Active` and/or `<relevant-knowledge>` blocks | `clarify.ts:174-213` |
| `BASE`/`EXTENDED` | KB injector | store non-empty, no marker | `EXTENDED` | appends `## Active knowledge base` block | `kb-index-injector.ts:93-103` |

### Tilt DEFCON Swear Jar Machine — implicit & persisted
**Where:** `src/features/tilt.ts` (`sessionStrikesBySession`, `recordTiltIncident`, `installTilt`); scope = repository root on disk (`<root>/.omp/tilt.json`), global disk (`~/.omp/tilt.json`), and in-memory session strikes
**States:**
| State | Encoding | Meaning |
|---|---|---|
| `DEFCON 5 (Chill)` | `session_strikes <= 0` | Baseline; calm vibe |
| `DEFCON 4 (Annoyed)` | `1 <= session_strikes <= 2` | Mild agitation |
| `DEFCON 3 (Frustrated)` | `3 <= session_strikes <= 5` | Noticeable agitation |
| `DEFCON 2 (High Agitation)` | `6 <= session_strikes <= 9` | Severe agitation |
| `DEFCON 1 (Nuclear Rage)` | `session_strikes >= 10` | Extreme rage |

**Invariants:**
- `I1`: Repository root boundary: Local tilt is always resolved to repository root (`findRepoRoot(startDir)`), never fragmented across subdirectories (`tilt.ts:510, 839`).
- `I2`: Session strike scope: Session strikes and DEFCON levels reset per session ID; lifetime totals persist (`tilt.ts:468-469, 513-516, 791, 801`).
- `I3`: Corrupt file quarantine: Malformed JSON is not silently overwritten; quarantined to `*.corrupt.<timestamp>` and reinitialized (`tilt.ts:420-426, 455, 489`).
- `I4`: Atomic writes: Local and global tilt states are written via temporary files and atomic rename (`tilt.ts:413-418, 462, 496`).
- `I5`: `sessionStrikesBySession` holds only live sessions; `session_shutdown` releases the disposed session's entry.

**Transitions:**
| From | Trigger | Guard | To | Effect | Code |
|---|---|---|---|---|---|
| `DEFCON N` | `input` | `scanPromptTilt(text).points > 0` | `DEFCON M` | Increments session strikes in memory, project/global strikes on disk; recalculates DEFCON | `tilt.ts:501-548` |
| `DEFCON N` | `/tilt reset` | - | `DEFCON 5` | Clears active session strikes; sets `session_strikes = 0, defcon = 5` | `tilt.ts:790-798` |
| `DEFCON N` | `/tilt clear-all` | - | `DEFCON 5` | Clears active session strikes; zeroes project strikes, swear jar, and breakdown | `tilt.ts:800-811` |
| any | `session_shutdown` | `sessionIdOf(ctx)` defined | *(entry removed)* | Drops the disposed session's in-memory strike count (`sessionStrikesBySession`) | `installTilt` |


### Timeline History Aggregator — stateless
**Where:** `src/features/timeline.ts:48-79`; scope = per-call execution
**States:** Stateless pipeline collecting git and knowledge events.
**Invariants:**
- `I1`: Unified stream accuracy: Git commit subjects containing pipe (`|`) characters preserve their full subject line (`timeline.ts:62`).

## 7. Invalid states and transitions (defects)

Every entry was reachable from a real entry point (slash command, runtime event, tool call, or a workflow body the model follows) and confirmed by a repro, a failing regression test, or a captured provider payload from the installed runtime (D53). Issue files: `.omp/scratch/state-machine-audit/issues/`. All are fixed; their regression tests run in `npm test`.

### 7.1 Priority

| Issue | Priority | Defects | Impact |
|---|---|---|---|
| 18 — System prompt contributors honour the `string[]` contract | P0 | D53 | every prompt in a repo with a knowledge base |
| 01 — Research project lifecycle: destructive and restore transitions | P0 | D01, D02, D03, D04, D05 | data loss |
| 02 — Append-only KB guard: bypasses and stuck audit revisions | P0 | D06, D07, D08 | data loss / integrity |
| 03 — Bootstrap command list: present in every main-session request, never in subagents | P1 | D09, D10, D11 | every session |
| 04 — Research DAG: node completion only from the node's own valid result | P1 | D12, D13, D14 | silent wrong progress |
| 05 — Outline parser: nested lists never swallow sibling items | P1 | D15, D16 | silent data loss |
| 06 — Hindsight: nudge once per user prompt in every session | P1 | D17, D18 | feature inert |
| 07 — Council: subcommands and keywords route only where intended | P1 | D19, D20, D21, D22 | wrong transition, token burn |
| 08 — Reference corpus: a failed clone leaves nothing behind | P1 | D23 | stuck after retry |
| 17 — herdr agent settlement: `prompt` returns only after the agent settles | P1 | D51, D52 | tool reports a false state |
| 09 — Council config parser: field order and indentation do not drop data | P2 | D24, D25, D26, D27 | silent config loss |
| 10 — KB telemetry: per-session counts, wired status line, read-only reads | P2 | D28, D29, D30, D31, D32, D33 | wrong prompt/state |
| 11 — Workspace root resolution: no stale or shadowed roots | P2 | D34, D35, D36 | wrong directory |
| 12 — Clarify `~` bypass applies to exactly the prompt that carried it | P2 | D37, D38 | wrong system prompt |
| 13 — Ticket and audit status derivation matches the documented vocabulary | P2 | D39, D40, D41, D42 | wrong guidance |
| 14 — Routine runs: the reported outcome matches the process outcome | P2 | D43, D44 | misleading result |
| 15 — Tilt: session scope, repo-root storage, no silent history wipe | P2 | D45, D46, D47 | persistent wrong state |
| 21 — Reference corpus: distinct repos with the same name can coexist | P2 | D56 | stuck state with wrong guidance |
| 19 — Council overlay: one tab per persona of the verdict | P2 | D54 | part of the verdict unreachable |
| 20 — `/audit list` lists every audit report | P2 | D55 | wrong output |
| 16 — Research overlay: every key leads to a valid state | P3 | D48, D49, D50 | UX |

### 7.2 Defect register

#### D01 — Bare `/research remove` (and `/research delete`) permanently deletes latest research project without argument or confirmation
- **Issue:** 01 (P0)
- **Machine / invariant:** Research Project Locators & Deletion, Invariant I1
- **Reachable via:** User or script runs bare `/research remove` or `/research delete` without a slug argument.
- **Evidence (pre-fix):** `src/research/research-store.ts:874-903` resolved empty string to `entries[0]` via locator fallback and unconditionally deleted the most recent project folder.
- **Fix:** Guard added in `removeResearchProject` (`if (!slugArg || !slugArg.trim()) return { ok: false, error: ... }`) and in `src/index.ts:572` notifying a warning when no slug is provided.
- **Regression test:** `tests/research.test.ts` — "D01: Bare remove without slug must fail and leave projects untouched"
- **Status:** fixed

#### D02 — Bare `/research archive` silently archives latest research project without explicit slug
- **Issue:** 01 (P0)
- **Machine / invariant:** Research Project Locators & Deletion, Invariant I1
- **Reachable via:** User runs bare `/research archive` without a slug argument.
- **Evidence (pre-fix):** `src/research/research-store.ts:791-795` resolved empty string to `entries[0]` and moved it into `.archive/`.
- **Fix:** Guard added in `archiveResearchProject` (`if (!slugArg || !slugArg.trim()) return { ok: false, error: ... }`) and in `src/index.ts:541`.
- **Regression test:** `tests/research.test.ts` — "D02: Bare archive without slug must fail and leave projects untouched"
- **Status:** fixed

#### D03 — Restoring an outline or paused project from archive unconditionally rewrites status to `CONVERGED`
- **Issue:** 01 (P0)
- **Machine / invariant:** Research Project On-Disk Lifecycle, Invariant I2
- **Reachable via:** User archives an `OUTLINE` or `PAUSED` project and restores it with `/research unarchive <slug>`.
- **Evidence (pre-fix):** `src/research/research-store.ts:850` hardcoded `const targetStatus = hasReport ? "REPORT_READY" : "CONVERGED";`, overwriting draft outline projects to `CONVERGED`.
- **Fix:** `archiveResearchProject` preserves prior active status in `prior_status` front-matter; `unarchiveResearchProject` inspects artifacts on disk (`report.md`, `results/`, `outline.yaml`) to restore `REPORT_READY`, `CONVERGED`, `PAUSED`, `RUNNING`, or `OUTLINE` matching real file state.
- **Regression test:** `tests/research.test.ts` — "D03: Unarchive derives restored status from files"
- **Status:** fixed

#### D04 — `/research review` and `/research status` fabricate phantom `"unknown"` project when research directory is empty
- **Issue:** 01 (P0)
- **Machine / invariant:** Research Project Locators & Deletion, Invariant I2
- **Reachable via:** User runs `/research review` or `/research status` in a repository with zero research projects.
- **Evidence (pre-fix):** `resolveResearchProjectDir` computed `notFound = false` when `slugArg` was empty, returning `slug: "unknown"`, prompting handlers to display a fictional card in `DRAFT REVIEW`.
- **Fix:** `readProject` checks `notFound || !projectDir || !existsSync(projectDir)`; handlers in `src/index.ts` guard on missing project path and emit a clear "No active research projects found" notification.
- **Regression test:** `tests/research.test.ts` — "D04: Empty research root produces notFound, no phantom 'unknown' project"
- **Status:** fixed

#### D05 — Persistent status bar `ctx.ui.setStatus` not cleared on project removal or archival
- **Issue:** 01 (P0)
- **Machine / invariant:** Research Status-Line Pin, Invariant I1
- **Reachable via:** User enables status bar with `/research status <slug> --bar`, then archives or deletes the project.
- **Evidence (pre-fix):** `src/index.ts` archive and remove handlers executed file operations without calling `ctx.ui?.setStatus?.("research", undefined)`.
- **Fix:** Added `ctx.ui?.setStatus?.("research", undefined)` to both `archive` and `remove`/`delete` command handlers in `src/index.ts:551, 582`.
- **Regression test:** `tests/research.test.ts` — "D05: Archive / remove clears pinned status bar key"
- **Status:** fixed

#### D06 — Policy guard bash bypasses on protected directories and ancestor paths
- **Issue:** 02 (P0)
- **Machine / invariant:** Policy Guard — Invariants 1, 2, 4.
- **Reachable via:** Shell command executing `rm -rf .omp/knowledge`, `rm -rf .omp`, `1> .omp/knowledge/INDEX.md`, `cp -t .omp/knowledge/records/ file.md`, or `mv -t .omp/knowledge/records/ file.md`.
- **Evidence (pre-fix):** `src/knowledge/policy.ts:28-49,87,128-136`. `knowledgeSubpath` returned `[]` for `.omp/knowledge` and `null` for `.omp`, causing `isProtectedPath` to evaluate `false`. Truncating redirect regex matched only bare `>` without digits (missing `1>`, `2>`), and `cp` argument parser checked only the last positional token instead of `-t` target directory. Repro output: `rm -rf .omp/knowledge blocked: false`, `1> INDEX.md blocked: false`, `cp -t blocked: false`.
- **Fix:** `src/knowledge/policy.ts:28-64,97-231`. Updated `knowledgeSubpath` to identify `.omp` and `.omp/knowledge` as protected path tokens; updated `isProtectedPath` to protect `.omp` and `.omp/knowledge`; rewritten bash redirect detection to match `(?:[0-9]+)?>(?!>|&)` while allowing `>>` and `2>&1`; rewritten `cp` and `mv` token parsers to inspect `-t`/`--target-directory` and all positional arguments.
- **Regression test:** `tests/knowledge.test.ts` — "D06: rm -rf .omp/knowledge must block", "D06: rm -rf .omp must block", "D06: 1> redirect to INDEX.md must block", "D06: cp -t into protected dir must block", "D06: mv -t into protected dir must block", "D06: plain mv src protected-dest direct test (asserts returned target)", "D06: stderr redirect 2>&1 must NOT block".
- **Status:** fixed

#### D07 — Subtopic without own version unconditionally blocked after root report bumped
- **Issue:** 02 (P0)
- **Machine / invariant:** Policy Guard — Invariant 3; Audit Report Lifecycle — Invariant 4.
- **Reachable via:** Agent creates audit report (`overview.md`), creates subtopic file (`subtopics/auth.md`), bumps root report to `v0.1.1`, then attempts to write/edit `subtopics/auth.md`. Pre-fix `isControlledAuditUpdate` extracted both `oldVersion` and `newVersion` from on-disk `overview.md`, causing `newVersion === oldVersion` and unconditional rejection.
- **Evidence (pre-fix):** `src/knowledge/policy.ts:248-264,277-293,296`. Repro output: `Write to subtopic after overview bumped: {"block":true}`.
- **Fix:** `src/knowledge/policy.ts:352-384`. Added subtopic revision branch: when target file is a subtopic without own version frontmatter, validates that parent root report (`overview.md`/`report.md`) exists, has valid SemVer, has `## Revision History`, and has `rootMtime >= subtopicMtime`.
- **Regression test:** `tests/knowledge.test.ts` — "D07: Subtopic without own version revisable after root report bumped".
- **Status:** fixed

#### D08 — Audit revisions could lower the SemVer
- **Issue:** 02 (P0)
- **Machine / invariant:** Policy Guard — I3; Audit Report Lifecycle — I1.
- **Reachable via:** `write`/`edit` of an existing audit report from `v0.1.1` to `v0.1.0`: the guard only checked `newVersion !== oldVersion`.
- **Evidence (pre-fix):** `src/knowledge/policy.ts:295-298`; repro: downgrade write returned no block.
- **Fix:** `compareSemVer(newVersion, oldVersion) > 0` required; status must be one of the documented `active | superseded | archived`, read with the template's YAML comment stripped (`policy.ts` `readStatus`). Review caught an interim regression — the first fix compared the raw `status: active # active | superseded | archived` line from the AUDIT-FORMAT template and rejected every template-shaped revision — and an undocumented `archived → active` lock, which was removed.
- **Regression test:** `tests/knowledge.test.ts` — "D08: policy failed to block SemVer version downgrade", "D08: policy blocked a valid version bump whose status line carries the template YAML comment".
- **Status:** fixed

#### D09 — Bootstrap disarmed after the first `agent_end`, but `context` injections are per-request
- **Issue:** 03 (P1)
- **Machine / invariant:** Bootstrap Injection — I1.
- **Reachable via:** every interactive session. `context` results feed one provider request and are never persisted (R6), yet `agent_end` set `injectBootstrap = false`: from the second turn on, the command list was absent from every request, and the context prefix shifted once (one full prompt-cache miss).
- **Evidence (pre-fix):** `src/core/bootstrap.ts:60-63` (`agent_end` → `injectBootstrap = false`) vs `sdk.ts:3257-3260`, `agent-loop.ts:1535-1540` (ephemeral transform).
- **Fix:** lifecycle flags removed; injection runs on every `context` event of a UI session (`src/core/bootstrap.ts`).
- **Regression test:** `tests/commands.test.ts` — "bootstrap: subsequent turn did not receive ephemeral context injection".
- **Status:** fixed

#### D10 — `session_compact` and `/new` never re-arm bootstrap once any `agent_end` fired
- **Issue:** 03 (P1)
- **Machine / invariant:** Bootstrap Injection — I1.
- **Reachable via:** turn 1 settles (module flag `hasSeenAgentEnd = true`, shared by every binding — R2), then auto-compaction or `/new` (which emits no `session_start` — R3). `session_compact` returned early on `hasSeenAgentEnd`, so the command list never came back for the rest of the process.
- **Evidence (pre-fix):** `src/core/bootstrap.ts:44-58`.
- **Fix:** no lifecycle state; every UI-session request is injected.
- **Regression test:** `tests/commands.test.ts` — "bootstrap: subsequent turn did not receive ephemeral context injection".
- **Status:** fixed

#### D11 — Subagent guard never blocks: each subagent binding starts armed
- **Issue:** 03 (P1)
- **Machine / invariant:** Bootstrap Injection — I2.
- **Reachable via:** any task subagent. Each binding re-runs `installBootstrap`, whose closure starts `let injectBootstrap = true` (R1); the guard only stopped *re-arming*, so the subagent's first request always carried the command list.
- **Evidence (pre-fix):** `src/core/bootstrap.ts:42`; subagent contexts carry `hasUI: false` (`task/executor.ts:3280-3335`, runner default mode `print`).
- **Fix:** `if (ctx.hasUI === false) return;` in the `context` handler (`src/core/bootstrap.ts`).
- **Regression test:** `tests/commands.test.ts` — "bootstrap: subagent with hasUI: false received bootstrap injection".
- **Status:** fixed

#### D12 — Substring matching in `findItemResultFile` prematurely completes items
- **Issue:** 04 (P1)
- **Machine / invariant:** Research DAG Node State, Invariant I1
- **Reachable via:** Outline contains an item whose name/id is a substring of another item (e.g. `auth` vs `oauth`), and only the longer item's JSON exists.
- **Evidence (pre-fix):** `src/research/research-dag.ts:114, 117` used `.includes(idSlug)`, falsely matching `oauth.json` to item `auth`.
- **Fix:** Replaced `.includes()` with exact match or numbered prefix match (`/^\d+_.+$/`).
- **Regression test:** `tests/research.test.ts` — "D12: Substring matching in findItemResultFile prematurely completes items"
- **Status:** fixed

#### D13 — Unparseable or 0-byte result JSON marked as completed DAG node
- **Issue:** 04 (P1)
- **Machine / invariant:** Research DAG Node State, Invariant I2
- **Reachable via:** Interrupted or crashed search worker leaves a truncated or 0-byte JSON file in `results/`.
- **Evidence (pre-fix):** `src/research/research-dag.ts:101` only checked `existsSync()`, marking corrupt JSON as `completed`.
- **Fix:** Added `isValidResultJsonFile` verifying `stat.size > 0` and `JSON.parse()` success before returning a result file path.
- **Regression test:** `tests/research.test.ts` — "D13: Unparseable or 0-byte result JSON marked as completed DAG node"
- **Status:** fixed

#### D14 — Dangling / missing dependencies misclassified as circular graph cycles in `buildResearchDag`
- **Issue:** 04 (P1)
- **Machine / invariant:** Research DAG Node State, Invariant I3
- **Reachable via:** Outline defines an item with `depends_on: ["missing_item"]` where no cycle exists.
- **Evidence (pre-fix):** Kahn's algorithm in `src/research/research-dag.ts:224-248` failed to decrement in-degree for missing nodes, setting `hasCycles: true` and suppressing topological metrics.
- **Fix:** Segregated dangling dependencies into `missingDependencies` record, excluding missing node IDs from cycle detection in-degrees.
- **Regression test:** `tests/research.test.ts` — "D14: Dangling / missing dependencies misclassified as circular graph cycles"
- **Status:** fixed

#### D15 — YAML parser `readOutlineItemSpecs` swallows sibling items into `depends_on`
- **Issue:** 05 (P1)
- **Machine / invariant:** YAML Outline & Fields Mini-Parsers, Invariant I1
- **Reachable via:** Outline contains multi-line `depends_on:` followed by a sibling item starting with `- id:`.
- **Evidence (pre-fix):** `src/research/research-store.ts:411` matched `/^\s*-\s+/` on sibling `- id:` lines, consuming them into `depends_on`.
- **Fix:** Added indentation guard (`nextIndent <= currentItemIndent`) and item key check (`!/^\s*-\s*(id|name|category|depends_on):\s*/i`).
- **Regression test:** `tests/research.test.ts` — "D15: YAML parser readOutlineItemSpecs swallows sibling items into depends_on"
- **Status:** fixed

#### D16 — YAML parser `readOutlineItems` prematurely exits on multi-line items
- **Issue:** 05 (P1)
- **Machine / invariant:** YAML Outline & Fields Mini-Parsers, Invariant I2, I3
- **Reachable via:** Outline items place `- id:` on line 1 and `name:` on line 2.
- **Evidence (pre-fix):** `src/research/research-store.ts:321` matched `/^[a-z0-9_]+:/` on indented `name:`, setting `inItems = false` and dropping subsequent items.
- **Fix:** Delegated `readOutlineItems` to `readOutlineItemSpecs` first; added column-0 unindented guard to fallback line scanner.
- **Regression test:** `tests/research.test.ts` — "D16: YAML parser readOutlineItems prematurely exits on multi-line items"
- **Status:** fixed

#### D17 — SF-1: Hindsight didRealWork missing preceding tool calls
- **Issue:** 06 (P1)
- **Machine / invariant:** Hindsight Reflection Loop Machine / `I2`
- **Reachable via:** Agent runs tools and settles with a final text-only summary message.
- **Evidence (pre-fix):** `didRealWork(last_assistant_message)` checked only the final assistant message, finding 0 tool calls and returning `false`.
- **Fix:** Added `didTurnDoRealWork(messages, lastAssistantMessage)` in `src/features/hindsight.ts` scanning turn messages since the last user message for `toolCall` / `toolResult`.
- **Regression test:** `tests/features.test.ts` — "hindsight: didTurnDoRealWork returned false for turn with tool calls"
- **Status:** fixed

#### D18 — SF-2: Hindsight nudgedUserMessageCount cross-session collision
- **Issue:** 06 (P1)
- **Machine / invariant:** Hindsight Reflection Loop Machine / `I1`, `I4`
- **Reachable via:** User running `/new` or switching sessions; module-scoped `nudgedUserMessageCount` remained equal to 1, suppressing turn 1 of the new session.
- **Evidence (pre-fix):** Module counter suppressed any turn matching prior count.
- **Fix:** Keyed nudged turn state by `sessionId` → identity of the last user message (`nudgedTurnBySession`). Identity is the message's `timestamp` — required on runtime `UserMessage` (`ai/src/types.ts:874`) — with the transcript index as fallback; an interim text-prefix fallback flagged in review was dead for runtime payloads and was removed.
- **Regression test:** `tests/features.test.ts` — "hindsight: session 2 turn 1 was suppressed due to cross-session collision", "hindsight: a new prompt with the same text as the previous one was not nudged"
- **Status:** fixed

#### D19 — `/council recent [N]` and `history [N]` route to `runCouncilRecentCommand` (zero agent turns)
- **Issue:** 07 (P1)
- **Machine / invariant:** CLI Argument & Subcommand Parser (Invariant 1: Subcommands short-circuit deliberation)
- **Reachable via:** User running `/council recent`, `/council recent 5`, or `/council history 3` in chat.
- **Evidence (pre-fix):** `src/council/council-history.ts:80` regex `/^(?:--?recent(?:\s+\d+)?)\s*$/` rejected bare `recent`, returning `false`. `src/council/council.ts:1179` had no `recent`/`history` subcommand check, returning `null`. Argument fell through to topic parsing, launching multi-agent deliberation on topic "recent".
- **Fix:** Added `recent` and `history` to `parseCouncilSubcommand` (`src/council/council.ts:1260-1277`), updated `isRecentArgs` and `parseRecentCount` regex to `/^(?:(?:--?)?(?:recent|history))(?:\s+\d+)?\s*$/i` (`src/council/council-history.ts:81, 91`), dispatched `runCouncilRecentCommand` (`src/council/council.ts:1317-1320`), and added completions to `src/index.ts:1724-1725, 1736`.
- **Regression test:** `tests/council.test.ts` — "D19: /council recent [N] and history [N] subcommand routing & regex"
- **Status:** fixed

#### D20 — Bare keywords recognised only as a leading run; topic prose preserved verbatim
- **Issue:** 07 (P1)
- **Machine / invariant:** CLI Argument & Subcommand Parser (Invariant 2: Bare keywords recognized only in leading run; topic prose intact)
- **Reachable via:** Natural questions containing keyword words anywhere, e.g. `/council Should we save the session state?` or `/council How deep should our verification be?`.
- **Evidence (pre-fix):** `src/council/council.ts:1135-1167` scanned every token unconditionally, consuming `save` as `save: true` and omitting it from the topic (`"Should we the session state?"`), and consuming `deep` as `mode: "deep"`.
- **Fix:** Added `inLeadingKeywords = true` state in `parseCouncilArgs` (`src/council/council.ts:1192`). Explicit `--flags` are recognized anywhere (`council.ts:1196-1211`); bare keywords are only recognized while `inLeadingKeywords` is true (`council.ts:1212-1244`). The first non-keyword token sets `inLeadingKeywords = false`, and all subsequent non-`--` tokens are preserved verbatim in `topicParts`.
- **Regression test:** `tests/council.test.ts` — "D20: Bare keywords only as leading run; topic prose intact"
- **Status:** fixed

#### D21 — Live status-bar indicator stays until binding's next settled `agent_end`
- **Issue:** 07 (P1)
- **Machine / invariant:** Council Deliberation Lifecycle (Invariant 1: Status bar displays active deliberation text until deliberation concludes)
- **Reachable via:** Any `/council <topic>` deliberation invocation.
- **Evidence (pre-fix):** `src/council/council.ts:1296` set the status bar text, and line 1374 immediately cleared it (`setStatus(COUNCIL_STATUS_KEY, undefined)`) in the same synchronous execution turn before subagents were even dispatched.
- **Fix:** Removed immediate synchronous clearing at line 1374. Subscribed to `pi.on("agent_end")` with a one-shot guard in `runCouncilCommand` to clear the status bar on turn settlement (`src/council/council.ts:1399-1404`).
- **Regression test:** `tests/council.test.ts` — "runCouncilCommand: expected exactly 1 setStatus call (start only, not cleared synchronously)"
- **Status:** fixed

#### D22 — Remove dead overlay `s`/`Enter` claims from `commands/council.md`
- **Issue:** 07 (P1)
- **Machine / invariant:** Interactive Verdict Overlay Reducer / Documentation Invariant (AGENTS.md rule 8: never advertise affordances that no handler implements)
- **Reachable via:** LLM agent reading `commands/council.md:62, 192` and describing `s` and `Enter` shortcuts to the user after v0.76.2 removed them.
- **Evidence (pre-fix):** `commands/council.md:62` stated `Use j/k to scroll, s to save, Enter to run /implement with the consensus invariants, Esc/q to dismiss.` Line 192 stated `s to save the record; Enter to dispatch /implement...`.
- **Fix:** Removed `s to save` and `Enter to run /implement` from lines 62 and 192 in `commands/council.md`, leaving `Use j/k to scroll, Esc/q to dismiss.` consistent with v0.76.2 CHANGELOG.
- **Regression test:** Verified via inspection and test suite execution.
- **Status:** fixed

#### D23 — References: failed clone leaves unmanaged leftover directory causing deadlock
- **Issue:** 08 (P1)
- **Machine / invariant:** `ReferenceCorpus` (Invariants I1, I2, I3)
- **Reachable via:** `/reference add <invalid-url>` or interrupted clone leaves empty/partial directory without `.git`. Retrying `add` says it exists (use `update`), `update` says not installed (use `add`), and `list` hid it.
- **Evidence (pre-fix):** `src/features/references.ts:179-191`, `src/core/locators.ts:239`. Partial directory trapped user.
- **Fix:** `src/features/references.ts:180-202` cleans up partial targets on clone failure; detects unmanaged directories on `add` and advises removal with `/reference remove <name>`; `src/core/locators.ts:248-260` exports `listUnmanagedReferences` so `/reference list` displays unmanaged directories.
- **Regression test:** `tests/tools.test.ts` — "D23: Reference - Failed clone leaves partial target, unmanaged directory handling"
- **Status:** fixed

#### D24 — Persona field order-independent (`name:` before `id:`)
- **Issue:** 09 (P2)
- **Machine / invariant:** Council Configuration & YAML Parser (Invariant 3: Persona fields parsed regardless of field order)
- **Reachable via:** `.omp/council.yaml` placing `- name:` before `id:` in persona declarations.
- **Evidence (pre-fix):** `src/council/council.ts:440` required `/^\s*-\s*id:\s*(.+)$/i` to allocate `currentPersona`. If `- name:` came first, the regex failed, `currentPersona` was never allocated, and the persona was silently dropped (`councils["name-first-triad"] === []`).
- **Fix:** Allocated `currentPersona` on any bullet line matching any persona attribute (`id`, `name`, `role`, `prompt`, `color`, `tools`) (`src/council/council.ts:451-489`), and added fallback slug derivation in `pushPersona` (`src/council/council.ts:542`).
- **Regression test:** `tests/council.test.ts` — "D24: Persona order-independent (name: before id:)"
- **Status:** fixed

#### D25 — Councils indented 4 spaces under `councils:` recognized
- **Issue:** 09 (P2)
- **Machine / invariant:** Council Configuration & YAML Parser (Invariant 5: Standard YAML indentation recognized)
- **Reachable via:** `.omp/council.yaml` with 4-space indentation under `councils:`.
- **Evidence (pre-fix):** `src/council/council.ts:427` regex `/^(?:[ \t]{2})?([a-z0-9_-]+):\s*$/i` strictly required 0 or 2 spaces, ignoring 4-space councils (`councils["four-space-triad"] === undefined`).
- **Fix:** Updated council detection to match `^([ \t]*)([a-z0-9_-]+):\s*$` tracking `councilIndent` level, supporting consistent indentation at 0, 2, or 4+ spaces while ignoring deeper persona keys (`src/council/council.ts:430-448`).
- **Regression test:** `tests/council.test.ts` — "D25: Councils indented 4 spaces under councils:"
- **Status:** fixed

#### D26 — Only `tools:` list items become tools (no guideline leak)
- **Issue:** 09 (P2)
- **Machine / invariant:** Council Configuration & YAML Parser (Invariant 4: Only `tools:` items become tools)
- **Reachable via:** `.omp/council.yaml` persona containing non-tool bullet lists (e.g. `guidelines:`, `rules:`).
- **Evidence (pre-fix):** `src/council/council.ts:462` matched any line starting with `- ` as a tool, leaking guideline strings (`"never allocate in ISR"`) into `persona.tools` and causing subagent dispatch failure on invalid tool names.
- **Fix:** Added `inToolsList` state tracking (`src/council/council.ts:390, 468, 505-512`), toggling true only after `tools:` and resetting on any subsequent key, ensuring only tools list items are appended to `persona.tools`.
- **Regression test:** `tests/council.test.ts` — "D26: Only tools: list items become tools (no guideline leak)"
- **Status:** fixed

#### D27 — Unknown `default:` falls back to `default-triad`
- **Issue:** 09 (P2)
- **Machine / invariant:** Council Configuration & YAML Parser (Invariant 2: `defaultCouncil` must exist in `config.councils`)
- **Reachable via:** `.omp/council.yaml` setting `default: nonexistent-council`.
- **Evidence (pre-fix):** `src/council/council.ts:473-475` ternary else branch evaluated `: explicitDefaultCouncil || "default-triad"`, which returned the non-existent council name, violating invariant that `defaultCouncil in councils`.
- **Fix:** Changed ternary else branch to `: "default-triad"` (`src/council/council.ts:520-522`).
- **Regression test:** `tests/council.test.ts` — "D27: Unknown default: falls back to default-triad"
- **Status:** fixed

#### D28 — Subagent session_start wipes parent session counters and detail ring
- **Issue:** 10 (P2)
- **Machine / invariant:** Ingest Counter & Status Widget — Invariant 2; Guardrail Block Counter & Detail Ring — Invariant 3.
- **Reachable via:** Main session ingests records or incurs blocks. A background task subagent starts (`hasUI: false`, its own `session_start`). Pre-fix module-level `resetSession()` reset shared counters `blockCount = 0`, `recordCount = 0`, `blockDetails = []`.
- **Evidence (pre-fix):** `src/knowledge/kb-guard-status.ts:45-49,71-74,117-122`, `src/knowledge/kb-ingest-status.ts:31-35,56-59,135-140`. Repro output: `Parent state after subagent session_start: Block count: 0, Record count: 0`.
- **Fix:** `src/knowledge/kb-guard-status.ts:45-62,151-168`, `src/knowledge/kb-ingest-status.ts:31-54,178-193`. Keyed state in `sessionGuardStates` and `sessionIngestStates` maps by session ID (`sessionIdOf(ctx)`). Ignored subagent `session_start` from resetting active main session state.
- **Follow-up (review):** the per-session maps are released on `session_shutdown` (every disposed session, including each finished task subagent, emits it on its own binding), and the read accessors no longer create entries — otherwise every subagent left a permanent entry in the process-shared map. Verified with a throwaway probe: counts 1/1 before shutdown, entry gone after.
- **Regression test:** `tests/knowledge.test.ts` — "D28: Subagent session_start must not wipe parent session counters".
- **Status:** fixed

#### D29 — Counters and cwd survive /new and session switch
- **Issue:** 10 (P2)
- **Machine / invariant:** Ingest Counter & Status Widget — Invariant 3; Guardrail Block Counter & Detail Ring — Invariant 3.
- **Reachable via:** User works in session A, generating blocks and records. User executes `/new` (or resume/switch). Runtime emits `session_switch`, `session_branch`, `session_tree` without emitting `session_start`. Pre-fix modules did not subscribe to session switch events, leaving stale counts on status bar and in prompt.
- **Evidence (pre-fix):** `src/knowledge/kb-guard-status.ts:116-126`, `src/knowledge/kb-ingest-status.ts:134-144`.
- **Fix:** `src/knowledge/kb-guard-status.ts:170-186`, `src/knowledge/kb-ingest-status.ts:195-215`. Subscribed both modules to `session_switch`, `session_branch`, and `session_tree` to switch `currentSessionId`, initialize fresh 0 counts for new sessions, sync UI, and refresh status bar.
- **Regression test:** `tests/knowledge.test.ts` — "D29: Session switch resets/isolates counts for new session".
- **Status:** fixed

#### D30 — Ingest counter increments on speculative tool_call before execution outcome
- **Issue:** 10 (P2)
- **Machine / invariant:** Ingest Counter & Status Widget — Invariant 1.
- **Reachable via:** Model attempts write to `.omp/knowledge/records/`. Pre-execution `tool_call` handler immediately bumped counter. If the write failed, was blocked by downstream policy, or was retried, counter remained inflated. Retries caused duplicate counting.
- **Evidence (pre-fix):** `src/knowledge/kb-ingest-status.ts:144-164`. Repro output: `Initial: 0, after failed write: 1, after retry write: 2`.
- **Fix:** `src/knowledge/kb-ingest-status.ts:67-83,222-237`. Removed ingest counting from `tool_call`. Subscribed to post-execution `tool_result` event, verifying `toolName === "write"`, `!event.isError`, and `existsSync(target)`. Maintained an `ingestedPaths: Set<string>` per session to deduplicate writes targeting the same file.
- **Regression test:** `tests/knowledge.test.ts` — "D30: Ingest counted on tool_result success, not speculative tool_call; deduplicated".
- **Status:** fixed

#### D31 — Status bar widgets never render in production because setStatusFn is uninitialized
- **Issue:** 10 (P2)
- **Machine / invariant:** Ingest Counter & Status Widget — Invariant 4; Guardrail Block Counter & Detail Ring — Invariant 4.
- **Reachable via:** Normal production startup. Neither `kb-guard-status` nor `kb-ingest-status` captured `ctx.ui.setStatus` from event contexts, leaving `setStatusFn` `undefined`. `refreshStatus()` returned early every time.
- **Evidence (pre-fix):** `src/knowledge/kb-guard-status.ts:51-53,105-108`, `src/knowledge/kb-ingest-status.ts:37-39,91-94`. Repro output: `Status bar calls made to UI: 0`.
- **Fix:** `src/knowledge/kb-guard-status.ts:148-153`, `src/knowledge/kb-ingest-status.ts:173-177`. Added `syncUi(ctx)` in event handlers to capture `ctx.ui.setStatus` whenever `ctx.hasUI !== false` and `ctx.ui.setStatus` is present.
- **Regression test:** `tests/knowledge.test.ts` — "D31: ctx.ui.setStatus wired and called".
- **Status:** fixed

#### D32 — Status text suppressed when cwd is repo subdirectory or in audit-only repository
- **Issue:** 10 (P2)
- **Machine / invariant:** Ingest Counter & Status Widget — Invariant 4; Guardrail Block Counter & Detail Ring — Invariant 4.
- **Reachable via:** User or agent starts omp from a subdirectory (e.g. `repo/packages/core`) or in an audit-only workspace without `.omp/knowledge`. `formatStatusText` checked only immediate `join(rootCwd, ".omp", "knowledge")`, returning `undefined` and hiding status widgets.
- **Evidence (pre-fix):** `src/knowledge/kb-guard-status.ts:97-102`, `src/knowledge/kb-ingest-status.ts:82-88`. Repro output: `Guard status from subDir: undefined`, `Ingest status from subDir: undefined`, `Guard status for audit-only repo: undefined`.
- **Fix:** `src/knowledge/kb-guard-status.ts:120-133`, `src/knowledge/kb-ingest-status.ts:114-126`. Resolved root using `findKnowledgeRoot(rootCwd)`. For `kb-guard-status`, checked presence of either `.omp/knowledge` or `.omp/audits`.
- **Regression test:** `tests/knowledge.test.ts` — "D32: formatStatusText from repo subdirectory and audit-only repo".
- **Status:** fixed

#### D33 — readKnowledge side-effect creates .omp/knowledge directory structure on read-only queries
- **Issue:** 10 (P2)
- **Machine / invariant:** Knowledge Base Query Engine — Invariant 1.
- **Reachable via:** Calling `readKnowledge` or `knowledge_read` tool with `type: "audits"` or `"records"` on a clean directory. Line 273 called `ensureKnowledgeDirs(root)` which executed `mkdirSync` to create `.omp/knowledge/{records,pitfalls,research}`.
- **Evidence (pre-fix):** `src/knowledge/knowledge.ts:273`.
- **Fix:** `src/knowledge/knowledge.ts:275`. Replaced `ensureKnowledgeDirs(root)` with read-only path resolution `const base = join(root, ".omp", "knowledge");` and removed unused import.
- **Regression test:** `tests/knowledge.test.ts` — "D33: readKnowledge must never create .omp/knowledge directory".
- **Status:** fixed

#### D34 — Workspace: workspaceCache caches fallback (non-repo) results permanently
- **Issue:** 11 (P2)
- **Machine / invariant:** `WorkspaceContextResolver` (Invariant I1)
- **Reachable via:** Calling `getWorkspaceContext(dir)` before `.git` or `.omp` exists caches `isRepo: false`. If `git init` or `/omp-setup` is run later, the cached context permanently reports `isRepo: false`.
- **Evidence (pre-fix):** `src/core/workspace.ts:165` always called `workspaceCache.set(resolvedStart, ctx)` regardless of `isRepo`.
- **Fix:** `src/core/workspace.ts:171-173` only caches in `workspaceCache` when `isRepo === true`.
- **Regression test:** `tests/tools.test.ts` — "D34: Workspace - Do not cache fallback (non-repo) results"
- **Status:** fixed

#### D35 — Workspace: nested weak markers shadow enclosing git root
- **Issue:** 11 (P2)
- **Machine / invariant:** `WorkspaceContextResolver` (Invariant I2)
- **Reachable via:** In a git repo with a nested directory containing `.scratch` or `scripts/routines`, `findRepoRoot` from within that nested directory stopped at the weak marker instead of ascending to `.git`.
- **Evidence (pre-fix):** `src/core/workspace.ts:47-54` checked `.git`, `.omp`, `.scratch`, and `scripts/routines` in a single pass from child to parent.
- **Fix:** `src/core/workspace.ts:46-66` uses a two-pass resolution: pass 1 checks strong markers (`.git`, `.omp`) anywhere up the tree excluding `join(os.homedir(), ".omp")` (omp user config directory); pass 2 checks weak markers (`.scratch`, `scripts/routines`). Similarly, routines' fallback marker search in `src/features/routines.ts:230` excludes `homedir()`.
- **Regression test:** `tests/tools.test.ts` — "D35: Workspace - .git/.omp take precedence over weak markers (.scratch, scripts/routines) anywhere up tree"
- **Status:** fixed

#### D36 — Routines: repoRootCache never notices a manifest created later
- **Issue:** 11 (P2)
- **Machine / invariant:** `RoutinesExecution` (Invariant I4)
- **Reachable via:** `findRoutinesRepoRoot` cached fallback directory roots. If a manifest was created later in a subproject, `findRoutinesRepoRoot` returned the stale cached root.
- **Evidence (pre-fix):** `src/features/routines.ts:229` called `repoRootCache.set(startDir, dir)` for fallback non-manifest markers.
- **Fix:** `src/features/routines.ts:210-240` validates that cached roots still contain `scripts/routines/manifest.json` and does not cache fallback marker paths.
- **Regression test:** `tests/tools.test.ts` — "D36: Routines - repoRootCache picks up a manifest created later"
- **Status:** fixed

#### D37 — SF-3: Clarify bypassNextTurn stuck on aborted prompt / slash command
- **Issue:** 12 (P2)
- **Machine / invariant:** Clarify Prompt Interception Machine / `I1`, `I3`
- **Reachable via:** User enters `~/timeline` or aborts a `~` prompt; `agent_end` never fires, leaving `bypassNextTurn = true` indefinitely.
- **Evidence (pre-fix):** Subsequent normal prompts had clarification permanently disabled.
- **Fix:** Switched from boolean flag to `pendingBypasses` Set keyed by stripped prompt text and consumed in `before_agent_start`.
- **Residual (accepted):** an aborted `~text` leaves `text` pending, so a later prompt with the identical text skips clarification once; the set is capped at 16 and ignores slash commands.
- **Regression test:** `tests/features.test.ts` — "clarify: aborted tilde command permanently suppressed clarification on subsequent normal prompt"
- **Status:** fixed

#### D38 — SF-4: Clarify bypassNextTurn cleared by concurrent subagent
- **Issue:** 12 (P2)
- **Machine / invariant:** Clarify Prompt Interception Machine / `I1`, `I2`
- **Reachable via:** Main session enters `~prompt`; concurrent background subagent completes and fires `agent_end`, resetting module-level `bypassNextTurn`.
- **Evidence (pre-fix):** Parent prompt unexpectedly had guidelines injected.
- **Fix:** Removed `agent_end` reset; bypasses are consumed strictly by `before_agent_start` of the matching prompt.
- **Regression test:** `tests/features.test.ts` — "clarify: ~ prefixed prompt was not bypassed"
- **Status:** fixed

#### D39 — Triage: ready-for-agent canonical label classified as unlabeled
- **Issue:** 13 (P2)
- **Machine / invariant:** `BacklogTriageClassifier` (Invariant I2)
- **Reachable via:** Ticket marked with canonical `status: ready-for-agent` had `agent_ready === 0` and was counted in `unlabeled`.
- **Evidence (pre-fix):** `src/index.ts:246` checked only `agent-ready` and `agent_ready`.
- **Fix:** `src/index.ts:251-256` adds `ready-for-agent` and `ready_for_agent` to `agentReady` classification.
- **Regression test:** `tests/tools.test.ts` — "D39: Triage - Recognise 'ready-for-agent' and 'ready_for_agent'"
- **Status:** fixed

#### D40 — Triage: non-issue markdown files counted as tickets
- **Issue:** 13 (P2)
- **Machine / invariant:** `BacklogTriageClassifier` (Invariant I1)
- **Reachable via:** Having `spec.md` or `.omp/scratch/debates/*.md` inflated `total_items` and `unlabeled`.
- **Evidence (pre-fix):** `src/index.ts:224-227` collected any `.md` file in any subdirectory of `.scratch`.
- **Fix:** `src/index.ts:227-231` verifies `basename(dir) === "issues"` before collecting markdown files.
- **Regression test:** `tests/tools.test.ts` — "D40: Triage - Count only issue files, not specs or debates"
- **Status:** fixed

#### D41 — Audit: status regex captures inline YAML comments
- **Issue:** 13 (P2)
- **Machine / invariant:** `AuditCardStatus` (Invariant I1)
- **Reachable via:** `status: active # comment` resulted in `payload.status` containing `"active # comment"`.
- **Evidence (pre-fix):** `src/index.ts:161-162` used greedy capture `[^"'\r\n]+`.
- **Fix:** `src/index.ts:162` strips `/#.*$/` and trims.
- **Regression test:** `tests/tools.test.ts` — "D41: Audit - Strip YAML comments from audit status"
- **Status:** fixed

#### D42 — Frontier: ticket slug collision across features breaks DAG dependency resolution
- **Issue:** 13 (P2)
- **Machine / invariant:** `FrontierTicketWalker` (Invariant I1)
- **Reachable via:** Feature A has resolved `001.md`; Feature B has open `001.md` and `002.md` (`Blocked by: 001`). `findFrontierTicket` considered `002.md` unblocked because `001` was resolved in Feature A.
- **Evidence (pre-fix):** `src/core/locators.ts:457` collected all resolved slugs into a single flat `Set<string>`.
- **Fix:** `src/core/locators.ts:474-489` scopes resolved ticket sets by `t.feature`.
- **Regression test:** `tests/tools.test.ts` — "D42: Frontier - Blockers resolve within same feature"
- **Status:** fixed

#### D43 — Routines: execution error message suppressed in tool content when stdout is non-empty
- **Issue:** 14 (P2)
- **Machine / invariant:** `RoutinesExecution` (Invariant I2)
- **Reachable via:** Routine fails or aborts after producing stdout; `content[0].text` showed only partial stdout with no error explanation.
- **Evidence (pre-fix):** `src/features/routines.ts:440` guarded error message with `if (error && !stdout && !stderr)`.
- **Fix:** `src/features/routines.ts:457-461` includes `Execution error: ...` or exit code whenever an error or non-zero exit occurs.
- **Regression test:** `tests/tools.test.ts` — "D43 & D44: Routines - Tool content has error/timeout on failure even with stdout, corrupt manifest stops run"
- **Status:** fixed

#### D44 — Routines: corrupt manifest silently drops parameter defaults
- **Issue:** 14 (P2)
- **Machine / invariant:** `RoutinesExecution` (Invariant I1)
- **Reachable via:** `scripts/routines/manifest.json` contains syntax error or partial write; `run_routine` catches and swallows error, executing script with zero parameter defaults.
- **Evidence (pre-fix):** `src/features/routines.ts:312-314` had empty `catch {}`.
- **Fix:** `src/features/routines.ts:316-330` returns an error ToolResult reporting corrupt manifest and halting execution.
- **Regression test:** `tests/tools.test.ts` — "D43 & D44: Routines - Tool content has error/timeout on failure even with stdout, corrupt manifest stops run"
- **Status:** fixed

#### D45 — SF-5: Tilt recording in subdirectories
- **Issue:** 15 (P2)
- **Machine / invariant:** Tilt DEFCON Swear Jar Machine / `I1`
- **Reachable via:** Typing profanity when current directory is a repo subdirectory.
- **Evidence (pre-fix):** `recordTiltIncident` used `process.cwd()`, saving `.omp/tilt.json` into the subdirectory.
- **Fix:** Resolved root via `findRepoRoot(startDir)` in `recordTiltIncident` and renderer fallback.
- **Regression test:** `tests/features.test.ts` — "tilt: incident in subdir did not record to repo root"
- **Status:** fixed

#### D46 — SF-6: Tilt session_strikes persisted across restarts
- **Issue:** 15 (P2)
- **Machine / invariant:** Tilt DEFCON Swear Jar Machine / `I2`
- **Reachable via:** Incurring strikes in session A; restarting or switching sessions left DEFCON locked at 1.
- **Evidence (pre-fix):** `session_strikes` was loaded from disk and never reset.
- **Fix:** Tracked active session strikes in memory keyed by session ID (`sessionStrikesBySession`), recalculating DEFCON dynamically.
- **Follow-up (review):** `session_shutdown` releases the disposed session's entry in `sessionStrikesBySession`.
- **Regression test:** `tests/features.test.ts` — "tilt: session_strikes bled into fresh session sess-2"
- **Status:** fixed

#### D47 — SF-7: Tilt corrupt file wipe & non-atomic writes
- **Issue:** 15 (P2)
- **Machine / invariant:** Tilt DEFCON Swear Jar Machine / `I3`, `I4`
- **Reachable via:** Partial write or syntax error in `tilt.json`; read fallback returned 0 strikes, overwriting the file.
- **Evidence (pre-fix):** `writeLocalTilt` and `writeGlobalTilt` used direct `writeFileSync`; corrupt JSON caught and overwritten with empty defaults.
- **Fix:** Added `atomicWriteJson` (temp file + rename) and `quarantineCorruptFile` (moves corrupt file to `*.corrupt.<timestamp>`).
- **Regression test:** `tests/features.test.ts` — "tilt: corrupt tilt.json was not quarantined"
- **Status:** fixed

#### D48 — `ResearchOverlay` Enter action on phase 3 project dispatches non-slash prose instruction as command
- **Issue:** 16 (P3)
- **Machine / invariant:** Interactive Research Dashboard Overlay Component, Invariant I1
- **Reachable via:** User opens overlay on a Phase 3 project and presses Enter.
- **Evidence (pre-fix):** `runCommandForActive()` returned prose string `"View .omp/.../report.md for the full report"`, which command dispatcher rejected as unrecognized.
- **Fix:** `runCommandForActive()` requires commands to start with `"/"`; for Phase 3, returns `/research status <slug>`. `handleInput` guards `cmd.startsWith("/")`.
- **Regression test:** `tests/research.test.ts` — "D48: ResearchOverlay Enter action on phase 3 project dispatches slash command, not prose"
- **Status:** fixed

#### D49 — Project switching in `ResearchOverlay` retains stale scroll offsets across inactive tabs
- **Issue:** 16 (P3)
- **Machine / invariant:** Interactive Research Dashboard Overlay Component, Invariant I2
- **Reachable via:** User scrolls on `items` tab of Project 1, switches to `overview` tab, and cycles to Project 2.
- **Evidence (pre-fix):** `cycleProject` only reset `scrollOffsets[activeTab]`, leaving inactive tabs' offsets non-zero.
- **Fix:** `cycleProject` and `setActiveSlug` iterate all `TABS` resetting `scrollOffsets[tab] = 0`.
- **Regression test:** `tests/research.test.ts` — "D49: Project switching in ResearchOverlay resets all scroll offsets"
- **Status:** fixed

#### D50 — Inability to dismiss `ResearchOverlay` with `q` or `Ctrl+C` while project picker is open
- **Issue:** 16 (P3)
- **Machine / invariant:** Interactive Research Dashboard Overlay Component, Invariant I3
- **Reachable via:** User presses `p` to open project picker, then presses `q` or `Ctrl+C`.
- **Evidence (pre-fix):** `handleInput` ignored `q` and `\x03` inside `if (this.state.showProjectPicker)`, trapping user in modal.
- **Fix:** Added `if (key === "q" || key === "\x03") return { action: "dismiss" }` inside the project picker block.
- **Regression test:** `tests/research.test.ts` — "D50: q and Ctrl+C dismiss overlay while project picker is open"
- **Status:** fixed

#### D51 — herdr: prompt waits only for blocked; normal completion causes full timeout
- **Issue:** 17 (P1)
- **Machine / invariant:** `HerdrAgentSettlement` (Invariant I1)
- **Reachable via:** `herdr_agent prompt` dispatched `agent send` then waited with `agent wait --status blocked`. Normal completion to `idle` stalled for 60s.
- **Evidence (pre-fix):** `src/features/herdr-tools.ts:412-421`.
- **Fix:** `src/features/herdr-tools.ts:423-440` invokes `herdr agent prompt <target> <text> --wait --until idle --until done --until blocked --timeout <ms>`.
- **Regression test:** `tests/tools.test.ts` — "D51 & D52: herdr agent settlement & CLI argument compliance"
- **Status:** fixed

#### D52 — herdr: CLI rejects agent send and agent wait --status
- **Issue:** 17 (P1)
- **Machine / invariant:** `HerdrAgentSettlement` (Invariants I2, I3, I4)
- **Reachable via:** herdr 0.8.2 CLI rejects `agent wait --status` (`unknown option: --status`) and has no `agent send` subcommand.
- **Evidence (pre-fix):** Running `herdr agent wait --status` exits with error; `herdr agent send` does not exist.
- **Fix:** `src/features/herdr-tools.ts:454` uses `--until`; `src/features/herdr-tools.ts:468` maps `send` action to `["agent", "prompt", target, text]` (0.8.2 submit without `--wait`).
- **Regression test:** `tests/tools.test.ts` — "D51 & D52: herdr agent settlement & CLI argument compliance"
- **Status:** fixed

#### D53 — System prompt contributors treat `systemPrompt: string[]` as a string
- **Issue:** 18 (P0)
- **Machine / invariant:** System Prompt Contributor Chain — I1, I2; KB Index Injector — I1.
- **Reachable via:** any prompt in a repo with `.omp/knowledge/` entries. The KB injector bails (`typeof systemPrompt !== "string"`) so the index never reaches the model. Clarify's handler string-appends to the array whenever clarify is on **or** the prompt matches a KB entry: `Array.prototype.toString` comma-joins every runtime block into one string, which the runtime then wraps as a single block.
- **Evidence (pre-fix):** installed omp 18.17.0 `emitBeforeAgentStart` passes `systemPrompt: u` with `u = typeof p.systemPrompt === "string" ? [p.systemPrompt] : p.systemPrompt` and `buildSystemPromptForAgentStart` returns `[...u, a]`; reference `extensions/types.ts:756-761` (`systemPrompt: string[]`). Real-runtime smoke (`omp -p` in a fixture repo, provider payload captured by a probe extension on `before_provider_request`): HEAD → **1** system block of 19 457 chars containing `</critical>,<project-context>`, no `## Active knowledge base`; fixed → **4** blocks `[15013, 4238, 240, 204]` = 2 runtime blocks untouched + KB index + `<relevant-knowledge>`. The test mock chained raw strings, which hid both failures.
- **Fix:** `src/core/api.ts` `BeforeAgentStartEvent` / `asBeforeAgentStartEvent`; `kb-index-injector.ts:93-103` and `clarify.ts:169-214` append tail blocks; mock parity in `tests/test-utils.ts:199-209`; AGENTS.md §8 / §9.7 restated for `string[]`.
- **Regression test:** `tests/knowledge.test.ts` — "D53: base system prompt blocks were rewritten" / "D53: KB index section missing from the system prompt".
- **Status:** fixed (verified in the real runtime)

#### D54 — Council verdict overlay hardcodes three persona tabs
- **Issue:** 19 (P2)
- **Machine / invariant:** Interactive Verdict Overlay Reducer — I2, I3.
- **Reachable via:** any council in `.omp/council.yaml` with ≠ 3 personas, opened with `/council overlay <topic>`. With 5 personas, digit `5`/`6` and Tab cycling never reach personas 4–5; with 2, the bar shows a phantom `[4] Persona C — no opinion recorded`.
- **Evidence (pre-fix):** `src/council/council-overlay.ts:39,62-75` — `CouncilOverlayTab` union, `TABS`, `TAB_KEY_INDEX` (`1`–`4`), `TAB_LABELS` fixed at three personas; repro: `key '6' on 5-opinion verdict should select persona-4, got: verdict`.
- **Fix:** Tabs derived from `verdict.opinions` (`getTabs`), digits `1..min(9, tabs)`, Tab/Shift+Tab wrap over the real tabs, `setVerdict` keeps `activeTab` valid and rebuilds clamped offsets; the tab bar keeps `Persona A…` labels and is truncated to the overlay width. `commands/council.md` and `skills/council/SKILL.md` describe `[2..N+1]` persona tabs and no longer advertise the undispatched `s`/`Enter` actions in the `overlay` keyword line (completes D22).
- **Regression test:** `tests/council.test.ts` — "COUNCIL-9: key '6' on 5-opinion verdict should select persona-4", "COUNCIL-9: 2-opinion overlay must not render phantom third persona tab", "COUNCIL-9: setVerdict should fall back to verdict when active persona no longer exists".
- **Status:** fixed

#### D55 — `/audit list` shows only the newest audit
- **Issue:** 20 (P2)
- **Machine / invariant:** Audit Report Lifecycle (read side) — `list` enumerates every report; argument completion promises "List all audit reports".
- **Reachable via:** `/audit list` with more than one report under `.omp/audits/`: the handler shared the `status`/`view` branch, computed `targetSlug = ""`, and `getAuditCardPayload(root, "")` picked one entry by reverse name order.
- **Evidence (pre-fix):** `src/index.ts:901-905`; repro (3 audits): `D55: /audit list did not show audit "alpha" (shown: legacy)`.
- **Fix:** `list` has its own branch: one `audit-card` per slug from `listAuditSlugs`, newest report first (mtime), zero-turn; empty → notice naming `/audit <topic>`. Verified in the real runtime (`omp --mode rpc`): 3 cards, `Found 3 audit report(s)`.
- **Regression test:** `tests/commands.test.ts` — "D55: /audit list did not show audit …", "D55: /audit list queued an agent turn".
- **Status:** fixed

#### D56 — `/reference add` of a different repository with the same basename points at the wrong repository
- **Issue:** 21 (P2)
- **Machine / invariant:** Reference Corpus — one directory per repository; every refusal names an action that works.
- **Reachable via:** `/reference add https://github.com/org1/engine`, then `/reference add https://github.com/org2/engine`: `deriveReferenceName` keeps only the last URL segment, the target exists, and the guidance says `use /reference update engine` — which pulls org1. No command could add org2's repository: a stuck state.
- **Evidence (pre-fix):** `src/features/references.ts:188` emitted the update hint unconditionally; repro: `Reference — .omp/references/engine already exists — use /reference update engine`.
- **Fix:** `/reference add <url> [name]` (name validated as one safe path segment by `safeReferenceTarget`). An existing target's `origin` is compared with the requested URL (`normalizeRepoUrl`: trailing `/` and `.git` ignored): same → update hint; different → `already exists (origin: …) — use /reference add <url> <other-name>`; non-git leftover → `/reference remove` hint (D23).
- **Regression test:** `tests/tools.test.ts` — "TOOLSPROTO-12: References - Repo Name Collision & Custom Directory Name Support".
- **Status:** fixed

### 7.3 Additional findings fixed during the audit

Findings from the mapping pass outside D01–D56, re-checked against a real entry point before fixing.

#### X-COREDISPATCH-14 — Research review overlay `handleInput` returns `undefined` while dashboard returns action, breaking key routing contract in custom overlay component
- **Machine / invariant:** Interactive Research Dashboard Overlay Component, Invariant I4
- **Reachable via:** User opens review overlay in interactive TUI; key events are consumed without forwarding action to runtime.
- **Evidence (pre-fix):** `src/index.ts:604-607` (original line numbers) wrapped `handleInput` without `return act;`, and returned `Container` instead of `renderLines`.
- **Fix:** Returned `overlay.renderLines(width, height)` in `render` and `return act;` in `handleInput`.
- **Regression test:** `tests/research.test.ts` — "X-COREDISPATCH-14: Review overlay handleInput wrapper returns action"
- **Status:** fixed

#### X-COUNCIL-11 — `saveCouncilRecord` date-slug filename collision silently overwrites previous deliberations
- **Machine / invariant:** Decision Record Persistence (Invariant 1: Avoid same-day collision overwrites)
- **Reachable via:** Running `/council save` multiple times on the same topic on the same day.
- **Evidence (pre-fix):** `src/council/council.ts:810-812` wrote directly to `${dateStr}_${slug}.md`, overwriting earlier records and cryptographic signatures.
- **Fix:** Checked `existsSync(targetPath)` and incremented suffix `_2.md`, `_3.md` before writing (`src/council/council.ts:862-868`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-11: saveCouncilRecord avoids date-slug collisions"
- **Status:** fixed

#### X-COUNCIL-12 — `parseDebateFrontmatter` completely fails on CRLF files
- **Machine / invariant:** Decision Record Persistence (Invariant 2: Frontmatter parser tolerates CRLF line endings)
- **Reachable via:** Reading debate records on Windows or checkouts with CRLF line endings via `/council recent`.
- **Evidence (pre-fix):** `src/council/council-history.ts:145` regex `/^---\n([\s\S]*?)\n---/` failed on `\r\n`, returning default empty frontmatter.
- **Fix:** Changed regex to `/^---\r?\n([\s\S]*?)\r?\n---/` and split lines on `/\r?\n/` (`src/council/council-history.ts:146, 149`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-12: parseDebateFrontmatter tolerates CRLF line endings"
- **Status:** fixed

#### X-COUNCIL-13 — History card ANSI row calculation truncates metadata tail (`🔏 signed` / `unsigned`)
- **Machine / invariant:** Decision Record Persistence (Invariant 4: History card renders metadata badges without truncation)
- **Reachable via:** Running `/council recent` with debate records containing moderately long topics (~40 chars).
- **Evidence (pre-fix):** `src/council/council-history.ts:282` undercounted the date prefix width by 6 characters, producing 80-column lines truncated by `boxLine` into `...`.
- **Fix:** Calculated `topicBudget` using `inner - displayWidth(prefix) - metaWidth` where `prefix = ` [${date}] `` (`src/council/council-history.ts:286-288`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-13: renderCouncilHistoryCard preserves metadata badges without truncation"
- **Status:** fixed

#### X-COUNCIL-15 — Persisted debate records do not save `publicKey`, making Ed25519 signatures un-verifiable
- **Machine / invariant:** Decision Record Persistence (Invariant 3: Saved records contain verifiable signatures with public key)
- **Reachable via:** Calling `verifyCouncilSignature` against saved debate records.
- **Evidence (pre-fix):** `src/council/council.ts:821` wrote `signature_ed25519` to frontmatter but omitted `publicKey`, leaving verifiers with no key to verify the signature.
- **Fix:** Serialized `public_key_ed25519` into frontmatter with newline escaping (`src/council/council.ts:879`), and parsed it in `parseDebateFrontmatter` (`src/council/council-history.ts:47, 184`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-15: saveCouncilRecord persists public_key_ed25519"
- **Status:** fixed

#### X-COUNCIL-16 — Overlay `setVerdict` leaves out-of-bounds scroll offsets
- **Machine / invariant:** Interactive Verdict Overlay Reducer (Invariant 2: Scroll offsets clamped across verdict updates)
- **Reachable via:** Calling `setVerdict` with a shorter verdict while scrolled down on previous verdict.
- **Evidence (pre-fix):** `src/council/council-overlay.ts:127` left `state.scrollOffsets` untouched, causing sudden jumps on subsequent scrolling.
- **Fix:** In `setVerdict`, reset all tab scroll offsets to 0 (`src/council/council-overlay.ts:129-131`).
- **Regression test:** `tests/council.test.ts` — verified in overlay lifecycle suite.
- **Status:** fixed

#### X-COUNCIL-7 — Star Chamber partitioner treats duplicate invariants from 1 persona as unanimous consensus
- **Machine / invariant:** Star Chamber Semantic Consensus Partitioner (Invariant 1: Consensus requires unanimous confirmation across distinct personas)
- **Reachable via:** Single persona repeating an invariant 3 times across sections or prompt bullets.
- **Evidence (pre-fix):** `src/council/council.ts:650-659` incremented occurrence count rather than distinct persona count, falsely promoting repeated single-persona invariants to unanimous 3/3 consensus.
- **Fix:** Deduplicated `op.keyInvariants` per persona using `seenForPersona = new Set<string>()` and tracked support via `personas: Set<string>` (`src/council/council.ts:696-708`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-7: partitionCouncilOpinions deduplicates invariants per persona"
- **Status:** fixed

#### X-COUNCIL-8 — Overlay handles input after completion, invoking `onDone` multiple times
- **Machine / invariant:** Interactive Verdict Overlay Reducer (Invariant 1: `onDone` called at most once; subsequent input ignored)
- **Reachable via:** Buffered keystrokes arriving during modal dismissal or teardown.
- **Evidence (pre-fix):** `src/council/council-overlay.ts:334-377` had no completion flag, allowing subsequent keystrokes after dismissal to re-invoke `this.onDone`.
- **Fix:** Added `private done = false;` guard to `CouncilOverlay`; sets `this.done = true` on first action and immediately returns `undefined` if `this.done` is true (`src/council/council-overlay.ts:108, 338, 340, 367, 373`).
- **Regression test:** `tests/council.test.ts` — "X-COUNCIL-8: CouncilOverlay ignores input after completion"
- **Status:** fixed

#### X-KNOWLEDGE-8 — readKnowledge type="index" returns oldest entries from top instead of newest from tail
- **Machine / invariant:** Knowledge Base Query Engine — Invariant 2.
- **Reachable via:** Running `knowledge_read` tool with `type: "index"`. Pre-fix `lines.slice(0, limit)` returned the file header `# Knowledge Base Index` and oldest entries recorded months ago.
- **Evidence (pre-fix):** `src/knowledge/knowledge.ts:404-419`.
- **Fix:** `src/knowledge/knowledge.ts:415-423`. Filtered out markdown header lines (`!l.trim().startsWith("#")`) and sliced the newest entries from the tail (`lines.slice(-limit)`).
- **Regression test:** `tests/knowledge.test.ts` — "X-KNOWLEDGE-8: readKnowledge type='index' should return newest tail entries".
- **Status:** fixed

#### X-KNOWLEDGE-9 — findRelevantKnowledge drops multiple research project matches due to duplicate seenPaths key
- **Machine / invariant:** Knowledge Relevance Retrieval Engine — Invariants 1, 2.
- **Reachable via:** Prompt matching multiple research projects listed in `INDEX.md`. Regex matched only `pitfalls` and `records`, defaulting `refPath` to `".omp/knowledge/INDEX.md"` for research lines. Second matching project hit `seenPaths.has(".omp/knowledge/INDEX.md")` and was discarded.
- **Evidence (pre-fix):** `src/knowledge/knowledge.ts:74-76,82-86`. Repro output: second research project dropped from hits.
- **Fix:** `src/knowledge/knowledge.ts:25,74-75,82-88`. Broadened `pathMatch` to `(pitfalls|records|research)`, allowing each research project its unique `refPath`, and classified kind as `"research"`.
- **Regression test:** `tests/knowledge.test.ts` — "X-KNOWLEDGE-9: findRelevantKnowledge with multiple research projects".
- **Status:** fixed

#### X-RESEARCH-11 — `derivePipelineStatus` prioritizes stale explicit status over generated `report.md`
- **Machine / invariant:** Research Project On-Disk Lifecycle, Invariant I1
- **Reachable via:** Project completes report generation writing `report.md`, but front-matter still records `status: CONVERGED` or `RUNNING`.
- **Evidence (pre-fix):** `src/research/research-status.ts:58` checked `facts.explicit` before `facts.hasReport`, locking project in Phase 2.
- **Fix:** Reordered checks in `derivePipelineStatus` so `facts.hasReport` returns `"REPORT_READY"` before evaluating `facts.explicit`.
- **Regression test:** `tests/research.test.ts` — "X-RESEARCH-11: derivePipelineStatus prioritizes report.md over stale explicit status"
- **Status:** fixed

#### X-SF-10 — Hindsight config reload on session_stop
- **Machine / invariant:** Hindsight Reflection Loop Machine / `I5`
- **Reachable via:** Editing `~/.omp/hindsight.json` while session is running.
- **Evidence (pre-fix):** `session_stop` never called `reloadHindsightConfig()`.
- **Fix:** Added `reloadHindsightConfig()` inside `session_stop` handler.
- **Regression test:** `tests/features.test.ts` — "hindsight: session_stop did not reload updated config file from disk"
- **Status:** fixed

#### X-SF-8 — Timeline commit title truncation with pipe character
- **Machine / invariant:** Timeline History Aggregator / `I1`
- **Reachable via:** Running `/timeline` in a repository with commit subject containing `|`.
- **Evidence (pre-fix):** `line.split("|")` took index 3, truncating everything after the first pipe.
- **Fix:** Joined remaining slices with `parts.slice(3).join("|")`.
- **Regression test:** `tests/features.test.ts` — "timeline: commit subject truncated at pipe"
- **Status:** fixed

#### X-SF-9 — Clarify duplicate command registration
- **Machine / invariant:** Clarify Prompt Interception Machine / `I4`
- **Reachable via:** `installClarify` registering `pi.registerCommand("clarify")` without completions, shadowing `COMMANDS`.
- **Evidence (pre-fix):** `installClarify` had redundant `registerCommand`.
- **Fix:** Removed duplicate `registerCommand("clarify")` from `installClarify`.
- **Regression test:** none — registration wiring; `/clarify` stays in `EXPECTED_COMMANDS` (commands suite).
- **Status:** fixed

#### X-TOOLSPROTO-11 — Herdr: regex compilation failure & empty match in wait_output
- **Machine / invariant:** `HerdrWaitOutputLoop` (Invariants I1, I2)
- **Reachable via:** `match: ""` matched immediately on empty terminal; literal strings with brackets were parsed as regex character classes.
- **Evidence (pre-fix):** `src/features/herdr-tools.ts:281-286, 300`.
- **Fix:** `src/features/herdr-tools.ts:287-292, 310` requires non-empty match and uses literal substring checking (`lastText.includes(match)`).
- **Regression test:** `tests/tools.test.ts` — "TOOLSPROTO-11: herdr_pane wait_output pattern matching"
- **Status:** fixed

#### X-TOOLSPROTO-13 — Recent Command: --recent 0 emits misleading empty card
- **Machine / invariant:** `RecentCommandBypass` (Invariant I1)
- **Reachable via:** `/record --recent 0` parsed limit as 0, causing slice of 0 entries and false "no entries" notification.
- **Evidence (pre-fix):** `src/features/recent-command.ts:40-45`.
- **Fix:** `src/features/recent-command.ts:44` defaults non-positive count to `DEFAULT_LIMIT`.
- **Regression test:** `tests/tools.test.ts` — "TOOLSPROTO-13: Recent count - parseRecentCount(\"--recent 0\") defaults to positive limit"
- **Status:** fixed

#### X-TOOLSPROTO-8 — Routines: kebab-case parameter names fail shell variable binding
- **Machine / invariant:** `RoutinesExecution` (Invariant I3)
- **Reachable via:** Routine with parameter `output-dir` in `manifest.json`. Bash cannot read `$OUTPUT-DIR`.
- **Evidence (pre-fix):** `src/features/routines.ts:405` only set `env[k.toUpperCase()]`.
- **Fix:** `src/features/routines.ts:422` sets `env[k.toUpperCase().replace(/[^A-Z0-9]/g, "_")]`.
- **Regression test:** `tests/tools.test.ts` — "TOOLSPROTO-8: Routines - Kebab-case parameter env binding"
- **Status:** fixed

### 7.4 Review of the fix batch

An independent review of the combined diff raised eight findings. Each was checked against the runtime before acting.

| Finding | Disposition | Evidence / change |
|---|---|---|
| Audit revision whose status line carries the AUDIT-FORMAT template comment (`status: active # active \| superseded \| archived`) rejected | **Fixed** — regression introduced by the first D08 fix, never released | `policy.ts` `readStatus` strips `#…` and lower-cases; test "D08: policy blocked a valid version bump whose status line carries the template YAML comment" failed before (raw value `active # active \| superseded \| archived` ∉ statuses) |
| Undocumented `archived → active` lock added by the D08 fix | **Removed** | AUDIT-FORMAT documents the three values but no transition order; the guard now enforces only documented rules |
| Per-session maps (`sessionGuardStates`, `sessionIngestStates`, `sessionStrikesBySession`) grow with every subagent session | **Fixed** (D28/D46 follow-up) | `session_shutdown` releases the entry; getters no longer create entries. Runtime: `AgentSession.#doDispose` → `emitSessionShutdownEvent` (`agent-session.ts:4086-4091`); task executor disposes every subagent session (`task/executor.ts:2471`) |
| Hindsight identity from a 40-char text prefix suppresses a repeated prompt | **Unreachable**; dead branch removed | Runtime `UserMessage.timestamp` is required (`ai/src/types.ts:874`) and was checked before the text fallback; boundary test added |
| Aborted `~prompt` stays in the process-shared `pendingBypasses` set | **Bounded** (accepted residual, D37) | Capped at 16 entries, slash-command text never stored; the only effect is one skipped clarification on a later prompt with identical text |
| Successful `write` over an existing record counts as an ingest | **Unreachable** | The policy guard blocks overwrites in `tool_call`; the runtime throws before `execute` (`extensions/wrapper.ts:222-225`), so no successful `tool_result` follows (Ingest machine I6) |
| New `/council recent` affordance without version bump / changelog | **Fixed** | `package.json` 0.77.0, `CHANGELOG.md` `[0.77.0]` |

### 7.5 Findings not fixed

| Finding | Disposition | Evidence |
|---|---|---|
| IAP performative DAG (envelope payload resolution, hub serialization, inbox extraction) admits invalid performative sequences | **Unreachable** | `src/protocol/iap.ts` / `iap-hub.ts` helpers have no production caller; research waves exchange on-disk JSON results only |
| KB index section duplicated across turns (X-KNOWLEDGE-10) | **Unreachable** | The runtime rebuilds the system prompt every turn before `before_agent_start` (`agent-session.ts:5832`); a turn never carries the previous turn's section |
| Council overlay `s` / `Enter` actions discarded | **Not a defect** | Removed deliberately in 0.76.2; the stale doc claims were the defect (D22) |
