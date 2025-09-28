import { pathToFileURL } from 'node:url';
import { sql, inArray } from 'drizzle-orm';
import { buildVerbArtifacts } from './build-verbs.mjs';

async function seedVerbs() {
  const { verbs } = await buildVerbArtifacts();

  const { db } = await import('../db/index.ts');
  const { verbs: verbsTable } = await import('../db/schema.ts');

  const canonicalInfinitives = new Set(verbs.map((verb) => verb.infinitive));

  const existing = await db
    .select({ infinitive: verbsTable.infinitive })
    .from(verbsTable);

  const staleInfinitives = existing
    .map((row) => row.infinitive)
    .filter((infinitive) => !canonicalInfinitives.has(infinitive));

  if (staleInfinitives.length > 0) {
    await db.delete(verbsTable).where(inArray(verbsTable.infinitive, staleInfinitives));
    console.log(`Removed ${staleInfinitives.length} verbs no longer present in canonical dataset`);
  }

  let inserted = 0;
  for (const verb of verbs) {
    await db
      .insert(verbsTable)
      .values({
        infinitive: verb.infinitive,
        english: verb.english,
        ['präteritum']: verb['präteritum'],
        partizipII: verb.partizipII,
        auxiliary: verb.auxiliary,
        level: verb.level,
        ['präteritumExample']: verb['präteritumExample'],
        ['partizipIIExample']: verb['partizipIIExample'],
        source: verb.source,
        pattern: verb.pattern ?? null,
      })
      .onConflictDoUpdate({
        target: verbsTable.infinitive,
        set: {
          english: sql`excluded.english`,
          präteritum: sql`excluded.präteritum`,
          partizipII: sql`excluded.partizipII`,
          auxiliary: sql`excluded.auxiliary`,
          level: sql`excluded.level`,
          präteritumExample: sql`excluded.präteritumExample`,
          partizipIIExample: sql`excluded.partizipIIExample`,
          source: sql`excluded.source`,
          pattern: sql`excluded.pattern`,
          updatedAt: sql`unixepoch('now')`,
        },
      });
    inserted += 1;
  }

  console.log(`Upserted ${inserted} verbs from canonical dataset`);
}

async function main() {
  await seedVerbs();
}

if (process.argv[1]) {
  const invokedUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === invokedUrl) {
    main()
      .then(() => {
        console.log('Verb seeding completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to seed verbs', error);
        process.exit(1);
      });
  }
}
