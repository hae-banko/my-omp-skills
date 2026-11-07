# Overengineering Repository Audit

Use when auditing an entire codebase or repository for over-engineering, unneeded dependencies, and architectural bloat. The cut comes before the addition ([skill://principles/subtract-before-you-add.md](../../principles/subtract-before-you-add.md)).

Scope is what the user named (subsystem, module, or directory path; `/ponytail-audit` passes it under `## User's arguments`). If unspecified, audit the entire repository.

## Steps

### 1. Audit project dependencies

Examine package manifests across the repository (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.).
Identify dependencies that replicate capabilities natively present in modern runtime platforms or standard libraries (for example, utility libraries superseded by built-in file operations, date formatting, or URL parsing).
Completion criterion: Manifest dependencies analyzed and redundant packages identified.

### 2. Scan codebase structure for bloat

Search the repository for unnecessary abstraction layers and dead complexity:
- Single-implementation interfaces and abstract base classes without a second concrete type.
- Hand-rolled utility functions replicating standard library modules.
- Factories returning a single concrete type.
- Pass-through wrappers and forwarding layers with only one caller.
- Single-export files and dead configuration flags.
Completion criterion: Structural scan completed and architectural bloat items cataloged.

### 3. Categorize and rank findings

Tag each item using standard complexity categories:
- `delete:` Dead abstractions, unused configuration, single-product factories.
- `stdlib:` Hand-rolled utilities replaceable by standard library functions.
- `native:` External dependencies replaceable by runtime/platform capabilities.
- `yagni:` Single-caller wrappers or single-implementation interfaces.
- `shrink:` Verbose boilerplate replaceable with idiomatic patterns.

Rank findings in descending order by estimated net reduction (largest line and dependency savings first).
Calculate total lines and dependencies that can be removed.
Completion criterion: Findings tagged, ranked by impact, and total savings tallied.

## Reply

List findings ranked from largest reduction to smallest:
```
1. <tag> <what to cut>. <replacement>. [<location>]
```

Conclude with the repository scorecard:
```
net: -<N> lines, -<M> dependencies possible across repository.
```

If the codebase is already lean and minimal:
```
Lean already. Ship.
```
