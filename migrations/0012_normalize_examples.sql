DO $$
DECLARE
  rec RECORD;
  normalized JSONB;
BEGIN
  FOR rec IN SELECT id, examples FROM words LOOP
    normalized := NULL;

    IF rec.examples IS NOT NULL THEN
      SELECT jsonb_agg(entry_json)
      INTO normalized
      FROM (
        SELECT jsonb_strip_nulls(jsonb_build_object(
          'sentence', entry_details.sentence,
          'translations', entry_details.translations
        )) AS entry_json
        FROM jsonb_array_elements(rec.examples) AS elem(value)
        CROSS JOIN LATERAL (
          SELECT
            NULLIF(BTRIM(COALESCE(value->>'sentence', value->>'exampleDe', value->>'example_de')), '') AS sentence,
            (
              SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE jsonb_object_agg(lower_key, value_text) END
              FROM (
                SELECT LOWER(TRIM(k)) AS lower_key, NULLIF(BTRIM(v), '') AS value_text
                FROM jsonb_each_text(
                  COALESCE(
                    value->'translations',
                    CASE WHEN value ? 'exampleEn' THEN jsonb_build_object('en', value->>'exampleEn') ELSE '{}'::jsonb END
                  )
                ) AS trans(k, v)
              ) AS translation_pairs
              WHERE lower_key IS NOT NULL AND value_text IS NOT NULL
            ) AS translations
        ) AS entry_details
      ) AS entry
      WHERE entry_json IS NOT NULL;
    END IF;

    IF normalized = '[]'::jsonb THEN
      normalized := NULL;
    END IF;

    IF (
      (normalized IS NULL AND rec.examples IS NOT NULL)
      OR (normalized IS NOT NULL AND rec.examples IS NULL)
      OR (normalized IS NOT NULL AND rec.examples IS NOT NULL AND normalized::text <> rec.examples::text)
    ) THEN
      UPDATE words
      SET examples = normalized
      WHERE id = rec.id;
    END IF;
  END LOOP;

  UPDATE words
  SET example_de = NULL,
      example_en = NULL
  WHERE example_de IS NOT NULL
     OR example_en IS NOT NULL;
END $$;
