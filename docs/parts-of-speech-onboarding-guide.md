# Parts-of-Speech Onboarding Guide

This guide helps new contributors ramp onto the lexeme-based architecture that now powers verbs, nouns, and adjectives.

## 1. Environment setup
1. Install Node.js 22.0.0+ and npm 10+.
2. Copy `.env.example` to `.env` and review the feature flags:
   - Leave `ENABLE_LEXEME_SCHEMA=true` to opt into the task registry.
   - Enable `ENABLE_NOUNS_BETA` and `ENABLE_ADJECTIVES_BETA` when you need mixed-POS queues locally.
3. Run the standard setup commands:
   ```bash
   npm install
   npm run db:push
   npm run seed
   npm run dev
   ```
4. Visit `http://localhost:5173` and confirm the practice mode switcher exposes Verbs, Nouns, and Adjectives when their feature flags are enabled.

## 2. Understanding the task registry
- `shared/task-registry.ts` defines the prompt and solution schema for each `taskType` along with default queue caps.
- The server extends these entries in `server/tasks/registry.ts` to configure evaluation strategies and enforce per-device limits.
- Client renderers map task types to UI components; study `client/src/pages/home.tsx` and the practice card components to see how prompts are displayed.

## 3. Data flow walkthrough
1. Source CSVs and manual overrides live in `data/` and `docs/external/`.
2. `npm run seed` hydrates the legacy `words` table while generating deterministic `lexemes`, `inflections`, and `task_specs` packs under `data/packs/`.
3. `npm run packs:lint` validates every pack JSON file against the shared registry before you copy the refreshed bundles into `client/public/packs/` for offline use.
4. `/api/tasks` serves queue items based on `task_specs`, respecting feature flags and scheduler priorities stored in `scheduling_state`.

## 4. QA checklist before merging
- Run `npm run test` for unit/integration coverage and `npm run test:e2e` after Playwright browsers are installed.
- Execute `npm run packs:lint` whenever you touch pack data or ETL scripts.
- Verify the admin dashboard edits propagate into packs by reseeding and spot-checking the updated JSON files.
- Confirm `/api/tasks?pos=noun` and `/api/tasks?pos=adjective` return items when their feature flags are enabled.

## 5. Additional resources
- [`docs/parts-of-speech-schema-rfc.md`](./parts-of-speech-schema-rfc.md) — canonical schema and migration background.
- [`docs/parts-of-speech-task-policies.md`](./parts-of-speech-task-policies.md) — queue caps and renderer requirements.
- [`docs/content-admin-guide.md`](./content-admin-guide.md) — workflow details for content editors.
