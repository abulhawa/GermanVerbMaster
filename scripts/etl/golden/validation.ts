import type { AggregatedWord } from '../types';
import { validateWord } from '../validators';
import type { PosValidationResult } from '../validators';

const LOG_VALIDATION_WARNINGS =
  process.env.GOLDEN_LOG_VALIDATION_WARNINGS?.toLowerCase() === 'true';

export function validateGoldenWord(word: AggregatedWord): PosValidationResult {
  const validation = validateWord(word);
  if (LOG_VALIDATION_WARNINGS && validation.errors.length > 0) {
    console.warn(
      `[etl] lexeme ${word.lemma} (${word.pos}) has validation issues: ${validation.errors.join(', ')}`,
    );
  }
  return validation;
}
