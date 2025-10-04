import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLocalStorage } from '../storage';

describe('resolveLocalStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns window.localStorage when available', () => {
    const storage = resolveLocalStorage({ context: 'test' });
    expect(storage).toBe(window.localStorage);
  });

  it('falls back to globalThis.localStorage when window is unavailable', () => {
    const originalWindow = (globalThis as { window?: Window }).window;
    const globalStorage = (globalThis as { localStorage?: Storage }).localStorage;

    try {
      (globalThis as { window?: Window }).window = undefined;

      const storage = resolveLocalStorage({ context: 'test' });
      expect(storage).toBe(globalStorage ?? null);
    } finally {
      (globalThis as { window?: Window }).window = originalWindow;
    }
  });

  it('warns when accessing localStorage throws an error', () => {
    const warn = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const error = new Error('localStorage unavailable');

    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw error;
        },
      });

      const storage = resolveLocalStorage({ context: 'test', warn });
      expect(storage).toBeNull();
      expect(warn).toHaveBeenCalledWith('Local storage unavailable for test:', error);
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor);
      }
    }
  });
});
