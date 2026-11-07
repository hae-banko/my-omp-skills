// Ambient declaration for the subset of `bun:sqlite` this package uses. omp
// runs extensions on its bundled bun runtime, which provides the module;
// bun's type package is not installed, so tsc gets this structural stand-in.

declare module "bun:sqlite" {
  export class Statement<Row = unknown> {
    get(...params: unknown[]): Row | null;
    all(...params: unknown[]): Row[];
    run(...params: unknown[]): void;
  }

  export interface Transaction<T> {
    (): T;
    immediate(): T;
  }

  export class Database {
    constructor(filename: string);
    exec(sql: string): void;
    query<Row = unknown>(sql: string): Statement<Row>;
    transaction<T>(fn: () => T): Transaction<T>;
    close(): void;
  }
}
