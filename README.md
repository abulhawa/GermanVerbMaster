# GermanVerbMaster

GermanVerbMaster is a full-stack web application for practicing German verbs. It provides a React-based interface to quiz yourself on verb forms and an Express API backed by a Drizzle ORM database. The app can be installed as a Progressive Web App and now works fully offline.

## Local setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Copy `.env.example` to `.env` and override the defaults. You can change:
   - `DATABASE_FILE` – where the SQLite database file lives (defaults to `db/data.sqlite`).
   - `APP_ORIGIN` – a comma-separated allow list used for CORS in production builds.
3. Create or update the SQLite database and migrations:
   ```bash
   npm run db:push
   ```
4. Seed the verbs table so the API and offline cache have data:
   ```bash
   npm run seed:verbs
   ```
5. Start the development server (Express API + Vite dev server):
   ```bash
   npm run dev
   ```
6. Additional scripts:
   ```bash
   npm run check   # type-check the project
   npm run build   # create production bundles and server output
   npm run test    # run unit and API tests
   ```

The app runs entirely on your machine—no container or managed database is required. All data is stored in the SQLite file defined by `DATABASE_FILE`, which keeps small vocab collections under version control or inside your backup strategy.

## Progressive Web App
- The client is bundled with `vite-plugin-pwa` using an auto-updating service worker.
- `client/public/manifest.webmanifest` defines install metadata, icons, and standalone display mode.
- Runtime caching keeps `/api/verbs*` responses and the static `verbs.json` available offline.
- A `virtual:pwa-register` hook registers the service worker on load; the app earns an 80+ Lighthouse PWA score when built.

## Offline + Sync
- Verb data is fetched from `/api/verbs` when online and automatically falls back to the committed `attached_assets/verbs.json` when offline.
- Practice attempts are written to an IndexedDB queue (via Dexie) whenever the network is unavailable or the API is rate limited.
- The `useSyncQueue` hook listens to `online` and `visibilitychange` events and flushes queued attempts back to `/api/practice-history`.
- Each device receives a persistent `deviceId` stored in `localStorage`; it is sent with every practice submission and stored in the database.

## Database utilities
- The schema is managed with Drizzle + SQLite. After editing `db/schema.ts`, run `npm run db:push` to apply the migration to your local database file.
- `npm run seed:verbs` fills the SQLite database and exports `attached_assets/verbs.json` for offline usage. Repeat this after importing new verbs.

## Partner integrations
- Generate sandbox API keys with `npm run integration:create-key` and follow the workflow documented in [`docs/integration-api.md`](docs/integration-api.md).
- Authenticated partners can fetch embeddable drill bundles and review their request analytics via the new `/api/partner/*` routes.

