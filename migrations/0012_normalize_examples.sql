DO $$
DECLARE
  rec RECORD;
  normalized JSONB;
  fallback JSONB;
  fallback_sentence TEXT;
  fallback_translation TEXT;
BEGIN
  FOR rec IN SELECT id, examples, example_de, example_en FROM words LOOP
    normalized := NULL;
    fallback := NULL;

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

    fallback_sentence := NULLIF(BTRIM(rec.example_de), '');
    fallback_translation := NULLIF(BTRIM(rec.example_en), '');

    IF fallback_sentence IS NOT NULL OR fallback_translation IS NOT NULL THEN
      fallback := jsonb_strip_nulls(jsonb_build_object(
        'sentence', fallback_sentence,
        'translations', CASE
          WHEN fallback_translation IS NOT NULL THEN jsonb_build_object('en', fallback_translation)
          ELSE NULL
        END
      ));

      IF fallback = '{}'::jsonb THEN
        fallback := NULL;
      END IF;
    END IF;

    IF fallback IS NOT NULL THEN
      IF normalized IS NULL THEN
        normalized := jsonb_build_array(fallback);
      ELSE
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(normalized) AS elem(value)
          WHERE elem.value @> fallback AND fallback @> elem.value
        ) THEN
          normalized := normalized || jsonb_build_array(fallback);
        END IF;
      END IF;
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
  WHERE examples IS NOT NULL
    AND (example_de IS NOT NULL OR example_en IS NOT NULL);
END $$;
