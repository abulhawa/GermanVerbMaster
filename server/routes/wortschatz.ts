import { Router } from 'express';
import { asc, like, or, sql } from 'drizzle-orm';

import { db, words } from '@db';
import type { PartOfSpeech, WortschatzWord } from '@shared';
import { ANDROID_B2_BERUF_SOURCE, ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';

function createDelimitedSourceFilter(source: string) {
  return or(
    sql`coalesce(${words.sourcesCsv}, '') = ${source}`,
    like(words.sourcesCsv, `${source};%`),
    like(words.sourcesCsv, `%;${source}`),
    like(words.sourcesCsv, `%;${source};%`),
  );
}

export function createWortschatzRouter(): Router {
  const router = Router();

  router.get('/wortschatz/words', async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: words.id,
          lemma: words.lemma,
          pos: words.pos,
          level: words.level,
          english: words.english,
          exampleDe: words.exampleDe,
          exampleEn: words.exampleEn,
          gender: words.gender,
          plural: words.plural,
        })
        .from(words)
        .where(createDelimitedSourceFilter(ANDROID_B2_BERUF_SOURCE))
        .orderBy(sql`lower(${words.lemma})`, asc(words.id));

      const payload: WortschatzWord[] = rows.map((row) => ({
        ...row,
        pos: row.pos as PartOfSpeech,
      }));

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Wortschatz-Dataset-Version', ANDROID_B2_BERUF_VERSION);
      res.json(payload);
    } catch (error) {
      console.error('Failed to load Wortschatz words', error);
      res.status(500).json({
        error: 'Failed to load Wortschatz words',
        code: 'WORTSCHATZ_WORDS_FAILED',
      });
    }
  });

  return router;
}
