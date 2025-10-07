// api/index.js
const fallbackModule = await import('./index.impl.js');

const bundledModule = await import('../dist/api/index.js').catch(() => fallbackModule);

const fallbackHandler = fallbackModule.handler ?? fallbackModule.default;
const resolvedHandler = bundledModule.handler ?? bundledModule.default ?? fallbackHandler;

export const handler = resolvedHandler;
export const createVercelApiHandler =
  typeof bundledModule.createVercelApiHandler === 'function'
    ? bundledModule.createVercelApiHandler
    : fallbackModule.createVercelApiHandler;

export default resolvedHandler;
