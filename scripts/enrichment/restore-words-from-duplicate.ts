import { getDb, getPool } from "@db/client";
import { sql } from "drizzle-orm";


// 'node --env-file=.env --import tsx scripts/enrichment/restore-words-from-duplicate.ts'

const DUPLICATE_TABLE = "words_duplicate_21_10_2025";

async function main(): Promise<void> {
  const db = getDb();

  const { rowCount } = await db.execute(
    sql`UPDATE words AS w SET
      lemma = dup.lemma,
      pos = dup.pos,
      level = dup.level,
      english = dup.english,
      example_de = dup.example_de,
      example_en = dup.example_en,
      gender = dup.gender,
      plural = dup.plural,
      separable = dup.separable,
      aux = dup.aux,
      praesens_ich = dup.praesens_ich,
      praesens_er = dup.praesens_er,
      praeteritum = dup.praeteritum,
      partizip_ii = dup.partizip_ii,
      perfekt = dup.perfekt,
      comparative = dup.comparative,
      superlative = dup.superlative,
      approved = dup.approved,
      complete = dup.complete,
      sources_csv = dup.sources_csv,
      source_notes = dup.source_notes,
      export_uid = dup.export_uid,
      exported_at = dup.exported_at,
      translations = dup.translations,
      examples = dup.examples,
      pos_attributes = dup.pos_attributes,
      enrichment_applied_at = dup.enrichment_applied_at,
      enrichment_method = dup.enrichment_method,
      created_at = dup.created_at,
      updated_at = dup.updated_at
    FROM ${sql.raw(DUPLICATE_TABLE)} AS dup
    WHERE w.id = dup.id`,
  );

  console.log(`Restored ${rowCount ?? 0} rows in words from ${DUPLICATE_TABLE}.`);
}

main()
  .catch((error) => {
    console.error("Failed to restore words from duplicate table", error);
    process.exitCode = 1;
  })
  .finally(() => {
    const pool = getPool();
    return pool.end().catch((error) => {
      console.warn("Failed to close database pool cleanly", error);
    });
  });
