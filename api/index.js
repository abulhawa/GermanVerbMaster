// api/index.js

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

async function loadModule() {
  try {
    const resolvedPath = require.resolve('../dist/api/index.js');
    return await import(pathToFileURL(resolvedPath).href);
  } catch (error) {
    /** @type {{ code?: string; message?: string }} */
    const info = (typeof error === 'object' && error) || {};
    const code = 'code' in info ? info.code : undefined;
    const message = 'message' in info ? String(info.message) : '';
    const isMissingModule =
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'MODULE_NOT_FOUND' ||
      message.includes('Cannot find module') ||
      message.includes('Failed to resolve module') ||
      message.includes('Failed to resolve import');

    if (!isMissingModule) {
      throw error;
    }
  }

  return import('./index.impl.ts');
}

const moduleExports = await loadModule();
const defaultExport = moduleExports.default ?? moduleExports.handler;
const resolvedHandler = moduleExports.handler ?? defaultExport;

export const handler = resolvedHandler;
export const createVercelApiHandler =
  typeof moduleExports.createVercelApiHandler === 'function'
    ? moduleExports.createVercelApiHandler
    : () => resolvedHandler;

export default resolvedHandler;
