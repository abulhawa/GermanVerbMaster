# POS-Based Word Data Refactor Prompt

## Objective
Restructure the GermanVerbMaster lexical data pipeline, storage schema, and documentation so that words are managed per part-of-speech (POS) with a simplified approval workflow and legacy assets archived.

> **Implementation status:** complete – the data pipeline, database schema, admin tooling, and documentation now reflect the approved-per-POS workflow and legacy CSVs are archived under `data/legacy/`.

## Key Requirements
- **Rename "canonical" to "approved" conceptually**
  - Update terminology across backend models, database schema, API contracts, seeding scripts, UI labels, tests, and documentation.
  - Preserve the meaning: an approved word is learner-ready.

- **Split word seed data into POS-specific files**
  - Create distinct CSV (or equivalent) files for each supported POS: verbs, nouns, adjectives, adverbs, etc.
  - Duplicate lemmas across files if they represent multiple POS values.
  - Each POS file should only contain columns relevant to that POS (e.g., verb conjugations for verbs, plural for nouns).
  - Add an `approved` column in every POS file to designate learner-ready entries.

- **Adjust application seeding and ingestion**
  - Update the seeding pipeline to read the new POS-specific files.
  - Map POS-specific fields into the database schema while applying approval logic.
  - Remove reliance on previous aggregated word files and the separate `words_canonical.csv` overlay.
  - Ensure completeness heuristics align with the new structure or are replaced with the approved flag as the gatekeeper.

- **Revise backend schema and services**
  - Modify database tables (and associated migrations) so word records store POS-tailored data cleanly.
  - Ensure APIs, models, and validation logic accommodate the new POS-based storage while supporting duplicated lemmas across POS types.
  - Remove columns tied to legacy source tracking that the new workflow no longer needs.
  - keep or create date columns for "last updated"

- **Update frontend/admin tools**
  - Revise React forms, validation schemas, and admin filters to operate with POS-specific data and the `approved` terminology.
  - Ensure editors can manage approval state per POS entry and understand field expectations per POS.

- **Documentation & tests**
  - Update README, docs, and onboarding materials to explain the new POS file layout and approval process.
  - Adjust automated tests (unit, integration, e2e) to reflect the new data model and seeding pipeline.

- **Archive legacy assets**
  - Move old word files into a `legacy/` folder for later removal once the new system is validated.
  - Keep references minimal to avoid confusion during the transition.

## Acceptance Criteria
1. All previous word files are merged/split into the POS-specific files with appropriate columns and approval markers.
2. Application seeding, backend services, and UI flows work end-to-end using the new files.
3. README, developer docs, and tests accurately describe and validate the new workflow.
4. Legacy word files are relocated into a clearly labeled `legacy/` directory pending deletion.

## Non-Goals
- No requirement to retain historical enrichment payloads or provenance tracking in the new model.
- Automated completeness heuristics can be removed if approval becomes the sole gatekeeper.

## Open Questions
- How will we migrate existing database records to the new schema while maintaining learner continuity? IGNORE it, we are starting afresh from scratch. 
- Do we need a manual approval queue or dashboard updates to replace the approval review process? Yes, we will use approval toggles in admin tools, like we currently have to mark a word approved
- Should any enrichment capabilities be preserved in a future iteration, and if so, where would that data live? IGNORE, we dont want to store enrichment data.
