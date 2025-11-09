import { describe, expect, it } from 'vitest';

import {
  createExampleFallback,
  mergeWordPosAttributes,
  normaliseBoolean,
  normaliseExamples,
  normaliseLevel,
  normaliseString,
  normalizeStringArray,
  parseBooleanish,
  resolveFallbackExample,
} from '../../../scripts/seed/normalizers';
import type { BasePosJsonRecord } from '../../../scripts/seed/types';

describe('seed normalizers', () => {
  it('normalises primitive values', () => {
    expect(normaliseString('  value  ')).toBe('value');
    expect(normaliseString(null)).toBeNull();
    expect(normaliseLevel('b1')).toBe('B1');
    expect(normaliseLevel('custom')).toBe('custom');
  });

  it('coerces booleans from various forms', () => {
    expect(parseBooleanish('YES')).toBe(true);
    expect(parseBooleanish('0')).toBe(false);
    expect(normaliseBoolean('1')).toBe(true);
    expect(normaliseBoolean(0)).toBe(false);
    expect(normaliseBoolean(undefined)).toBeNull();
  });

  it('creates and resolves fallback examples', () => {
    const record: BasePosJsonRecord = {
      lemma: 'laufen',
      example_de: 'Ich laufe nach Hause.',
      example_en: 'I walk home.',
    };
    const fallback = createExampleFallback(record);
    expect(fallback).not.toBeNull();

    const resolved = resolveFallbackExample(fallback);
    expect(resolved).toMatchObject({
      sentence: 'Ich laufe nach Hause.',
      translations: { en: 'I walk home.' },
    });
  });

  it('normalises examples and dedupes entries', () => {
    const fallback: BasePosJsonRecord = {
      lemma: 'lernen',
      example_de: 'Ich lerne.',
      example_en: 'I learn.',
    };

    const { examples, exampleDe, exampleEn } = normaliseExamples(
      [
        { sentence: 'Ich lerne.', translations: { en: 'I learn.' } },
        { sentence: 'Ich lerne.', translations: { en: 'I learn.' } },
      ],
      createExampleFallback(fallback),
    );

    expect(exampleDe).toBe('Ich lerne.');
    expect(exampleEn).toBe('I learn.');
    expect(examples).toHaveLength(1);
  });

  it('merges word POS attributes from multiple sources', () => {
    const merged = mergeWordPosAttributes(
      { pos: 'Präp', preposition: { cases: ['Akkusativ'], notes: ['movement'] }, tags: ['core'] },
      { preposition: { cases: ['Dativ'] }, notes: ['usage'], tags: ['core', 'additional'] },
    );

    expect(merged?.preposition?.cases).toEqual(['Akkusativ', 'Dativ']);
    expect(merged?.notes).toEqual(['movement', 'usage']);
    expect(merged?.tags).toEqual(['additional', 'core']);
  });

  it('normalizes string arrays', () => {
    expect(normalizeStringArray([' Hallo ', 'hallo', null, 'Tschüss'])).toEqual(['Hallo', 'Tschüss']);
  });
});
