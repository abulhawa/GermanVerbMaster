import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig, types } from 'pg';
import { vi } from 'vitest';

import { createMockPool } from './mock-pg';

type Schema = typeof import('../../db/schema.js');

export interface TestDatabaseContext {
  db: NodePgDatabase<Schema>;
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
  const hadDatabaseUrl = Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_URL');
  const originalDatabaseUrl = process.env.DATABASE_URL;

  if (externalConnection && originalDatabaseUrl && externalConnection === originalDatabaseUrl) {
    throw new Error(
      'Refusing to run tests against the production database: TEST_DATABASE_URL matches DATABASE_URL.',
    );
  }

  process.env.DATABASE_URL = 'postgres://test.invalid/german-verb-master';

  let pool: Pool;
  let usingExternal = false;

  if (externalConnection) {
    pool = new Pool(resolveExternalPoolConfig(externalConnection));
    usingExternal = true;
    await resetExternalDatabase(pool);
  } else {
    pool = createMockPool();
  }

  const schema = await import('../../db/schema.js');

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
    vi.doMock('@db/schema', () => schema);
    vi.doMock('@db/schema.js', () => schema);
  };

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    if (hadDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (usingExternal) {
      await resetExternalDatabase(pool);
    }
    await pool.end();
    vi.resetModules();
  };

  return { db, pool, mock, cleanup };
}
