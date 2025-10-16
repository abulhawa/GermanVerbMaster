# GermanVerbMaster Enrichment

GermanVerbMaster has been simplified into a focused enrichment workbench for German vocabulary. The app exposes the enrichment pipeline UI, supporting APIs, and administrative utilities used to collect, review, and apply content updates to the `words` catalog. Practice flows, history analytics, task packs, and adaptive scheduling have been removed so the application can operate as an independent enrichment console.

## Features
- Run bulk enrichment jobs with configurable providers and filters.
- Preview AI and provider suggestions before committing them to the database.
- Apply manual edits to individual words, including translations, examples, and metadata.
- Download enrichment reports and review provider history for each word.

## Local setup
Requires Node.js 22.0.0 or newer and npm 10+.

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Copy `.env.example` to `.env` and configure the connection + admin values:
   - `DATABASE_URL` – Postgres connection string used by the API.
   - `DATABASE_SSL` / `PGSSLMODE` – set to `disable` for local development without TLS.
   - `ADMIN_API_TOKEN` – secret token required to call admin endpoints from the UI.
   - `APP_ORIGIN` – optional comma-separated allow list for production CORS.
   - `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` – only required when Better Auth sign-in is enabled.
3. Apply the latest migrations:
   ```bash
   npm run db:push
   ```
4. Seed fixture data (optional but recommended for first run):
   ```bash
   npm run seed
   ```
5. Start the combined API + Vite development server:
   ```bash
   npm run dev
   ```
   The enrichment console is now available at [http://localhost:5000/](http://localhost:5000/). Provide the `ADMIN_API_TOKEN` via the "Admin token" field in the UI to access protected actions.

### Useful scripts
- `npm run build` – produce the production client bundle and server output.
- `npm run check` – TypeScript type checking.
- `npm run test:unit` – Vitest unit and integration suites.
- `npm run enrich` – execute the enrichment pipeline from the command line.
- `npm run enrichment:export` – export applied enrichment snapshots for auditing.
- `npm run enrichment:restore` – restore words from an enrichment backup snapshot.

## Testing
Run the Vitest suite to validate core helpers and UI logic:
```bash
npm run test:unit
```

## Deployment notes
Production deployments require the same environment variables listed above. The build step should run `npm install`, `npm run db:push`, `npm run seed`, and `npm run build`. Serve the static assets from `dist/public/` and point `/api/*` routes at the bundled Express handlers in `dist/server/`.

---
The enrichment pipeline consumes provider definitions, storage helpers, and shared types located under `scripts/enrichment/` and `shared/enrichment/`. See [`docs/enrichment-persistence.md`](docs/enrichment-persistence.md) for details on where enrichment data is stored and how provider snapshots are synchronised.
