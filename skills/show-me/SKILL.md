---
name: show-me
description: Help the user understand the current topic visually with concise diagrams, code-shape sketches, pseudocode, diffs, or focused HTML artifacts.
---

Help the user visually understand code architecture, runtime flows, state changes, file structures, UI components, or conceptual designs.

## Core Rules

1. **Skip preamble** — start immediately with the visual representation and brief contextual header.
2. **Keep prose brief** — place visuals next to short, targeted supporting text. Explanations serve the visual.
3. **Select smallest clear view** — omit noise, internal plumbing, or unrelated layers. Focus strictly on the structure or concept being explained.
4. **Prefer native rendering primitives** — oh-my-pi TUI renders ```mermaid ``` blocks natively as ASCII diagrams.

## Visual Representations

Pick the format that best fits the subject:

### 1. Mermaid Diagrams
Use ` ```mermaid ` blocks for component interaction, system architecture, state machines, sequence flows, and data pipelines.
*(Note: oh-my-pi TUI renders Mermaid blocks natively as ASCII)*

```mermaid
graph TD
    Client[Client App] --> API[API Gateway]
    API --> Auth[Auth Service]
    API --> Store[(Data Store)]
```

### 2. Pseudocode
Use high-level pseudocode for logic, algorithms, or complex multi-step decision routines when real code syntax would obscure the core algorithm.

### 3. Call Trees
Use indented call trees for runtime control flow, function invocation hierarchies, stack transitions, or dispatch sequences.

```
main()
└── processBatch(items)
    ├── validateItem(item)
    └── dispatchEvent(event)
        └── Bus.publish(payload)
```

### 4. Component Trees
Use nested JSX/TSX or indented component trees for UI structure, slot placement, and parent-child component hierarchies.

```tsx
<AppLayout>
  <Sidebar>
    <Navigation />
  </Sidebar>
  <MainContent>
    <Header />
    <DashboardGrid />
  </MainContent>
</AppLayout>
```

### 5. Shallow File Trees
Use focused file trees to explain module boundaries, file responsibility, or proposed directory reorganization. Keep them shallow and omit unrelated boilerplate.

```
src/
├── core/
│   ├── engine.ts       # Main execution loop
│   └── dispatcher.ts   # Event router
└── ui/
    └── renderer.ts     # Rendering pipeline
```

### 6. Targeted Diffs
Use unified `diff` blocks to illustrate targeted changes (component updates, layout shifts, call tree refactoring, or state schema changes).

```diff
- const data = fetchSync(url);
+ const data = await fetchAsync(url);
```

### 7. Full Code Blocks
Use full code blocks when exact syntax context, type signatures, or structural code details are needed to complete the picture.

### 8. Focused HTML Artifacts
For visual UI designs, complex mockups, component layouts, or rich infographics:
- Generate a standalone, focused HTML file with self-contained styling and structure.
- Open the artifact using available system tools (`xdg-open`, `wslview`, or system browser) so the user can inspect the visual artifact immediately.
