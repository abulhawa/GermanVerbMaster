import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

async function loadFromDatabase() {
  const { db } = await import('@db');
  const { words } = await import('@db/schema');
  const rows = await db
    .select({
      lemma: words.lemma,
      english: words.english,
      level: words.level,
      praeteritum: words.praeteritum,
      partizipIi: words.partizipIi,
      aux: words.aux,
      examples: words.examples,
      sourcesCsv: words.sourcesCsv,
      sourceNotes: words.sourceNotes,
    })
    .from(words)
    .where(eq(words.pos, 'V'))
    .orderBy(words.lemma);

  return rows.map((row) => {
    const [firstExample, secondExample] = row.examples ?? [];
    const firstSentence = firstExample?.sentence ?? firstExample?.exampleDe ?? null;
    const secondSentence = secondExample?.sentence ?? secondExample?.exampleDe ?? null;
    const primarySource = row.sourcesCsv?.split(';')[0]?.trim() || null;

    return {
      infinitive: row.lemma,
      english: row.english,
      präteritum: row.praeteritum,
      partizipII: row.partizipIi,
      auxiliary: row.aux,
      level: row.level,
      präteritumExample: firstSentence,
      partizipIIExample: secondSentence,
      source: {
        name: primarySource ?? 'words_table',
        levelReference: row.sourceNotes ?? '',
      },
      pattern: null,
    };
  });
}

async function loadFromSeed() {
  const { verbsData } = await import('../db/seed-data.js');
  return verbsData;
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputPath = path.resolve(__dirname, '..', 'attached_assets', 'verbs.json');

  let verbs;
  try {
    verbs = await loadFromDatabase();
    console.log(`Exported ${verbs.length} verbs from database`);
  } catch (error) {
    console.warn('Falling back to local seed data:', error instanceof Error ? error.message : error);
    verbs = await loadFromSeed();
  }

  await writeFile(outputPath, JSON.stringify(verbs, null, 2));
  console.log(`Wrote ${verbs.length} verbs to ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to export verbs JSON', error);
  process.exit(1);
});
