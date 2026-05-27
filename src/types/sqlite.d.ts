declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean; create?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
  
  export class StatementSync {
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
}
