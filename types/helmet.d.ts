declare module 'helmet' {
  import type { IncomingMessage, ServerResponse } from 'http';

  export interface HelmetOptions {
    [key: string]: unknown;
  }

  type NextHandler = (err?: unknown) => void;
  type HelmetMiddleware = (req: IncomingMessage, res: ServerResponse, next: NextHandler) => void;

  interface HelmetExport {
    (options?: HelmetOptions): HelmetMiddleware;
  }

  const helmet: HelmetExport;
  export default helmet;
}
