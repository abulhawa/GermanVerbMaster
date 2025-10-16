# Failing Test Remediation Plan

This document breaks down the current Vitest failures into smaller, actionable tasks based on the recent regression analysis.

## 1. Seed Lexeme Inventory for Task Pipeline Tests
- **Problem**: `/api/tasks` now performs an `INNER JOIN` on the `lexemes` table. Test fixtures that only call `upsertGoldenBundles` end up with no matching lexeme rows, so the tasks API returns an empty array.
- **Task A**: Extend the task-related test helpers to insert the minimum lexeme records (lemma, language code, and linkage) before invoking the API.
- **Task B**: Audit all Vitest suites that depend on `/api/tasks` (queue shadowing, client fallbacks, etc.) and update their setup hooks to call the new helper.
- **Task C**: Add a regression test that confirms a task appears after both the bundle and its lexeme are seeded, guarding against future fixture drift.

## 2. Update Completeness Expectations for Verb Admin Tests
- **Problem**: `computeWordCompleteness` now requires an English gloss plus at least one DE/EN example pair before marking a verb complete. The admin route test only patches verb forms, so the completeness flag remains `false`.
- **Task A**: Expand the verb admin test fixture to include the mandatory gloss and example sentences when simulating an update.
- **Task B**: Verify other suites asserting the completeness flag (if any) and align their fixtures with the new business rule.
- **Task C**: Document the enhanced completeness criteria in developer-facing docs or fixture helpers to keep expectations synchronized across tests.

## 3. Follow-up Quality Checks
- **Task A**: After applying the above fixes, rerun `npm test` to ensure the Vitest suites pass.
- **Task B**: Update any relevant README or onboarding notes to call out the lexeme dependency for task APIs and the stricter completeness requirements.
