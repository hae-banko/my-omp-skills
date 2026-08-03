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
  constructor(public text: string, public x = 0, public y = 0) {}
}
