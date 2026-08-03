---
name: math-rendering
description: Render math with LaTeX delimiters in your answers — the TUI converts them to real typeset output (Unicode for inline, full 2-D layout for display math). Use when an answer contains formulas, equations, derivations, or math-heavy ML content, instead of ASCII approximations.
---

# Math rendering

The oh-my-pi TUI renders LaTeX math natively. When your answer contains
math, write it as LaTeX — the terminal shows it typeset. ASCII approximations
(`sqrt(a^2 + b^2)`, `x = (-b +/- sqrt(...)) / (2a)`) are a downgrade; the
renderer handles the real thing.

## Delimiters

| Form | Write | Renders as |
|---|---|---|
| Inline | `$...$` or `\(...\)` | single-line Unicode: superscripts/subscripts, Greek, operators, `\frac` compacted |
| Display | `$$...$$` or `\[...\]`, each delimiter on its own line | 2-D layout: stacked fractions with bars, stretched delimiters, matrices, radicals, limits |
| Bare display env | `\begin{aligned}...\end{aligned}` without fences | same 2-D path |

## Rules

- **Prefer the real thing**: `\frac{a}{b}`, `\sqrt{x}`, `\sum_{i=1}^{n}`,
  `\begin{pmatrix}...\end{pmatrix}`, `\left( \right)` — not `(a/b)` or
  hand-built ASCII.
- **Multi-line derivations**: use a display block with an environment —
  `\begin{aligned}` (or `align`/`gather`) and `&` alignment. Never flatten a
  derivation into one line.
- **What the renderer knows**: fractions (`\frac`/`\dfrac`), roots, scripts
  (`^`/`_`), `\left...\right` and stretchy bare parens, matrices
  (`matrix`/`pmatrix`/`bmatrix`/`cases`/`array`), big operators with limits
  (`\sum`, `\prod`, `\lim`), integrals, `\binom`, `\underbrace`/`\overbrace`,
  `\overset`/`\underset`, Greek, bold vectors (`\mathbf{E}`), math fonts
  (`\mathbb{R}`, `\mathcal`), and colors (`\textcolor`, `\colorbox`).
- **Keep inline math single-line**; anything taller goes in a display block.
- **Currency guard**: `$5`, `$10k` are not math — leave bare dollar amounts
  alone. When in doubt about `$`, use `\(...\)` for inline math.

## When not to

- Inside code blocks or inline code — delimiters there are literal.
- Shell variables (`$PATH`, `$HOME`), currency, or prose dollar amounts.
- Trivial mentions where math isn't the content.

## Verify

If the user asks whether math rendering works, emit a display block and an
inline example (e.g. Maxwell's equations) — the TUI shows it typeset, no
plugin involved. The `/math` command is the user-facing explainer.
