// Ambient declaration for the subset of @oh-my-pi/pi-tui and @earendil-works/pi-tui
// this package renders with. The runtime serves the real bundled copy (omp remaps
// imports inside plugins); the type package is not installed, so tsc gets
// this structural stand-in. The selftest swaps in a stub via esbuild alias.

declare module "@oh-my-pi/pi-tui" {
  export class Container {
    children?: unknown[];
    addChild(child: unknown): void;
  }
  export class Text {
    constructor(text: string, paddingX?: number, paddingY?: number);
  }
}

declare module "@earendil-works/pi-tui" {
  export class Container {
    children?: unknown[];
    addChild(child: unknown): void;
  }
  export class Text {
    constructor(text: string, paddingX?: number, paddingY?: number);
  }
}
