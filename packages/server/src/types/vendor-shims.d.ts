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
