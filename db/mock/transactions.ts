import { type Pool, type PoolClient, type QueryResult } from "pg";
import type { IMemoryDb } from "pg-mem";

export type QueryConfig = Record<string, unknown>;

export type NormalizedQuery = {
  text?: string;
  config?: QueryConfig;
};

interface EnumTypeDefinition {
  schema: string | null;
  name: string;
  values: readonly string[];
}

const enumTypeDefinitions: readonly EnumTypeDefinition[] = [
  {
    schema: "public",
    name: "enrichment_method",
    values: ["bulk", "manual_api", "manual_entry", "preexisting"],
  },
  {
    schema: "public",
    name: "user_role",
    values: ["standard", "admin"],
  },
  {
    schema: "public",
    name: "practice_result",
    values: ["correct", "incorrect"],
  },
  {
    schema: "public",
    name: "job_run_status",
    values: ["running", "success", "failed"],
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatQualifiedTypeName(definition: EnumTypeDefinition): string {
  if (definition.schema) {
    return `"${definition.schema}"."${definition.name}"`;
  }

  return `"${definition.name}"`;
}

function createEnumValuesLiteral(definition: EnumTypeDefinition): string {
  return definition.values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}

function createEnumTypeStatement(
  definition: EnumTypeDefinition,
  options: { ifNotExists?: boolean } = {},
): string {
  const prefix = options.ifNotExists ? "CREATE TYPE IF NOT EXISTS" : "CREATE TYPE";
  return `${prefix} ${formatQualifiedTypeName(definition)} AS ENUM (${createEnumValuesLiteral(definition)});`;
}

function buildEnumDoPattern(definition: EnumTypeDefinition): RegExp {
  const schemaPart = definition.schema ? `"${escapeRegex(definition.schema)}"\\.` : "";
  return new RegExp(
    `\\s*DO\\s+\\$\\$[\\s\\S]*?CREATE\\s+TYPE\\s+${schemaPart}"${escapeRegex(definition.name)}"\\s+AS\\s+ENUM[\\s\\S]*?\\$\\$\\s*;?`,
    "gi",
  );
}

const enumDoReplacements = enumTypeDefinitions.map((definition) => ({
  pattern: buildEnumDoPattern(definition),
  replacement: createEnumTypeStatement(definition, { ifNotExists: true }),
}));

const genericDoPattern = /\s*DO\s+\$\$[\s\S]*?\$\$\s*;?/gi;
const alterUsingPattern = /(ALTER\s+TABLE\s+[^;]+?\s+ALTER\s+COLUMN\s+[^;]+?\s+TYPE\s+[^;]+?)\s+USING\s+[^;]+(;?)/gis;
const foreignKeyNoActionPattern = /ON\s+DELETE\s+NO\s+ACTION/gi;
const foreignKeyUpdateNoActionPattern = /ON\s+UPDATE\s+NO\s+ACTION/gi;
const alterForeignKeyPattern = /ALTER\s+TABLE\s+[^;]+?ADD\s+CONSTRAINT\s+[^;]+?FOREIGN\s+KEY[\s\S]*?;/gis;

export function extractQueryConfig(configOrText: unknown): NormalizedQuery {
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

export function sanitizeSql(text: string): string[] {
  let normalized = text.replace(/-->\s*statement-breakpoint/gi, "");

  for (const { pattern, replacement } of enumDoReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

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

export function createEmptyResult(): QueryResult<any> {
  return {
    command: "",
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: [],
  } as QueryResult<any>;
}

function matchesEnumCreateStatement(statement: string, definition: EnumTypeDefinition): boolean {
  const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
  const schemaQualified = definition.schema
    ? `"${definition.schema.toLowerCase()}"."${definition.name.toLowerCase()}"`
    : `"${definition.name.toLowerCase()}"`;
  const schemaQualifiedBare = definition.schema
    ? `${definition.schema.toLowerCase()}.${definition.name.toLowerCase()}`
    : definition.name.toLowerCase();
  const bareName = definition.name.toLowerCase();
  const candidates = new Set<string>([schemaQualified, schemaQualifiedBare, `"${bareName}"`, bareName]);

  for (const candidate of candidates) {
    if (normalized.startsWith(`create type if not exists ${candidate} as enum`)) {
      return true;
    }

    if (normalized.startsWith(`create type ${candidate} as enum`)) {
      return true;
    }
  }

  return false;
}

function handleEnumCreateStatement(
  statement: string,
  mem: IMemoryDb,
): QueryResult<any> | undefined {
  for (const definition of enumTypeDefinitions) {
    if (!matchesEnumCreateStatement(statement, definition)) {
      continue;
    }

    try {
      mem.public.none(`CREATE TYPE ${formatQualifiedTypeName(definition)} AS ENUM (${createEnumValuesLiteral(definition)})`);
    } catch (error) {
      if (!/already exists/i.test((error as Error).message ?? "")) {
        throw error;
      }
    }

    return createEmptyResult();
  }

  return undefined;
}

const dropWordsExportQueue = /DROP\s+VIEW\s+IF\s+EXISTS\s+"words_export_queue"\s*;?/i;
const dropEnrichmentSnapshots = /DROP\s+TABLE\s+IF\s+EXISTS\s+"enrichment_provider_snapshots"\s*;?/i;

export function handleCustomStatements(
  statement: string,
  mem: IMemoryDb,
): QueryResult<any> | undefined {
  const enumResult = handleEnumCreateStatement(statement, mem);
  if (enumResult) {
    return enumResult;
  }

  if (dropWordsExportQueue.test(statement) || dropEnrichmentSnapshots.test(statement)) {
    return createEmptyResult();
  }

  return undefined;
}

export function wrapQuery(original: Pool["query"], mem: IMemoryDb): Pool["query"] {
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

export function patchPool(pool: Pool, mem: IMemoryDb): Pool {
  pool.query = wrapQuery(pool.query.bind(pool), mem);

  const originalConnect = pool.connect.bind(pool) as (...args: any[]) => Promise<PoolClient>;
  pool.connect = (async (...args: any[]) => {
    const client = await originalConnect(...args);
    (client as PoolClient).query = wrapQuery(client.query.bind(client), mem) as PoolClient["query"];
    return client as PoolClient;
  }) as Pool["connect"];

  return pool;
}
