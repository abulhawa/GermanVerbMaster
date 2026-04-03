# Parts-of-Speech Word Ingestion Playbook

Use this playbook when adding new verbs, nouns, or adjectives to the canonical corpus.

## Source of truth

- The canonical source is `data/pos/*.jsonl`.
- The database is derived state. Do not add words by editing DB rows first.
- `task_specs` are also derived. Do not hand-edit them.
- `complete` is computed during seed. Do not add a `complete` field to JSONL records.
- `npm run seed` and `npm run build:tasks` populate the database referenced by `DATABASE_URL`. If `DATABASE_URL` points at Supabase Postgres, these commands populate Supabase directly.

## Supported intake formats

Best to worst:

1. Prepared text lists with lemma, POS, translation, and examples already supplied.
2. PDF or text exports from a book glossary.
3. Clear screenshots that can be transcribed into a prepared list.

If the source is already translated and has example sentences, add the JSONL rows directly and use Groq only for missing morphology or missing examples.

## What the system currently supports

Task-generating ingestion is currently reliable for:

- `V` via `data/pos/verbs.jsonl`
- `N` via `data/pos/nouns.jsonl`
- `Adj` via `data/pos/adjectives.jsonl`

Do not force unsupported phrase-level items into these files. Examples that should be skipped or parked unless the schema changes:

- `im Anschluss an (+ Akk.)`
- `eine flache Hierarchie`
- `an der Spitze von (+ Dat.)`

If a source item is a phrase, pattern, or construction instead of a clean lemma, do not encode it as a noun/verb/adjective row just to get it into the queue.

## Intake rules

For every candidate item:

1. Determine whether it is a noun, verb, or adjective.
2. Check whether the exact `lemma + pos` already exists in `data/pos/`.
3. If it already exists, update the existing row only if the new source is materially better.
4. If it does not exist, append a new JSONL row to the matching file.
5. Keep `approved: true` only for rows that are ready to seed.

Practical rules:

- Nouns: keep the lemma without the article in `lemma`; put the article in `noun.gender`.
- Verbs: keep the infinitive in `lemma`; use `verb.separable` for separable verbs.
- Adjectives: keep the base form in `lemma`; use `keine Steigerung` when the adjective is not gradable.
- Keep one German example plus one English translation for every row.
- Also keep the paired example in the `examples` array for consistency with existing canonicals.

## Canonical record shapes

Use the existing JSONL shape exactly.

### Noun

```json
{"lemma":"Filiale","approved":true,"level":"B2","english":"branch, store branch","example_de":"Die Filiale schließt um 18 Uhr.","example_en":"The branch closes at 6 p.m.","examples":[{"de":"Die Filiale schließt um 18 Uhr.","en":"The branch closes at 6 p.m."}],"noun":{"gender":"die","plural":"Filialen"}}
```

### Verb

```json
{"lemma":"anordnen","approved":true,"level":"B2","english":"to order, arrange, instruct officially","example_de":"Die Leitung ordnete zusätzliche Kontrollen an.","example_en":"Management ordered additional checks.","examples":[{"de":"Die Leitung ordnete zusätzliche Kontrollen an.","en":"Management ordered additional checks."}],"verb":{"aux":"haben","separable":true,"praesens":{"ich":"ordne an","er":"ordnet an"},"praeteritum":"ordnete an","partizipIi":"angeordnet","perfekt":"hat angeordnet"}}
```

### Adjective

```json
{"lemma":"untergeordnet","approved":true,"level":"B2","english":"subordinate","example_de":"Dieser Punkt spielt nur eine untergeordnete Rolle.","example_en":"This point plays only a subordinate role.","examples":[{"de":"Dieser Punkt spielt nur eine untergeordnete Rolle.","en":"This point plays only a subordinate role."}],"adjective":{"comparative":"keine Steigerung","superlative":"keine Steigerung"}}
```

## Recommended workflow

### 1. Prepare the batch

- Normalize the source into a flat list of candidate lemmas.
- Split the list into nouns, verbs, and adjectives.
- Remove duplicates before editing the JSONL files.
- Skip unsupported phrase-only items.

### 2. Edit the canonical JSONL files

Files:

- `data/pos/nouns.jsonl`
- `data/pos/verbs.jsonl`
- `data/pos/adjectives.jsonl`

Append only the new rows you actually intend to ship. Keep the diff small and scoped to the batch.

### 3. Use Groq only for missing fields

The enrichment script is:

```bash
npm run enrich:pos -- --pos=V,Adj --level=B2 --limit=200
```

What it does:

1. Seeds the current JSONL corpus into the database.
2. Selects rows that are still incomplete unless `--overwrite` is passed.
3. Calls the Groq enrichment service for allowed fields only.
4. Writes the enriched data back through the admin update path.
5. Exports touched POS rows back into `data/pos/*.jsonl`.
6. Reseeds the database.
7. Rebuilds `task_specs`.

Important flags:

- `--pos=V,Adj` limits enrichment to verbs and adjectives.
- `--level=B2` narrows to one CEFR level.
- `--limit=200` caps the batch.
- `--overwrite` re-enriches complete rows too.
- `--include-unapproved` also processes rows that are not approved yet.

Required environment:

- `GROQ_API_KEY`
- A working `DATABASE_URL`

Use Groq for:

- missing English glosses
- missing German and English example pairs
- missing verb morphology
- missing adjective gradation

Do not trust Groq blindly. Review every batch for obvious linguistic errors.

### 4. Manually review enriched rows

Always spot-check:

- separable verbs
- participles and perfect forms
- noun gender and plural
- adjectives that should be `keine Steigerung`
- unnatural or misleading English glosses
- weak example sentences

Recent examples that needed manual correction after enrichment:

- `anordnen` needed `separable: true` and `partizipIi: "angeordnet"`
- `zuordnen` needed `separable: true`
- `untergeordnet`, `untergliedert`, `unterteilt` needed `keine Steigerung`

### 5. Rebuild derived data

Do not stop at `npm run seed`. The reliable manual import flow is:

```bash
npm run seed
npm run build:tasks
```

`npm run seed` hydrates `words`, `lexemes`, and `inflections`.

`npm run build:tasks` regenerates `task_specs` from the current lexeme inventory.

There is no separate Supabase upload step. The target database is whichever Postgres instance `DATABASE_URL` points to:

- local Postgres if you are working locally against a local database
- Supabase Postgres if the environment is configured for Supabase

That means the normal content-publish path for Supabase is still just:

```bash
npm run seed
npm run build:tasks
```

### 6. Verify the batch

Run the smallest relevant verification set first:

```bash
npx vitest run tests/scripts/enrich-pos-jsonl.test.ts tests/scripts/b2-coverage.test.ts
npm run check
```

Then run broader verification if the batch is large enough to justify it:

```bash
npm test
```

What to verify:

- the new lemmas exist in `data/pos/*.jsonl`
- the target database now contains the rows in `words` and `lexemes`
- seeded rows are `approved`
- the rows are now `complete`
- the targeted CEFR slice produces non-zero task counts after `build:tasks`

If you are targeting Supabase, verify against Supabase directly after the rebuild. A minimal spot-check is:

```sql
select lemma, pos, approved, complete
from words
where lemma in ('Filiale', 'anordnen', 'untergeordnet');
```

## Completeness rules

A row becomes task-ready only when it is both approved and complete.

Completeness currently means:

- shared fields: `english` plus at least one German/English example pair
- verb fields: `praeteritum`, `partizipIi`, `perfekt`
- noun fields: `gender`, `plural`
- adjective fields: `comparative`, `superlative`

If a row is present in JSONL but still does not show up in practice, the first thing to check is whether it is actually complete after seed.

## Common failure modes

### The new words are in JSONL but no tasks appear

Usually one of these is true:

- the row is missing required morphology
- `approved` is false
- the level is wrong
- `npm run build:tasks` was not run after seeding
- the item is a phrase and does not map to a supported task type

### Groq says it updated rows, but the canonicals still look wrong

- Groq output is filtered to allowed fields only
- some rows still need manual correction
- rerun with narrower filters or patch the canonical JSONL directly

### Enrichment says `Selected 0 words, updated 0`

Usually:

- the filtered rows are already complete
- the `--pos`, `--level`, or `--limit` filters are too narrow
- the new rows were not seeded before enrichment

## Minimal agent checklist

Another agent can follow this sequence exactly:

1. Read the source batch and normalize it into supported lemmas.
2. Skip phrase-only items and duplicates.
3. Add new rows to `data/pos/nouns.jsonl`, `data/pos/verbs.jsonl`, and `data/pos/adjectives.jsonl`.
4. Run `npm run enrich:pos -- --pos=V,Adj --level=<LEVEL> --limit=<N>` if fields are missing and `GROQ_API_KEY` is available.
5. Manually review any Groq-generated morphology.
6. Run `npm run seed`.
7. Run `npm run build:tasks`.
8. Verify the target database rows in `words`, `lexemes`, and, if relevant, `task_specs`. If `DATABASE_URL` points at Supabase, this verification is a Supabase check.
9. Run `npx vitest run tests/scripts/enrich-pos-jsonl.test.ts tests/scripts/b2-coverage.test.ts`.
10. Run `npm run check`.
11. Run `npm test` when the batch is large or high-risk.

## Related files

- `data/pos/nouns.jsonl`
- `data/pos/verbs.jsonl`
- `data/pos/adjectives.jsonl`
- `scripts/enrich-pos-jsonl.ts`
- `scripts/export-pos-jsonl.ts`
- `scripts/seed.ts`
- `scripts/build-tasks.ts`
- `tests/scripts/enrich-pos-jsonl.test.ts`
- `tests/scripts/b2-coverage.test.ts`
