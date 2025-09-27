# CEFR Verb Source Audit & Shortlist Tracker

This tracker documents the source audit performed for epic #31 and captures the preliminary verb candidate pool by CEFR level.

## Source Inventory
| Source ID | Description | Levels | Access URL | License | Status |
| --- | --- | --- | --- | --- | --- |
| dwds_goethe_a1 | DWDS Goethe-Zertifikat A1 API export | A1 | https://www.dwds.de/api/lemma/goethe/A1.csv | DWDS terms (attribution required) | ✅ Imported into shortlist (156 verbs)
| dwds_goethe_a2 | DWDS Goethe-Zertifikat A2 API export | A2 | https://www.dwds.de/api/lemma/goethe/A2.csv | DWDS terms (attribution required) | ✅ Imported into shortlist (135 verbs)
| dwds_goethe_b1 | DWDS Goethe-Zertifikat B1 API export | B1 | https://www.dwds.de/api/lemma/goethe/B1.csv | DWDS terms (attribution required) | ✅ Imported into shortlist (393 verbs)
| goethe_b2_official | Goethe-Zertifikat B2 Wortliste (PDF) | B2 | https://www.goethe.de/pro/relaunch/prf/de/B2_Wortliste_2018.pdf | Copyright © Goethe-Institut | ⚠️ Requires manual download workflow
| goethe_c1_official | Goethe-Zertifikat C1 Wortliste (PDF) | C1 | https://www.goethe.de/pro/relaunch/prf/de/C1_Wortliste.pdf | Copyright © Goethe-Institut | ⚠️ Manual extraction required
| goethe_c2_official | Goethe-Zertifikat C2 Wortliste (PDF) | C2 | https://www.goethe.de/pro/relaunch/prf/de/C2_Wortliste.pdf | Copyright © Goethe-Institut | ⚠️ Manual extraction required
| cukowski_words | Community word-list repo (GermanWordListByLevel) | A1–B2 | https://github.com/Cukowski/GermanWordListByLevel | Unknown | ⚠️ Reference only until licensing clarified; no longer used in shortlist
| duden_api | Duden “Sprachniveau” annotations for verbs | B1–C2 | https://www.duden.de | Copyright © Bibliographisches Institut | ⚠️ Accessible, but needs scraping pipeline + usage review

## Candidate Pool Snapshot
Verb candidates extracted so far are stored in `docs/verb-corpus/cefr-verb-shortlist.csv`. Counts per level (see `cefr-verb-shortlist-summary.json`):

| Level | Candidates | Primary Sources | Notes |
| --- | --- | --- | --- |
| A1 | 156 | dwds_goethe_a1 | Meets ≥100 target; needs dedupe vs. existing DB and auxiliary tagging.
| A2 | 135 | dwds_goethe_a2 | Meets ≥100 target; pending normalization + QA.
| B1 | 393 | dwds_goethe_b1 | Ample coverage; will need scoping for examples + difficulty alignment.
| B2 | 0 | — | Awaiting manual extraction from Goethe PDFs (or alternative corpora).
| C1 | 0 | — | Same as B2; consider Duden “Sprachniveau” to prioritize verbs.
| C2 | 0 | — | Requires advanced sources; TBD after B2/C1 pipeline.

## Outstanding Risks & Follow-ups
- **DWDS attribution & terms**: Confirm acceptable-use and required attribution language before distribution/production import.
- **Higher-level coverage (B2–C2)**: No machine-readable dataset yet; still reliant on PDF extraction or alternate corpora. Track in epic #31.
- **Normalization workload**: A1–B1 lists still need auxiliary verb classification, separability flags, and sentence examples (tasks #33–#34).

## Next Actions (handoff to #33/#34)
1. Incorporate DWDS verb entries into the normalization workbook, adding auxiliaries, pattern tags, and examples.
2. Define plan for sourcing B2–C2 verbs (Goethe PDFs vs. Duden scraping) and log resulting tasks.
3. Document DWDS attribution requirements alongside the ingestion checklist.

## Review Status
- Updated shortlist + source tracker shared for review; blockers revised above.
- Risks and next steps reflected in epic #31 and task issue #32 comment thread.
