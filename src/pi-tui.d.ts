// Ambient declaration for the subset of @oh-my-pi/pi-tui this package renders
// with. The runtime serves the real bundled copy (omp remaps @oh-my-pi/*
// imports inside plugins); the type package is not installed, so tsc gets
// this structural stand-in. The selftest swaps in a stub via esbuild alias.

declare module "@oh-my-pi/pi-tui" {
  export class Container {
    children?: unknown[];
    addChild(child: unknown): void;
  }
  export class Text {
    constructor(text: string, x?: number, y?: number);
  }
}
