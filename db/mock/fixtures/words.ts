import type { IMemoryDb } from "pg-mem";

function toJsonLiteral(value: unknown): string {
  return `'${JSON.stringify(value ?? null).replace(/'/g, "''")}'::jsonb`;
}

function toTimestampLiteral(value: string | Date | null | undefined): string {
  if (!value) {
    return "NULL";
  }
  const iso = value instanceof Date ? value.toISOString() : value;
  return `'${iso.replace(/'/g, "''")}'::timestamptz`;
}

export function seedWordsFixture(mem: IMemoryDb, timestamp: Date | string = new Date()): void {
  const now = timestamp instanceof Date ? timestamp.toISOString() : timestamp;

  mem.public.none(
    `INSERT INTO words (
      id,
      lemma,
      pos,
      level,
      english,
      example_de,
      example_en,
      gender,
      plural,
      separable,
      aux,
      praesens_ich,
      praesens_er,
      praeteritum,
      partizip_ii,
      perfekt,
      approved,
      complete,
      translations,
      examples,
      pos_attributes,
      enrichment_applied_at,
      enrichment_method,
      created_at,
      updated_at
    ) VALUES (
      1,
      'arbeiten',
      'V',
      'A1',
      'to work',
      'Sie arbeitet jeden Tag.',
      'She works every day.',
      NULL,
      NULL,
      NULL,
      'haben',
      'arbeite',
      'arbeitet',
      'arbeitete',
      'gearbeitet',
      'hat gearbeitet',
      TRUE,
      TRUE,
      ${toJsonLiteral([
        { value: "to work", source: "wiktextract", language: "en" },
        { value: "to labour", source: "kaikki", language: "en" },
      ])},
      ${toJsonLiteral([
        {
          sentence: "Sie arbeitet jeden Tag im Büro.",
          translations: { en: "She works in the office every day." },
        },
        {
          sentence: "Wir haben gestern lange gearbeitet.",
          translations: { en: "We worked for a long time yesterday." },
        },
      ])},
      ${toJsonLiteral({ verbForms: { infinitive: "arbeiten", participle: "gearbeitet" } })},
      ${toTimestampLiteral(now)},
      'manual_entry',
      ${toTimestampLiteral(now)},
      ${toTimestampLiteral(now)}
    );`,
  );
}
