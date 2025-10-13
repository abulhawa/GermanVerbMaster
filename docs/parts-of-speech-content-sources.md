# Parts of Speech Content Source Matrix

This matrix extends the verb-only audit by identifying candidate datasets for nouns, adjectives, and support material needed to deliver the multi-POS roadmap. Each source includes licensing, coverage notes, and follow-up considerations so ingestion work can be prioritised quickly once schema support lands.

## Legend
- **POS** – Primary part of speech covered by the source (some cover multiple POS).
- **Metadata** – Notable fields supplied by the dataset that matter for downstream features.
- **Gaps** – Known omissions to plan around during ETL work.
- **License** – Short summary with compatibility assessment for redistribution inside GermanVerbMaster.
- **Action Notes** – Next steps or integration caveats informed by the verb-only audit.

## Primary Datasets

| Source | POS | Metadata | Gaps | License | Action Notes |
| --- | --- | --- | --- | --- | --- |
| [Open Multilingual WordNet – German (GermaNet subset)](https://compling.hss.ntu.edu.sg/omw/) | Noun, Verb, Adjective | Synsets with POS tags, lexical relations, glosses. Useful for cross-linking lexemes and building families. | No explicit inflection tables; genders only implicit in glosses. Needs augmentation from other sources for determiners. | [Open Wordnet License](https://openwordnet-pp.sourceforge.net/license.php) (BSD-like, redistribution allowed with attribution). | Use as canonical lexeme spine. Map synset IDs to deterministic `lexeme_id`s and merge with inflectional data from Wiktionary dump. |
| [Wiktionary German dump via Wiktextract](https://kaikki.org/dictionary/German/index.html) | Noun, Verb, Adjective, Adverb | Rich inflection tables, genders, comparative/superlative degrees, usage examples. | Quality varies; needs heuristics to filter non-standard entries and duplicate senses. | CC BY-SA 3.0 – compatible if we preserve attribution and share-alike for distributed packs. | Primary inflection feed. Store revision IDs in `inflections.source_revision` for deterministic checksums, implement attribution bundler in `content_packs`, drive noun/adjective pilot runs via enrichment `POS_FILTERS`, and capture Kaikki POS tags/usage notes into `words.pos_attributes` ahead of the lexeme schema rollout. |
| [Uni Leipzig Wortschatz Frequencies](https://wortschatz.uni-leipzig.de/en/download) | All POS (frequency counts) | Frequency ranks, example sentences, morphological annotations. | Requires license request; derivative redistribution limited. Need to keep frequency scores internal. | Research license; data cannot be re-distributed. | Use for internal telemetry weights only (populate `telemetry_priorities.frequency_rank`). Store raw data outside shipped packs. |
| [Tatoeba Sentences](https://tatoeba.org/eng/downloads) | Verb, Noun, Adjective usage examples | Parallel sentences with user-contributed translations. | Volunteer content with varying quality; lacks POS metadata. Need linking via lemma search. | CC BY 2.0. Attribution required; remix allowed. | Leverage for contextual hints and partner drill exports. Record `content_packs` metadata with contributor attribution. |
| [OpenGerman Word Lists](https://github.com/elastic/rally-data/tree/master/geonames) | Noun (proper), Misc | Contains named entities and geographic names. | Not core to curriculum; no gender/plural info. | Apache 2.0. | Optional enrichment for advanced packs; treat as secondary pack with `content_packs.tier = "supplemental"`. |

## Secondary / Specialized Sources

| Source | POS | Metadata | Gaps | License | Action Notes |
| --- | --- | --- | --- | --- | --- |
| [Leipzig Corpora Collection – POS tagged corpora](https://wortschatz.uni-leipzig.de/en/download/german) | All POS | Token + POS tags, frequency counts. | No lemma-level inflection; only tokens. | Research use; redistribution restricted. | Use to validate scheduling heuristics and telemetry weights. Do not package raw corpora; only derived statistics. |
| [Duden Open Data (community crawls)](https://dumps.wikimedia.org/other/) | Noun, Verb, Adjective | Gender, plural, stem change notes from community crawls. | Not officially licensed; reliability concerns. | Inconsistent licensing. | Avoid for production packs but monitor for validation cross-checks. |
| [OPUS Corpora (OpenSubtitles, Europarl)](https://opus.nlpl.eu/) | Verb, Noun | Parallel corpora with morphological tags via UDPipe. | Requires morphological parsing to extract inflections. | Various (mostly permissive). | Use for AI-driven hint generation and telemetry. Record parser revision in `telemetry_priorities.metadata`. |
| [Digitales Wörterbuch der Deutschen Sprache (DWDS) API](https://www.dwds.de/d/api) | Noun, Verb, Adjective | Lemma info, frequency data, collocations. | API rate-limited, requires registration. | CC BY-SA 4.0 for dictionary entries. | Integrate via fetcher script to cross-validate lemma metadata. Respect attribution in pack notes. |

## Metadata Requirements per POS

- **Nouns**: gender, plural forms, case declensions, countability, noun class for scheduling. Candidate coverage: Wiktextract + DWDS cross-check. Store case tables within `inflections.features.case`.  
- **Adjectives**: base/comparative/superlative, predicative vs. attributive forms, endings by case/number. Use Wiktextract for tables, supplement with WordNet synonyms for hint generation.  
- **Verbs**: continue using existing verb CSVs while migrating to shared `lexemes`/`inflections`. Ensure auxiliary verb and separable prefix fields remain in `lexemes.metadata`.

## Next Steps

1. Request Leipzig and DWDS access keys; document storage restrictions in `content_packs.license_notes`.
2. Prototype Wiktextract ingestion to confirm inflection JSON schema (align with RFC in Task 4) and run noun/adjective spot checks using the enrichment `POS_FILTERS` flag to validate coverage.
3. Draft attribution template for packs bundling CC BY-SA and CC BY sources.
4. Align with analytics team on storing restricted datasets (frequency corpora) in non-exported tables.
5. Keep `scripts/etl/attribution.ts` updated as new sources are onboarded so pack metadata lists every CC BY/SA contributor.
