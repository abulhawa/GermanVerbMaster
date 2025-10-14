import type { PartOfSpeech } from '@shared/types';

import type { AggregatedWord } from './types';

export interface PosValidationResult {
  lemma: string;
  pos: PartOfSpeech;
  errors: string[];
  warnings: string[];
}

type PosValidator = (word: AggregatedWord) => PosValidationResult;

function baseValidation(word: AggregatedWord): PosValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!word.lemma?.trim()) {
    errors.push('lemma');
  }
  if (!word.approved) {
    warnings.push('pending_approval');
  }

  return { lemma: word.lemma, pos: word.pos, errors, warnings };
}

function requireField(
  result: PosValidationResult,
  predicate: boolean,
  field: string,
  severity: 'error' | 'warning' = 'error',
): void {
  if (predicate) return;
  if (severity === 'error') {
    result.errors.push(field);
  } else {
    result.warnings.push(field);
  }
}

const VALIDATORS: Record<PartOfSpeech, PosValidator> = {
  V: (word) => {
    const result = baseValidation(word);
    requireField(result, Boolean(word.praeteritum), 'praeteritum');
    requireField(result, Boolean(word.partizipIi), 'partizipIi');
    requireField(result, Boolean(word.praesensIch), 'praesensIch', 'warning');
    requireField(result, Boolean(word.praesensEr), 'praesensEr', 'warning');
    requireField(result, Boolean(word.perfekt), 'perfekt', 'warning');
    return result;
  },
  N: (word) => {
    const result = baseValidation(word);
    requireField(result, Boolean(word.gender), 'gender');
    requireField(result, Boolean(word.plural), 'plural', 'warning');
    return result;
  },
  Adj: (word) => {
    const result = baseValidation(word);
    requireField(result, Boolean(word.comparative), 'comparative');
    requireField(result, Boolean(word.superlative), 'superlative');
    return result;
  },
  Adv: (word) => {
    const result = baseValidation(word);
    requireField(result, Boolean(word.comparative), 'comparative', 'warning');
    requireField(result, Boolean(word.superlative), 'superlative', 'warning');
    return result;
  },
  Pron: baseValidation,
  Det: baseValidation,
  Präp: (word) => {
    const result = baseValidation(word);
    const cases = word.posAttributes?.preposition?.cases ?? [];
    requireField(result, Array.isArray(cases) && cases.length > 0, 'preposition.cases', 'warning');
    requireField(result, Boolean(word.posAttributes?.notes?.length), 'pos.notes', 'warning');
    return result;
  },
  Konj: baseValidation,
  Num: baseValidation,
  Part: baseValidation,
  Interj: baseValidation,
};

export function validateWord(word: AggregatedWord): PosValidationResult {
  const validator = VALIDATORS[word.pos];
  if (!validator) {
    return {
      lemma: word.lemma,
      pos: word.pos,
      errors: [`unsupported_pos:${word.pos}`],
      warnings: [],
    };
  }
  return validator(word);
}

export function assertValidWord(word: AggregatedWord): void {
  const result = validateWord(word);
  if (result.errors.length > 0) {
    throw new Error(
      `Aggregated word ${word.lemma} (${word.pos}) failed validation: ${result.errors.join(', ')}`,
    );
  }
}

export function collectValidationIssues(words: AggregatedWord[]): PosValidationResult[] {
  const issues: PosValidationResult[] = [];
  for (const word of words) {
    const result = validateWord(word);
    if (result.errors.length || result.warnings.length) {
      issues.push(result);
    }
  }
  return issues;
}
