import { db } from "@db";
import { verbs as verbsTable } from "@db/schema";
import { verbsData } from "./seed-data";

async function seedVerbs() {
  try {
    console.log('Starting verb seeding...');

    // First, let's clear the existing verbs
    await db.delete(verbsTable);
    console.log('Cleared existing verbs');

    for (const verb of verbsData) {
      await db.insert(verbsTable).values({
        infinitive: verb.infinitive,
        english: verb.english,
        präteritum: verb.präteritum,
        partizipII: verb.partizipII,
        auxiliary: verb.auxiliary,
        level: verb.level,
        präteritumExample: verb.präteritumExample,
        partizipIIExample: verb.partizipIIExample,
        source: verb.source,
        pattern: verb.pattern || null,
      }).onConflictDoNothing();
    }

    console.log('Verb seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding verbs:', error);
    throw error;
  }
}

// Run the seeding
seedVerbs()
  .then(() => {
    console.log('Seeding complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed verbs:', error);
    process.exit(1);
  });