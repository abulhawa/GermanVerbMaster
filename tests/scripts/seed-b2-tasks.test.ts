import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setupTestDatabase, type TestDatabaseContext } from '../helpers/pg'

describe('seed-b2-tasks script', () => {
  let dbContext: TestDatabaseContext | undefined
  let drizzleDb: typeof import('@db').db

  beforeEach(async () => {
    dbContext = await setupTestDatabase()
    dbContext.mock()

    const dbModule = await import('@db')
    drizzleDb = dbModule.db
  })

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup()
      dbContext = undefined
    }
  })

  it('upserts 10 B2 scenarios idempotently', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised')
    }

    const { seedB2Tasks, B2_SCENARIOS } = await import('../../scripts/seed-b2-tasks')

    const firstRun = await seedB2Tasks(drizzleDb)
    expect(firstRun.taskSpecCount).toBe(B2_SCENARIOS.length)

    const initialTaskCount = await dbContext.pool.query(
      "select count(*)::int as count from task_specs where task_type = 'b2_writing_prompt'",
    )
    expect(initialTaskCount.rows[0]?.count).toBe(10)

    const initialLexemeCount = await dbContext.pool.query(
      "select count(*)::int as count from lexemes where id like 'lex:b2:%'",
    )
    expect(initialLexemeCount.rows[0]?.count).toBe(10)

    const initialInflectionCount = await dbContext.pool.query(
      "select count(*)::int as count from inflections where id like 'inf:b2:%'",
    )
    expect(initialInflectionCount.rows[0]?.count).toBe(10)

    await dbContext.pool.query(
      "update task_specs set prompt = '{}'::jsonb where id = 'task:b2:formal-work-email'",
    )

    await seedB2Tasks(drizzleDb)

    const secondTaskCount = await dbContext.pool.query(
      "select count(*)::int as count from task_specs where task_type = 'b2_writing_prompt'",
    )
    expect(secondTaskCount.rows[0]?.count).toBe(10)

    const restoredPrompt = await dbContext.pool.query(
      `
        select
          prompt->>'cefrLevel' as level,
          jsonb_array_length(prompt->'wordBankItems')::int as word_bank_count,
          jsonb_array_length(solution->'keyPhrases')::int as key_phrase_count
        from task_specs
        where id = 'task:b2:formal-work-email'
      `,
    )

    expect(restoredPrompt.rows[0]?.level).toBe('B2')
    expect(Number(restoredPrompt.rows[0]?.word_bank_count)).toBeGreaterThanOrEqual(4)
    expect(Number(restoredPrompt.rows[0]?.word_bank_count)).toBeLessThanOrEqual(6)
    expect(Number(restoredPrompt.rows[0]?.key_phrase_count)).toBeGreaterThanOrEqual(3)
    expect(Number(restoredPrompt.rows[0]?.key_phrase_count)).toBeLessThanOrEqual(4)
  })
})
