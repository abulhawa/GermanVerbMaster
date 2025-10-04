import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { newDb } from 'pg-mem';
import { type Pool, types } from 'pg';
import { vi } from 'vitest';

import * as schema from '../../db/schema';

export interface TestDatabaseContext {
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  mock: () => void;
  cleanup: () => Promise<void>;
}

export async function setupTestDatabase(): Promise<TestDatabaseContext> {
  vi.resetModules();

  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.none('create schema if not exists drizzle');

  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool({ types }) as Pool;

  const originalQuery = pool.query.bind(pool);
  pool.query = ((configOrText: any, values?: any, callback?: any) => {
    if (configOrText && typeof configOrText === 'object') {
      const { types: _types, rowMode, ...rest } = configOrText;

      if (rowMode === 'array' || _types !== undefined) {
        let resolvedValues = values;
        let resolvedCallback = callback;

        if (typeof resolvedValues === 'function') {
          resolvedCallback = resolvedValues;
          resolvedValues = undefined;
        }

        const mapResult = (result: any) => {
          if (rowMode === 'array' && Array.isArray(result.rows)) {
            const fieldNames = Array.isArray(result.fields) && result.fields.length > 0
              ? result.fields.map((field: any) => field.name)
              : Object.keys(result.rows[0] ?? {});

            result.rows = result.rows.map((row: Record<string, unknown>) =>
              fieldNames.map((field) => row[field]),
            );
          }

          return result;
        };

        const promise = originalQuery(rest, resolvedValues as any).then(mapResult);

        if (typeof resolvedCallback === 'function') {
          promise.then(
            (result) => resolvedCallback!(null, result),
            (error) => resolvedCallback!(error),
          );
          return undefined as unknown as ReturnType<Pool['query']>;
        }

        return promise;
      }
    }

    return originalQuery(configOrText, values, callback);
  }) as Pool['query'];
  const db = drizzle(pool, { schema });

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
  await migrate(db, { migrationsFolder });

  const mock = () => {
    vi.doMock('@db', () => ({ db }));
  };

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    await pool.end();
    vi.resetModules();
  };

  return { db, pool, mock, cleanup };
}
