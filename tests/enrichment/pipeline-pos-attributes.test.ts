import { describe, expect, it } from 'vitest';

import { mergePosAttributes } from '../../scripts/enrichment/pipeline';
import type { EnrichmentPrepositionSuggestion } from '../../shared/enrichment';
import type { WordPosAttributes } from '../../shared/types';

describe('mergePosAttributes', () => {
  it('merges preposition cases, tags, and notes from suggestions', () => {
    const existing: WordPosAttributes = {
      pos: 'preposition',
      preposition: { cases: ['Dativ'], notes: ['temporal'] },
      tags: ['two-way'],
      notes: ['Existing note'],
    };

    const suggestions: EnrichmentPrepositionSuggestion[] = [
      { source: 'kaikki.org', cases: ['Akkusativ'], notes: ['Directional'] },
    ];

    const result = mergePosAttributes(
      'Präp',
      existing,
      suggestions,
      'preposition',
      ['two-way', 'idiomatic'],
      ['Used with movement'],
    );

    expect(result).toEqual({
      pos: 'preposition',
      preposition: { cases: ['Akkusativ', 'Dativ'], notes: ['Directional', 'temporal'] },
      tags: ['idiomatic', 'two-way'],
      notes: ['Existing note', 'Used with movement'],
    });
  });

  it('returns merged metadata even when no preposition data is present', () => {
    const result = mergePosAttributes(
      'N',
      null,
      [],
      'proper noun',
      ['countable'],
      ['Used predominantly in Switzerland'],
    );

    expect(result).toEqual({
      pos: 'proper noun',
      tags: ['countable'],
      notes: ['Used predominantly in Switzerland'],
    });
  });
});
