import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { Pool, types } from "pg";
import type { IMemoryDb } from "pg-mem";

import { handleCustomStatements, patchPool, sanitizeSql } from "./transactions.js";
import { seedMockData } from "./fixtures/index.js";

const require = createRequire(import.meta.url);

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

function loadPgMem(): typeof import("pg-mem") {
  try {
    return require("pg-mem") as typeof import("pg-mem");
  } catch (error) {
    throw new Error(
      "pg-mem is required to create the mock database pool. Install it as a dev dependency to enable the mock.",
      { cause: error },
    );
  }
}

function applyMigrations(mem: IMemoryDb): void {
  const entries = fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of entries) {
    const filePath = path.join(migrationsFolder, fileName);
    const sql = fs.readFileSync(filePath, "utf8");
    const statements = sanitizeSql(sql);

    for (const statement of statements) {
      const custom = handleCustomStatements(statement, mem);
      if (custom) {
        continue;
      }

      mem.public.none(statement);
    }
  }
}

function ensureDatabase(mem: IMemoryDb): void {
  mem.public.none("create schema if not exists drizzle");
  mem.public.registerFunction({
    name: "random",
    returns: "double precision",
    implementation: () => Math.random(),
  } as any);
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID(),
    impure: true,
  } as any);
  mem.public.registerFunction({
    name: "floor",
    args: ["double precision"],
    returns: "double precision",
    implementation: (value: number) => Math.floor(Number(value)),
  } as any);
  mem.public.registerFunction({
    name: "to_hex",
    args: ["int8"],
    returns: "text",
    implementation: (value: number | string) => {
      const numeric = typeof value === "string" ? Number(value) : value;
      return Math.trunc(Number(numeric)).toString(16);
    },
  } as any);
  mem.public.registerFunction({
    name: "lpad",
    args: ["text", "int4", "text"],
    returns: "text",
    implementation: (input: string, targetLength: number, fill: string) => {
      const value = input ?? "";
      const filler = (fill ?? " ") || " ";
      const length = Math.max(Number(targetLength) || 0, 0);
      if (value.length >= length) {
        return value;
      }
      const padLength = length - value.length;
      const fillerLength = filler.length || 1;
      const repeated = filler.repeat(Math.ceil(padLength / fillerLength)).slice(0, padLength);
      return repeated + value;
    },
  } as any);
  mem.public.registerFunction({
    name: "substr",
    args: ["text", "int4", "int4"],
    returns: "text",
    implementation: (input: string, start: number, length: number) => {
      const text = input ?? "";
      const from = Math.max((Number(start) || 1) - 1, 0);
      const size = Math.max(Number(length) || 0, 0);
      return text.substring(from, from + size);
    },
  } as any);
  mem.public.registerFunction({
    name: "substr",
    args: ["text", "int4"],
    returns: "text",
    implementation: (input: string, start: number) => {
      const text = input ?? "";
      const from = Math.max((Number(start) || 1) - 1, 0);
      return text.substring(from);
    },
  } as any);
}

let cachedPool: Pool | null = null;

export interface CreateMockPoolOptions {
  seed?: boolean;
}

export function createMockPool(options: CreateMockPoolOptions = {}): Pool {
  if (cachedPool) {
    return cachedPool;
  }

  const { newDb } = loadPgMem();
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  ensureDatabase(mem);
  applyMigrations(mem);

  if (options.seed !== false) {
    seedMockData(mem);
  }

  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool({ types }) as Pool;
  cachedPool = patchPool(pool, mem);
  return cachedPool;
}
