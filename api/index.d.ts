import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreateApiAppOptions } from '../server/api/app.js';

export interface CreateVercelHandlerOptions extends CreateApiAppOptions {}

export type VercelApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export const handler: VercelApiHandler;
export function createVercelApiHandler(options?: CreateVercelHandlerOptions): VercelApiHandler;
declare const defaultExport: VercelApiHandler;
export default defaultExport;
