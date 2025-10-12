import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockPool } from './helpers/mock-pg';

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
    const pool = createMockPool();

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
