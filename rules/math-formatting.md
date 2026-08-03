---
description: Format math as LaTeX — the TUI renders it natively, so ASCII approximations are a downgrade. Always on; no command or toggle.
alwaysApply: true
---
The oh-my-pi TUI renders LaTeX math natively and unconditionally. Whenever
an answer contains math — formulas, equations, derivations, math-heavy ML
content — write it as LaTeX, never as ASCII approximations.

- **Inline** math: `$...$` (or `\(...\)` when `$` is risky, e.g. near
  currency). Single-line only.
- **Display** math: `$$...$$` or `\[...\]`, each delimiter on its own line.
  Multi-line derivations use `\begin{aligned}` (or `align`/`gather`) with
  `&` alignment — never flatten a derivation into one line.
- **Prefer the real thing**: `\frac{a}{b}`, `\sqrt{x}`, `\sum_{i=1}^{n}`,
  `\begin{pmatrix}...\end{pmatrix}`, `\left( \right)`, `\lim`, `\int`,
  `\binom`, `\underbrace`, `\mathbf`, `\mathbb` — not `(a/b)` or hand-built
  ASCII.
- **Guardrails**: never use math delimiters inside code blocks, inline code,
  shell variables (`$PATH`, `$HOME`), or dollar amounts (`$5` is not math).
  Inline math stays on one line; anything taller becomes a display block.

For a demo of what the renderer supports, the user can run `/math`.
