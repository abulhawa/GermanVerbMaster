# CEFR Verb Source Audit & Shortlist Tracker

This tracker documents the source audit performed for epic #31 and captures the preliminary verb candidate pools we are assembling ahead of normalization.

## Source Inventory
| Source ID | Description | Levels | Access URL | License | Status |
| --- | --- | --- | --- | --- | --- |
| dwds_goethe_a1 | DWDS Goethe-Zertifikat A1 API export | A1 | https://www.dwds.de/api/lemma/goethe/A1.csv | DWDS terms (attribution required) | ? Imported into shortlist (156 verbs)
| dwds_goethe_a2 | DWDS Goethe-Zertifikat A2 API export | A2 | https://www.dwds.de/api/lemma/goethe/A2.csv | DWDS terms (attribution required) | ? Imported into shortlist (135 verbs)
| dwds_goethe_b1 | DWDS Goethe-Zertifikat B1 API export | B1 | https://www.dwds.de/api/lemma/goethe/B1.csv | DWDS terms (attribution required) | ? Imported into shortlist (393 verbs)
| goethe_dtz | Alphabetical DTZ Wortliste (Goethe-Institut) | DTZ (A2â€“B1) | https://www.goethe.de/resources/files/pdf209/dtz_wortliste.pdf | Copyright Â© Goethe-Institut | âœ… Imported 16 DTZ-only verbs (see `dtz-verb-list.csv`); 459 overlaps logged in `dtz-verb-overlap.csv`; text capture stored (`goethe-dtz-wortliste.txt`)
| goethe_b2_official | Goethe-Zertifikat B2 Wortliste (PDF) | B2 | https://www.goethe.de/pro/relaunch/prf/de/B2_Wortliste_2018.pdf | Copyright Â© Goethe-Institut | ?? Requires manual download workflow
| goethe_c1_official | Goethe-Zertifikat C1 Wortliste (PDF) | C1 | https://www.goethe.de/pro/relaunch/prf/de/C1_Wortliste.pdf | Copyright Â© Goethe-Institut | ?? Manual extraction required
| goethe_c2_official | Goethe-Zertifikat C2 Wortliste (PDF) | C2 | https://www.goethe.de/pro/relaunch/prf/de/C2_Wortliste.pdf | Copyright Â© Goethe-Institut | ?? Manual extraction required
| lingster_wordlist | Lingster Academy A1â€“B2 thematic wordlist (PDF) | A1â€“B2 | https://lingster.de/wp-content/uploads/2023/03/Der-deutsche-Wortschatz-von-A1-bis-B2-Lingster-Academy.pdf | Copyright Â© Lingster Academy | ? Text capture stored (`lingster-wortschatz-A1-B2.txt`); heuristic verb candidates in `lingster-verb-candidates.csv` need manual validation
| duden_api | Duden â€œSprachniveauâ€ annotations for verbs | B1â€“C2 | https://www.duden.de | Copyright Â© Bibliographisches Institut | ?? Accessible, but needs scraping pipeline + usage review

## Candidate Pool Snapshot
Verb candidates extracted so far are stored in `docs/verb-corpus/cefr-verb-shortlist.csv`. Counts per level/source cohort (see `cefr-verb-shortlist-summary.json`):

| Level | Candidates | Primary Sources | Notes |
| --- | --- | --- | --- |
| A1 | 156 | dwds_goethe_a1 | Meets =100 target; needs dedupe vs. existing DB and auxiliary tagging.
| A2 | 135 | dwds_goethe_a2 | Meets =100 target; pending normalization + QA.
| B1 | 393 | dwds_goethe_b1 | Ample coverage; scope examples + difficulty alignment during normalization.
| DTZ | 16 | goethe_dtz | Unique DTZ verbs not already in A1â€“B1; overlap list in `dtz-verb-overlap.csv`.
| B2 | 0 | â€” | Awaiting manual extraction from Goethe PDFs (or alternate corpora).
| C1 | 0 | â€” | Same as B2; consider Duden â€œSprachniveauâ€ to prioritize verbs.
| C2 | 0 | â€” | Requires advanced sources; TBD after B2/C1 pipeline.

> Additional candidate file: `docs/verb-corpus/lingster-verb-candidates.csv` (730 heuristically extracted lemmas ending in `-en`). Contains adjectives and false positives â€” needs linguistic review before ingesting.

## Outstanding Risks & Follow-ups
- **DWDS attribution & terms**: Confirm acceptable-use and required attribution language before distribution/production import.
- **Goethe DTZ licensing**: DTZ list is copyrighted; confirm internal-only usage is acceptable and document attribution in ingestion notes.
- **Higher-level coverage (B2â€“C2)**: No machine-readable dataset yet; still reliant on PDF extraction or alternate corpora. Track in epic #31.
- **Normalization workload**: All harvested lists (A1â€“B1 + DTZ) still need auxiliary verb classification, separability flags, and sentence examples (tasks #33â€“#34).
- **Lingster candidates**: File requires manual triage (adjectives/pronouns included). Decide whether to keep as reference-only or refine heuristics before import.

## Next Actions (handoff to #33/#34)
1. Incorporate DWDS + DTZ verb entries into the normalization workbook, adding auxiliaries, pattern tags, and examples.
2. Define plan for sourcing B2â€“C2 verbs (Goethe PDFs vs. Duden scraping) and log resulting engineering tasks.
3. Document DWDS/Goethe attribution requirements alongside the ingestion checklist.
4. Review `lingster-verb-candidates.csv` to keep only true verbs or derive better heuristics.

## Review Status
- Updated shortlist + source tracker shared for review; blockers revised above.
- Risks and next steps reflected in epic #31 and task issue #32 comment thread (latest comment documents DWDS + DTZ harvest).



