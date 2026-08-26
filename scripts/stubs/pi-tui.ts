// esbuild alias target for `@oh-my-pi/pi-tui` in the selftest bundle. The
// real module is served at runtime by the omp binary; the stub only needs to
// satisfy what src/knowledge-tool.ts (and the council/research/herdr/audit
// message renderers) construct so the renderers can be exercised headlessly
// and the harness-loop pattern (`for (...) t[i].render(width)`) does not
// throw `TypeError: t[i].render is not a function` when a renderer returns a
// Container.

export class Container {
  children: Array<{ render: (width: number) => readonly string[] }> = [];
  addChild(child: { render: (width: number) => readonly string[] }): void {
    this.children.push(child);
  }
  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const row of child.render(width)) lines.push(row);
    }
    return lines;
  }
}

export class Text {
  // NOTE: the 2nd/3rd constructor args are PADDING (paddingX, paddingY), NOT
  // x/y coordinates — pi-tui has no coordinate system; Container/Box children
  // stack with no gap, and a nonzero paddingY emits that many blank rows above
  // AND below the content. Pass (text, 0, 0) for unspaced lines.
  constructor(public text: string, public paddingX = 0, public paddingY = 0) {}
  render(width: number): string[] {
    const rows: string[] = [];
    for (let i = 0; i < this.paddingY; i++) rows.push("");
    if (this.text.length > 0) {
      const safeWidth = Math.max(1, width - this.paddingX * 2);
      // Strip ANSI to check true visible length
      const cleanLen = this.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").length;
      if (cleanLen <= safeWidth) {
        rows.push(this.text);
      } else {
        const words = this.text.split(" ");
        let current = "";
        for (const word of words) {
          const wordClean = word.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
          const currentClean = current.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
          if (current.length === 0) {
            current = word;
          } else if (currentClean.length + 1 + wordClean.length <= safeWidth) {
            current += " " + word;
          } else {
            rows.push(current);
            current = word;
          }
        }
        if (current.length > 0) rows.push(current);
      }
    }
    for (let i = 0; i < this.paddingY; i++) rows.push("");
    return rows;
  }
}
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
  children: Array<{ render: (width: number) => readonly string[] }> = [];

  constructor(
    public paddingX = 1,
    public paddingY = 1,
    public bgFn?: (text: string) => string,
    public border?: BoxBorder,
  ) {}

  addChild(child: { render: (width: number) => readonly string[] }): void {
    this.children.push(child);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const hasBorder = Boolean(this.border);
    const innerWidth = Math.max(0, width - (hasBorder ? 2 : 0));
    const contentWidth = Math.max(0, innerWidth - this.paddingX * 2);

    const interior: string[] = [];
    const pushRow = (row: string): void => {
      const clean = row.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const visLen = clean.length;
      const padNeeded = Math.max(0, innerWidth - visLen);
      const padded = padNeeded > 0 ? row + " ".repeat(padNeeded) : row;
      interior.push(this.bgFn ? this.bgFn(padded) : padded);
    };

    // Top padding
    for (let i = 0; i < this.paddingY; i++) pushRow("");

    // Children
    const leftPad = " ".repeat(this.paddingX);
    for (const child of this.children) {
      const childLines = child.render(contentWidth);
      for (const line of childLines) {
        const row = this.paddingX > 0 ? leftPad + line : line;
        pushRow(row);
      }
    }

    // Bottom padding
    for (let i = 0; i < this.paddingY; i++) pushRow("");

    if (this.border) {
      const paint = this.border.color ?? ((s: string) => s);
      const rule = this.border.chars.horizontal.repeat(innerWidth);
      const side = paint(this.border.chars.vertical);
      lines.push(paint(this.border.chars.topLeft + rule + this.border.chars.topRight));
      for (const row of interior) {
        lines.push(side + row + side);
      }
      lines.push(paint(this.border.chars.bottomLeft + rule + this.border.chars.bottomRight));
    } else {
      for (const row of interior) lines.push(row);
    }

    return lines;
  }
}

