import { randomUUID } from 'node:crypto';

import { newDb, type IMemoryDb } from 'pg-mem';
import { Pool, types, type PoolClient, type QueryResult } from 'pg';

type QueryConfig = { text: string } & Record<string, any>;

type NormalizedQuery = {
  text?: string;
  config?: QueryConfig;
  rowMode?: string;
};

const userRoleDoPattern = /\s*DO\s+\$\$[\s\S]*?CREATE\s+TYPE\s+"public"\."user_role"\s+AS\s+ENUM[\s\S]*?\$\$\s*;?/gi;
const genericDoPattern = /\s*DO\s+\$\$[\s\S]*?\$\$\s*;?/gi;
const alterUsingPattern = /(ALTER\s+TABLE\s+[^;]+?\s+ALTER\s+COLUMN\s+[^;]+?\s+TYPE\s+[^;]+?)\s+USING\s+[^;]+(;?)/gis;
const foreignKeyNoActionPattern = /ON\s+DELETE\s+NO\s+ACTION/gi;
const foreignKeyUpdateNoActionPattern = /ON\s+UPDATE\s+NO\s+ACTION/gi;
const alterForeignKeyPattern = /ALTER\s+TABLE\s+[^;]+?ADD\s+CONSTRAINT\s+[^;]+?FOREIGN\s+KEY[\s\S]*?;/gis;

function extractQueryConfig(configOrText: any): NormalizedQuery {
  if (typeof configOrText === 'string') {
    return { text: configOrText };
  }

  if (configOrText && typeof configOrText.text === 'string') {
    const { text, rowMode, types: _types, ...rest } = configOrText;
    return { text, config: rest, rowMode };
  }

  return { config: configOrText };
}

function sanitizeSql(text: string): string[] {
  let normalized = text;

  normalized = normalized.replace(
    userRoleDoPattern,
    'CREATE TYPE IF NOT EXISTS "public"."user_role" AS ENUM (\'standard\', \'admin\');',
  );

  normalized = normalized.replace(genericDoPattern, '');
  normalized = normalized.replace(alterForeignKeyPattern, '');
  normalized = normalized.replace(foreignKeyUpdateNoActionPattern, '');
  normalized = normalized.replace(foreignKeyNoActionPattern, '');
  normalized = normalized.replace(alterUsingPattern, '$1$2');

  return normalized
    .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function createEmptyResult(): QueryResult<any> {
  return {
    command: '',
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: [],
  } as QueryResult<any>;
}

function handleCustomStatements(statement: string, mem: IMemoryDb): QueryResult<any> | undefined {
  const createUserRole = /CREATE\s+TYPE\s+IF\s+NOT\s+EXISTS\s+"public"\."user_role"\s+AS\s+ENUM\s*\('standard',\s*'admin'\)\s*;?/i;

  if (createUserRole.test(statement)) {
    try {
      mem.public.none("CREATE TYPE \"public\".\"user_role\" AS ENUM ('standard', 'admin')");
    } catch (error) {
      if (!/already exists/i.test((error as Error).message ?? '')) {
        throw error;
      }
    }

    return createEmptyResult();
  }

  return undefined;
}

function wrapQuery(original: Pool['query'], mem: IMemoryDb): Pool['query'] {
  return (function wrapped(configOrText: any, valuesOrCallback?: any, maybeCallback?: any) {
    let values = valuesOrCallback;
    let callback = maybeCallback;

    if (typeof values === 'function') {
      callback = values;
      values = undefined;
    }

    const { text, config, rowMode } = extractQueryConfig(configOrText);

    if (!text) {
      if (typeof callback === 'function') {
        return original(configOrText, values, callback);
      }

      return original(configOrText, values, callback);
    }

    const statements = sanitizeSql(text);

    const run = async (): Promise<QueryResult<any>> => {
      if (statements.length === 0) {
        return createEmptyResult();
      }

      const applyRowMode = (result: QueryResult<any>): QueryResult<any> => {
        if (!result || rowMode !== 'array' || !result.rows || result.rows.length === 0) {
          return result;
        }

        if (Array.isArray(result.rows[0])) {
          return result;
        }

        const fieldMetadata = (result as unknown as { fields?: Array<{ name: string }> }).fields;
        const columnNames =
          Array.isArray(fieldMetadata) && fieldMetadata.length > 0
            ? fieldMetadata.map((field) => field.name)
            : Object.keys(result.rows[0]!);

        result.rows = result.rows.map((row) => columnNames.map((column) => row?.[column]));
        return result;
      };

      const execute = async (statement: string): Promise<QueryResult<any>> => {
        const customResult = handleCustomStatements(statement, mem);
        if (customResult) {
          return applyRowMode(customResult);
        }

        let queryResult: QueryResult<any>;
        if (config) {
          const queryConfig = { ...config, text: statement };
          delete (queryConfig as Record<string, unknown>).rowMode;
          queryResult = await original(queryConfig, values);
        } else {
          queryResult = await original(statement, values);
        }

        return applyRowMode(queryResult);
      };

      if (statements.length === 1) {
        return execute(statements[0]);
      }

      if (values !== undefined && values !== null) {
        const hasValues =
          Array.isArray(values)
            ? values.length > 0
            : typeof values === 'object' && Object.keys(values).length > 0;

        if (hasValues) {
          throw new Error('mock-pg: multi-statement queries with bound values are not supported');
        }
      }

      let lastResult: QueryResult<any> = createEmptyResult();
      for (const statement of statements) {
        lastResult = await execute(statement);
      }

      return lastResult;
    };

    if (typeof callback === 'function') {
      run().then(
        (result) => callback!(null, result),
        (error) => callback!(error),
      );

      return undefined as unknown as ReturnType<Pool['query']>;
    }

    return run();
  }) as Pool['query'];
}

function patchPool(pool: Pool, mem: IMemoryDb): Pool {
  pool.query = wrapQuery(pool.query.bind(pool), mem);

  const originalConnect = pool.connect.bind(pool);
  pool.connect = (async (...args) => {
    const client = await originalConnect(...args);
    client.query = wrapQuery(client.query.bind(client), mem) as PoolClient['query'];
    return client;
  }) as Pool['connect'];

  return pool;
}

export function createMockPool(): Pool {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.none('create schema if not exists drizzle');
  mem.public.registerFunction({
    name: 'random',
    returns: 'double precision',
    implementation: () => Math.random(),
  });
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUID(),
    impure: true,
  });
  mem.public.registerFunction({
    name: 'floor',
    args: ['double precision'],
    returns: 'double precision',
    implementation: (value: number) => Math.floor(Number(value)),
  });
  mem.public.registerFunction({
    name: 'to_hex',
    args: ['int8'],
    returns: 'text',
    implementation: (value: number | string) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      const hex = Math.trunc(Number(numeric)).toString(16);
      return hex;
    },
  });
  mem.public.registerFunction({
    name: 'lpad',
    args: ['text', 'int4', 'text'],
    returns: 'text',
    implementation: (input: string, targetLength: number, fill: string) => {
      const value = input ?? '';
      const filler = (fill ?? ' ') || ' ';
      const length = Math.max(Number(targetLength) || 0, 0);
      if (value.length >= length) {
        return value;
      }
      const padLength = length - value.length;
      const fillerLength = filler.length || 1;
      const repeated = filler.repeat(Math.ceil(padLength / fillerLength)).slice(0, padLength);
      return repeated + value;
    },
  });
  mem.public.registerFunction({
    name: 'substr',
    args: ['text', 'int4', 'int4'],
    returns: 'text',
    implementation: (input: string, start: number, length: number) => {
      const text = input ?? '';
      const from = Math.max((Number(start) || 1) - 1, 0);
      const size = Math.max(Number(length) || 0, 0);
      return text.substring(from, from + size);
    },
  });
  mem.public.registerFunction({
    name: 'substr',
    args: ['text', 'int4'],
    returns: 'text',
    implementation: (input: string, start: number) => {
      const text = input ?? '';
      const from = Math.max((Number(start) || 1) - 1, 0);
      return text.substring(from);
    },
  });

  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool({ types }) as Pool;
  return patchPool(pool, mem);
}
