# `packs:lint` Usage Notes

The `npm run packs:lint` script validates deterministic content packs before they ship to production or QA. It ensures the lexeme-based rollout stays consistent with the shared task registry and prevents malformed bundles from reaching the client or offline cache.

## Running the linter
```bash
npm run packs:lint          # lint every JSON file under data/packs/
npm run packs:lint data/packs/verbs-foundation.v1.json
npm run packs:lint data/packs
```
- With no arguments the script scans `data/packs/*.json`.
- Passing a directory restricts the scan to that folder.
- Passing a file lints a single pack.

## What the linter checks
- Pack headers include a license, metadata block, and matching `taskTypes`, `size`, and CEFR level information.
- Lexeme, inflection, and task IDs are unique, match the pack `posScope`, and link to the correct language.
- Tasks validate against the shared registry (`taskType`, renderer, prompt, and solution schema).
- Pack-to-lexeme mappings reference known IDs, maintain sequential ordering, and point at the correct `packId`.
- POS-specific requirements hold true (e.g., noun gender present, verb level provided).

## Recommended workflow
1. Run `npm run seed` after editing CSV inputs, packs, or lexeme metadata.
2. Execute `npm run packs:lint` to catch schema issues before tests.
3. Fix any reported JSON path or schema mismatch, rerun `npm run seed`, and lint again until the script prints `All packs passed linting.`
4. Commit regenerated packs alongside the change set so reviewers can inspect the deterministic diffs.

## Exit codes
- The process exits with status code `0` when every pack passes.
- It prints each violation to `stderr` and exits with status code `1` if any issues remain; CI treats this as a failure.
