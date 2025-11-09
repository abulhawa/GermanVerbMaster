import type { PartOfSpeech } from '@shared/types';

export const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const WORDS_BATCH_SIZE = 500;

export const POS_MAP = new Map<string, PartOfSpeech>([
  ['verb', 'V'],
  ['v', 'V'],
  ['v.', 'V'],
  ['nomen', 'N'],
  ['substantiv', 'N'],
  ['noun', 'N'],
  ['n', 'N'],
  ['adj', 'Adj'],
  ['adjektiv', 'Adj'],
  ['adjective', 'Adj'],
  ['adv', 'Adv'],
  ['adverb', 'Adv'],
  ['pron', 'Pron'],
  ['pronomen', 'Pron'],
  ['det', 'Det'],
  ['artikel', 'Det'],
  ['präposition', 'Präp'],
  ['prep', 'Präp'],
  ['konj', 'Konj'],
  ['konjunktion', 'Konj'],
  ['num', 'Num'],
  ['numeral', 'Num'],
  ['part', 'Part'],
  ['partikel', 'Part'],
  ['interj', 'Interj'],
  ['interjektion', 'Interj'],
]);

export const EXTERNAL_POS_VALUES: readonly PartOfSpeech[] = [
  'V',
  'N',
  'Adj',
  'Adv',
  'Pron',
  'Det',
  'Präp',
  'Konj',
  'Num',
  'Part',
  'Interj',
] as const;
