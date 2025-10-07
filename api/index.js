// api/index.js
const isModuleNotFound = (error) =>
  error?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/i.test(error?.message ?? '');

const loadFallbackModule = (() => {
  /** @type {Promise<any> | undefined} */
  let cached;
  return async () => {
    if (!cached) {
      cached = import('./index.impl.ts').catch((tsError) => {
        if (!isModuleNotFound(tsError)) {
          throw tsError;
        }
        return import('./index.impl.js');
      });
    }
    return cached;
  };
})();

let bundledModule;

try {
  bundledModule = await import('../dist/api/index.js');
} catch (error) {
  if (!isModuleNotFound(error)) {
    throw error;
  }
}

let fallbackModule = bundledModule ? undefined : await loadFallbackModule();

let resolvedHandler =
  bundledModule?.handler ?? bundledModule?.default ?? fallbackModule?.handler ?? fallbackModule?.default;

if (!resolvedHandler) {
  fallbackModule = await loadFallbackModule();
  resolvedHandler = fallbackModule.handler ?? fallbackModule.default;
}

let resolvedCreateVercelHandler =
  typeof bundledModule?.createVercelApiHandler === 'function'
    ? bundledModule.createVercelApiHandler
    : undefined;

if (!resolvedCreateVercelHandler) {
  fallbackModule = await loadFallbackModule();
  if (typeof fallbackModule.createVercelApiHandler === 'function') {
    resolvedCreateVercelHandler = fallbackModule.createVercelApiHandler;
  }
}

export const handler = resolvedHandler;
export const createVercelApiHandler = resolvedCreateVercelHandler;

export default resolvedHandler;
