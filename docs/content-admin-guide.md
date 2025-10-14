# Content Admin Guide – Lexeme Rollout

## Overview
The admin dashboard at `/admin` now manages verbs, nouns, and adjectives from a single words table while the lexeme-based task system rolls out. This guide documents the controls content editors need to curate entries, trigger ETL updates, and verify pack readiness.

## Prerequisites
- Set an `ADMIN_API_TOKEN` in your `.env` file and restart the server so protected routes accept updates.
- Confirm the lexeme schema is enabled (`ENABLE_LEXEME_SCHEMA=true`). Toggle `ENABLE_NOUNS_BETA` or `ENABLE_ADJECTIVES_BETA` when you are ready to expose new queues to end users.
- Run `npm install` followed by `npm run dev` so the React admin UI and Express API are available locally.

## Navigating the dashboard
1. Open `http://localhost:5000/admin` and enter the admin token when prompted. The token is stored locally for the session.
2. Use the **Part of speech** filter to switch between verbs (`V`), nouns (`N`), adjectives (`Adj`), and the other supported categories imported from upstream sources.
3. Combine filters for CEFR level, approval status, and completeness to focus on items that are ready for pack promotion.
4. Click a row to edit: the drawer surfaces shared metadata (translations, examples, sources) along with POS-specific fields such as auxiliary verbs, noun plurals, or adjective degrees.
5. Save changes to issue a `PATCH /api/words/:id` request. Successful edits automatically refresh the table and invalidate cached rows.

## Coordinating with ETL & packs
1. After curating a batch, run `npm run seed` to re-aggregate source CSVs and regenerate deterministic task packs under `data/packs/`. Copy any updated JSON files into `client/public/packs/` so the service worker can serve them offline.
2. Execute `npm run packs:lint` before committing changes. The lint step ensures pack metadata, task descriptors, and lexeme IDs align with the shared task registry.
3. When promoting new POS content, keep the relevant feature flag disabled until QA signs off on the generated packs. Flip the flag, redeploy, and monitor the `/api/tasks` responses during the first live session.

## Troubleshooting checklist
- **Unauthorized responses**: confirm the admin token matches the `.env` value and that the request includes the `x-admin-token` header.
- **Missing noun/adjective fields**: verify the lexeme schema feature flag remains enabled; falling back to the legacy stack hides the new form controls.
- **Pack lint failures**: inspect the reported JSON path, fix the mismatched metadata or schema issue, rerun `npm run seed`, then lint again.
