import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { types } from 'pg';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
let applyMigrations: typeof import('../scripts/db-push').applyMigrations;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://local.test/database';
  }

  ({ applyMigrations } = await import('../scripts/db-push'));
});

afterAll(() => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe('applyMigrations', () => {
  it('creates the expected tables and indexes in a fresh database', async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool } = mem.adapters.createPg();
    const pool = new Pool({ types });

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
            return undefined as unknown as ReturnType<typeof pool.query>;
          }

          return promise;
        }
      }

      return originalQuery(configOrText, values, callback);
    }) as typeof pool.query;

    await applyMigrations(pool);

    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        'lexemes',
        'task_specs',
        'scheduling_state',
        'practice_history',
        'pack_lexeme_map',
      ]),
    );

    await pool.query(
      "insert into lexemes (id, lemma, language, pos, source_ids, metadata) values ($1, $2, 'de', 'verb', $3::jsonb, $4::jsonb)",
      ['lex:1', 'gehen', '[]', '{}'],
    );

    await expect(
      pool.query(
        "insert into lexemes (id, lemma, language, pos, source_ids, metadata) values ($1, $2, 'de', 'verb', $3::jsonb, $4::jsonb)",
        ['lex:2', 'gehen', '[]', '{}'],
      ),
    ).rejects.toThrow(/unique/i);

    await pool.end();
  });
});
