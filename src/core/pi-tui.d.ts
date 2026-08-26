// Ambient declaration for the subset of @oh-my-pi/pi-tui and @earendil-works/pi-tui
// this package renders with. The runtime serves the real bundled copy (omp remaps
// imports inside plugins); the type package is not installed, so tsc gets
// this structural stand-in. The selftest swaps in a stub via esbuild alias.

declare module "@oh-my-pi/pi-tui" {
  export interface Component {
    render(width: number): readonly string[];
  }
  export interface BoxBorder {
    chars: {
      topLeft: string;
      topRight: string;
      bottomLeft: string;
      bottomRight: string;
      horizontal: string;
      vertical: string;
    };
    color?: (text: string) => string;
  }
  export class Box implements Component {
    constructor(
      paddingX?: number,
      paddingY?: number,
      bgFn?: (text: string) => string,
      border?: BoxBorder,
    );
    addChild(component: unknown): void;
    render(width: number): readonly string[];
  }
  export class Container implements Component {
    children?: unknown[];
    addChild(child: unknown): void;
    render(width: number): readonly string[];
  }
  export class Text implements Component {
    constructor(text: string, paddingX?: number, paddingY?: number);
    render(width: number): readonly string[];
  }
}

declare module "@earendil-works/pi-tui" {
  export interface Component {
    render(width: number): readonly string[];
  }
  export interface BoxBorder {
    chars: {
      topLeft: string;
      topRight: string;
      bottomLeft: string;
      bottomRight: string;
      horizontal: string;
      vertical: string;
    };
    color?: (text: string) => string;
  }
  export class Box implements Component {
    constructor(
      paddingX?: number,
      paddingY?: number,
      bgFn?: (text: string) => string,
      border?: BoxBorder,
    );
    addChild(component: unknown): void;
    render(width: number): readonly string[];
  }
  export class Container implements Component {
    children?: unknown[];
    addChild(child: unknown): void;
    render(width: number): readonly string[];
  }
  export class Text implements Component {
    constructor(text: string, paddingX?: number, paddingY?: number);
    render(width: number): readonly string[];
  }
}
