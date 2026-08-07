// esbuild alias target for `@oh-my-pi/pi-tui` in the selftest bundle. The
// real module is served at runtime by the omp binary; the stub only needs to
// satisfy what src/knowledge-tool.ts constructs so the renderers can be
// exercised headlessly.

export class Container {
  children: unknown[] = [];
  addChild(child: unknown): void {
    this.children.push(child);
  }
}

export class Text {
  // NOTE: the 2nd/3rd constructor args are PADDING (paddingX, paddingY), NOT
  // x/y coordinates — pi-tui has no coordinate system; Container/Box children
  // stack with no gap, and a nonzero paddingY emits that many blank rows above
  // AND below the content. Pass (text, 0, 0) for unspaced lines.
  constructor(public text: string, public paddingX = 0, public paddingY = 0) {}
}
