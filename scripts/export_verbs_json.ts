import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

async function loadFromDatabase() {
  const { db } = await import('@db');
  const { verbs } = await import('@db/schema');
  return db.select().from(verbs).orderBy(verbs.infinitive);
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
