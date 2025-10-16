process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test.invalid/german-verb-master';

if (typeof window === 'undefined' || typeof document === 'undefined') {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  const { window: jsdomWindow } = dom;

  const propagate = (source: typeof jsdomWindow, target: typeof globalThis) => {
    const descriptors = Object.getOwnPropertyNames(source)
      .filter((property) => typeof (target as any)[property] === 'undefined')
      .reduce<Record<string, PropertyDescriptor>>((acc, property) => {
        const descriptor = Object.getOwnPropertyDescriptor(source, property);
        if (descriptor) {
          acc[property] = descriptor;
        }
        return acc;
      }, {});

    Object.defineProperties(target, descriptors);
  };

  (globalThis as any).window = jsdomWindow;
  (globalThis as any).document = jsdomWindow.document;
  (globalThis as any).self = jsdomWindow;
  (globalThis as any).top = jsdomWindow;

  propagate(jsdomWindow, globalThis);
  propagate(jsdomWindow.constructor.prototype, globalThis);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: false,
  });
}

if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: false,
  });
} else if (!('onLine' in globalThis.navigator)) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
  });
}
