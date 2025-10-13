import { z } from 'zod';

import { exampleSchema, translationSchema } from './admin-word-schemas';

const providerSnapshotSchema = z.object({}).passthrough();

export const wordEnrichmentHistorySchema = z.object({
  wordId: z.number(),
  lemma: z.string(),
  pos: z.string(),
  snapshots: z.array(providerSnapshotSchema),
  translations: z.array(translationSchema),
  examples: z.array(exampleSchema),
});
