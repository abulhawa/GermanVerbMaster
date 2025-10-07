// api/index.js
import defaultExport, { handler as bundledHandler, createVercelApiHandler as bundledFactory } from '../dist/api/index.js';

const resolvedHandler = bundledHandler ?? defaultExport;

export const handler = resolvedHandler;
export const createVercelApiHandler =
  typeof bundledFactory === 'function' ? bundledFactory : () => resolvedHandler;

export default resolvedHandler;
