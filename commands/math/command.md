Math formatting for this conversation — the TUI renders LaTeX natively, so
from now on format math as LaTeX instead of ASCII approximations.

## What you do

For every answer that contains math (formulas, equations, derivations,
math-heavy ML content):

- **Inline** math: `$...$` (or `\(...\)` when `$` is risky, e.g. near
  currency). Single-line only — superscripts, subscripts, Greek, `\frac`
  compacted.
- **Display** math: `$$...$$` or `\[...\]`, each delimiter on its own line.
  Multi-line derivations use `\begin{aligned}` (or `align`/`gather`) with
  `&` alignment — never flatten a derivation into one line.
- **Prefer the real thing**: `\frac{a}{b}`, `\sqrt{x}`, `\sum_{i=1}^{n}`,
  `\begin{pmatrix}...\end{pmatrix}`, `\left( \right)`, `\lim`, `\int`,
  `\binom`, `\underbrace`, `\mathbf`, `\mathbb` — not ASCII approximations.

## What the renderer supports

Fractions and roots, scripts, stretchy delimiters, matrices and cases,
big-operator limits, integrals, aligned environments, bold vectors, math
fonts, `\textcolor`/`\colorbox`.

## Guardrails

- Never use math delimiters inside code blocks, inline code, shell variables
  (`$PATH`, `$HOME`), or dollar amounts (`$5` is not math).
- When in doubt between `$` and other uses, use `\(...\)` for inline math.
- Inline math stays on one line; anything taller becomes a display block.

## Demo

To show the user what rendering looks like, emit:

```latex
\[
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0}, \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t}
\end{aligned}
\]
```

and an inline example like $e^{i\pi} + 1 = 0$.
