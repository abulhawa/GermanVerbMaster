# Repository Guidelines

## Required checks
- Run `npm run check` to ensure the TypeScript project compiles.
- Run `npm run build` to confirm both the Vite client and Express server bundle without errors.

## Dependency management
- Whenever you change `package.json`, run `npm install` so `package-lock.json` stays in sync.
- Keep dependencies minimal. Remove unused packages rather than leaving them in `package.json`.

## Coding conventions
- Match the surrounding style in each file (string quoting, semicolons, and component structure differ between folders).
- Use the existing TypeScript path aliases (`@` for the client, `@db` for database code) instead of relative paths.

## Other notes
- Do not commit build artifacts (`dist/`) or dependency directories (`node_modules/`).
- Database schema changes live under `db/`; run `npm run db:push` after altering schema files.
