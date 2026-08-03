# Math rendering — native LaTeX, always on

**Status:** shipped (v0.12.0). Rendering is entirely in oh-my-pi core
(`packages/tui/src/latex-to-unicode.ts`, `latex-block.ts`, wired into
`components/markdown.ts`); this package adds the model-side discipline as an
always-apply rule.

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
   text — works in any terminal, no image protocol, no setting. Confirmed
   live in-session (Maxwell's equations rendered).
2. **pi-math itself cannot run on omp as-is.** It targets Earendil's Pi
   harness (`@earendil-works/pi-*` peers); its core seam — wrapping
   `Markdown.render()` — is absent from omp's extension surface: the legacy
   shim exposes `ImageProtocol`/`TERMINAL` but no Markdown class, and the
   modern API's `messageRenderers` are customType-keyed (no general
   assistant-message render hook).
3. **The image-based path is architecturally possible** (omp has Kitty
   graphics incl. U=1 Unicode placeholders, iTerm2, SIXEL, protocol
   detection, and `{type:"image"}` message/tool-result content blocks with
   protocol-aware fallback) **but only as a core patch**: the natural seam
   is omp's own math token renderers in `markdown.ts` (swap
   `latexToUnicode`/`latexToBlock` for MathJax→PNG→image sequences when
   `TERMINAL.imageProtocol` is set). Terminal gate: the user's daily driver
   is Windows Terminal under WSL2, which supports none of the protocols omp
   emits (no Kitty graphics/iTerm2; omp's SIXEL detection is win32-gated
   while WSL2 is linux) — images would fall back there, and pi-math's
   fallback (raw LaTeX text) is strictly worse than omp's native 2-D layout.

**Decision:** native path, always on. The image port is deferred: it would be
pure fallback on the user's terminal, and the seam is a core change, not a
plugin hook.

## What ships

- **`rules/math-formatting.md`** — always-apply rule: format math as LaTeX
  (`$…$` inline; `$$…$$`/`\[…\]`/`\begin{aligned}` display; `\frac`,
  `\sqrt`, matrices, `\left( \right)`, `\sum`/`\lim`/`\int`, `\mathbf`,
  `\mathbb`). Guardrails: no delimiters in code, shell variables, or
  currency; inline stays single-line; `\(…\)` when `$` is risky. Enforced
  every turn — no command, no toggle, no second thought.
- **`/math` command** — explainer + demo only (the behavior is the rule).
  No built-in-name conflict (checked `slash-commands/builtin-registry.ts`).

## Verification

- Selftest: `math` registered with a non-empty body (25 commands total).
- Rule file ships in `rules/` alongside the other always-apply rules.

## Future: the port, when it makes sense

If a Kitty/Ghostty-capable terminal enters the picture (or omp adds a
markdown math→image hook), port pi-math's renderer as a core patch: MathJax
+ `@resvg/resvg-js` → PNG, emitted through omp's existing
`kitty-graphics.ts`/`renderImage` path, keyed on `TERMINAL.imageProtocol`,
falling back to the native 2-D renderer (better than pi-math's raw-LaTeX
fallback). The plugin-side rule stays valid in either case.
