declare module 'express' {
/* eslint-disable @typescript-eslint/no-explicit-any */
  const express: any;
  export default express;
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
}

declare module 'cors' {
  const cors: any;
  export default cors;
}

declare module 'better-sqlite3' {
  const Database: any;
  export default Database;
}

declare module 'kuzu' {
  export class Database {
    constructor(databasePath: string);
  }
  export class Connection {
    constructor(database: Database, numThreads?: number);
    query(statement: string): Promise<any>;
    prepare(statement: string): Promise<any>;
    execute(statement: any, params: Record<string, unknown>): Promise<any>;
    close?(): Promise<void> | void;
  }
}
