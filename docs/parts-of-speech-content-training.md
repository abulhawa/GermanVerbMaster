# Content Training Deck – Parts-of-Speech Expansion

> Use this outline as a slide deck for onboarding content editors to the lexeme-based workflow. Each `## Slide` heading represents one slide.

## Slide 1 – Why the change?
- Verb-only infrastructure blocked expansion into nouns and adjectives.
- New lexeme schema + task registry supports mixed POS sessions, deterministic packs, and feature-flagged rollouts.
- Editors now help steward pack metadata that powers both online and offline experiences.

## Slide 2 – Key concepts
- **Lexeme**: canonical lemma + POS + metadata; deterministic ID (e.g., `de:noun:Kind:wx3af912`).
- **Inflection**: surface form + morphological features linked to a lexeme.
- **Task spec**: prompt/solution pair bound to a lexeme and task type (e.g., `noun_case_declension`).
- **Content pack**: curated bundle with license metadata, lexeme list, inflections, and tasks.

## Slide 3 – Daily workflow overview
1. Pull latest `main` and install dependencies.
2. Run `npm run seed` to refresh packs and QA fixtures.
3. Open `/admin` to review candidate entries (filters by POS, level, completeness).
4. Edit entries inline; reseed if you adjust canonical flags or metadata.
5. Execute `npm run packs:lint` to validate packs before handing off to QA.

## Slide 4 – Authoring guidelines
- Populate translations, CEFR level, and usage examples for every lexeme.
- Verbs require auxiliary, Präteritum, Partizip II, and Perfekt fields.
- Nouns must include gender and plural; adjectives need comparative and superlative forms.
- Use `sourceNotes` for attribution/URL trails; keep `sourcesCsv` synced with upstream dataset identifiers.

## Slide 5 – Pack QA checklist
- Confirm pack metadata (`taskTypes`, `size`, `cefrLevels`) matches the regenerated contents.
- Spot-check offline bundles after copying `data/packs/*.json` into `client/public/packs/` to ensure prompts/solutions render as expected.
- Verify feature flags remain disabled until QA completes noun/adjective reviews.
- Record any lint failures with file paths and share during standup.

## Slide 6 – Launch readiness signals
- `/api/tasks` returns healthy mixes for each POS when flags are enabled.
- Scheduler telemetry in `scheduling_state` shows attempts across verbs, nouns, and adjectives.
- Playwright smoke tests pass for mixed-mode sessions.
- Training materials (this deck + admin guide) are acknowledged by the content team.

## Slide 7 – Support & escalation
- Engineering contact: Platform team (#lexeme-expansion channel).
- File issues in the `parts-of-speech` project board for schema or renderer bugs.
- Document dataset anomalies in `docs/verb-corpus/` or create a new note under `docs/external/`.
- Share learnings and pack review notes in weekly content syncs.
