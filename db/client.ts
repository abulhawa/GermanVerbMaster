import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

export interface DatabasePoolOptions {
  connectionString?: string;
  ssl?: PoolConfig["ssl"] | boolean;
}

let poolInstance: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

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
