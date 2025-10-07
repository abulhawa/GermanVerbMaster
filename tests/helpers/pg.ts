import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { newDb } from 'pg-mem';
import { Pool, type PoolConfig, types } from 'pg';
import { vi } from 'vitest';

import * as schema from '../../db/schema.js';

export interface TestDatabaseContext {
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  mock: () => void;
  cleanup: () => Promise<void>;
}

function resolveExternalPoolConfig(connectionString: string): PoolConfig {
  const config: PoolConfig = {
    connectionString,
  };

  const sslPreference = (
    process.env.TEST_DATABASE_SSL
      ?? process.env.DATABASE_SSL
      ?? process.env.PGSSLMODE
      ?? ''
  ).toLowerCase();

  if (sslPreference) {
    if (['disable', 'allow', 'prefer', 'false', '0'].includes(sslPreference)) {
      config.ssl = false;
    } else if (sslPreference === 'true' || sslPreference === '1') {
      config.ssl = { rejectUnauthorized: false };
    } else {
      config.ssl = { rejectUnauthorized: false };
    }
  } else {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

async function resetExternalDatabase(pool: Pool): Promise<void> {
  const schemas = ['public', 'drizzle'];

  for (const schemaName of schemas) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE; CREATE SCHEMA "${schemaName}";`);
  }
}

export async function setupTestDatabase(): Promise<TestDatabaseContext> {
  vi.resetModules();

  const externalConnection = process.env.TEST_DATABASE_URL;

  let pool: Pool;
  let usingExternal = false;

  if (externalConnection) {
    pool = new Pool(resolveExternalPoolConfig(externalConnection));
    usingExternal = true;
    await resetExternalDatabase(pool);
  } else {
    const mem = newDb({ autoCreateForeignKeyIndices: true });
    mem.public.none('create schema if not exists drizzle');

    const { Pool: MemPool } = mem.adapters.createPg();
    pool = new MemPool({ types }) as Pool;

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
  }

  const db = drizzle(pool, { schema });

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
  await migrate(db, { migrationsFolder });

  const moduleExports = {
    db,
    createDb: () => db,
    getDb: () => db,
    createPool: () => pool,
    getPool: () => pool,
    ...schema,
  } satisfies Partial<typeof import('@db')> & { db: typeof db };

  const mock = () => {
    vi.doMock('@db', () => moduleExports);
    vi.doMock('@db/client', () => moduleExports);
  };

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    if (usingExternal) {
      await resetExternalDatabase(pool);
    }
    await pool.end();
    vi.resetModules();
  };

  return { db, pool, mock, cleanup };
}
