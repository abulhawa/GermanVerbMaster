export type CreateVercelHandlerOptions = Record<string, unknown>;

export type VercelApiHandler = (request: unknown, response: unknown) => unknown;

export const handler: VercelApiHandler;
export function createVercelApiHandler(options?: CreateVercelHandlerOptions): VercelApiHandler;
const defaultExport: VercelApiHandler;
export default defaultExport;
