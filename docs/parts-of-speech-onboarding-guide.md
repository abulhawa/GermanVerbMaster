# Parts-of-Speech Onboarding Guide

This guide helps new contributors ramp onto the lexeme-based architecture that now powers verbs, nouns, and adjectives.

## 1. Environment setup
1. Install Node.js 22.0.0+ and npm 10+.
2. Copy `.env.example` to `.env`, set `DATABASE_URL` to the target Postgres instance, and confirm `ENABLE_LEXEME_SCHEMA=true` so the task registry remains active. In shared/dev environments this target may be a Supabase Postgres database.
3. Run the standard setup commands:
   ```bash
   npm install
   npm run db:push
   npm run seed
   npm run build:tasks
   npm run dev
   ```
4. Visit `http://localhost:5000` and confirm the practice mode switcher exposes Verbs, Nouns, and Adjectives by default.

## 2. Understanding the task registry
- `shared/task-registry.ts` defines the prompt and solution schema for each `taskType` along with default queue caps.
- The server extends these entries in `server/tasks/registry.ts` to configure evaluation strategies and enforce per-device limits.
- Client renderers map task types to UI components; study `client/src/pages/home.tsx` and the practice card components to see how prompts are displayed.

## 3. Data flow walkthrough
1. Source CSVs and manual overrides live in `data/` and `docs/external/`.
2. `npm run seed` hydrates the legacy `words` table while generating deterministic `lexemes` and `inflections` entries in the database referenced by `DATABASE_URL`. `npm run build:tasks` regenerates `task_specs` from the current lexeme inventory in that same database.
3. The legacy JSON pack export has been retired; offline clients now synchronise tasks from the live practice queues instead of copying bundle files into `client/public/packs/`.
4. `/api/tasks` serves queue items directly from `task_specs`, returning the latest prompts without maintaining scheduler state.

## 4. QA checklist before merging
- Run `npm run test` for unit/integration coverage and `npm run test:e2e` after Playwright browsers are installed.
- Run `npm run seed` after updating ETL scripts to confirm the generated lexeme inventories still hydrate without errors, then run `npm run build:tasks` to refresh `task_specs`.
- Verify admin dashboard edits propagate into the generated lexeme/task spec snapshots by reseeding, rebuilding tasks, and spot-checking the refreshed database rows via `/api/tasks`.
- Confirm `/api/tasks?pos=noun` and `/api/tasks?pos=adjective` return items for seeded datasets.

## 5. Additional resources
- [`docs/parts-of-speech-system.md`](./parts-of-speech-system.md) — end-to-end architecture and queue behaviour.
- [`docs/parts-of-speech-content-training.md`](./parts-of-speech-content-training.md) — onboarding slide deck for content editors.
- [`docs/parts-of-speech-content-sources.md`](./parts-of-speech-content-sources.md) — vetted datasets and licensing notes per POS.
- [`docs/parts-of-speech-word-ingestion-playbook.md`](./parts-of-speech-word-ingestion-playbook.md) — exact intake, enrichment, seeding, and verification workflow for adding new words.
- [`docs/content-admin-guide.md`](./content-admin-guide.md) — workflow details for content editors.
