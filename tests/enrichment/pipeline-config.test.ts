import { describe, expect, it, beforeEach, afterAll } from 'vitest';

import { resolveConfigFromEnv } from '../../scripts/enrichment/pipeline';

const ORIGINAL_ENV = { ...process.env };

describe('resolveConfigFromEnv', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.POS_FILTERS;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to an empty set of POS filters', () => {
    const config = resolveConfigFromEnv();
    expect(config.posFilters).toEqual([]);
  });

  it('parses POS_FILTERS environment values with aliases', () => {
    process.env.POS_FILTERS = 'noun, adj ,  praep |Konj';

    const config = resolveConfigFromEnv();

    expect(config.posFilters).toEqual(['N', 'Adj', 'Präp', 'Konj']);
  });

  it('treats wildcard filters as no-op and ignores duplicates', () => {
    process.env.POS_FILTERS = 'all, noun, noun, *';

    const config = resolveConfigFromEnv();

    expect(config.posFilters).toEqual(['N']);
  });

  it('honours override-provided filters and normalises them', () => {
    process.env.POS_FILTERS = 'verb';

    const config = resolveConfigFromEnv({ posFilters: ['adverbs', 'N', 'Det'] });

    expect(config.posFilters).toEqual(['Adv', 'N', 'Det']);
  });
});

