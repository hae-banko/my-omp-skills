# Math rendering — native LaTeX, made first-class

**Status:** shipped (v0.11.0). Renders entirely in oh-my-pi core
(`packages/tui/src/latex-to-unicode.ts`, `latex-block.ts`, wired into
`components/markdown.ts`); this package adds the model-side discipline.

## The check (why this exists)

The user cloned [pi-math](https://github.com/Fadouse/pi-math) — a Pi-harness
extension that renders LaTeX as terminal images (MathJax → SVG → resvg → PNG,
placed via Kitty Unicode placeholders / Kitty graphics / iTerm2). Question:
is that possible with oh-my-pi?

Findings (source-verified against `packages/tui/src` and
`packages/coding-agent/src`, omp 17.2.x):

1. **oh-my-pi already renders LaTeX natively.** Inline `$…$`/`\(…\)` →
   `latexToUnicode` (Unicode superscripts/subscripts, Greek, operators,
   radicals, ANSI `\textcolor`/`\colorbox`, math fonts, anti-currency
   heuristic); display `$$…$$`/`\[…\]`/bare math environments →
   `latexToBlock`, a 2-D layout engine (stacked fractions, stretched
   delimiters, matrices/cases, drawn radicals, operator limits, aligned
   `&` columns). Wired unconditionally into the markdown renderer
   (`markdown.ts:2219` → `latexToBlock`, `:1210` → `renderMathToken`). Pure
   text — works in any terminal, no image protocol, no setting.
2. **pi-math itself cannot run on omp as-is.** It targets Earendil's Pi
   harness (`@earendil-works/pi-*` peers); its core seam — wrapping
   `Markdown.render()` — is absent from omp's legacy compat surface (the
   shim exposes `ImageProtocol`/`TERMINAL`, not a Markdown class).
3. **The image-based path is architecturally possible** (omp has Kitty
   graphics incl. U=1 Unicode placeholders, iTerm2, SIXEL, protocol
   detection, and `{type:"image"}` message/tool-result content blocks with
   protocol-aware fallback) **but terminal-gated**: the user's daily driver
   is Windows Terminal under WSL2, which supports none of the protocols omp
   emits (no Kitty graphics/iTerm2; omp's SIXEL detection is win32-gated
   while WSL2 is linux). Images would fall back to text there. Ghostty/Kitty
   terminals would be required to make the image path pay for itself.

**Decision:** the next feature is the native path made first-class — teach
the model to emit LaTeX (the renderer already handles it). The image port is
deferred: it would be pure fallback on the user's terminal.

## What ships

- **`skills/math-rendering/SKILL.md`** — model-invoked: render math as LaTeX.
  Delimiter table, supported-construct list (fractions, roots, scripts,
  stretchy delimiters, matrices/cases, operator limits, integrals, aligned
  envs, bold vectors, math fonts, colors), guardrails (no math delimiters in
  code/shell variables/currency; inline stays single-line; `\(…\)` when `$`
  is risky).
- **`/math` command** — user-invoked: applies the formatting instruction to
  the conversation and can demo the rendering. No built-in name conflict
  (checked `slash-commands/builtin-registry.ts`).

## Verification

- Selftest: `math` registered with a non-empty body (24 commands total).
- Live render test performed in-session: Maxwell's equations in
  `\begin{aligned}` display form and inline `$…$` — rendered by the core
  renderer (user-visible).
