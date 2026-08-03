Native LaTeX math rendering — explainer and demo.

The oh-my-pi TUI renders LaTeX math natively and **always on** (a core
feature, no plugin and no toggle): inline `$...$` becomes single-line
Unicode; display `$$...$$` / `\[...\]` and bare `\begin{env}` math blocks
become 2-D layout — stacked fractions, stretched delimiters, matrices,
radicals, big-operator limits, aligned environments.

## What the renderer supports

- Fractions and roots: `\frac{a}{b}`, `\sqrt{x}`, `\binom{n}{k}`
- Scripts: `x^2`, `x_i`, `e^{i\pi}`, `\hat{\boldsymbol{\theta}}`
- Stretchy delimiters: `\left( \right)`, tall bare parens
- Matrices and cases: `\begin{pmatrix}...\end{pmatrix}`, `\begin{cases}`
- Big operators with limits: `\sum_{i=1}^{n}`, `\prod`, `\lim`, `\int`
- Aligned environments: `\begin{aligned}` with `&` alignment
- Bold vectors and math fonts: `\mathbf{E}`, `\mathbb{R}`, `\mathcal{L}`
- Colors: `\textcolor`, `\colorbox`

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

The formatting itself is enforced by the always-apply `math-formatting`
rule — no command needed. This command exists only to explain and demo.
