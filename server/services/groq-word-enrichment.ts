import Groq from 'groq-sdk';
import { z } from 'zod';

import type { Word } from '@db';

import { logStructured } from '../logger.js';
import type { WordUpdateInput } from '../routes/admin/schemas.js';

const WORD_ENRICHMENT_MODEL = 'llama-3.3-70b-versatile';

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const optionalTrimmedString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value !== 'string') {
      return value ?? null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalTrimmedStringArray = z
  .union([z.array(z.string().trim().min(1)), z.null()])
  .optional()
  .transform((value) => (Array.isArray(value) ? value : undefined));

const GROQ_GENDER_MAP: Record<string, string> = {
  masculine: 'der',
  feminine: 'die',
  neuter: 'das',
  m: 'der',
  f: 'die',
  n: 'das',
};

const wordEnrichmentSchema = z
  .object({
    english: optionalTrimmedString,
    exampleDe: optionalTrimmedString,
    exampleEn: optionalTrimmedString,
    gender: optionalTrimmedString,
    plural: optionalTrimmedString,
    separable: z.boolean().nullable().optional(),
    aux: z.enum(['haben', 'sein', 'haben / sein']).nullable().optional(),
    praesensIch: optionalTrimmedString,
    praesensEr: optionalTrimmedString,
    praeteritum: optionalTrimmedString,
    partizipIi: optionalTrimmedString,
    perfekt: optionalTrimmedString,
    comparative: optionalTrimmedString,
    superlative: optionalTrimmedString,
    posAttributes: z
      .object({
        tags: z.array(z.string().trim().min(1)).optional(),
        notes: z.array(z.string().trim().min(1)).optional(),
        preposition: z
          .object({
            cases: optionalTrimmedStringArray,
            notes: optionalTrimmedStringArray,
          })
          .partial()
          .nullable()
          .optional(),
      })
      .partial()
      .nullable()
      .optional(),
  })
  .partial();

export interface GroqWordEnrichmentOptions {
  overwrite?: boolean;
}

function getAllowedEnrichmentKeys(word: Word): ReadonlySet<keyof WordUpdateInput> {
  const common: Array<keyof WordUpdateInput> = [
    'english',
    'exampleDe',
    'exampleEn',
    'posAttributes',
  ];

  switch (word.pos) {
    case 'V':
      return new Set([
        ...common,
        'separable',
        'aux',
        'praesensIch',
        'praesensEr',
        'praeteritum',
        'partizipIi',
        'perfekt',
      ]);
    case 'N':
      return new Set([...common, 'gender', 'plural']);
    case 'Adj':
    case 'Adv':
      return new Set([...common, 'comparative', 'superlative']);
    default:
      return new Set(common);
  }
}

function sanitizeRawEnrichmentForWord(
  word: Word,
  enrichment: Record<string, unknown>,
): Record<string, unknown> {
  const allowedKeys = getAllowedEnrichmentKeys(word);
  const sanitized = Object.fromEntries(
    Object.entries(enrichment).filter(([key]) => allowedKeys.has(key as keyof WordUpdateInput)),
  );

  if (word.pos === 'N' && typeof sanitized.gender === 'string') {
    const normalized = sanitized.gender.trim().toLowerCase();
    sanitized.gender = GROQ_GENDER_MAP[normalized] ?? sanitized.gender;
  }

  return sanitized;
}

function extractJsonObject(content: string | null | undefined): string {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new Error('Empty enrichment response');
  }

  const sanitized = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = sanitized.match(/\{[\s\S]*\}/);
  return (match?.[0] ?? sanitized).trim();
}

function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function buildSystemPrompt(word: Word): string {
  const baseInstructions = [
    'You enrich German lexicon entries for a language-learning app.',
    'Respond with JSON only. No markdown. No commentary.',
    'Be conservative. Use null when you are unsure.',
    'Keep english concise and natural.',
    'exampleDe must be a short natural German sentence using the lemma.',
    'exampleEn must be an English translation of exampleDe.',
  ];

  switch (word.pos) {
    case 'V':
      baseInstructions.push(
        'For verbs, infer: aux, separable, praesensIch, praesensEr, praeteritum, partizipIi, perfekt.',
      );
      break;
    case 'N':
      baseInstructions.push('For nouns, infer: gender and plural.');
      break;
    case 'Adj':
    case 'Adv':
      baseInstructions.push('For adjectives/adverbs, infer: comparative and superlative when standard forms exist.');
      break;
    case 'Pr\u00e4p':
      baseInstructions.push('For prepositions, fill posAttributes.preposition.cases and notes when confident.');
      break;
    default:
      break;
  }

  return baseInstructions.join(' ');
}

function buildUserPrompt(word: Word): string {
  return JSON.stringify(
    {
      task: 'Fill missing fields for this German lexicon entry.',
      partOfSpeech: word.pos,
      current: {
        lemma: word.lemma,
        level: word.level,
        english: word.english,
        exampleDe: word.exampleDe,
        exampleEn: word.exampleEn,
        gender: word.gender,
        plural: word.plural,
        separable: word.separable,
        aux: word.aux,
        praesensIch: word.praesensIch,
        praesensEr: word.praesensEr,
        praeteritum: word.praeteritum,
        partizipIi: word.partizipIi,
        perfekt: word.perfekt,
        comparative: word.comparative,
        superlative: word.superlative,
        posAttributes: word.posAttributes,
      },
      returnShape: {
        english: 'string|null',
        exampleDe: 'string|null',
        exampleEn: 'string|null',
        gender: 'string|null',
        plural: 'string|null',
        separable: 'boolean|null',
        aux: "'haben'|'sein'|'haben / sein'|null",
        praesensIch: 'string|null',
        praesensEr: 'string|null',
        praeteritum: 'string|null',
        partizipIi: 'string|null',
        perfekt: 'string|null',
        comparative: 'string|null',
        superlative: 'string|null',
        posAttributes: {
          tags: 'string[]|undefined',
          notes: 'string[]|undefined',
          preposition: {
            cases: 'string[]|undefined',
            notes: 'string[]|undefined',
          },
        },
      },
    },
    null,
    2,
  );
}

function toWordUpdatePayload(
  word: Word,
  rawEnrichment: Record<string, unknown>,
  enrichment: z.infer<typeof wordEnrichmentSchema>,
  options: GroqWordEnrichmentOptions,
): WordUpdateInput {
  const { overwrite = false } = options;
  const payload: WordUpdateInput = {};

  const assign = <K extends keyof WordUpdateInput>(key: K, nextValue: WordUpdateInput[K]) => {
    if (nextValue === undefined) {
      return;
    }

    const currentValue = word[key as keyof Word];
    if (!overwrite && !isBlankValue(currentValue)) {
      return;
    }

    payload[key] = nextValue;
  };

  const maybeAssign = <K extends keyof WordUpdateInput>(
    key: K,
    source: Partial<Record<K, WordUpdateInput[K]>>,
  ) => {
    if (!Object.prototype.hasOwnProperty.call(rawEnrichment, key)) {
      return;
    }
    assign(key, source[key]);
  };

  maybeAssign('english', enrichment);
  maybeAssign('exampleDe', enrichment);
  maybeAssign('exampleEn', enrichment);
  maybeAssign('gender', enrichment);
  maybeAssign('plural', enrichment);
  maybeAssign('separable', enrichment);
  maybeAssign('aux', enrichment);
  maybeAssign('praesensIch', enrichment);
  maybeAssign('praesensEr', enrichment);
  maybeAssign('praeteritum', enrichment);
  maybeAssign('partizipIi', enrichment);
  maybeAssign('perfekt', enrichment);
  maybeAssign('comparative', enrichment);
  maybeAssign('superlative', enrichment);
  maybeAssign('posAttributes', enrichment);

  if (Object.keys(payload).length > 0) {
    payload.enrichmentMethod = 'manual_api';
    payload.enrichmentAppliedAt = new Date();
  }

  return payload;
}

export async function buildGroqWordEnrichment(
  word: Word,
  options: GroqWordEnrichmentOptions = {},
): Promise<WordUpdateInput> {
  const startedAt = Date.now();

  try {
    if (!process.env.GROQ_API_KEY || !groq) {
      return {};
    }

    const response = await groq.chat.completions.create({
      model: WORD_ENRICHMENT_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(word),
        },
        {
          role: 'user',
          content: buildUserPrompt(word),
        },
      ],
    });

    const payload = extractJsonObject(response.choices[0]?.message?.content);
    const rawEnrichment = JSON.parse(payload) as Record<string, unknown>;
    const sanitizedEnrichment = sanitizeRawEnrichmentForWord(word, rawEnrichment);
    const enrichment = wordEnrichmentSchema.parse(sanitizedEnrichment);
    const updates = toWordUpdatePayload(word, sanitizedEnrichment, enrichment, options);

    logStructured({
      event: 'groq.word_enrichment',
      source: 'word-enrichment',
      data: {
        durationMs: Date.now() - startedAt,
        lemma: word.lemma,
        pos: word.pos,
        fields: Object.keys(updates),
      },
    });

    return updates;
  } catch (error) {
    logStructured({
      event: 'groq.word_enrichment.error',
      level: 'error',
      source: 'word-enrichment',
      message: 'Word enrichment generation failed',
      error,
      data: {
        durationMs: Date.now() - startedAt,
        lemma: word.lemma,
        pos: word.pos,
      },
    });
    return {};
  }
}
