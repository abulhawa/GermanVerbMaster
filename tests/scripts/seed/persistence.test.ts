import { describe, expect, it, vi } from 'vitest';
import { MANUAL_ADMIN_SOURCE } from '@shared/content-sources';

vi.mock('../../../scripts/etl/golden', () => {
  return {
    buildLexemeInventory: vi.fn(() => ({
      lexemes: [{ id: '1' }],
      inflections: [{ id: 'a' }, { id: 'b' }],
    })),
    upsertLexemeInventory: vi.fn(async () => {}),
  };
});

import * as persistence from '../../../scripts/seed/persistence';
import type { AggregatedWordWithKey } from '../../../scripts/seed/types';

class FakeDb {
  public inserted: Array<Record<string, unknown>[]> = [];
  public deleteCalls: number = 0;
  public existing: Array<{ lemma: string; pos: string; sourcesCsv?: string | null }>;

  constructor(existing: Array<{ lemma: string; pos: string; sourcesCsv?: string | null }>) {
    this.existing = existing;
  }

  insert() {
    return {
      values: (values: Record<string, unknown>[]) => {
        this.inserted.push(values);
        return {
          onConflictDoUpdate: async () => {},
        };
      },
    };
  }

  select() {
    return {
      from: async () => this.existing,
    };
  }

  async execute(): Promise<void> {
    this.deleteCalls += 1;
  }
}

describe('seed persistence', () => {
  const aggregated: AggregatedWordWithKey[] = [
    {
      key: 'laufen::V',
      lemma: 'laufen',
      pos: 'V',
      level: 'B1',
      english: 'to run',
      exampleDe: 'Ich laufe.',
      exampleEn: 'I run.',
      gender: null,
      plural: null,
      separable: null,
      aux: 'haben',
      praesensIch: 'laufe',
      praesensEr: 'läuft',
      praeteritum: 'lief',
      partizipIi: 'gelaufen',
      perfekt: 'ist gelaufen',
      comparative: null,
      superlative: null,
      approved: true,
      complete: true,
      translations: null,
      examples: null,
      enrichmentAppliedAt: null,
      enrichmentMethod: null,
    },
  ];

  it('inserts batched words with normalized payloads', async () => {
    const db = new FakeDb([]);
    await persistence.insertWordsBatch(db as unknown as any, aggregated);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0][0]).toMatchObject({ lemma: 'laufen', pos: 'V' });
  });

  it('syncs legacy words by deleting missing entries and inserting batches', async () => {
    const db = new FakeDb([{ lemma: 'alt', pos: 'N' }]);

    await persistence.syncLegacyWords(db as unknown as any, aggregated);

    expect(db.deleteCalls).toBe(1);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]?.[0]).toMatchObject({ lemma: 'laufen', pos: 'V' });
  });

  it('preserves manual admin entries that are not present in the seed dataset', async () => {
    const db = new FakeDb([{ lemma: 'Neu', pos: 'V', sourcesCsv: MANUAL_ADMIN_SOURCE }]);

    await persistence.syncLegacyWords(db as unknown as any, aggregated);

    expect(db.deleteCalls).toBe(0);
    expect(db.inserted).toHaveLength(1);
  });

  it('delegates lexeme inventory upsert and returns counts', async () => {
    const golden = await import('../../../scripts/etl/golden');
    const result = await persistence.upsertLexemeInventory({} as any, aggregated);
    expect(golden.buildLexemeInventory).toHaveBeenCalledWith(aggregated);
    expect(golden.upsertLexemeInventory).toHaveBeenCalled();
    expect(result).toEqual({ lexemeCount: 1, inflectionCount: 2 });
  });
});
