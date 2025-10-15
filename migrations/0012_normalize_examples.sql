DO $$
DECLARE
  rec RECORD;
  normalized JSONB;
  fallback_example_de TEXT;
  fallback_example_en TEXT;
BEGIN
  FOR rec IN SELECT id, examples, example_de, example_en FROM words LOOP
    normalized := NULL;

    IF rec.examples IS NOT NULL THEN
      SELECT jsonb_agg(entry_json)
      INTO normalized
      FROM (
        SELECT jsonb_strip_nulls(jsonb_build_object(
          'sentence', entry_details.sentence,
          'translations', entry_details.translations,
          'source', entry_details.source
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
            ) AS translations,
            NULLIF(BTRIM(value->>'source'), '') AS source
        ) AS entry_details
      ) AS entry
      WHERE entry_json IS NOT NULL;
    END IF;

    IF normalized = '[]'::jsonb THEN
      normalized := NULL;
    END IF;

    fallback_example_de := NULLIF(BTRIM(rec.example_de), '');
    fallback_example_en := NULLIF(BTRIM(rec.example_en), '');

    IF normalized IS NULL AND (fallback_example_de IS NOT NULL OR fallback_example_en IS NOT NULL) THEN
      normalized := jsonb_build_array(
        jsonb_strip_nulls(
          jsonb_build_object(
            'sentence', fallback_example_de,
            'translations', CASE WHEN fallback_example_en IS NOT NULL THEN jsonb_build_object('en', fallback_example_en) ELSE NULL END
          )
        )
      );
      IF normalized = '[]'::jsonb THEN
        normalized := NULL;
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
  SET example_de = primary.example_de,
      example_en = primary.example_en
  FROM (
    SELECT
      w.id,
      (
        SELECT NULLIF(BTRIM(value->>'sentence'), '')
        FROM jsonb_array_elements(COALESCE(w.examples, '[]'::jsonb)) AS elem(value)
        WHERE NULLIF(BTRIM(value->>'sentence'), '') IS NOT NULL
        ORDER BY 1
        LIMIT 1
      ) AS example_de,
      (
        SELECT NULLIF(BTRIM(trans.value), '')
        FROM jsonb_array_elements(COALESCE(w.examples, '[]'::jsonb)) AS elem(value)
        CROSS JOIN LATERAL jsonb_each_text(value->'translations') AS trans(lang, value)
        WHERE LOWER(TRIM(trans.lang)) = 'en'
          AND NULLIF(BTRIM(trans.value), '') IS NOT NULL
        ORDER BY 1
        LIMIT 1
      ) AS example_en
    FROM words w
  ) AS primary
  WHERE words.id = primary.id
    AND (
      (primary.example_de IS NULL AND words.example_de IS NOT NULL)
      OR (primary.example_de IS NOT NULL AND words.example_de IS NULL)
      OR (primary.example_de IS NOT NULL AND words.example_de IS NOT NULL AND primary.example_de <> words.example_de)
      OR (primary.example_en IS NULL AND words.example_en IS NOT NULL)
      OR (primary.example_en IS NOT NULL AND words.example_en IS NULL)
      OR (primary.example_en IS NOT NULL AND words.example_en IS NOT NULL AND primary.example_en <> words.example_en)
    );
END $$;
