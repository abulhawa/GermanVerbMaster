# GermanVerbMaster

GermanVerbMaster is a full-stack web application for practicing German verbs. It provides a React-based interface to quiz yourself on verb forms and an Express API backed by a Drizzle ORM database. The app can be installed as a Progressive Web App and now works fully offline.

## Local setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure `DATABASE_URL` plus `APP_ORIGIN` (used to tighten CORS in production).
3. Generate the cached verb JSON used for offline mode (optional when a database is connected):
   ```bash
   npm run seed:verbs
   ```
4. Start the development server (Express + Vite dev server):
   ```bash
   npm run dev
   ```
5. Additional scripts:
   ```bash
   npm run check   # type-check the project
   npm run build   # create production bundles and server output
   npm run test    # run unit and API tests
   ```

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
- The schema is managed with Drizzle. After editing `db/schema.ts`, run `npm run db:push` and commit any generated migrations.
- `npm run seed:verbs` exports the canonical verbs from Postgres (or local seed data) into `attached_assets/verbs.json` for offline usage.

