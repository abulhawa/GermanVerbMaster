import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('seed database helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a cached database instance', async () => {
    const fakeDb = { execute: vi.fn(), transaction: vi.fn() };
    const getDb = vi.fn(() => fakeDb);

    vi.doMock('@db', () => ({ getDb }));
    vi.doMock('@db/schema', () => ({
      inflections: 'inflections',
      lexemes: 'lexemes',
      words: 'words',
    }));

    const database = await import('../../../scripts/seed/database');

    const first = database.ensureDatabase();
    const second = database.ensureDatabase();

    expect(first).toBe(fakeDb);
    expect(second).toBe(fakeDb);
    expect(getDb).toHaveBeenCalledTimes(1);
  });

  it('ensures the legacy schema exists', async () => {
    const db = { execute: vi.fn(), transaction: vi.fn() };

    vi.doMock('@db', () => ({ getDb: vi.fn(() => db) }));
    vi.doMock('@db/schema', () => ({
      inflections: 'inflections',
      lexemes: 'lexemes',
      words: 'words',
    }));

    const database = await import('../../../scripts/seed/database');

    await database.ensureLegacySchema(db as any);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('resets seeded content inside a transaction', async () => {
    const deletes: unknown[] = [];
    const db = {
      execute: vi.fn(),
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
        await callback({ delete: (table: unknown) => { deletes.push(table); } });
      }),
    };

    vi.doMock('@db', () => ({ getDb: vi.fn(() => db) }));
    vi.doMock('@db/schema', () => ({
      inflections: 'inflections',
      lexemes: 'lexemes',
      words: 'words',
    }));

    const database = await import('../../../scripts/seed/database');

    await database.resetSeededContent(db as any);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(deletes).toEqual(['inflections', 'lexemes', 'words']);
  });
});
