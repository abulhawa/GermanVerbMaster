import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";
import { createMockPool } from "./mock-pool.js";

export interface DatabasePoolOptions {
  connectionString?: string;
  ssl?: PoolConfig["ssl"] | boolean;
}

let poolInstance: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;
let mockDatabaseWarningLogged = false;

function shouldUseMockDatabase(): boolean {
  const preference = (process.env.USE_DEV_DB_MOCK ?? "").toLowerCase();
  const explicitOptIn = ["1", "true", "yes", "on"].includes(preference);
  if (!explicitOptIn) {
    return false;
  }

  const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
  if (nodeEnv === "production" || nodeEnv === "test") {
    return false;
  }

  return true;
}

function resolveSslOption(options: DatabasePoolOptions = {}): PoolConfig["ssl"] | undefined {
  if (options.ssl === false) {
    return false;
  }

  if (options.ssl && options.ssl !== true) {
    return options.ssl;
  }

  if (options.ssl === true) {
    return { rejectUnauthorized: false };
  }

  const sslMode = (process.env.DATABASE_SSL ?? process.env.PGSSLMODE ?? "").toLowerCase();
  if (["disable", "allow", "prefer"].includes(sslMode)) {
    return false;
  }

  return { rejectUnauthorized: false };
}

export function createPool(options: DatabasePoolOptions = {}): Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    if (shouldUseMockDatabase()) {
      if (!mockDatabaseWarningLogged) {
        console.warn(
          "DATABASE_URL is not configured. Falling back to the in-memory mock database for local development.",
        );
        mockDatabaseWarningLogged = true;
      }

      const pool = createMockPool();
      process.env.ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN ?? "dev-admin";
      return pool;
    }

    throw new Error(
      "DATABASE_URL is not configured. Set a connection string before using the database client.",
    );
  }

  const poolConfig: PoolConfig = {
    connectionString,
  };

  const ssl = resolveSslOption(options);
  if (ssl !== undefined) {
    poolConfig.ssl = ssl === true ? { rejectUnauthorized: false } : ssl;
  }

  return new Pool(poolConfig);
}

export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = createPool();
  }

  return poolInstance;
}

export function createDb(pool: Pool = getPool()): NodePgDatabase<typeof schema> {
  return drizzle(pool, { schema });
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = createDb();
  }

  return dbInstance;
}

export const db = getDb();
