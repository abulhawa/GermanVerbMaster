import { describe, expect, it } from 'vitest';
import { derivePromptLemma, derivePromptLemmaFromEntry } from '@/lib/prompt-lemma';

describe('derivePromptLemma', () => {
  it('returns the lemma before an en dash', () => {
    expect(derivePromptLemma('arbeiten – Partizip II angeben')).toBe('arbeiten');
  });

  it('captures the lemma from legacy von prompts', () => {
    expect(derivePromptLemma('Partizip II von gehen')).toBe('gehen');
  });

  it('ignores surrounding punctuation when parsing', () => {
    expect(derivePromptLemma('Translate to English: laufen?')).toBe('laufen');
  });

  it('strips leading articles when present', () => {
    expect(derivePromptLemma('Bestimme den Artikel für den Apfel')).toBe('Apfel');
  });
});

describe('derivePromptLemmaFromEntry', () => {
  it('prefers the prompt summary when both values exist', () => {
    expect(
      derivePromptLemmaFromEntry({
        promptSummary: 'spielen – Präsens',
        prompt: 'Partizip II von gehen',
      }),
    ).toBe('spielen');
  });

  it('falls back to the prompt value when summary is missing', () => {
    expect(
      derivePromptLemmaFromEntry({
        prompt: 'Plural von Häuser',
      }),
    ).toBe('Häuser');
  });
});
