import { z } from 'zod';

import { exampleSchema, translationSchema } from './admin-word-schemas';

const providerSnapshotSchema = z.object({}).passthrough();
const suggestionConfigSchema = z.object({
  collectSynonyms: z.boolean(),
  collectExamples: z.boolean(),
  collectTranslations: z.boolean(),
  collectWiktextract: z.boolean(),
  enableAi: z.boolean(),
  openAiModel: z.string().nullable().optional(),
});
export const enrichmentDraftSchema = z.object({
  id: z.number(),
  wordId: z.number(),
  lemma: z.string(),
  pos: z.string(),
  configHash: z.string(),
  config: suggestionConfigSchema,
  suggestions: z.object({}).passthrough(),
  fetchedAt: z.string(),
  appliedAt: z.string().nullable(),
  appliedMethod: z.string().nullable().optional(),
});

export const wordEnrichmentHistorySchema = z.object({
  wordId: z.number(),
  lemma: z.string(),
  pos: z.string(),
  snapshots: z.array(providerSnapshotSchema),
  translations: z.array(translationSchema),
  examples: z.array(exampleSchema),
  drafts: z.array(enrichmentDraftSchema),
});
