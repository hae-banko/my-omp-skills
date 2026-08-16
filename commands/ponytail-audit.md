Audit the entire repository for **over-engineering, unnecessary dependencies, and architectural bloat**.

Unlike diff review, this command scans the whole tree to produce a prioritized elimination and simplification roadmap.

## Process

1. **Dependency Audit**:
   - Inspect package manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`).
   - Identify packages that wrap built-ins or standard libraries (e.g. `mkdirp`, `rimraf`, `lodash.clonedeep`, `query-string`, `dateutil`, `pytz`).

2. **Codebase Structural Scan**:
   - Single-implementation interfaces and abstract base classes.
   - Hand-rolled utility functions replicating standard library capabilities.
   - Factories returning single concrete types.
   - Pass-through wrappers and forwarding layers with only one caller.

## Output Format

List findings ranked from largest line/dependency elimination to smallest:
`1. <tag> <what to cut>. <replacement>. [<location>]`

Summary scorecard:
`net: -<N> lines, -<M> dependencies possible across repository.`

If the codebase is already minimal:
`Lean already. Ship.`
