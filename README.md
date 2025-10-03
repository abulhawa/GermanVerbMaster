# GermanVerbMaster

GermanVerbMaster is a full-stack, lexeme-centric practice platform for German learners. It ships with a multi-part-of-speech task registry covering verbs, nouns, and adjectives, a React-based client that renders tasks by `taskType`, and an Express API backed by Drizzle ORM. The app can be installed as a Progressive Web App and works fully offline thanks to deterministic task packs seeded at build time.

## Local setup
Requires Node.js 24.5.2 or newer and npm 10+ (see `package.json` engines field).

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Copy `.env.example` to `.env` and override the defaults. You can change:
   - `DATABASE_FILE` – where the SQLite database file lives (defaults to `db/data.sqlite`).
   - `APP_ORIGIN` – a comma-separated allow list used for CORS in production builds.
   - `ENABLE_LEXEME_SCHEMA` – disable to fall back to the legacy verb-only stack (defaults to `true`).
   - `ENABLE_NOUNS_BETA` / `ENABLE_ADJECTIVES_BETA` – flip feature flags for the new noun and adjective task cohorts. Both default to `false` so you can stage rollouts incrementally.
3. Create or update the SQLite database and migrations:
   ```bash
   npm run db:push
   ```
4. Seed the `words` table and regenerate deterministic task packs used by the offline cache:
   ```bash
   npm run seed
   ```
5. Start the development server (Express API + Vite dev server):
   ```bash
   npm run dev
   ```
6. Additional scripts:
   ```bash
   npm run check      # type-check the project
   npm run build      # create production bundles and server output
   npm run test       # run unit and API tests
   npm run packs:lint # validate generated content packs against the task registry
   ```

The app runs entirely on your machine—no container or managed database is required. All data is stored in the SQLite file defined by `DATABASE_FILE`, which keeps small vocab collections under version control or inside your backup strategy.

## Theme system
- Global color tokens live in `client/src/index.css`. Light and dark palettes share the same variable names (`--bg`, `--fg`, `--accent`, etc.), so components only reference semantic utilities such as `bg-card`, `text-fg`, and `ring-accent`.
- Accent usage is intentionally small: primary buttons, selected states, focus rings, and toggled controls. Most surfaces rely on muted neutrals for both themes.
- The header now includes a theme toggle that persists the selection (`light`, `dark`, or `system`) in `localStorage` and respects the system preference when `system` is active. The helper logic lives in `client/src/lib/theme.ts`.

## Lexeme-based task system
- `/api/tasks` exposes POS-aware task descriptors driven by the shared registry in `shared/task-registry.ts` and server metadata in `server/tasks/registry.ts`.
- Legacy verb routes (`/api/quiz/verbs`, `/api/practice-history`, `/api/review-queue`) remain available behind a compatibility layer while feature flag rollouts complete. Deprecation headers point clients back to the task feed.
- The deterministic schema covers `lexemes`, `inflections`, `task_specs`, `content_packs`, `pack_lexeme_map`, `scheduling_state`, and `telemetry_priorities`. These tables live alongside legacy verb tables until shadow mode validates parity.
- Feature flags (`ENABLE_NOUNS_BETA`, `ENABLE_ADJECTIVES_BETA`) gate access to noun and adjective queues. The API emits `x-gvm-feature-flags` headers to document the current snapshot.

## Progressive Web App
- The client is bundled with `vite-plugin-pwa` using an auto-updating service worker.
- `client/public/manifest.webmanifest` defines install metadata, icons, and standalone display mode.
- Runtime caching keeps `/api/tasks` responses and pack metadata available offline. Copy the deterministic pack bundles from `data/packs/*.json` into `client/public/packs/` before a release so `/packs/*.json` remains available as the final fallback for each POS.
- A `virtual:pwa-register` hook registers the service worker on load; the app earns an 80+ Lighthouse PWA score when built.

## Offline + Sync
- Task data is fetched from `/api/tasks` when online and automatically falls back to deterministic task packs served from `/packs/*.json` (populated from `client/public/packs/`) when offline.
- Practice attempts are written to an IndexedDB queue (via Dexie) whenever the network is unavailable or the API is rate limited.
- The `useSyncQueue` hook listens to `online` and `visibilitychange` events and flushes queued attempts back to `POST /api/submission`.
- Each device receives a persistent `deviceId` stored in `localStorage`; it is sent with every practice submission and stored in `scheduling_state` for priority calculations.
- `data/words_manual.csv` stores handcrafted rows that supplement the scraped sources.
- `data/words_all_sources.csv` is regenerated on each `npm run seed` by combining `docs/external/**` with the manual rows, and `data/words_canonical.csv` marks the curated canonical subset. Running `npm run seed` normalises, merges, and upserts that data into SQLite while regenerating `data/packs/*.json` bundles.

## Database utilities
- The schema is managed with Drizzle + SQLite. After editing `db/schema.ts`, run `npm run db:push` to apply the migration to your local database file.
- `npm run seed` recomputes completeness, writes deterministic content packs to `data/packs/`, and idempotently upserts source material into SQLite. Copy updated pack JSON into `client/public/packs/` before building so offline clients can fetch the refreshed bundles. Run the seed after editing `data/words_manual.csv`, adding sources under `docs/external`, or changing `data/words_canonical.csv`.

## Vocabulary enrichment helpers
- Run `tsx scripts/enrich-non-canonical-words.ts` to gather translations, Wiktionary summaries, and OpenThesaurus synonym sets for the current non-canonical entries in the `words` table. The script stores its output under `data/generated/non-canonical-enrichment.json`; set `LIMIT=<n>` to override the default batch size of 25.

## Lexeme & content admin tools
- Configure an `ADMIN_API_TOKEN` in your `.env` file (see `.env.example`) to protect ingestion routes. Restart the dev server after changing environment variables.
- Visit `http://localhost:5000/admin` to access the words dashboard. Multi-select filters now support verbs, nouns, and adjectives plus CEFR level and pack membership.
- Updates are issued via `PATCH /api/words/:id` with the `x-admin-token` header. Canonical toggles and field edits immediately invalidate the admin cache and prompt pack regeneration during the next `npm run seed`.

## Partner integrations
- Generate sandbox API keys with `npm run integration:create-key` and follow the workflow documented in [`docs/integration-api.md`](docs/integration-api.md).
- Authenticated partners can fetch embeddable drill bundles and review their request analytics via the new `/api/partner/*` routes.

## Adaptive review scheduler
- The adaptive spaced-repetition engine persists Leitner box stats per device inside `scheduling_state`, regenerates priority-ranked queues, and exposes them through `/api/tasks` plus the `/api/review-queue` legacy alias.
- Review [`docs/adaptive-review-scheduler.md`](docs/adaptive-review-scheduler.md) for the full architecture, configuration flags, and integration checklist before extending the system.

