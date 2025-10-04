export interface ResolveLocalStorageOptions {
  /**
   * Name of the feature attempting to access local storage.
   * Used for scoped warning messages when access fails.
   */
  context: string;
  /**
   * Optional logger used when resolving storage fails.
   * Defaults to console.warn for backward compatibility.
   */
  warn?: typeof console.warn;
}

interface GlobalWithLocalStorage {
  localStorage?: Storage;
}

/**
 * Attempts to resolve the browser's localStorage instance in a way that
 * tolerates SSR environments and guards against access errors.
 */
export function resolveLocalStorage({
  context,
  warn = console.warn,
}: ResolveLocalStorageOptions): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }

    const globalStorage = (globalThis as GlobalWithLocalStorage).localStorage;
    if (typeof globalStorage !== 'undefined') {
      return globalStorage;
    }

    return null;
  } catch (error) {
    warn(`Local storage unavailable for ${context}:`, error);
    return null;
  }
}
