import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { Pool, types, type PoolClient, type QueryResult } from "pg";

import type { IMemoryDb } from "pg-mem";

const require = createRequire(import.meta.url);

type QueryConfig = Record<string, unknown>;

type NormalizedQuery = {
  text?: string;
  config?: QueryConfig;
};

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

const userRoleDoPattern =
  /\s*DO\s+\$\$[\s\S]*?CREATE\s+TYPE\s+"public"\."user_role"\s+AS\s+ENUM[\s\S]*?\$\$\s*;?/gi;
const genericDoPattern = /\s*DO\s+\$\$[\s\S]*?\$\$\s*;?/gi;
const alterUsingPattern = /(ALTER\s+TABLE\s+[^;]+?\s+ALTER\s+COLUMN\s+[^;]+?\s+TYPE\s+[^;]+?)\s+USING\s+[^;]+(;?)/gis;
const foreignKeyNoActionPattern = /ON\s+DELETE\s+NO\s+ACTION/gi;
const foreignKeyUpdateNoActionPattern = /ON\s+UPDATE\s+NO\s+ACTION/gi;
const alterForeignKeyPattern = /ALTER\s+TABLE\s+[^;]+?ADD\s+CONSTRAINT\s+[^;]+?FOREIGN\s+KEY[\s\S]*?;/gis;

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

function extractQueryConfig(configOrText: unknown): NormalizedQuery {
  if (typeof configOrText === "string") {
    return { text: configOrText };
  }

  if (configOrText && typeof (configOrText as { text?: unknown }).text === "string") {
    const { text, types: _types, rowMode, ...rest } = configOrText as { text: string } & QueryConfig & {
      types?: unknown;
      rowMode?: unknown;
    };
    return { text, config: rest };
  }

  return { config: (configOrText as QueryConfig | undefined) ?? undefined };
}

function sanitizeSql(text: string): string[] {
  let normalized = text.replace(/-->\s*statement-breakpoint/gi, "");

  normalized = normalized.replace(
    userRoleDoPattern,
    'CREATE TYPE IF NOT EXISTS "public"."user_role" AS ENUM (\'standard\', \'admin\');',
  );

  normalized = normalized.replace(genericDoPattern, "");
  normalized = normalized.replace(alterForeignKeyPattern, "");
  normalized = normalized.replace(foreignKeyUpdateNoActionPattern, "");
  normalized = normalized.replace(foreignKeyNoActionPattern, "");
  normalized = normalized.replace(alterUsingPattern, "$1$2");

  return normalized
    .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function createEmptyResult(): QueryResult<any> {
  return {
    command: "",
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: [],
  } as QueryResult<any>;
}

function handleCustomStatements(statement: string, mem: IMemoryDb): QueryResult<any> | undefined {
  const createUserRole =
    /CREATE\s+TYPE\s+IF\s+NOT\s+EXISTS\s+"public"\."user_role"\s+AS\s+ENUM\s*\('standard',\s*'admin'\)\s*;?/i;

  if (createUserRole.test(statement)) {
    try {
      mem.public.none("CREATE TYPE \"public\".\"user_role\" AS ENUM ('standard', 'admin')");
    } catch (error) {
      if (!/already exists/i.test((error as Error).message ?? "")) {
        throw error;
      }
    }

    return createEmptyResult();
  }

  return undefined;
}

function wrapQuery(original: Pool["query"], mem: IMemoryDb): Pool["query"] {
  return (function wrapped(configOrText: unknown, valuesOrCallback?: unknown, maybeCallback?: unknown) {
    let values = valuesOrCallback as unknown;
    let callback = maybeCallback as unknown;

    if (typeof values === "function") {
      callback = values;
      values = undefined;
    }

    const { text, config } = extractQueryConfig(configOrText);

    if (!text) {
      if (typeof callback === "function") {
        return (original as any)(configOrText as any, values, callback as any);
      }

      return (original as any)(configOrText as any, values, callback as any);
    }

    const statements = sanitizeSql(text);

    const run = async (): Promise<QueryResult<any>> => {
      if (statements.length === 0) {
        return createEmptyResult();
      }

      const execute = (statement: string) => {
        const customResult = handleCustomStatements(statement, mem);
        if (customResult) {
          return Promise.resolve(customResult);
        }

        if (config) {
          return (original as any)({ ...(config as QueryConfig), text: statement } as any, values as any);
        }

        return (original as any)(statement as any, values as any);
      };

      if (statements.length === 1) {
        return execute(statements[0]);
      }

      if (values !== undefined && values !== null) {
        const hasValues = Array.isArray(values)
          ? values.length > 0
          : typeof values === "object" && Object.keys(values as Record<string, unknown>).length > 0;

        if (hasValues) {
          throw new Error("mock-pg: multi-statement queries with bound values are not supported");
        }
      }

      let lastResult: QueryResult<any> = createEmptyResult();
      for (const statement of statements) {
        lastResult = await execute(statement);
      }

      return lastResult;
    };

    if (typeof callback === "function") {
      (run as () => Promise<QueryResult<any>>)().then(
        (result) => (callback as (error: null, result: QueryResult<any>) => void)(null, result),
        (error) => (callback as (error: unknown) => void)(error),
      );

      return undefined as unknown as ReturnType<Pool["query"]>;
    }

    return run();
  }) as Pool["query"];
}

function patchPool(pool: Pool, mem: IMemoryDb): Pool {
  pool.query = wrapQuery(pool.query.bind(pool), mem);

  const originalConnect = pool.connect.bind(pool) as (...args: any[]) => Promise<PoolClient>;
  pool.connect = (async (...args: any[]) => {
    const client = await originalConnect(...args);
    (client as PoolClient).query = wrapQuery(client.query.bind(client), mem) as PoolClient["query"];
    return client as PoolClient;
  }) as Pool["connect"];

  return pool;
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

function toJsonLiteral(value: unknown): string {
  return `'${JSON.stringify(value ?? null).replace(/'/g, "''")}'::jsonb`;
}

function toTextLiteral(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return "NULL";
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function toBooleanLiteral(value: boolean | null | undefined): string {
  if (value === undefined || value === null) {
    return "NULL";
  }
  return value ? "TRUE" : "FALSE";
}

function toTimestampLiteral(value: string | Date | null | undefined): string {
  if (!value) {
    return "NULL";
  }
  const iso = value instanceof Date ? value.toISOString() : value;
  return `'${iso.replace(/'/g, "''")}'::timestamptz`;
}

function seedMockData(mem: IMemoryDb): void {
  const now = new Date().toISOString();

  mem.public.none(
    `INSERT INTO words (
      id,
      lemma,
      pos,
      level,
      english,
      example_de,
      example_en,
      gender,
      plural,
      separable,
      aux,
      praesens_ich,
      praesens_er,
      praeteritum,
      partizip_ii,
      perfekt,
      approved,
      complete,
      translations,
      examples,
      pos_attributes,
      enrichment_applied_at,
      enrichment_method,
      created_at,
      updated_at
    ) VALUES (
      1,
      'arbeiten',
      'V',
      'A1',
      'to work',
      'Sie arbeitet jeden Tag.',
      'She works every day.',
      NULL,
      NULL,
      NULL,
      'haben',
      'arbeite',
      'arbeitet',
      'arbeitete',
      'gearbeitet',
      'hat gearbeitet',
      TRUE,
      TRUE,
      ${toJsonLiteral([
        { value: "to work", source: "wiktextract", language: "en" },
        { value: "to labour", source: "kaikki", language: "en" },
      ])},
      ${toJsonLiteral([
        {
          sentence: "Sie arbeitet jeden Tag im Büro.",
          translations: { en: "She works in the office every day." },
        },
        {
          sentence: "Wir haben gestern lange gearbeitet.",
          translations: { en: "We worked for a long time yesterday." },
        },
      ])},
      ${toJsonLiteral({ verbForms: { infinitive: "arbeiten", participle: "gearbeitet" } })},
      ${toTimestampLiteral(now)},
      'manual_entry',
      ${toTimestampLiteral(now)},
      ${toTimestampLiteral(now)}
    );`,
  );

  mem.public.none(
    `INSERT INTO enrichment_provider_snapshots (
      id,
      word_id,
      lemma,
      pos,
      provider_id,
      provider_label,
      status,
      error,
      trigger,
      mode,
      translations,
      examples,
      synonyms,
      english_hints,
      verb_forms,
      noun_forms,
      adjective_forms,
      preposition_attributes,
      raw_payload,
      collected_at,
      created_at
    ) VALUES
    (
      1,
      1,
      'arbeiten',
      'V',
      'wiktextract',
      'Wiktextract',
      'success',
      NULL,
      'manual',
      'approved',
      ${toJsonLiteral([
        { value: "to work", source: "wiktextract", language: "en", confidence: 0.92 },
      ])},
      ${toJsonLiteral([
        {
          sentence: "Sie arbeitet als Ingenieurin.",
          translations: { en: "She works as an engineer." },
        },
      ])},
      ${toJsonLiteral(["schaffen", "tätig sein"])},
      ${toJsonLiteral(["labour", "profession"] )},
      ${toJsonLiteral({ infinitive: "arbeiten", participle: "gearbeitet" })},
      NULL,
      NULL,
      NULL,
      ${toJsonLiteral({ provider: "wiktextract", version: "mock" })},
      ${toTimestampLiteral(now)},
      ${toTimestampLiteral(now)}
    ),
    (
      2,
      1,
      'arbeiten',
      'V',
      'kaikki',
      'Kaikki',
      'success',
      NULL,
      'manual',
      'approved',
      ${toJsonLiteral([
        { value: "to labour", source: "kaikki", language: "en", confidence: 0.75 },
        { value: "to toil", source: "kaikki", language: "en", confidence: 0.68 },
      ])},
      ${toJsonLiteral([
        {
          sentence: "Wir arbeiten gemeinsam an dem Projekt.",
          translations: { en: "We are working on the project together." },
        },
      ])},
      ${toJsonLiteral(["kooperieren", "handwerken"])},
      ${toJsonLiteral(["project", "teamwork"] )},
      ${toJsonLiteral({ thirdPersonSingular: "arbeitet", past: "arbeitete" })},
      NULL,
      NULL,
      NULL,
      ${toJsonLiteral({ provider: "kaikki", version: "mock" })},
      ${toTimestampLiteral(new Date(Date.now() - 1000 * 60 * 60))},
      ${toTimestampLiteral(now)}
    );`,
  );
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

